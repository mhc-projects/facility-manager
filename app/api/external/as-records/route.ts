import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyApiKey } from '@/utils/api-key-auth';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['completed', 'scheduled', 'finished', 'on_hold', 'site_check', 'installation', 'completion_fix', 'modem_check'];

function parseDate(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();
  const match = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return null;
}

/**
 * POST /api/external/as-records
 * 외부 시스템(에코센스 등)에서 AS 데이터를 직접 전송하는 엔드포인트
 * JWT 토큰 대신 API 키 인증을 사용
 *
 * 필수: business_name_raw (사업장명) 또는 business_management_code (사업장관리코드)
 * 선택: receipt_date, work_date, receipt_content, work_content,
 *        as_manager_name, site_address, site_manager, site_contact,
 *        chimney_number, dispatch_count, status,
 *        delivery_date (출고일 - 유상/무상 판단 기준. YYYY-MM-DD 또는 YYYY/MM/DD)
 *        external_id (외부 시스템 자체 ID - 제공 시 중복 방지 upsert 동작)
 * 자동: manufacturer = 'ecosense' (에코센스 API를 통한 등록은 항상 에코센스)
 */
export async function POST(request: NextRequest) {
  // API 키 인증
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'API 키가 필요합니다. Authorization: Bearer {API_KEY} 헤더를 포함해주세요.' },
      { status: 401 }
    );
  }

  const apiKey = authHeader.substring(7);
  const keyInfo = await verifyApiKey(apiKey, '/api/external/as-records');
  if (!keyInfo) {
    return NextResponse.json(
      { success: false, error: '유효하지 않거나 만료된 API 키입니다.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const {
      business_name_raw,
      business_management_code,
      site_address,
      site_manager,
      site_contact,
      receipt_date,
      work_date,
      receipt_content,
      work_content,
      as_manager_name,
      chimney_number,
      dispatch_count = 1,
      status = 'scheduled',
      delivery_date,
      external_id,
    } = body;

    // 필수 필드 검증: 사업장명 또는 사업장관리코드 중 하나 필수
    if ((!business_name_raw || String(business_name_raw).trim() === '') && !business_management_code) {
      return NextResponse.json(
        { success: false, error: 'business_name_raw(사업장명) 또는 business_management_code(사업장관리코드)가 필요합니다.' },
        { status: 400 }
      );
    }

    // 상태값 검증
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `유효하지 않은 status 값입니다. 허용값: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // 사업장관리코드(우선) 또는 사업장명으로 등록된 사업장 조회 (있으면 business_id로 연결)
    let businessId: string | null = null;
    if (business_management_code) {
      const codeResult = await pgQuery(
        `SELECT id FROM business_info
         WHERE CAST(business_management_code AS TEXT) = $1 AND is_deleted = false
         LIMIT 1`,
        [String(business_management_code)]
      );
      businessId = codeResult.rows[0]?.id || null;
    }
    if (!businessId && business_name_raw && String(business_name_raw).trim()) {
      const nameResult = await pgQuery(
        `SELECT id FROM business_info
         WHERE TRIM(business_name) = $1 AND is_deleted = false
         LIMIT 1`,
        [String(business_name_raw).trim()]
      );
      businessId = nameResult.rows[0]?.id || null;
    }

    const parsedReceiptDate = parseDate(receipt_date);
    const parsedWorkDate = parseDate(work_date);
    const parsedDeliveryDate = parseDate(delivery_date);
    const externalIdVal = external_id ? String(external_id).trim() : null;

    const insertValues = [
      businessId,
      businessId ? null : (business_name_raw ? String(business_name_raw).trim() : null),
      businessId ? null : (site_address || null),
      businessId ? null : (site_manager || null),
      businessId ? null : (site_contact || null),
      parsedReceiptDate,
      parsedWorkDate,
      receipt_content || null,
      work_content || null,
      as_manager_name || null,
      chimney_number || null,
      Math.max(1, Number(dispatch_count) || 1),
      status,
      parsedDeliveryDate,
      externalIdVal,
    ];

    // external_id 제공 시 upsert, 없으면 단순 insert
    const sql = externalIdVal
      ? `INSERT INTO as_records (
          business_id, business_name_raw,
          site_address, site_manager, site_contact,
          receipt_date, work_date,
          receipt_content, work_content,
          as_manager_name, chimney_number,
          dispatch_count, status,
          manufacturer, delivery_date_override, external_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ecosense', $14, $15)
        ON CONFLICT (external_id) DO UPDATE SET
          business_id             = EXCLUDED.business_id,
          business_name_raw       = EXCLUDED.business_name_raw,
          site_address            = EXCLUDED.site_address,
          site_manager            = EXCLUDED.site_manager,
          site_contact            = EXCLUDED.site_contact,
          receipt_date            = EXCLUDED.receipt_date,
          work_date               = EXCLUDED.work_date,
          receipt_content         = EXCLUDED.receipt_content,
          work_content            = EXCLUDED.work_content,
          as_manager_name         = EXCLUDED.as_manager_name,
          chimney_number          = EXCLUDED.chimney_number,
          dispatch_count          = EXCLUDED.dispatch_count,
          status                  = EXCLUDED.status,
          delivery_date_override  = EXCLUDED.delivery_date_override,
          updated_at              = NOW()
        RETURNING id, business_name_raw, receipt_date, work_date, status, manufacturer, delivery_date_override, external_id, created_at, updated_at,
                  (xmax = 0) AS inserted`
      : `INSERT INTO as_records (
          business_id, business_name_raw,
          site_address, site_manager, site_contact,
          receipt_date, work_date,
          receipt_content, work_content,
          as_manager_name, chimney_number,
          dispatch_count, status,
          manufacturer, delivery_date_override, external_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ecosense', $14, $15)
        RETURNING id, business_name_raw, receipt_date, work_date, status, manufacturer, delivery_date_override, external_id, created_at, updated_at,
                  true AS inserted`;

    const result = await pgQuery(sql, insertValues);
    const row = result.rows[0];

    return NextResponse.json(
      {
        success: true,
        data: row,
        matched_business: businessId ? true : false,
        action: row.inserted ? 'created' : 'updated',
      },
      { status: row.inserted ? 201 : 200 }
    );
  } catch (error) {
    console.error('[external/as-records] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'AS 데이터 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/external/as-records
 * 외부 시스템에서 AS 레코드 목록 조회
 * 쿼리 파라미터: external_id (특정 external_id로 조회)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'API 키가 필요합니다.' },
      { status: 401 }
    );
  }

  const apiKey = authHeader.substring(7);
  const keyInfo = await verifyApiKey(apiKey, '/api/external/as-records');
  if (!keyInfo) {
    return NextResponse.json(
      { success: false, error: '유효하지 않거나 만료된 API 키입니다.' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const externalId = searchParams.get('external_id');

  try {
    if (externalId) {
      const result = await pgQuery(
        `SELECT id, business_id, business_name_raw, receipt_date, work_date,
                receipt_content, work_content, as_manager_name, chimney_number,
                dispatch_count, status, manufacturer, delivery_date_override,
                external_id, created_at, updated_at
         FROM as_records
         WHERE external_id = $1`,
        [externalId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: '해당 external_id의 AS 레코드를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, data: result.rows[0] });
    }

    return NextResponse.json(
      { success: false, error: 'external_id 쿼리 파라미터가 필요합니다.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[external/as-records] GET error:', error);
    return NextResponse.json(
      { success: false, error: '데이터 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
