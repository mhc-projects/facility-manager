import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function sendNotification({
  targetUserId, title, message, documentId, documentNumber, documentType,
}: {
  targetUserId: string; title: string; message: string;
  documentId: string; documentNumber: string; documentType: string;
}) {
  try {
    // 1. DB에 알림 저장
    const { data: inserted, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        title,
        message,
        category: 'report_rejected',
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
      console.error('[APPROVAL] 반려 알림 DB 저장 실패:', error);
      return;
    }

    // 2. Supabase Broadcast로 즉시 실시간 전달 (postgres_changes RLS 우회)
    // 클라이언트는 'approval-notify:{userId}' 채널을 구독해 즉시 수신
    await supabaseAdmin
      .channel(`approval-notify:${targetUserId}`)
      .send({
        type: 'broadcast',
        event: 'new_notification',
        payload: {
          id: inserted.id,
          title: inserted.title,
          message: inserted.message,
          category: 'report_rejected',
          priority: 'high',
          related_url: `/admin/approvals/${documentId}`,
          created_at: inserted.created_at,
        }
      });

    console.log('[APPROVAL] 반려 알림 broadcast 발송 완료 → user:', targetUserId);
  } catch (e) { console.warn('[APPROVAL] 반려 알림 발송 예외:', e); }
}

const DOC_TYPE_LABEL: Record<string, string> = {
  expense_claim: '지출결의서', purchase_request: '구매요청서',
  leave_request: '휴가원', business_proposal: '업무품의서', overtime_log: '연장근무일지',
};

/**
 * POST /api/approvals/[id]/reject
 * 결재 반려
 * body: { comment: string } (필수)
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
    const comment = (body.comment || '').trim();
    if (!comment) {
      return NextResponse.json({ success: false, error: '반려 사유를 입력해 주세요' }, { status: 400 });
    }

    // 문서 조회
    const doc = await queryOne(
      `SELECT d.*, e.name AS requester_name
       FROM approval_documents d
       LEFT JOIN employees e ON e.id = d.requester_id
       WHERE d.id = $1 AND d.is_deleted = FALSE`,
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
      `SELECT s.*, e.name AS approver_name
       FROM approval_steps s
       LEFT JOIN employees e ON e.id = s.approver_id
       WHERE s.document_id = $1 AND s.approver_id = $2 AND s.status = 'pending'
       ORDER BY s.step_order ASC LIMIT 1`,
      [params.id, userId]
    );
    if (!currentStep) {
      return NextResponse.json({ success: false, error: '결재 권한이 없거나 이미 처리된 단계입니다' }, { status: 403 });
    }

    const expectedStepOrder = doc.current_step + 1;
    if (currentStep.step_order !== expectedStepOrder) {
      return NextResponse.json({ success: false, error: '아직 내 결재 차례가 아닙니다' }, { status: 403 });
    }

    // 현재 step 반려 처리
    await queryOne(
      `UPDATE approval_steps
       SET status = 'rejected', approved_at = NOW(), comment = $1
       WHERE id = $2`,
      [comment, currentStep.id]
    );

    // 반려 이력 추가
    const currentHistory = doc.rejection_history || [];
    const newHistory = [
      ...currentHistory,
      {
        rejected_by: currentStep.approver_name || '',
        rejected_by_id: userId,
        role_label: currentStep.role_label,
        reason: comment,
        rejected_at: new Date().toISOString(),
      }
    ];

    // 문서 상태 → rejected (작성자가 수정 후 재상신 가능)
    await queryOne(
      `UPDATE approval_documents
       SET status = 'rejected',
           rejection_history = $1::JSONB,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(newHistory), params.id]
    );

    // 작성자에게 반려 사유 포함 알림 발송
    const typeLabel = DOC_TYPE_LABEL[doc.document_type] || doc.document_type;
    await sendNotification({
      targetUserId: doc.requester_id,
      title: '[결재 반려]',
      message: `${typeLabel}(${doc.document_number})이 반려되었습니다.\n반려 사유: ${comment}`,
      documentId: params.id, documentNumber: doc.document_number,
      documentType: doc.document_type,
    });

    return NextResponse.json({ success: true, message: '반려 완료' });
  } catch (error: any) {
    console.error('[API] POST /approvals/[id]/reject error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
