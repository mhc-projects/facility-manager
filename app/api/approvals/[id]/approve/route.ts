import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function sendNotification({
  targetUserId, title, message, category, documentId, documentNumber, documentType,
}: {
  targetUserId: string; title: string; message: string; category: string;
  documentId: string; documentNumber: string; documentType: string;
}) {
  try {
    // 1. DB에 알림 저장
    const { data: inserted, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        title,
        message,
        category,
        priority: 'high',
        notification_tier: 'personal',
        target_user_id: targetUserId,
        related_resource_type: 'approval',
        related_resource_id: documentId,
        related_url: `/admin/approvals/${documentId}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { document_number: documentNumber, document_type: documentType },
      })
      .select()
      .single();

    if (error) {
      console.error('[APPROVAL] 알림 DB 저장 실패:', error);
      return;
    }

    // 2. Supabase Broadcast로 즉시 실시간 전달 (postgres_changes RLS 우회)
    await supabaseAdmin
      .channel(`approval-notify:${targetUserId}`)
      .send({
        type: 'broadcast',
        event: 'new_notification',
        payload: {
          id: inserted.id,
          title: inserted.title,
          message: inserted.message,
          category,
          priority: 'high',
          related_url: `/admin/approvals/${documentId}`,
          created_at: inserted.created_at,
        }
      });

    console.log('[APPROVAL] 알림 broadcast 발송 완료 → user:', targetUserId);
  } catch (e) { console.warn('[APPROVAL] 알림 발송 예외:', e); }
}

const DOC_TYPE_LABEL: Record<string, string> = {
  expense_claim: '지출결의서', purchase_request: '구매요청서',
  leave_request: '휴가원', business_proposal: '업무품의서', overtime_log: '연장근무일지',
};

/**
 * 최종 승인 완료 시 경영지원 역할 부서 직원 전체에게 알림 발송
 */
async function notifyManagementSupportDept({
  doc, allSteps, documentId, requesterName,
}: {
  doc: any; allSteps: any[]; documentId: string; requesterName: string;
}) {
  try {
    const mgmtDept = await queryOne(
      `SELECT id, name FROM departments WHERE is_management_support = TRUE AND is_active = TRUE LIMIT 1`,
      []
    );
    if (!mgmtDept) return;

    const staffList = await queryAll(
      `SELECT id FROM employees WHERE department = $1 AND is_deleted = FALSE AND is_active = TRUE`,
      [mgmtDept.name]
    );
    if (!staffList || staffList.length === 0) return;

    const stepSummary = allSteps
      .filter((s: any) => s.step_order > 1)
      .sort((a: any, b: any) => a.step_order - b.step_order)
      .map((s: any) => s.approver_name)
      .join(' → ');

    const typeLabel = DOC_TYPE_LABEL[doc.document_type] || doc.document_type;
    const completedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const deptLabel = doc.department ? ` (${doc.department})` : '';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const message =
      `${doc.document_number} ${typeLabel}\n` +
      `작성자: ${requesterName}${deptLabel}\n` +
      `결재선: ${stepSummary}\n` +
      `완료일시: ${completedAt}`;

    const rows = staffList.map((staff: any) => ({
      title: '[결재 완료 통보]',
      message,
      category: 'report_approved',
      priority: 'normal',
      notification_tier: 'personal',
      target_user_id: staff.id,
      related_resource_type: 'approval',
      related_resource_id: documentId,
      related_url: `/admin/approvals/${documentId}`,
      expires_at: expiresAt,
      metadata: { document_number: doc.document_number, document_type: doc.document_type },
    }));

    const { error } = await supabaseAdmin.from('notifications').insert(rows);
    if (error) console.error('[APPROVAL] 경영지원부 알림 DB 저장 실패:', error);
  } catch (e) {
    console.warn('[APPROVAL] 경영지원부 통보 처리 실패:', e);
  }
}

/**
 * POST /api/approvals/[id]/approve
 * 결재 승인
 * body: { comment?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }
    const userId = decoded.userId || decoded.id;

    const body = await request.json().catch(() => ({}));
    const comment = body.comment || '';

    // 문서 조회
    const doc = await queryOne(
      `SELECT * FROM approval_documents WHERE id = $1 AND is_deleted = FALSE`,
      [params.id]
    );
    if (!doc) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
    }
    if (doc.status !== 'pending') {
      return NextResponse.json({ success: false, error: '결재 진행 중인 문서가 아닙니다' }, { status: 400 });
    }

    // 현재 단계에서 내 결재 step 확인
    const currentStep = await queryOne(
      `SELECT * FROM approval_steps
       WHERE document_id = $1 AND approver_id = $2 AND status = 'pending'
       ORDER BY step_order ASC LIMIT 1`,
      [params.id, userId]
    );
    if (!currentStep) {
      return NextResponse.json({ success: false, error: '결재 권한이 없거나 이미 처리된 단계입니다' }, { status: 403 });
    }

    // 현재 단계가 맞는지 확인 (step_order와 current_step 매핑)
    // current_step=1 → step_order=2(팀장), current_step=2 → step_order=3(중역), current_step=3 → step_order=4(대표이사)
    const expectedStepOrder = doc.current_step + 1;
    if (currentStep.step_order !== expectedStepOrder) {
      return NextResponse.json({ success: false, error: '아직 내 결재 차례가 아닙니다' }, { status: 403 });
    }

    // 현재 step 승인 처리
    await queryOne(
      `UPDATE approval_steps
       SET status = 'approved', approved_at = NOW(), comment = $1
       WHERE id = $2`,
      [comment, currentStep.id]
    );

    const typeLabel = DOC_TYPE_LABEL[doc.document_type] || doc.document_type;

    // 남은 pending steps 중 다음 step 찾기 (자동 승인 step 건너뜀)
    const remainingSteps = await queryAll(
      `SELECT * FROM approval_steps
       WHERE document_id = $1 AND step_order > $2
       ORDER BY step_order ASC`,
      [params.id, currentStep.step_order]
    );

    const nextPendingStep = (remainingSteps || []).find((s: any) => s.status === 'pending');

    if (!nextPendingStep) {
      // 모든 step 처리 완료 → 최종 승인
      await queryOne(
        `UPDATE approval_documents
         SET status = 'approved', current_step = 4, completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [params.id]
      );

      // 상신자에게 최종 승인 알림
      await sendNotification({
        targetUserId: doc.requester_id,
        title: '[결재 완료]',
        message: `${typeLabel}(${doc.document_number})이 최종 승인되었습니다.`,
        category: 'report_approved',
        documentId: params.id, documentNumber: doc.document_number,
        documentType: doc.document_type,
      });

      // 경영지원 부서에 결재 완료 통보
      const allSteps = await queryAll(
        `SELECT step_order, approver_name FROM approval_steps WHERE document_id = $1 ORDER BY step_order ASC`,
        [params.id]
      );
      const requesterEmployee = await queryOne(
        `SELECT name FROM employees WHERE id = $1`,
        [doc.requester_id]
      );
      await notifyManagementSupportDept({
        doc,
        allSteps: allSteps || [],
        documentId: params.id,
        requesterName: requesterEmployee?.name || '담당자',
      });

      return NextResponse.json({ success: true, message: '최종 승인 완료', finalApproved: true });
    }

    // current_step 업데이트 (next pending step의 step_order - 1)
    const nextStep = nextPendingStep.step_order - 1;
    await queryOne(
      `UPDATE approval_documents SET current_step = $1, updated_at = NOW() WHERE id = $2`,
      [nextStep, params.id]
    );

    // 다음 결재자에게 알림
    const stepLabel = nextPendingStep.role_label;
    await sendNotification({
      targetUserId: nextPendingStep.approver_id,
      title: '[결재 요청]',
      message: `${typeLabel}(${doc.document_number}) - 이전 단계 승인 완료. ${stepLabel} 결재를 진행해 주세요.`,
      category: 'report_submitted',
      documentId: params.id, documentNumber: doc.document_number,
      documentType: doc.document_type,
    });

    return NextResponse.json({ success: true, message: '승인 완료', nextStep });
  } catch (error: any) {
    console.error('[API] POST /approvals/[id]/approve error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
