// app/api/external/measurements/route.ts - 외부 계측 장비 측정 데이터 수집 API
import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery, transaction } from '@/lib/supabase-direct';
import { verifyApiKey } from '@/utils/api-key-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/external/measurements
 * 외부 계측 장비(네오닉 전력량계 등)에서 측정 데이터를 직접 전송하는 엔드포인트
 * JWT 세션 대신 API 키 인증 사용 (app/api/external/as-records와 동일한 패턴)
 *
 * 필수: business_name(사업장명) 또는 business_management_code(사업장관리코드),
 *       device.serial_number, readings[](최소 1개, 각 항목은 measurement_type/measured_value/unit 필수)
 * 선택: device.device_type(기본 'power_meter'), device.device_name, device.manufacturer,
 *       device.installation_location, readings[].measured_at(생략 시 서버 시각),
 *       readings[].data_quality(기본 'normal'), readings[].environmental_conditions
 *
 * device.serial_number 기준으로 measurement_devices를 upsert하고, 같은 트랜잭션에서
 * readings 각각을 measurement_history에 insert한다.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'API 키가 필요합니다. Authorization: Bearer {API_KEY} 헤더를 포함해주세요.' },
      { status: 401 }
    );
  }

  const apiKey = authHeader.substring(7);
  const keyInfo = await verifyApiKey(apiKey, '/api/external/measurements');
  if (!keyInfo) {
    return NextResponse.json(
      { success: false, error: '유효하지 않거나 만료된 API 키입니다.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { business_name, business_management_code, device, readings } = body;

    if ((!business_name || String(business_name).trim() === '') && !business_management_code) {
      return NextResponse.json(
        { success: false, error: 'business_name(사업장명) 또는 business_management_code(사업장관리코드)가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!device || !device.serial_number || String(device.serial_number).trim() === '') {
      return NextResponse.json(
        { success: false, error: 'device.serial_number가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(readings) || readings.length === 0) {
      return NextResponse.json(
        { success: false, error: 'readings 배열이 최소 1개 이상 필요합니다.' },
        { status: 400 }
      );
    }

    for (const [i, r] of readings.entries()) {
      if (!r || !r.measurement_type || r.measured_value === undefined || r.measured_value === null || !r.unit) {
        return NextResponse.json(
          { success: false, error: `readings[${i}]: measurement_type, measured_value, unit이 모두 필요합니다.` },
          { status: 400 }
        );
      }
    }

    // 사업장 조회 (사업장관리코드 우선, 그 다음 사업장명) - app/api/external/as-records 패턴과 동일
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
    if (!businessId && business_name && String(business_name).trim()) {
      const nameResult = await pgQuery(
        `SELECT id FROM business_info
         WHERE TRIM(business_name) = $1 AND is_deleted = false
         LIMIT 1`,
        [String(business_name).trim()]
      );
      businessId = nameResult.rows[0]?.id || null;
    }

    if (!businessId) {
      // measurement_devices/measurement_history는 business_id가 NOT NULL이라
      // as_records처럼 business_name_raw로 임시 저장하는 폴백이 없음 - 매칭 실패 시 거부.
      return NextResponse.json(
        { success: false, error: '일치하는 사업장을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const deviceType = device.device_type || 'power_meter';
    const serialNumber = String(device.serial_number).trim();

    const { deviceId, insertedCount } = await transaction(async (client) => {
      const deviceResult = await client.query(
        `INSERT INTO measurement_devices (
           business_id, device_type, device_name, serial_number, manufacturer, installation_location
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (business_id, device_type, serial_number) DO UPDATE SET
           device_name = COALESCE(EXCLUDED.device_name, measurement_devices.device_name),
           manufacturer = COALESCE(EXCLUDED.manufacturer, measurement_devices.manufacturer),
           installation_location = COALESCE(EXCLUDED.installation_location, measurement_devices.installation_location)
         RETURNING id`,
        [
          businessId,
          deviceType,
          device.device_name || `${deviceType}-${serialNumber}`,
          serialNumber,
          device.manufacturer || null,
          device.installation_location || null,
        ]
      );
      const deviceId = deviceResult.rows[0].id;

      for (const r of readings) {
        await client.query(
          `INSERT INTO measurement_history (
             device_id, business_id, measured_at, measured_value, unit, measurement_type,
             data_quality, environmental_conditions
           ) VALUES ($1, $2, COALESCE($3, NOW()), $4, $5, $6, $7, $8::jsonb)`,
          [
            deviceId,
            businessId,
            r.measured_at || null,
            r.measured_value,
            r.unit,
            r.measurement_type,
            r.data_quality || 'normal',
            JSON.stringify(r.environmental_conditions || {}),
          ]
        );
      }

      return { deviceId, insertedCount: readings.length };
    });

    return NextResponse.json(
      {
        success: true,
        matched_business: true,
        device_id: deviceId,
        inserted_count: insertedCount,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[external/measurements] POST error:', error);
    return NextResponse.json(
      { success: false, error: '측정 데이터 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
