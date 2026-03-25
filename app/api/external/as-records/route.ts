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
 * 필수: business_name_raw (사업장명)
 * 선택: receipt_date, work_date, receipt_content, work_content,
 *        as_manager_name, site_address, site_manager, site_contact,
 *        chimney_number, dispatch_count, status
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

    const result = await pgQuery(
      `INSERT INTO as_records (
        business_id, business_name_raw,
        site_address, site_manager, site_contact,
        receipt_date, work_date,
        receipt_content, work_content,
        as_manager_name, chimney_number,
        dispatch_count, status,
        manufacturer
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ecosense')
      RETURNING id, business_name_raw, receipt_date, work_date, status, created_at`,
      [
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
      ]
    );

    return NextResponse.json(
      {
        success: true,
        data: result.rows[0],
        matched_business: businessId ? true : false,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[external/as-records] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'AS 데이터 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
