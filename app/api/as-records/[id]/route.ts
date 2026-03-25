import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/as-records/[id]
 * AS 건 상세 조회 (자재 포함)
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
    if (!verifyTokenString(token)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { id } = params;
    const [recordResult, materialsResult] = await Promise.all([
      pgQuery(
        `SELECT
          ar.id,
          ar.business_id,
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
          ar.manufacturer,
          bi.installation_date,
          ar.created_at,
          ar.updated_at,
          CASE
            WHEN ar.is_paid_override IS NOT NULL THEN ar.is_paid_override
            WHEN bi.delivery_date IS NULL THEN NULL
            ELSE (bi.delivery_date + INTERVAL '26 months' <= NOW())
          END AS is_paid
        FROM as_records ar
        LEFT JOIN business_info bi ON ar.business_id = bi.id
        WHERE ar.id = $1 AND ar.is_deleted = false`,
        [id]
      ),
      pgQuery(
        `SELECT
          amu.*,
          apl.category AS price_list_category,
          apl.item_name AS price_list_item_name
        FROM as_material_usage amu
        LEFT JOIN as_price_list apl ON amu.price_list_id = apl.id
        WHERE amu.as_record_id = $1
        ORDER BY amu.created_at ASC`,
        [id]
      ),
    ]);

    if (recordResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'AS 건을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...recordResult.rows[0],
        materials: materialsResult.rows,
      },
    });
  } catch (error) {
    console.error('[as-records/[id]] GET error:', error);
    return NextResponse.json({ success: false, error: 'AS 건 조회 실패' }, { status: 500 });
  }
}

/**
 * PATCH /api/as-records/[id]
 * AS 건 수정
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    if (!verifyTokenString(token)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const {
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
      status,
      chimney_number,
      dispatch_count,
      dispatch_cost_price_id,
      dispatch_revenue_price_id,
      manufacturer,
    } = body;

    if (status) {
      const validStatuses = ['completed', 'scheduled', 'finished', 'on_hold', 'site_check', 'installation', 'completion_fix', 'modem_check'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ success: false, error: '유효하지 않은 상태값입니다' }, { status: 400 });
      }
    }

    const validManufacturers = ['ecosense', 'cleanearth', 'gaia_cns', 'evs'];
    const safeManufacturer = manufacturer !== undefined
      ? (manufacturer && validManufacturers.includes(manufacturer) ? manufacturer : null)
      : undefined;

    const result = await pgQuery(
      `UPDATE as_records SET
        receipt_date = $1,
        work_date = $2,
        receipt_content = $3,
        work_content = $4,
        outlet_description = $5,
        as_manager_name = $6,
        as_manager_contact = $7,
        as_manager_affiliation = $8,
        site_address = $9,
        site_manager = $10,
        site_contact = $11,
        is_paid_override = $12,
        status = COALESCE($13, status),
        chimney_number = $14,
        dispatch_count = COALESCE($15, dispatch_count),
        dispatch_cost_price_id = $16,
        dispatch_revenue_price_id = $17,
        manufacturer = COALESCE($18, manufacturer),
        updated_at = NOW()
      WHERE id = $19 AND is_deleted = false
      RETURNING *`,
      [
        receipt_date ?? null,
        work_date ?? null,
        receipt_content ?? null,
        work_content ?? null,
        outlet_description ?? null,
        as_manager_name ?? null,
        as_manager_contact ?? null,
        as_manager_affiliation ?? null,
        site_address ?? null,
        site_manager ?? null,
        site_contact ?? null,
        is_paid_override !== undefined ? is_paid_override : null,
        status ?? null,
        chimney_number !== undefined ? (chimney_number || null) : null,
        dispatch_count !== undefined ? Number(dispatch_count) : null,
        dispatch_cost_price_id !== undefined ? (dispatch_cost_price_id || null) : null,
        dispatch_revenue_price_id !== undefined ? (dispatch_revenue_price_id || null) : null,
        safeManufacturer !== undefined ? safeManufacturer : null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'AS 건을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[as-records/[id]] PATCH error:', error);
    return NextResponse.json({ success: false, error: 'AS 건 수정 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/as-records/[id]
 * AS 건 삭제 (soft delete)
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
    if (!verifyTokenString(token)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { id } = params;
    const result = await pgQuery(
      `UPDATE as_records SET is_deleted = true, updated_at = NOW()
       WHERE id = $1 AND is_deleted = false
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'AS 건을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'AS 건이 삭제되었습니다' });
  } catch (error) {
    console.error('[as-records/[id]] DELETE error:', error);
    return NextResponse.json({ success: false, error: 'AS 건 삭제 실패' }, { status: 500 });
  }
}
