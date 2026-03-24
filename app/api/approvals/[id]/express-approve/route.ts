import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWebPushToUser } from '@/lib/send-push';

export const dynamic = 'force-dynamic';

async function sendNotification({
  targetUserId, title, message, category, documentId, documentNumber, documentType,
}: {
  targetUserId: string; title: string; message: string; category: string;
  documentId: string; documentNumber: string; documentType: string;
}) {
  try {
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
      console.error('[EXPRESS-APPROVE] 알림 DB 저장 실패:', error);
      return;
    }

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
        },
      });

    // Web Push (앱이 닫혀있어도 네이티브 알림)
    await sendWebPushToUser(targetUserId, {
      title,
      body: message,
      url: `/admin/approvals/${documentId}`,
      category,
    });
  } catch (e) {
    console.warn('[EXPRESS-APPROVE] 알림 발송 예외:', e);
  }
}

const DOC_TYPE_LABEL: Record<string, string> = {
  expense_claim: '지출결의서', purchase_request: '구매요청서',
  leave_request: '휴가원', business_proposal: '업무품의서', overtime_log: '연장근무일지',
};

async function notifyCooperativeTeam({
  doc, documentId,
}: {
  doc: any; documentId: string;
}) {
  try {
    const formData = typeof doc.form_data === 'string' ? JSON.parse(doc.form_data) : doc.form_data;
    const cooperativeTeamId = formData?.cooperative_team_id;
    const cooperativeTeamName = formData?.cooperative_team;
    if (!cooperativeTeamId && !cooperativeTeamName) return;

    let staffList;
    if (cooperativeTeamId) {
      staffList = await queryAll(
        `SELECT id FROM employees WHERE department_id = $1 AND is_deleted = FALSE AND is_active = TRUE`,
        [cooperativeTeamId]
      );
    } else {
      staffList = await queryAll(
        `SELECT id FROM employees WHERE department = $1 AND is_deleted = FALSE AND is_active = TRUE`,
        [cooperativeTeamName]
      );
    }
    if (!staffList || staffList.length === 0) return;

    const typeLabel = DOC_TYPE_LABEL[doc.document_type] || doc.document_type;
    const teamLabel = cooperativeTeamName || '협조팀';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const rows = staffList.map((staff: any) => ({
      title: '[협조 요청 완료]',
      message: `${doc.document_number} ${typeLabel}\n협조팀(${teamLabel})으로 지정된 문서가 최종 승인되었습니다.`,
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
    if (error) console.error('[EXPRESS-APPROVE] 협조팀 알림 DB 저장 실패:', error);
  } catch (e) {
    console.warn('[EXPRESS-APPROVE] 협조팀 통보 처리 실패:', e);
  }
}

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
      .filter((s: any) => s.step_order > 1 && s.status === 'approved')
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
      `결재선: ${stepSummary} [전결]\n` +
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
    if (error) console.error('[EXPRESS-APPROVE] 경영지원부 알림 DB 저장 실패:', error);
  } catch (e) {
    console.warn('[EXPRESS-APPROVE] 경영지원부 통보 처리 실패:', e);
  }
}

/**
 * POST /api/approvals/[id]/express-approve
 * 전결 처리 — executive role 사용자만 허용
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

    // 현재 사용자 정보 조회 (role 확인)
    const currentUser = await queryOne(
      `SELECT id, name, role FROM employees WHERE id = $1 AND is_deleted = FALSE AND is_active = TRUE`,
      [userId]
    );
    if (!currentUser) {
      return NextResponse.json({ success: false, error: '사용자를 찾을 수 없습니다' }, { status: 403 });
    }

    // 중역(executive)만 전결 가능
    if (currentUser.role !== 'executive') {
      return NextResponse.json({ success: false, error: '전결은 중역만 처리할 수 있습니다' }, { status: 403 });
    }

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

    // 해당 문서의 결재선에 현재 사용자가 중역으로 지정되어 있는지 확인
    if (doc.executive_id !== userId) {
      return NextResponse.json({ success: false, error: '이 문서의 결재선에 포함되지 않은 중역입니다' }, { status: 403 });
    }

    // 진행 중인 문서여야 함
    if (doc.status !== 'pending') {
      return NextResponse.json({ success: false, error: '결재 진행 중인 문서가 아닙니다' }, { status: 400 });
    }

    // 이미 전결 처리된 경우
    if (doc.is_express_approved) {
      return NextResponse.json({ success: false, error: '이미 전결 처리된 문서입니다' }, { status: 400 });
    }

    // 모든 steps 조회
    const allSteps = await queryAll(
      `SELECT * FROM approval_steps WHERE document_id = $1 ORDER BY step_order ASC`,
      [params.id]
    );
    if (!allSteps || allSteps.length === 0) {
      return NextResponse.json({ success: false, error: '결재 단계 정보가 없습니다' }, { status: 400 });
    }

    const myStep = allSteps.find((s: any) => s.approver_id === userId);
    if (!myStep) {
      return NextResponse.json({ success: false, error: '결재 단계를 찾을 수 없습니다' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const typeLabel = DOC_TYPE_LABEL[doc.document_type] || doc.document_type;

    // 트랜잭션: 중역 step 승인 + 이후 step skipped + 문서 최종완료
    // 1. 중역 본인 step → approved
    await queryOne(
      `UPDATE approval_steps
       SET status = 'approved', approved_at = $1, comment = $2
       WHERE id = $3`,
      [now, comment || '전결', myStep.id]
    );

    // 2. 아직 pending 상태인 이후 steps → skipped (전결로 건너뜀)
    //    중역보다 이전 단계이면서 pending인 steps도 skipped 처리 (전결은 모든 단계 완료로 간주)
    const pendingStepIds = allSteps
      .filter((s: any) => s.id !== myStep.id && s.status === 'pending')
      .map((s: any) => s.id);

    if (pendingStepIds.length > 0) {
      // IN 절 파라미터 동적 생성
      const placeholders = pendingStepIds.map((_: any, i: number) => `$${i + 1}`).join(', ');
      await queryOne(
        `UPDATE approval_steps
         SET status = 'skipped', skipped_reason = 'express_approval'
         WHERE id IN (${placeholders})`,
        pendingStepIds
      );
    }

    // 3. approval_documents 최종 완료 처리
    await queryOne(
      `UPDATE approval_documents
       SET status = 'approved',
           current_step = 4,
           completed_at = $1,
           updated_at = $1,
           is_express_approved = TRUE,
           express_approved_by = $2,
           express_approved_at = $1
       WHERE id = $3`,
      [now, userId, params.id]
    );

    // 4. 요청자에게 전결 완료 알림
    await sendNotification({
      targetUserId: doc.requester_id,
      title: '[전결 처리 완료]',
      message: `${typeLabel}(${doc.document_number})이 ${currentUser.name} 중역에 의해 전결 처리되었습니다.`,
      category: 'report_approved',
      documentId: params.id,
      documentNumber: doc.document_number,
      documentType: doc.document_type,
    });

    // 5. 경영지원 부서에 완료 통보
    const updatedSteps = await queryAll(
      `SELECT step_order, approver_name, status FROM approval_steps WHERE document_id = $1 ORDER BY step_order ASC`,
      [params.id]
    );
    const requesterEmployee = await queryOne(
      `SELECT name FROM employees WHERE id = $1`,
      [doc.requester_id]
    );
    await notifyManagementSupportDept({
      doc,
      allSteps: updatedSteps || [],
      documentId: params.id,
      requesterName: requesterEmployee?.name || '담당자',
    });

    // 업무품의서인 경우 협조팀에 알림 발송
    if (doc.document_type === 'business_proposal') {
      await notifyCooperativeTeam({ doc, documentId: params.id });
    }

    console.log(`[EXPRESS-APPROVE] 전결 완료: doc=${params.id}, executive=${currentUser.name}(${userId})`);

    // 문서 상세 페이지 실시간 갱신 트리거
    await supabaseAdmin.channel(`approval-doc:${params.id}`)
      .send({ type: 'broadcast', event: 'doc_updated', payload: { id: params.id, status: 'approved' } });

    return NextResponse.json({ success: true, message: '전결 처리 완료' });
  } catch (error: any) {
    console.error('[API] POST /approvals/[id]/express-approve error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
