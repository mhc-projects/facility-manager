import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWebPushToUser } from '@/lib/send-push';
import { sendTelegramToUser } from '@/lib/send-telegram';

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

    // Web Push (앱이 닫혀있어도 네이티브 알림)
    await sendWebPushToUser(targetUserId, {
      title,
      body: message,
      url: `/admin/approvals/${documentId}`,
      category,
    });

    // 텔레그램 알림 (iOS 네이티브 알림 대안)
    await sendTelegramToUser(targetUserId, {
      title,
      body: message,
      url: `/admin/approvals/${documentId}`,
    });
  } catch (e) { console.warn('[APPROVAL] 알림 발송 예외:', e); }
}

const DOC_TYPE_LABEL: Record<string, string> = {
  expense_claim: '지출결의서', purchase_request: '구매요청서',
  leave_request: '휴가원', business_proposal: '업무품의서', overtime_log: '연장근무일지',
};

/**
 * 최종 승인 완료 시 작성팀 직원 전체에게 알림 발송 (업무품의서 전용)
 * department_id에 teams.id가 저장됨 → teams에서 부서명/팀명 조회 후 employees 필터
 */
async function notifyWritingTeam({
  doc, documentId,
}: {
  doc: any; documentId: string;
}) {
  try {
    const formData = typeof doc.form_data === 'string' ? JSON.parse(doc.form_data) : doc.form_data;
    const teamId = formData?.department_id;
    const teamDisplayName = formData?.department;
    if (!teamId && !teamDisplayName) return;

    let staffList;
    if (teamId) {
      // teams.id로 팀 정보 조회 → 해당 팀 직원만 필터
      const teamInfo = await queryOne(
        `SELECT t.name AS team_name, d.name AS dept_name
         FROM teams t JOIN departments d ON d.id = t.department_id
         WHERE t.id = $1`,
        [teamId]
      );
      if (teamInfo) {
        staffList = await queryAll(
          `SELECT id FROM employees WHERE department = $1 AND team = $2 AND is_deleted = FALSE AND is_active = TRUE`,
          [teamInfo.dept_name, teamInfo.team_name]
        );
      }
    }
    if (!staffList || staffList.length === 0) return;

    // 작성자 본인 제외
    const targets = staffList.filter((s: any) => s.id !== doc.requester_id);
    if (targets.length === 0) return;

    const typeLabel = DOC_TYPE_LABEL[doc.document_type] || doc.document_type;
    const label = teamDisplayName || '작성팀';
    const title = '[업무품의서 승인 완료]';
    const message = `${doc.document_number} ${typeLabel}\n작성팀(${label}) 문서가 최종 승인되었습니다.`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const rows = targets.map((staff: any) => ({
      title,
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
    if (error) console.error('[APPROVAL] 작성팀 알림 DB 저장 실패:', error);

    await Promise.all(
      targets.map((staff: any) => Promise.all([
        sendWebPushToUser(staff.id, { title, body: message, url: `/admin/approvals/${documentId}`, category: 'report_approved' }),
        sendTelegramToUser(staff.id, { title, body: message, url: `/admin/approvals/${documentId}` }),
      ]))
    );
  } catch (e) {
    console.warn('[APPROVAL] 작성팀 통보 처리 실패:', e);
  }
}

/**
 * 최종 승인 완료 시 협조팀 직원 전체에게 알림 발송 (업무품의서 전용)
 * cooperative_team_id에 teams.id가 저장됨 → teams에서 부서명/팀명 조회 후 employees 필터
 */
async function notifyCooperativeTeam({
  doc, documentId,
}: {
  doc: any; documentId: string;
}) {
  try {
    const formData = typeof doc.form_data === 'string' ? JSON.parse(doc.form_data) : doc.form_data;
    const cooperativeTeamId = formData?.cooperative_team_id;
    const cooperativeTeamDisplayName = formData?.cooperative_team;
    if (!cooperativeTeamId && !cooperativeTeamDisplayName) return;

    let staffList;
    if (cooperativeTeamId) {
      const teamInfo = await queryOne(
        `SELECT t.name AS team_name, d.name AS dept_name
         FROM teams t JOIN departments d ON d.id = t.department_id
         WHERE t.id = $1`,
        [cooperativeTeamId]
      );
      if (teamInfo) {
        staffList = await queryAll(
          `SELECT id FROM employees WHERE department = $1 AND team = $2 AND is_deleted = FALSE AND is_active = TRUE`,
          [teamInfo.dept_name, teamInfo.team_name]
        );
      }
    }
    if (!staffList || staffList.length === 0) return;

    const typeLabel = DOC_TYPE_LABEL[doc.document_type] || doc.document_type;
    const teamLabel = cooperativeTeamDisplayName || '협조팀';
    const title = '[협조 요청 완료]';
    const message = `${doc.document_number} ${typeLabel}\n협조팀(${teamLabel})으로 지정된 문서가 최종 승인되었습니다.`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const rows = staffList.map((staff: any) => ({
      title,
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
    if (error) console.error('[APPROVAL] 협조팀 알림 DB 저장 실패:', error);

    await Promise.all(
      staffList.map((staff: any) => Promise.all([
        sendWebPushToUser(staff.id, { title, body: message, url: `/admin/approvals/${documentId}`, category: 'report_approved' }),
        sendTelegramToUser(staff.id, { title, body: message, url: `/admin/approvals/${documentId}` }),
      ]))
    );
  } catch (e) {
    console.warn('[APPROVAL] 협조팀 통보 처리 실패:', e);
  }
}

/**
 * 최종 승인 완료 시 총무팀 직원에게 알림 발송
 */
async function notifyManagementSupportDept({
  doc, allSteps, documentId, requesterName,
}: {
  doc: any; allSteps: any[]; documentId: string; requesterName: string;
}) {
  try {
    // 총무팀(teams.is_management_support = TRUE) 소속 직원만 알림 발송
    const mgmtTeam = await queryOne(
      `SELECT t.id, t.name AS team_name, d.name AS dept_name
       FROM teams t
       JOIN departments d ON d.id = t.department_id
       WHERE t.is_management_support = TRUE
       LIMIT 1`,
      []
    );
    if (!mgmtTeam) return;

    const staffList = await queryAll(
      `SELECT id FROM employees
       WHERE department = $1 AND team = $2
         AND is_deleted = FALSE AND is_active = TRUE`,
      [mgmtTeam.dept_name, mgmtTeam.team_name]
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

    const mgmtTitle = '[결재 완료 통보]';
    const rows = staffList.map((staff: any) => ({
      title: mgmtTitle,
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
    if (error) console.error('[APPROVAL] 총무팀 알림 DB 저장 실패:', error);

    // WebPush + 텔레그램 발송
    await Promise.all(
      staffList.map((staff: any) => Promise.all([
        sendWebPushToUser(staff.id, { title: mgmtTitle, body: message, url: `/admin/approvals/${documentId}`, category: 'report_approved' }),
        sendTelegramToUser(staff.id, { title: mgmtTitle, body: message, url: `/admin/approvals/${documentId}` }),
      ]))
    );
  } catch (e) {
    console.warn('[APPROVAL] 총무팀 통보 처리 실패:', e);
  }
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual:     '연차',
  condolence: '경조휴가',
  special:    '특별휴가',
  half_am:    '반차(오전)',
  half_pm:    '반차(오후)',
  other:      '기타휴가',
};

/**
 * 연속 날짜끼리 그룹화 (1일 차이면 같은 그룹, 그 이상이면 새 그룹)
 */
function groupConsecutiveDates(items: Array<{ date: string; leave_type: string; days: number }>) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const groups: Array<typeof sorted> = [];
  let current: typeof sorted = [];

  for (const item of sorted) {
    if (current.length === 0) {
      current.push(item);
    } else {
      const prevDate = new Date(current[current.length - 1].date);
      const currDate = new Date(item.date);
      const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        current.push(item);
      } else {
        groups.push(current);
        current = [item];
      }
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * 휴가원 최종 승인 완료 시 일정관리에 '연차' 라벨로 자동 등록
 * - 연속 날짜는 하나의 이벤트로, 비연속 날짜는 별도 이벤트로 생성
 * - 실패해도 결재 완료에는 영향 없음
 */
async function createLeaveCalendarEvent(doc: any, requesterName: string) {
  try {
    const formData = typeof doc.form_data === 'string' ? JSON.parse(doc.form_data) : doc.form_data;
    const totalDays = formData.total_days ?? 1;

    const insertQuery = `INSERT INTO calendar_events (
      title, description, event_date, end_date,
      event_type, is_completed, author_id, author_name,
      attached_files, labels
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`;

    if (Array.isArray(formData?.items) && formData.items.length > 0) {
      const groups = groupConsecutiveDates(formData.items);

      for (const group of groups) {
        const startDate = group[0].date;
        const endDate = group[group.length - 1].date;
        const groupDays = group.reduce((sum, i) => sum + (i.days ?? 1), 0);
        const typeLabels = [...new Set(group.map(i => LEAVE_TYPE_LABEL[i.leave_type] || '휴가'))];
        const leaveTypeDetail = typeLabels.join(', ');

        // 타이틀: 단일 종류면 종류명, 복수면 '연차'로 통합
        const title = typeLabels.length === 1
          ? `${requesterName} - ${typeLabels[0]}`
          : `${requesterName} - 연차 (${groupDays}일)`;

        const descriptionLines = [
          `[휴가원] ${doc.document_number}`,
          `신청자: ${requesterName} (${formData.department || ''})`,
          `휴가 종류: ${leaveTypeDetail}`,
          `기간: ${startDate} ~ ${endDate} (${groupDays}일)`,
          `전체 휴가: ${totalDays}일`,
          `사유: ${formData.reason || ''}`,
        ];
        if (formData.note) descriptionLines.push(`비고: ${formData.note}`);

        await queryOne(insertQuery, [
          title,
          descriptionLines.join('\n'),
          startDate,
          startDate === endDate ? null : endDate,
          'schedule',
          false,
          doc.requester_id,
          requesterName,
          JSON.stringify([]),
          ['연차'],
        ]);
      }
    } else if (formData?.start_date) {
      const startDate = formData.start_date;
      const endDate = formData.end_date || formData.start_date;
      const leaveTypeDetail = LEAVE_TYPE_LABEL[formData.leave_type] || '휴가';

      const descriptionLines = [
        `[휴가원] ${doc.document_number}`,
        `신청자: ${requesterName} (${formData.department || ''})`,
        `휴가 종류: ${leaveTypeDetail}`,
        `기간: ${startDate} ~ ${endDate} (${totalDays}일)`,
        `사유: ${formData.reason || ''}`,
      ];
      if (formData.note) descriptionLines.push(`비고: ${formData.note}`);

      await queryOne(insertQuery, [
        `${requesterName} - ${leaveTypeDetail}`,
        descriptionLines.join('\n'),
        startDate,
        startDate === endDate ? null : endDate,
        'schedule',
        false,
        doc.requester_id,
        requesterName,
        JSON.stringify([]),
        ['연차'],
      ]);
    } else {
      return;
    }

    console.log('[APPROVAL] 휴가원 일정 자동 등록 완료:', doc.document_number);
  } catch (e) {
    console.warn('[APPROVAL] 휴가원 일정 등록 실패 (결재 완료는 정상 처리됨):', e);
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

      // 업무품의서인 경우 작성팀 + 협조팀에 알림 발송
      if (doc.document_type === 'business_proposal') {
        await Promise.all([
          notifyWritingTeam({ doc, documentId: params.id }),
          notifyCooperativeTeam({ doc, documentId: params.id }),
        ]);
      }

      // 휴가원인 경우 일정관리에 '연차' 라벨로 자동 등록
      if (doc.document_type === 'leave_request') {
        await createLeaveCalendarEvent(doc, requesterEmployee?.name || '담당자');
      }

      // 설치비 마감인 경우 pending → paid 자동 전환
      if (doc.document_type === 'installation_closing') {
        try {
          const formData = typeof doc.form_data === 'string' ? JSON.parse(doc.form_data) : doc.form_data;
          const businessIds = formData?.business_ids || [];
          const closingType = formData?.closing_type || 'forecast';
          if (businessIds.length > 0) {
            await queryOne(`
              UPDATE installation_payments
              SET status = 'paid', payment_date = CURRENT_DATE
              WHERE business_id = ANY($1)
                AND payment_type = $2
                AND status = 'pending'
                AND notes LIKE $3
            `, [businessIds, closingType, `%${doc.document_number}%`]);
            console.log(`✅ [APPROVAL] 설치비 마감 자동 지급 처리: ${businessIds.length}건 (${doc.document_number})`);
          }
        } catch (closingErr) {
          console.error('⚠️ [APPROVAL] 설치비 마감 자동 처리 실패:', closingErr);
        }
      }

      // 문서 상세 페이지 실시간 갱신 트리거
      await supabaseAdmin.channel(`approval-doc:${params.id}`)
        .send({ type: 'broadcast', event: 'doc_updated', payload: { id: params.id, status: 'approved' } });

      return NextResponse.json({ success: true, message: '최종 승인 완료', finalApproved: true });
    }

    // current_step 업데이트 (next pending step의 step_order - 1)
    const nextStep = nextPendingStep.step_order - 1;
    await queryOne(
      `UPDATE approval_documents SET current_step = $1, updated_at = NOW() WHERE id = $2`,
      [nextStep, params.id]
    );

    // 다음 결재자에게 알림
    const stepOrderMap: Record<number, string> = { 2: '팀장', 3: '중역', 4: '대표이사' }
    const stepLabel = nextPendingStep.role_label || stepOrderMap[nextPendingStep.step_order] || '결재자'
    await sendNotification({
      targetUserId: nextPendingStep.approver_id,
      title: '[결재 요청]',
      message: `${typeLabel}(${doc.document_number}) - 이전 단계 승인 완료. ${stepLabel} 결재를 진행해 주세요.`,
      category: 'report_submitted',
      documentId: params.id, documentNumber: doc.document_number,
      documentType: doc.document_type,
    });

    // 상신자에게 진행 단계 변경 알림 (목록 실시간 갱신용 silent broadcast)
    if (doc.requester_id !== nextPendingStep.approver_id) {
      await supabaseAdmin.channel(`approval-notify:${doc.requester_id}`)
        .send({
          type: 'broadcast',
          event: 'new_notification',
          payload: { category: 'report_submitted', silent: true },
        });
    }

    // 문서 상세 페이지 실시간 갱신 트리거
    await supabaseAdmin.channel(`approval-doc:${params.id}`)
      .send({ type: 'broadcast', event: 'doc_updated', payload: { id: params.id, status: 'pending' } });

    return NextResponse.json({ success: true, message: '승인 완료', nextStep });
  } catch (error: any) {
    console.error('[API] POST /approvals/[id]/approve error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
