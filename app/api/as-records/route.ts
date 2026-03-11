import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/as-records
 * AS 건 목록 조회
 * Query params:
 *   - work_date_from: string (YYYY-MM-DD)
 *   - work_date_to: string (YYYY-MM-DD)
 *   - manager_name: string (부분 검색)
 *   - paid_status: 'paid' | 'free' | 'unknown' | 'all'
 *   - status: string (콤마 구분 다중)
 *   - business_name: string (부분 검색)
 *   - limit: number (기본 100)
 *   - offset: number (기본 0)
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

    const { searchParams } = new URL(request.url);
    const workDateFrom = searchParams.get('work_date_from');
    const workDateTo = searchParams.get('work_date_to');
    const managerName = searchParams.get('manager_name');
    const paidStatus = searchParams.get('paid_status') || 'all';
    const statusParam = searchParams.get('status');
    const businessName = searchParams.get('business_name');
    const limitParam = parseInt(searchParams.get('limit') || '100');
    const offsetParam = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = ['ar.is_deleted = false'];
    const values: (string | number | string[])[] = [];
    let paramIdx = 1;

    if (workDateFrom) {
      conditions.push(`ar.work_date >= $${paramIdx++}`);
      values.push(workDateFrom);
    }
    if (workDateTo) {
      conditions.push(`ar.work_date <= $${paramIdx++}`);
      values.push(workDateTo);
    }
    if (managerName) {
      conditions.push(`ar.as_manager_name ILIKE $${paramIdx++}`);
      values.push(`%${managerName}%`);
    }
    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(`ar.status = ANY($${paramIdx++}::VARCHAR[])`);
        values.push(statuses);
      }
    }
    if (businessName) {
      // business_info 연결된 경우와 직접 입력된 경우 모두 검색
      conditions.push(`(bi.business_name ILIKE $${paramIdx} OR ar.business_name_raw ILIKE $${paramIdx})`);
      values.push(`%${businessName}%`);
      paramIdx++;
    }

    // 유상/무상 필터 (delivery_date 기준 26개월, business_info 연결된 경우에만)
    if (paidStatus === 'paid') {
      conditions.push(`(
        ar.is_paid_override = true
        OR (ar.is_paid_override IS NULL AND bi.delivery_date IS NOT NULL
            AND bi.delivery_date + INTERVAL '26 months' <= NOW())
      )`);
    } else if (paidStatus === 'free') {
      conditions.push(`(
        ar.is_paid_override = false
        OR (ar.is_paid_override IS NULL AND bi.delivery_date IS NOT NULL
            AND bi.delivery_date + INTERVAL '26 months' > NOW())
      )`);
    } else if (paidStatus === 'unknown') {
      conditions.push(`(ar.is_paid_override IS NULL AND (bi.delivery_date IS NULL OR ar.business_id IS NULL))`);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT
        ar.id,
        ar.business_id,
        -- 사업장명: business_info 연결 시 bi.business_name, 미등록 시 ar.business_name_raw
        COALESCE(bi.business_name, ar.business_name_raw) AS business_name,
        ar.business_name_raw,
        bi.business_management_code,
        bi.delivery_date,
        bi.address,
        bi.manager_name,
        bi.manager_contact,
        ar.site_address,
        ar.site_manager,
        ar.site_contact,
        ar.receipt_date,
        ar.work_date,
        ar.receipt_content,
        ar.work_content,
        ar.outlet_description,
        ar.as_manager_name,
        ar.as_manager_contact,
        ar.as_manager_affiliation,
        ar.is_paid_override,
        ar.status,
        ar.progress_notes,
        ar.chimney_number,
        ar.dispatch_count,
        ar.dispatch_cost_price_id,
        ar.dispatch_revenue_price_id,
        ar.created_at,
        ar.updated_at,
        -- 유상/무상 자동 계산 컬럼 (business_info 연결된 경우에만)
        CASE
          WHEN ar.is_paid_override IS NOT NULL THEN ar.is_paid_override
          WHEN bi.delivery_date IS NULL THEN NULL
          ELSE (bi.delivery_date + INTERVAL '26 months' <= NOW())
        END AS is_paid,
        -- 사용자재 집계
        (SELECT COUNT(*) FROM as_material_usage amu WHERE amu.as_record_id = ar.id) AS material_count,
        (SELECT COALESCE(SUM(amu.quantity * amu.unit_price), 0)
         FROM as_material_usage amu WHERE amu.as_record_id = ar.id) AS total_material_cost
      FROM as_records ar
      LEFT JOIN business_info bi ON ar.business_id = bi.id
      WHERE ${whereClause}
      ORDER BY ar.work_date DESC NULLS LAST, ar.receipt_date DESC NULLS LAST, ar.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    values.push(limitParam, offsetParam);

    const [rowsResult, countResult] = await Promise.all([
      pgQuery(sql, values),
      pgQuery(
        `SELECT COUNT(*) FROM as_records ar
         LEFT JOIN business_info bi ON ar.business_id = bi.id
         WHERE ${whereClause}`,
        values.slice(0, -2)
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: rowsResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0'),
    });
  } catch (error) {
    console.error('[as-records] GET error:', error);
    return NextResponse.json({ success: false, error: 'AS 건 목록 조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/as-records
 * AS 건 등록
 * business_id 또는 business_name_raw 중 하나 필수
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

    const body = await request.json();
    const {
      business_id,
      business_name_raw,
      receipt_date,
      work_date,
      receipt_content,
      work_content,
      outlet_description,
      as_manager_name,
      as_manager_contact,
      as_manager_affiliation,
      site_address,
      site_manager,
      site_contact,
      is_paid_override,
      status = 'scheduled',
      chimney_number,
      dispatch_count = 1,
      dispatch_cost_price_id,
      dispatch_revenue_price_id,
    } = body;

    if (!business_id && !business_name_raw) {
      return NextResponse.json({ success: false, error: '사업장 ID 또는 사업장명이 필요합니다' }, { status: 400 });
    }

    const validStatuses = ['completed', 'scheduled', 'finished', 'on_hold', 'site_check', 'installation', 'completion_fix', 'modem_check'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 상태값입니다' }, { status: 400 });
    }

    const result = await pgQuery(
      `INSERT INTO as_records (
        business_id, business_name_raw, receipt_date, work_date, receipt_content, work_content,
        outlet_description, as_manager_name, as_manager_contact, as_manager_affiliation,
        site_address, site_manager, site_contact,
        is_paid_override, status, chimney_number,
        dispatch_count, dispatch_cost_price_id, dispatch_revenue_price_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        business_id || null,
        business_id ? null : (business_name_raw || null),
        receipt_date || null,
        work_date || null,
        receipt_content || null,
        work_content || null,
        outlet_description || null,
        as_manager_name || null,
        as_manager_contact || null,
        as_manager_affiliation || null,
        business_id ? null : (site_address || null),
        business_id ? null : (site_manager || null),
        business_id ? null : (site_contact || null),
        is_paid_override ?? null,
        status,
        chimney_number || null,
        Number(dispatch_count) || 1,
        dispatch_cost_price_id || null,
        dispatch_revenue_price_id || null,
      ]
    );

    return NextResponse.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('[as-records] POST error:', error);
    return NextResponse.json({ success: false, error: 'AS 건 등록 실패' }, { status: 500 });
  }
}
