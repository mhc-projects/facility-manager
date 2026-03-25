import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWebPushToUser } from '@/lib/send-push';
import { sendTelegramToUser } from '@/lib/send-telegram';

export const dynamic = 'force-dynamic';

/**
 * 알림 발송 헬퍼
 */
async function sendApprovalNotification({
  targetUserId,
  title,
  message,
  documentId,
  documentNumber,
  documentType,
}: {
  targetUserId: string;
  title: string;
  message: string;
  documentId: string;
  documentNumber: string;
  documentType: string;
}) {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase');

    // 1. DB에 알림 저장
    const { data: inserted, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        title,
        message,
        category: 'report_submitted',
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
      console.error('[APPROVAL] 상신 알림 DB 저장 실패:', error);
      return;
    }

    // 2. Broadcast로 즉시 실시간 전달 (reject/approve와 동일한 패턴)
    await supabaseAdmin
      .channel(`approval-notify:${targetUserId}`)
      .send({
        type: 'broadcast',
        event: 'new_notification',
        payload: {
          id: inserted.id,
          title: inserted.title,
          message: inserted.message,
          category: 'report_submitted',
          priority: 'high',
          related_url: `/admin/approvals/${documentId}`,
          created_at: inserted.created_at,
        }
      });

    console.log('[APPROVAL] 상신 알림 broadcast 발송 완료 → user:', targetUserId);

    // 3. Web Push (앱이 닫혀있어도 네이티브 알림)
    await sendWebPushToUser(targetUserId, {
      title,
      body: message,
      url: `/admin/approvals/${documentId}`,
      category: 'report_submitted',
    });

    // 4. 텔레그램 알림 (iOS 네이티브 알림 대안)
    await sendTelegramToUser(targetUserId, {
      title,
      body: message,
      url: `/admin/approvals/${documentId}`,
    });
  } catch (e) {
    console.warn('[APPROVAL] 상신 알림 발송 예외:', e);
  }
}

const DOC_TYPE_LABEL: Record<string, string> = {
  expense_claim: '지출결의서',
  purchase_request: '구매요청서',
  leave_request: '휴가원',
  business_proposal: '업무품의서',
  overtime_log: '연장근무일지',
};

