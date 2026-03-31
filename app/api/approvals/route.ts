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
 *   - completed_tab: 'true' → 결재완료 탭 (총무팀/권한4 전용)
 *   - search: 검색어 (문서번호, 제목, 작성자명)
 *   - date_from: 완료일 범위 시작 (YYYY-MM-DD)
 *   - date_to: 완료일 범위 끝 (YYYY-MM-DD)
 *   - processed: 'true'|'false' → 처리확인 여부 필터
 *   - department: 부서 필터
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
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1;
    const isSuperAdmin = permissionLevel >= 4;

    const { searchParams } = new URL(request.url);
    const typeFilter      = searchParams.get('type');
    const statusFilter    = searchParams.get('status');
    const mine            = searchParams.get('mine') === 'true';
    const pendingMine     = searchParams.get('pending_mine') === 'true';
    const completedTab    = searchParams.get('completed_tab') === 'true';
    const searchQuery     = searchParams.get('search')?.trim() || null;
    const dateFrom        = searchParams.get('date_from') || null;
    const dateTo          = searchParams.get('date_to') || null;
    const processedFilter = searchParams.get('processed'); // 'true' | 'false' | null
    const departmentFilter= searchParams.get('department') || null;
    const limit           = parseInt(searchParams.get('limit') || '50');
    const offset          = parseInt(searchParams.get('offset') || '0');

    // ── 결재완료 탭: 총무팀 또는 권한4 전용 ──
    if (completedTab) {
      let isManagementSupport = false;
      if (!isSuperAdmin) {
        const emp = await queryOne(
          `SELECT e.department, e.team
           FROM employees e
           WHERE e.id = $1 AND e.is_deleted = FALSE`,
          [userId]
        );
        if (emp?.department && emp?.team) {
          const teamRow = await queryOne(
            `SELECT t.is_management_support
             FROM teams t
             JOIN departments d ON d.id = t.department_id
             WHERE d.name = $1 AND t.name = $2
             LIMIT 1`,
            [emp.department, emp.team]
          );
          isManagementSupport = teamRow?.is_management_support === true;
        }
      }

      if (!isSuperAdmin && !isManagementSupport) {
        return NextResponse.json({ success: false, error: '결재완료 탭 접근 권한이 없습니다' }, { status: 403 });
      }

      const conds: string[] = ["d.status = 'approved'", 'd.is_deleted = FALSE'];
      const vals: any[] = [];
      let ci = 1;

      if (searchQuery) {
        conds.push(`(
          d.document_number ILIKE $${ci} OR
          d.title ILIKE $${ci} OR
          e.name ILIKE $${ci}
        )`);
        vals.push(`%${searchQuery}%`);
        ci++;
      }

      if (typeFilter) {
        conds.push(`d.document_type = $${ci++}`);
        vals.push(typeFilter);
      }

      if (dateFrom) {
        conds.push(`d.completed_at >= $${ci++}::TIMESTAMPTZ`);
        vals.push(dateFrom);
      }

      if (dateTo) {
        conds.push(`d.completed_at < ($${ci++}::DATE + INTERVAL '1 day')::TIMESTAMPTZ`);
        vals.push(dateTo);
      }

      if (processedFilter === 'true') {
        conds.push('d.is_processed = TRUE');
      } else if (processedFilter === 'false') {
        conds.push('(d.is_processed = FALSE OR d.is_processed IS NULL)');
      }

      if (departmentFilter) {
        conds.push(`d.department = $${ci++}`);
        vals.push(departmentFilter);
      }

      const whereClause = conds.join(' AND ');

      const countResult = await queryOne(
        `SELECT COUNT(*) AS total
         FROM approval_documents d
         LEFT JOIN employees e ON e.id = d.requester_id
         WHERE ${whereClause}`,
        vals
      );

      vals.push(limit, offset);
      const rows = await queryAll(
        `SELECT
          d.id, d.document_number, d.document_type, d.title,
          d.status, d.current_step, d.department,
          d.requester_id,
          d.created_at, d.submitted_at, d.completed_at, d.updated_at,
          d.is_processed, d.processed_at, d.processed_by_name, d.process_note,
          e.name AS requester_name
         FROM approval_documents d
         LEFT JOIN employees e ON e.id = d.requester_id
         WHERE ${whereClause}
         ORDER BY d.is_processed ASC NULLS FIRST, d.completed_at DESC
         LIMIT $${ci++} OFFSET $${ci++}`,
        vals
      );

      return NextResponse.json({
        success: true,
        data: rows || [],
        total: parseInt(countResult?.total || '0', 10),
      });
    }

    // ── 일반 탭 (기존 로직) ──
    // 총무팀 여부 확인 (슈퍼어드민이 아닌 경우)
    let isManagementSupportGeneral = false;
    if (!isSuperAdmin) {
      const empGeneral = await queryOne(
        `SELECT e.department, e.team FROM employees e WHERE e.id = $1 AND e.is_deleted = FALSE`,
        [userId]
      );
      if (empGeneral?.department && empGeneral?.team) {
        const teamGeneral = await queryOne(
          `SELECT t.is_management_support
           FROM teams t
           JOIN departments d ON d.id = t.department_id
           WHERE d.name = $1 AND t.name = $2
           LIMIT 1`,
          [empGeneral.department, empGeneral.team]
        );
        isManagementSupportGeneral = teamGeneral?.is_management_support === true;
      }
    }

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
    } else if (isSuperAdmin) {
      // 권한 4(슈퍼 관리자): 모든 문서 열람 가능
    } else if (isManagementSupportGeneral) {
      // 총무팀: 승인완료 + 결재중 문서 열람 가능
      conditions.push(`d.status IN ('approved', 'pending')`);
    } else {
      // 전체 탭: 작성자 본인 OR 결재선에 포함된 문서
      // + 업무품의서의 경우 현재 사용자의 팀이 작성팀/협조팀이면 추가 조회
      // 신규 문서: department_id에 teams.id 저장 / 기존 문서: departments.id 저장 → 양쪽 호환
      conditions.push(`(
        d.requester_id = $${idx++}
        OR d.id IN (
          SELECT document_id FROM approval_steps WHERE approver_id = $${idx++}
        )
        OR (
          d.document_type = 'business_proposal'
          AND d.id IN (
            SELECT id FROM approval_documents bp
            WHERE bp.is_deleted = FALSE
              AND (
                (bp.form_data->>'department_id') IN (
                  SELECT t.id::TEXT FROM teams t
                  JOIN departments dd ON dd.id = t.department_id
                  WHERE dd.name = (SELECT department FROM employees WHERE id = $${idx++} AND is_deleted = FALSE LIMIT 1)
                    AND t.name = (SELECT team FROM employees WHERE id = $${idx++} AND is_deleted = FALSE LIMIT 1)
                )
                OR (bp.form_data->>'cooperative_team_id') IN (
                  SELECT t.id::TEXT FROM teams t
                  JOIN departments dd ON dd.id = t.department_id
                  WHERE dd.name = (SELECT department FROM employees WHERE id = $${idx++} AND is_deleted = FALSE LIMIT 1)
                    AND t.name = (SELECT team FROM employees WHERE id = $${idx++} AND is_deleted = FALSE LIMIT 1)
                )
                OR (bp.form_data->>'department_id') IN (
                  SELECT dd.id::TEXT FROM departments dd
                  WHERE dd.name = (SELECT department FROM employees WHERE id = $${idx++} AND is_deleted = FALSE LIMIT 1)
                )
                OR (bp.form_data->>'cooperative_team_id') IN (
                  SELECT dd.id::TEXT FROM departments dd
                  WHERE dd.name = (SELECT department FROM employees WHERE id = $${idx++} AND is_deleted = FALSE LIMIT 1)
                )
              )
          )
        )
      )`);
      values.push(userId, userId, userId, userId, userId, userId, userId, userId);
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
       ORDER BY d.submitted_at DESC NULLS LAST, d.created_at DESC
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
