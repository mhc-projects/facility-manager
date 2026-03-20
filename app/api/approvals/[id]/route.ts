import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

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

    const doc = await queryOne(
      `SELECT
        d.*,
        e.name   AS requester_name,
        tl.name  AS team_leader_name,
        ex.name  AS executive_name,
        ceo.name AS ceo_name
       FROM approval_documents d
       LEFT JOIN employees e   ON e.id = d.requester_id
       LEFT JOIN employees tl  ON tl.id = d.team_leader_id
       LEFT JOIN employees ex  ON ex.id = d.executive_id
       LEFT JOIN employees ceo ON ceo.id = d.ceo_id
       WHERE d.id = $1 AND d.is_deleted = FALSE`,
      [params.id]
    );

    if (!doc) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
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
    if (!['draft', 'returned', 'rejected'].includes(doc.status)) {
      return NextResponse.json({ success: false, error: '임시저장 또는 반려된 문서만 수정할 수 있습니다' }, { status: 400 });
    }

    const body = await request.json();
    const { title, team_leader_id, executive_id, ceo_id, form_data, department } = body;

    const updated = await queryOne(
      `UPDATE approval_documents
       SET title = COALESCE($1, title),
           department = COALESCE($2, department),
           team_leader_id = $3,
           executive_id = $4,
           ceo_id = $5,
           form_data = COALESCE($6, form_data),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        title || null,
        department || null,
        team_leader_id || null,
        executive_id || null,
        ceo_id || null,
        form_data ? JSON.stringify(form_data) : null,
        params.id
      ]
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[API] PUT /approvals/[id] error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}

/**
 * DELETE /api/approvals/[id]
 * 결재 문서 취소/삭제 (draft 상태만 삭제, pending→cancelled)
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

    const doc = await queryOne(
      `SELECT * FROM approval_documents WHERE id = $1 AND is_deleted = FALSE`,
      [params.id]
    );

    if (!doc) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
    }
    if (doc.requester_id !== userId) {
      return NextResponse.json({ success: false, error: '본인이 작성한 문서만 삭제할 수 있습니다' }, { status: 403 });
    }
    if (!['draft', 'returned', 'rejected'].includes(doc.status)) {
      return NextResponse.json({ success: false, error: '임시저장 또는 반려된 문서만 삭제할 수 있습니다' }, { status: 400 });
    }

    await queryOne(
      `UPDATE approval_documents SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
      [params.id]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] DELETE /approvals/[id] error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