/**
 * POST /api/approvals/[id]/submit
 * 결재 상신 또는 재상신
 * body: { resubmit?: boolean }
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
    const isResubmit = body.resubmit === true;

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
    if (doc.requester_id !== userId) {
      return NextResponse.json({ success: false, error: '본인이 작성한 문서만 상신할 수 있습니다' }, { status: 403 });
    }

    const allowedStatuses = isResubmit ? ['returned', 'rejected'] : ['draft'];
    if (!allowedStatuses.includes(doc.status)) {
      return NextResponse.json({
        success: false,
        error: isResubmit ? '반려된 문서만 재상신할 수 있습니다' : '임시저장 상태의 문서만 상신할 수 있습니다'
      }, { status: 400 });
    }

    if (!doc.team_leader_id) {
      return NextResponse.json({ success: false, error: '팀장을 선택해 주세요' }, { status: 400 });
    }
    if (!doc.executive_id) {
      return NextResponse.json({ success: false, error: '중역을 선택해 주세요' }, { status: 400 });
    }
    if (!doc.ceo_id) {
      return NextResponse.json({ success: false, error: '대표이사를 선택해 주세요' }, { status: 400 });
    }

    // 결재자 이름 조회
    const approverNames = await queryAll(
      `SELECT id, name FROM employees WHERE id = ANY($1::UUID[])`,
      [[doc.requester_id, doc.team_leader_id, doc.executive_id, doc.ceo_id]]
    );
    const nameMap: Record<string, string> = {};
    (approverNames || []).forEach((r: any) => { nameMap[r.id] = r.name; });

    // 재상신: 기존 steps 삭제
    if (isResubmit) {
      await queryOne(
        `DELETE FROM approval_steps WHERE document_id = $1`,
        [params.id]
      );
    }

    // 결재 단계 생성 (4단계)
    // 작성자가 팀장 또는 중역인 경우 해당 step 자동 승인 처리
    const steps = [
      { order: 1, label: '담당',     approver_id: doc.requester_id,   name: nameMap[doc.requester_id] },
      { order: 2, label: '팀장',     approver_id: doc.team_leader_id, name: nameMap[doc.team_leader_id] },
      { order: 3, label: '중역',     approver_id: doc.executive_id,   name: nameMap[doc.executive_id] },
      { order: 4, label: '대표이사', approver_id: doc.ceo_id,         name: nameMap[doc.ceo_id] },
    ];

    // 작성자와 동일한 approver_id를 가진 step은 자동 승인
    const isAutoApproved = (step: typeof steps[number]) =>
      step.order === 1 || step.approver_id === doc.requester_id;

    for (const step of steps) {
      const auto = isAutoApproved(step);
      const status = auto ? 'approved' : 'pending';
      const approvedAt = auto ? 'NOW()' : 'NULL';
      await queryOne(
        `INSERT INTO approval_steps
          (document_id, step_order, role_label, approver_id, approver_name, status, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, ${approvedAt})`,
        [params.id, step.order, step.label, step.approver_id, step.name || '', status]
      );
    }

    // 첫 번째 pending step을 찾아 current_step 결정
    const firstPendingStep = steps.find(s => !isAutoApproved(s));
    const initialStep = firstPendingStep ? firstPendingStep.order - 1 : steps.length;

    // 모든 step이 자동 승인된 경우(대표이사가 직접 작성) 바로 approved
    const allAutoApproved = steps.every(isAutoApproved);
    const newStatus = allAutoApproved ? 'approved' : 'pending';
    const completedAt = allAutoApproved ? 'NOW()' : 'NULL';

    await queryOne(
      `UPDATE approval_documents
       SET status = '${newStatus}',
           current_step = $2,
           submitted_at = COALESCE(submitted_at, NOW()),
           completed_at = ${completedAt},
           updated_at = NOW()
       WHERE id = $1`,
      [params.id, initialStep]
    );

    const typeLabel = DOC_TYPE_LABEL[doc.document_type] || doc.document_type;
    const requesterName = doc.requester_name || '담당자';
    const actionWord = isResubmit ? '수정하여 재상신' : '상신';

    // 알림 대상: 첫 번째 pending step의 결재자
    if (firstPendingStep) {
      await sendApprovalNotification({
        targetUserId: firstPendingStep.approver_id,
        title: '[결재 요청]',
        message: `${requesterName}님이 ${typeLabel}(${doc.document_number})을 ${actionWord}했습니다. 결재를 진행해 주세요.`,
        documentId: params.id,
        documentNumber: doc.document_number,
        documentType: doc.document_type,
      });
    }

    // 업무품의서: 작성팀 + 협조팀 부서원 전체에게 상신 알림
    if (doc.document_type === 'business_proposal') {
      const formData = typeof doc.form_data === 'string' ? JSON.parse(doc.form_data) : (doc.form_data || {});

      const writingTeamId   = formData?.department_id;
      const writingTeamName = formData?.department;
      const coopTeamId      = formData?.cooperative_team_id;
      const coopTeamName    = formData?.cooperative_team;

      // 부서 ID/name으로 직원 목록 조회
      const fetchDeptStaff = async (deptId?: string, deptName?: string): Promise<string[]> => {
        if (!deptId && !deptName) return [];
        let rows: any[];
        if (deptId) {
          rows = await queryAll(
            `SELECT id FROM employees WHERE department_id = $1 AND is_deleted = FALSE AND is_active = TRUE`,
            [deptId]
          );
        } else {
          rows = await queryAll(
            `SELECT id FROM employees WHERE department = $1 AND is_deleted = FALSE AND is_active = TRUE`,
            [deptName]
          );
        }
        return (rows || []).map((r: any) => r.id);
      };

      const [writingStaff, coopStaff] = await Promise.all([
        fetchDeptStaff(writingTeamId, writingTeamName),
        fetchDeptStaff(coopTeamId, coopTeamName),
      ]);

      // 중복 제거 + 작성자 본인 제외 (작성자는 이미 알고 있음)
      const notifySet = new Set([...writingStaff, ...coopStaff]);
      notifySet.delete(userId);

      const teamLabel = [writingTeamName, coopTeamName].filter(Boolean).join(' / ');
      const notifyMessage = `${requesterName}님이 업무품의서(${doc.document_number})를 ${actionWord}했습니다.`;

      await Promise.all(
        Array.from(notifySet).map(targetId =>
          sendApprovalNotification({
            targetUserId: targetId,
            title: '[업무품의서 상신]',
            message: notifyMessage,
            documentId: params.id,
            documentNumber: doc.document_number,
            documentType: doc.document_type,
          })
        )
      );

      if (notifySet.size > 0) {
        console.log(`[APPROVAL] 업무품의서 상신 알림 → ${notifySet.size}명 (${teamLabel})`);
      }
    }

    // 문서 상세 페이지 실시간 갱신 트리거
    await supabaseAdmin.channel(`approval-doc:${params.id}`)
      .send({ type: 'broadcast', event: 'doc_updated', payload: { id: params.id, status: newStatus } });

    return NextResponse.json({ success: true, message: isResubmit ? '재상신 완료' : '상신 완료' });
  } catch (error: any) {
    console.error('[API] POST /approvals/[id]/submit error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
