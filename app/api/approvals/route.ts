import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery, queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { isApprovalFullAccessEmail, isApprovalCompletedTabAccessEmail } from '@/lib/approval-access';
import { normalizeApproverIds } from '@/lib/approval-line';
import { getKoreanHolidays } from '@/lib/holidays';

export const dynamic = 'force-dynamic';

// 휴가원 항목 배열 — items가 없는 초기 양식(start_date/leave_type/total_days 최상위 저장)은 단일 항목으로 변환
const LEAVE_ITEMS_SQL = `jsonb_array_elements(
  CASE WHEN jsonb_typeof(d.form_data->'items') = 'array' THEN d.form_data->'items'
  ELSE jsonb_build_array(jsonb_build_object(
    'date', d.form_data->>'start_date',
    'end_date', d.form_data->>'end_date',
    'leave_type', COALESCE(d.form_data->>'leave_type', 'annual'),
    'days', d.form_data->'total_days'
  )) END
)`;

// 휴가 항목(it)이 $n 연도와 하루라도 겹치는지 — 해를 넘기는 기간 항목은 양쪽 연도 모두에 걸린다
function leaveYearOverlapSql(paramIdx: number) {
  return `(it->>'date') <= ($${paramIdx}::TEXT || '-12-31') AND COALESCE(it->>'end_date', it->>'date') >= ($${paramIdx}::TEXT || '-01-01')`;
}

// 연도 분할용 공휴일 — 해를 넘기는 기간(최대 31일)만 대상이라 전·당·다음 해만 필요.
// 외부 조회가 실패해도 신정·성탄절은 고정 공휴일로 넣어 연말연초 분할이 크게 틀리지 않게 한다
async function getLeaveHolidays(year: number): Promise<string[]> {
  const years = [year - 1, year, year + 1];
  const fixed = years.flatMap(y => [`${y}-01-01`, `${y}-12-25`]);
  const fetched = await Promise.all(years.map(y =>
    getKoreanHolidays(y).then(r => r.dates).catch(err => {
      console.warn(`[approvals] ${y}년 공휴일 조회 실패, 고정 공휴일만 사용:`, err);
      return [] as string[];
    })
  ));
  return [...new Set([...fixed, ...fetched.flat()])];
}

/**
 * 휴가원 + 검색어(작성자) 필터가 걸렸을 때, 필터된 문서들의 휴가일수를 작성자별·휴가종류별로 합산한다.
 * 목록이 50건씩 페이지네이션되므로 현재 페이지가 아닌 필터 전체 기준으로 서버에서 집계한다.
 * 항목(items[].days) 단위로 합산하며, leaveYear가 있으면 그 해와 겹치는 항목만 센다.
 * 해를 넘기는 기간 항목은 그 해에 속한 근무일(주말·공휴일 제외, 작성 화면과 같은 기준) 비율만큼만 넣는다 —
 * 정상 작성된 항목은 days가 전체 근무일수와 같으므로 정확히 그 해 근무일수가 된다(0.5일 단위 반올림).
 * 반차(half_am/half_pm)는 유급휴가에 포함하되 반차 일수를 따로 내려준다.
 * 승인완료만 사용일수로 보고, 결재중은 별도 표기한다(임시저장·반려·재상신필요·취소는 제외).
 */
