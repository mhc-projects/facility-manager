import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/approvals/[id]
 * 결재 문서 상세 조회 (결재 단계 포함)
 */
export async function GET(
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
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1;
    const isSuperAdmin = permissionLevel >= 4;

    const doc = await queryOne(
      `SELECT
        d.*,
        e.name   AS requester_name,
        tl.name  AS team_leader_name,
        ex.name  AS executive_name,
        vp.name  AS vice_president_name,
        ceo.name AS ceo_name
       FROM approval_documents d
       LEFT JOIN employees e   ON e.id = d.requester_id
       LEFT JOIN employees tl  ON tl.id = d.team_leader_id
       LEFT JOIN employees ex  ON ex.id = d.executive_id
       LEFT JOIN employees vp  ON vp.id = d.vice_president_id
       LEFT JOIN employees ceo ON ceo.id = d.ceo_id
       WHERE d.id = $1 AND d.is_deleted = FALSE`,
      [params.id]
    );

    if (!doc) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
    }

    // 접근 권한 체크: 슈퍼 관리자, 작성자 본인, 결재선 포함자만 허용
    if (!isSuperAdmin) {
      const isRequester = doc.requester_id === userId;
      const isInApprovalLine =
        doc.team_leader_id === userId ||
        doc.executive_id === userId ||
        doc.vice_president_id === userId ||
        doc.ceo_id === userId;
      if (!isRequester && !isInApprovalLine) {
        // 총무팀(is_management_support) 직원인지 확인
        const mgmtMember = await queryOne(
          `SELECT e.id FROM employees e
           JOIN teams t ON t.name = e.team
           JOIN departments d ON d.name = e.department
           WHERE e.id = $1 AND t.is_management_support = TRUE
             AND e.is_deleted = FALSE AND e.is_active = TRUE
           LIMIT 1`,
          [userId]
        );
        if (!mgmtMember) {
          return NextResponse.json({ success: false, error: '이 문서에 접근할 권한이 없습니다' }, { status: 403 });
        }
      }
    }

    const steps = await queryAll(
      `SELECT s.*, e.name AS approver_name_live
       FROM approval_steps s
       LEFT JOIN employees e ON e.id = s.approver_id
       WHERE s.document_id = $1
       ORDER BY s.step_order ASC`,
      [params.id]
    );

    return NextResponse.json({ success: true, data: { ...doc, steps: steps || [] } });
  } catch (error: any) {
    console.error('[API] GET /approvals/[id] error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}

/**
 * PUT /api/approvals/[id]
 * 결재 문서 수정 (draft 또는 returned 상태일 때만 가능)
 */
export async function PUT(
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

    const doc = await queryOne(
      `SELECT * FROM approval_documents WHERE id = $1 AND is_deleted = FALSE`,
      [params.id]
    );

    if (!doc) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
    }
    if (doc.requester_id !== userId) {
      return NextResponse.json({ success: false, error: '본인이 작성한 문서만 수정할 수 있습니다' }, { status: 403 });
    }
    if (!['draft', 'returned', 'rejected', 'pending'].includes(doc.status)) {
      return NextResponse.json({ success: false, error: '임시저장, 반려 또는 결재 대기 중인 문서만 수정할 수 있습니다' }, { status: 400 });
    }

    // pending 상태: 작성자(1단계) 이후 첫 번째 실질 결재자가 아직 미처리인 경우에만 수정 허용
    if (doc.status === 'pending') {
      const approvedByOthers = await queryOne(
        `SELECT COUNT(*) AS cnt FROM approval_steps
         WHERE document_id = $1 AND status = 'approved' AND step_order > 1 AND approver_id != $2`,
        [params.id, userId]
      );
      if (approvedByOthers && Number(approvedByOthers.cnt) > 0) {
        return NextResponse.json({ success: false, error: '이미 결재가 진행된 문서는 수정할 수 없습니다' }, { status: 400 });
      }
    }

    const body = await request.json();
    const { title, team_leader_id, executive_id, vice_president_id, ceo_id, form_data, department } = body;

    // pending 상태에서 수정 시: draft로 되돌리고 결재 단계 초기화 (재상신 필요)
    const wasPending = doc.status === 'pending';

    const updated = await queryOne(
      `UPDATE approval_documents
       SET title = COALESCE($1, title),
           department = COALESCE($2, department),
           team_leader_id = $3,
           executive_id = $4,
           vice_president_id = $5,
           ceo_id = $6,
           form_data = COALESCE($7, form_data),
           ${wasPending ? "status = 'draft', current_step = 0," : ''}
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        title || null,
        department || null,
        team_leader_id || null,
        executive_id || null,
        vice_president_id || null,
        ceo_id || null,
        form_data ? JSON.stringify(form_data) : null,
        params.id
      ]
    );

    // pending → draft 전환 시 기존 결재 단계 삭제 (재상신 시 다시 생성됨)
    if (wasPending) {
      await queryOne(
        `DELETE FROM approval_steps WHERE document_id = $1`,
        [params.id]
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[API] PUT /approvals/[id] error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}

/**
 * DELETE /api/approvals/[id]
 * 결재 문서 취소/삭제
 * - 일반 사용자: draft/returned/rejected 상태의 본인 문서만 삭제 가능
 * - 권한 4(슈퍼 관리자): 모든 상태의 모든 문서 강제 취소 가능
 */
export async function DELETE(
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
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1;
    const isSuperAdmin = permissionLevel >= 4;

    const doc = await queryOne(
      `SELECT * FROM approval_documents WHERE id = $1 AND is_deleted = FALSE`,
      [params.id]
    );

    if (!doc) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
    }

    if (!isSuperAdmin) {
      // 일반 사용자: 본인 문서 + 삭제 가능한 상태만
      if (doc.requester_id !== userId) {
        return NextResponse.json({ success: false, error: '본인이 작성한 문서만 삭제할 수 있습니다' }, { status: 403 });
      }
      if (!['draft', 'returned', 'rejected', 'pending'].includes(doc.status)) {
        return NextResponse.json({ success: false, error: '임시저장, 반려 또는 결재 대기 중인 문서만 삭제할 수 있습니다' }, { status: 400 });
      }

      // pending 상태: 작성자(1단계) 이후 첫 번째 실질 결재자가 아직 미처리인 경우에만 삭제 허용
      if (doc.status === 'pending') {
        const approvedByOthers = await queryOne(
          `SELECT COUNT(*) AS cnt FROM approval_steps
           WHERE document_id = $1 AND status = 'approved' AND step_order > 1 AND approver_id != $2`,
          [params.id, userId]
        );
        if (approvedByOthers && Number(approvedByOthers.cnt) > 0) {
          return NextResponse.json({ success: false, error: '이미 결재가 진행된 문서는 삭제할 수 없습니다' }, { status: 400 });
        }
      }
    }

    await queryOne(
      `UPDATE approval_documents SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
      [params.id]
    );

    // 문서 소유자 목록 실시간 갱신 (내 문서 탭 즉시 반영)
    await supabaseAdmin.channel(`approval-notify:${doc.requester_id}`)
      .send({
        type: 'broadcast',
        event: 'new_notification',
        payload: { category: 'doc_deleted', silent: true },
      });

    // 상세 페이지가 열려있는 경우 처리 (삭제됨 이벤트 수신 후 목록으로 redirect)
    await supabaseAdmin.channel(`approval-doc:${params.id}`)
      .send({ type: 'broadcast', event: 'doc_updated', payload: { id: params.id, status: 'deleted' } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] DELETE /approvals/[id] error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
