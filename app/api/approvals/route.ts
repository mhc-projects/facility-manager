import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery, queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/approvals
 * 결재 문서 목록 조회
 * Query params:
 *   - type: 문서 유형 필터
 *   - status: 상태 필터 (comma separated)
 *   - mine: 'true' → 내가 작성한 문서
 *   - pending_mine: 'true' → 내가 결재해야 할 문서
 *   - limit, offset
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const typeFilter    = searchParams.get('type');
    const statusFilter  = searchParams.get('status');
    const mine          = searchParams.get('mine') === 'true';
    const pendingMine   = searchParams.get('pending_mine') === 'true';
    const limit         = parseInt(searchParams.get('limit') || '50');
    const offset        = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = ['d.is_deleted = FALSE'];
    const values: any[] = [];
    let idx = 1;

    if (pendingMine) {
      // 내가 결재해야 할 문서 (현재 내 차례인 것)
      conditions.push(`d.id IN (
        SELECT s.document_id FROM approval_steps s
        WHERE s.approver_id = $${idx++}
          AND s.status = 'pending'
          AND (
            (s.step_order = 2 AND d.current_step = 1)
            OR (s.step_order = 3 AND d.current_step = 2)
            OR (s.step_order = 4 AND d.current_step = 3)
          )
      ) AND d.status = 'pending'`);
      values.push(userId);
    } else if (mine) {
      conditions.push(`d.requester_id = $${idx++}`);
      values.push(userId);
    } else {
      // 전체 탭: draft(임시저장)는 본인 문서만, 상신된 문서는 모두 표시
      conditions.push(`(d.status != 'draft' OR d.requester_id = $${idx++})`);
      values.push(userId);
    }

    if (typeFilter) {
      conditions.push(`d.document_type = $${idx++}`);
      values.push(typeFilter);
    }

    if (statusFilter) {
      const statuses = statusFilter.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(`d.status = ANY($${idx++}::VARCHAR[])`);
        values.push(statuses);
      }
    }

    const whereClause = conditions.join(' AND ');

    // 총 건수
    const countResult = await queryOne(
      `SELECT COUNT(*) AS total FROM approval_documents d WHERE ${whereClause}`,
      values
    );

    // 목록 조회
    values.push(limit, offset);
    const rows = await queryAll(
      `SELECT
        d.id, d.document_number, d.document_type, d.title,
        d.status, d.current_step, d.department,
        d.requester_id, d.team_leader_id, d.executive_id, d.ceo_id,
        d.created_at, d.submitted_at, d.completed_at, d.updated_at,
        e.name AS requester_name,
        tl.name AS team_leader_name,
        ex.name AS executive_name,
        ceo.name AS ceo_name
       FROM approval_documents d
       LEFT JOIN employees e   ON e.id = d.requester_id
       LEFT JOIN employees tl  ON tl.id = d.team_leader_id
       LEFT JOIN employees ex  ON ex.id = d.executive_id
       LEFT JOIN employees ceo ON ceo.id = d.ceo_id
       WHERE ${whereClause}
       ORDER BY d.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    return NextResponse.json({
      success: true,
      data: rows || [],
      total: parseInt(countResult?.total || '0', 10)
    });
  } catch (error: any) {
    console.error('[API] GET /approvals error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}

/**
 * POST /api/approvals
 * 결재 문서 신규 생성 (임시저장)
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { document_type, title, team_leader_id, executive_id, ceo_id, form_data, department } = body;

    if (!document_type || !title) {
      return NextResponse.json({ success: false, error: '문서 유형과 제목은 필수입니다' }, { status: 400 });
    }

    // 문서번호 자동생성 (PostgreSQL 함수 호출)
    const numResult = await queryOne(
      `SELECT generate_document_number($1) AS doc_number`,
      [document_type]
    );
    const documentNumber = numResult?.doc_number;

    if (!documentNumber) {
      return NextResponse.json({ success: false, error: '문서번호 생성 실패' }, { status: 500 });
    }

    const result = await queryOne(
      `INSERT INTO approval_documents
        (document_number, document_type, title, requester_id, department,
         team_leader_id, executive_id, ceo_id, form_data, status, current_step)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',0)
       RETURNING *`,
      [
        documentNumber,
        document_type,
        title,
        userId,
        department || null,
        team_leader_id || null,
        executive_id || null,
        ceo_id || null,
        JSON.stringify(form_data || {})
      ]
    );

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: any) {
    console.error('[API] POST /approvals error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