async function getLeaveSummary(whereClause: string, vals: any[], leaveYear: string | null) {
  const summaryVals = [...vals];
  let yearCond = '';
  let daysExpr = `(it->>'days')::NUMERIC`;
  if (leaveYear) {
    summaryVals.push(leaveYear);
    const yIdx = summaryVals.length;
    summaryVals.push(await getLeaveHolidays(parseInt(leaveYear, 10)));
    const hIdx = summaryVals.length;
    yearCond = `AND ${leaveYearOverlapSql(yIdx)}`;
    const itStart = `(it->>'date')::DATE`;
    const itEnd = `COALESCE(it->>'end_date', it->>'date')::DATE`;
    const yStart = `($${yIdx}::TEXT || '-01-01')::DATE`;
    const yEnd = `($${yIdx}::TEXT || '-12-31')::DATE`;
    const workdays = (from: string, to: string) =>
      `(SELECT COUNT(*) FROM generate_series(${from}, ${to}, INTERVAL '1 day') g
        WHERE EXTRACT(ISODOW FROM g) < 6 AND NOT (g::DATE = ANY($${hIdx}::DATE[])))`;
    daysExpr = `(CASE WHEN ${itStart} >= ${yStart} AND ${itEnd} <= ${yEnd} THEN (it->>'days')::NUMERIC
      ELSE COALESCE(ROUND((it->>'days')::NUMERIC * ${workdays(`GREATEST(${itStart}, ${yStart})`, `LEAST(${itEnd}, ${yEnd})`)}
        / NULLIF(${workdays(itStart, itEnd)}, 0) * 2) / 2, 0) END)`;
  }
  const approvedDays = (typeCond: string) =>
    `COALESCE(SUM(${daysExpr}) FILTER (WHERE d.status = 'approved' AND ${typeCond}), 0)`;
  const rows = await queryAll(
    `SELECT d.requester_id, e.name AS requester_name,
            COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'approved') AS approved_count,
            ${approvedDays('TRUE')} AS approved_days,
            ${approvedDays(`it->>'leave_type' IN ('annual', 'half_am', 'half_pm')`)} AS annual_days,
            ${approvedDays(`it->>'leave_type' IN ('half_am', 'half_pm')`)} AS half_days,
            ${approvedDays(`it->>'leave_type' = 'condolence'`)} AS condolence_days,
            ${approvedDays(`it->>'leave_type' = 'special'`)} AS special_days,
            ${approvedDays(`it->>'leave_type' NOT IN ('annual', 'half_am', 'half_pm', 'condolence', 'special')`)} AS other_days,
            COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'pending') AS pending_count,
            COALESCE(SUM(${daysExpr}) FILTER (WHERE d.status = 'pending'), 0) AS pending_days
     FROM approval_documents d
     LEFT JOIN employees e ON e.id = d.requester_id
     CROSS JOIN LATERAL ${LEAVE_ITEMS_SQL} it
     WHERE ${whereClause} AND d.status IN ('approved', 'pending') ${yearCond}
     GROUP BY d.requester_id, e.name
     ORDER BY e.name`,
    summaryVals
  );
  return (rows || []).map((r: any) => ({
    requester_id: r.requester_id,
    requester_name: r.requester_name,
    approved_count: parseInt(r.approved_count, 10),
    approved_days: parseFloat(r.approved_days),
    annual_days: parseFloat(r.annual_days),
    half_days: parseFloat(r.half_days),
    condolence_days: parseFloat(r.condolence_days),
    special_days: parseFloat(r.special_days),
    other_days: parseFloat(r.other_days),
    pending_count: parseInt(r.pending_count, 10),
    pending_days: parseFloat(r.pending_days),
  }));
}

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
 *   - leave_year: 휴가원 휴가일 연도 필터 (YYYY, type=leave_request일 때만)
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
    const hasFullViewAccess = isSuperAdmin || isApprovalFullAccessEmail(decoded.email);

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
    const sortBy          = searchParams.get('sort_by') === 'completed_at' ? 'completed_at' : 'submitted_at';
    // 휴가원 휴가일 연도 필터 (휴가원 유형일 때만 적용)
    const leaveYearParam  = searchParams.get('leave_year');
    const leaveYear       = typeFilter === 'leave_request' && leaveYearParam && /^\d{4}$/.test(leaveYearParam) ? leaveYearParam : null;

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

      if (!isSuperAdmin && !isManagementSupport && !isApprovalCompletedTabAccessEmail(decoded.email)) {
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

      if (departmentFilter) {
        conds.push(`d.department = $${ci++}`);
        vals.push(departmentFilter);
      }

      if (leaveYear) {
        conds.push(`EXISTS (SELECT 1 FROM ${LEAVE_ITEMS_SQL} it WHERE ${leaveYearOverlapSql(ci++)})`);
        vals.push(leaveYear);
      }

      // 미처리/처리완료 배지는 processedFilter와 무관하게 항상 전체 기준으로 집계
      const baseWhereClause = conds.join(' AND ');
      const [unprocessedResult, processedResult] = await Promise.all([
        queryOne(
          `SELECT COUNT(*) AS total FROM approval_documents d
           LEFT JOIN employees e ON e.id = d.requester_id
           WHERE ${baseWhereClause} AND (d.is_processed = FALSE OR d.is_processed IS NULL)`,
          vals
        ),
        queryOne(
          `SELECT COUNT(*) AS total FROM approval_documents d
           LEFT JOIN employees e ON e.id = d.requester_id
           WHERE ${baseWhereClause} AND d.is_processed = TRUE`,
          vals
        ),
      ]);

      if (processedFilter === 'true') {
        conds.push('d.is_processed = TRUE');
      } else if (processedFilter === 'false') {
        conds.push('(d.is_processed = FALSE OR d.is_processed IS NULL)');
      }

      const whereClause = conds.join(' AND ');

      const [countResult, leaveSummary] = await Promise.all([
        queryOne(
          `SELECT COUNT(*) AS total
           FROM approval_documents d
           LEFT JOIN employees e ON e.id = d.requester_id
           WHERE ${whereClause}`,
          vals
        ),
        typeFilter === 'leave_request' && searchQuery ? getLeaveSummary(whereClause, vals, leaveYear) : Promise.resolve(null),
      ]);

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
        unprocessedTotal: parseInt(unprocessedResult?.total || '0', 10),
        processedTotal: parseInt(processedResult?.total || '0', 10),
        leaveSummary,
      });
    }

    // ── 일반 탭 (기존 로직) ──
    // 총무팀 여부 확인 (슈퍼어드민 및 전체 열람 예외 계정이 아닌 경우)
    let isManagementSupportGeneral = false;
    if (!hasFullViewAccess) {
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
            OR (s.step_order = 5 AND d.current_step = 4)
          )
      ) AND d.status = 'pending'`);
      values.push(userId);
    } else if (mine) {
      conditions.push(`d.requester_id = $${idx++}`);
      values.push(userId);
    } else if (hasFullViewAccess) {
      // 권한 4(슈퍼 관리자) 또는 전체 열람 예외 계정: 모든 문서 열람 가능
    } else if (isManagementSupportGeneral) {
      // 총무팀: 승인완료 + 결재중 문서 열람 가능
      conditions.push(`d.status IN ('approved', 'pending')`);
    } else {
      // 전체 탭: 작성자 본인 OR 결재선에 포함된 문서
      // + 업무품의서의 경우 현재 사용자의 팀이 작성팀/협조팀이면 추가 조회
      // department_id/cooperative_team_id는 teams.id를 저장한다 (departments.id로는 매칭하지 않음 —
      // 두 테이블의 id 시퀀스가 겹쳐서 무관한 부서에 노출되는 버그가 있었음, 2026-07-06 수정)
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
              )
          )
        )
      )`);
      values.push(userId, userId, userId, userId, userId, userId);
    }

    if (typeFilter) {
      conditions.push(`d.document_type = $${idx++}`);
      values.push(typeFilter);
    }

    if (leaveYear) {
      conditions.push(`EXISTS (SELECT 1 FROM ${LEAVE_ITEMS_SQL} it WHERE ${leaveYearOverlapSql(idx++)})`);
      values.push(leaveYear);
    }

    if (statusFilter) {
      const statuses = statusFilter.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(`d.status = ANY($${idx++}::VARCHAR[])`);
        values.push(statuses);
      }
    }

    if (searchQuery) {
      conditions.push(`(
        d.document_number ILIKE $${idx} OR
        d.title ILIKE $${idx} OR
        e.name ILIKE $${idx}
      )`);
      values.push(`%${searchQuery}%`);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    // 총 건수 (+ 휴가원·작성자 검색 시 휴가일수 합계)
    const [countResult, leaveSummary] = await Promise.all([
      queryOne(
        `SELECT COUNT(*) AS total FROM approval_documents d
         LEFT JOIN employees e ON e.id = d.requester_id
         WHERE ${whereClause}`,
        values
      ),
      typeFilter === 'leave_request' && searchQuery ? getLeaveSummary(whereClause, values, leaveYear) : Promise.resolve(null),
    ]);

    // 목록 조회
    values.push(limit, offset);
    const rows = await queryAll(
      `SELECT
        d.id, d.document_number, d.document_type, d.title,
        d.status, d.current_step, d.department,
        d.requester_id, d.team_leader_id, d.executive_id, d.vice_president_id, d.ceo_id,
        d.created_at, d.submitted_at, d.completed_at, d.updated_at,
        e.name AS requester_name,
        tl.name AS team_leader_name,
        ex.name AS executive_name,
        vp.name AS vice_president_name,
        ceo.name AS ceo_name
       FROM approval_documents d
       LEFT JOIN employees e   ON e.id = d.requester_id
       LEFT JOIN employees tl  ON tl.id = d.team_leader_id
       LEFT JOIN employees ex  ON ex.id = d.executive_id
       LEFT JOIN employees vp  ON vp.id = d.vice_president_id
       LEFT JOIN employees ceo ON ceo.id = d.ceo_id
       WHERE ${whereClause}
       ORDER BY d.${sortBy} DESC NULLS LAST, d.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    return NextResponse.json({
      success: true,
      data: rows || [],
      total: parseInt(countResult?.total || '0', 10),
      leaveSummary,
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
    const { document_type, title, team_leader_id, executive_id, vice_president_id, ceo_id, form_data, department } = body;

    if (!document_type || !title) {
      return NextResponse.json({ success: false, error: '문서 유형과 제목은 필수입니다' }, { status: 400 });
    }

    // role상 불필요한 결재자 ID는 저장하지 않음 (예: 본인이 팀장인데 team_leader_id에 본인 id가 남아있는 경우)
    const requesterEmp = await queryOne(`SELECT role FROM employees WHERE id = $1`, [userId]);
    const normalizedIds = normalizeApproverIds(requesterEmp?.role, {
      team_leader_id,
      executive_id,
      vice_president_id,
    });

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
         team_leader_id, executive_id, vice_president_id, ceo_id, form_data, status, current_step)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',0)
       RETURNING *`,
      [
        documentNumber,
        document_type,
        title,
        userId,
        department || null,
        normalizedIds.team_leader_id,
        normalizedIds.executive_id,
        normalizedIds.vice_president_id,
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
