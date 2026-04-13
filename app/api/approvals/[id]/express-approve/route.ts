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

    // 텔레그램 알림 (iOS 네이티브 알림 대안)
    await sendTelegramToUser(targetUserId, {
      title,
      body: message,
      url: `/admin/approvals/${documentId}`,
    });
  } catch (e) {
    console.warn('[EXPRESS-APPROVE] 알림 발송 예외:', e);
  }
}

const DOC_TYPE_LABEL: Record<string, string> = {
  expense_claim: '지출결의서', purchase_request: '구매요청서',
  leave_request: '휴가원', business_proposal: '업무품의서', overtime_log: '연장근무일지',
};

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual:     '연차',
  condolence: '경조휴가',
  special:    '특별휴가',
  half_am:    '반차(오전)',
  half_pm:    '반차(오후)',
  other:      '기타휴가',
};

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

    console.log('[EXPRESS-APPROVE] 휴가원 일정 자동 등록 완료:', doc.document_number);
  } catch (e) {
    console.warn('[EXPRESS-APPROVE] 휴가원 일정 등록 실패 (결재 완료는 정상 처리됨):', e);
  }
}

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
    if (error) console.error('[EXPRESS-APPROVE] 작성팀 알림 DB 저장 실패:', error);

    await Promise.all(
      targets.map((staff: any) => Promise.all([
        sendWebPushToUser(staff.id, { title, body: message, url: `/admin/approvals/${documentId}`, category: 'report_approved' }),
        sendTelegramToUser(staff.id, { title, body: message, url: `/admin/approvals/${documentId}` }),
      ]))
    );
  } catch (e) {
    console.warn('[EXPRESS-APPROVE] 작성팀 통보 처리 실패:', e);
  }
}

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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const coopTitle = '[협조 요청 완료]';
    const coopMessage = `${doc.document_number} ${typeLabel}\n협조팀(${teamLabel})으로 지정된 문서가 최종 승인되었습니다.`;
    const rows = staffList.map((staff: any) => ({
      title: coopTitle,
      message: coopMessage,
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

    await Promise.all(
      staffList.map((staff: any) => Promise.all([
        sendWebPushToUser(staff.id, { title: coopTitle, body: coopMessage, url: `/admin/approvals/${documentId}`, category: 'report_approved' }),
        sendTelegramToUser(staff.id, { title: coopTitle, body: coopMessage, url: `/admin/approvals/${documentId}` }),
      ]))
    );
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
    if (error) console.error('[EXPRESS-APPROVE] 총무팀 알림 DB 저장 실패:', error);

    // WebPush + 텔레그램 발송
    await Promise.all(
      staffList.map((staff: any) => Promise.all([
        sendWebPushToUser(staff.id, { title: mgmtTitle, body: message, url: `/admin/approvals/${documentId}`, category: 'report_approved' }),
        sendTelegramToUser(staff.id, { title: mgmtTitle, body: message, url: `/admin/approvals/${documentId}` }),
      ]))
    );
  } catch (e) {
    console.warn('[EXPRESS-APPROVE] 총무팀 통보 처리 실패:', e);
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
              AND notes = $3
          `, [businessIds, closingType, `결재문서: ${doc.document_number}`]);
          console.log(`✅ [EXPRESS-APPROVE] 설치비 마감 자동 지급 처리: ${businessIds.length}건 (${doc.document_number})`);
        }
      } catch (closingErr) {
        console.error('⚠️ [EXPRESS-APPROVE] 설치비 마감 자동 처리 실패:', closingErr);
      }
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
