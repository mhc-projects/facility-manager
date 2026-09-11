// 전자결재 문서의 작성일(written_date)만 한시적으로 수정하는 API — 결재 상태/단계는 건드리지 않는다
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { isWrittenDateEditWindowOpen, WRITTEN_DATE_EDIT_DEADLINE } from '@/lib/approval-written-date-edit';

export const dynamic = 'force-dynamic';

/**
 * 총무팀 소속 여부 확인 헬퍼
 */
async function isManagementSupportUser(userId: string): Promise<boolean> {
  const emp = await queryOne(
    `SELECT department, team FROM employees WHERE id = $1 AND is_deleted = FALSE`,
    [userId]
  );
  if (!emp?.department || !emp?.team) return false;
  const teamRow = await queryOne(
    `SELECT t.is_management_support
     FROM teams t
     JOIN departments d ON d.id = t.department_id
     WHERE d.name = $1 AND t.name = $2
     LIMIT 1`,
    [emp.department, emp.team]
  );
  return teamRow?.is_management_support === true;
}

const WRITTEN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PATCH /api/approvals/[id]/written-date
 * 작성일만 별도로 수정 — 결재 status/current_step/approval_steps는 그대로 유지, 이미 승인 완료된 문서도 대상
 * - 문서 작성자 본인, 총무팀, 또는 권한 4만 가능
 * - WRITTEN_DATE_EDIT_DEADLINE 까지만 한시적으로 허용 (기간 종료 후 자동 차단)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isWrittenDateEditWindowOpen()) {
      return NextResponse.json(
        { success: false, error: `작성일 수정 가능 기간이 종료되었습니다 (${WRITTEN_DATE_EDIT_DEADLINE.toLocaleDateString('ko-KR')}까지 한시 허용)` },
        { status: 403 }
      );
    }

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
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1;
    const isSuperAdmin = permissionLevel >= 4;

    const body = await request.json().catch(() => ({}));
    const writtenDate = body.written_date;
    if (typeof writtenDate !== 'string' || !WRITTEN_DATE_RE.test(writtenDate)) {
      return NextResponse.json({ success: false, error: '작성일 형식이 올바르지 않습니다 (YYYY-MM-DD)' }, { status: 400 });
    }

    const doc = await queryOne(
      `SELECT id, requester_id FROM approval_documents WHERE id = $1 AND is_deleted = FALSE`,
      [params.id]
    );
    if (!doc) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
    }

    const isOwner = doc.requester_id === userId;
    const isManagementSupport = (isOwner || isSuperAdmin) ? false : await isManagementSupportUser(userId);

    if (!isOwner && !isSuperAdmin && !isManagementSupport) {
      return NextResponse.json({ success: false, error: '작성일 수정 권한이 없습니다 (작성자 본인, 총무팀 또는 관리자만 가능)' }, { status: 403 });
    }

    const updated = await queryOne(
      `UPDATE approval_documents
       SET form_data = jsonb_set(COALESCE(form_data, '{}'::jsonb), '{written_date}', to_jsonb($1::text)),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, form_data`,
      [writtenDate, params.id]
    );

    await supabaseAdmin.channel(`approval-doc:${params.id}`)
      .send({ type: 'broadcast', event: 'doc_updated', payload: { id: params.id } });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[API] PATCH /approvals/[id]/written-date error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
