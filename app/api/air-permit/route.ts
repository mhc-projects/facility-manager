// app/api/air-permit/route.ts - 대기필증 정보 관리 API
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, query as pgQuery } from '@/lib/supabase-direct';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 🔥 배포 환경 캐싱 방지 헤더
const NO_CACHE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

// Type definitions
interface AirPermitInfo {
  id?: string;
  business_id: string;
  business_type: string | null;
  first_report_date: string | null;
  operation_start_date: string | null;
  annual_emission_amount: number | null;
  additional_info: any;
  is_active: boolean;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

// GET: 대기필증 정보 조회
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const permitId = searchParams.get('id');
    const includeDetails = searchParams.get('details') === 'true';

    console.log('🔍 [AIR-PERMIT] GET - 조회 시작:', { businessId, permitId, includeDetails });

    // 특정 대기필증 상세 조회
    if (permitId && includeDetails) {
      const permit = await queryOne(
        `SELECT
          api.*,
          json_build_object(
            'business_name', bi.business_name,
            'business_management_code', bi.business_management_code,
            'local_government', bi.local_government,
            'vpn_wired', bi.vpn_wired,
            'vpn_wireless', bi.vpn_wireless,
            'manufacturer', bi.manufacturer
          ) as business
         FROM air_permit_info api
         LEFT JOIN business_info bi ON api.business_id = bi.id
         WHERE api.id = $1 AND api.is_active = true AND api.is_deleted = false`,
        [permitId]
      );

      if (!permit) {
        return NextResponse.json(
          { error: '대기필증을 찾을 수 없습니다' },
          { status: 404 }
        );
      }

      // 배출구 및 시설 정보 조회
      const outlets = await queryAll(
        `SELECT
          outlet.*,
          (
            SELECT json_agg(df.*)
            FROM discharge_facilities df
            WHERE df.outlet_id = outlet.id
          ) as discharge_facilities,
          (
            SELECT json_agg(pf.*)
            FROM prevention_facilities pf
            WHERE pf.outlet_id = outlet.id
          ) as prevention_facilities
         FROM discharge_outlets outlet
         WHERE outlet.air_permit_id = $1
         ORDER BY outlet.outlet_number`,
        [permitId]
      );

      permit.outlets = outlets || [];

      console.log(`✅ [AIR-PERMIT] GET - 상세 조회 완료: ${permit.outlets?.length || 0}개 배출구`);
      return NextResponse.json({ data: permit }, {
        headers: NO_CACHE_HEADERS
      });
    }

    // 사업장별 대기필증 목록 조회
    if (businessId) {
      // businessId가 UUID 형식이 아니면 사업장명으로 간주하여 실제 ID 조회
      let actualBusinessId = businessId;

      // UUID 형식이 아니면 사업장명으로 처리
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(businessId)) {
        // 사업장명으로 실제 사업장 ID 조회 - Direct PostgreSQL
        const business = await queryOne(
          `SELECT id FROM business_info
           WHERE business_name = $1 AND is_active = true AND is_deleted = false`,
          [businessId]
        );

        if (!business) {
          return NextResponse.json(
            { error: '존재하지 않는 사업장입니다' },
            { status: 404 }
          );
        }
        actualBusinessId = business.id;
      }

      let permits;
      if (includeDetails) {
        // 상세 정보 포함하여 조회
        permits = await queryAll(
          `SELECT
            api.*,
            json_build_object(
              'business_name', bi.business_name,
              'business_management_code', bi.business_management_code,
              'local_government', bi.local_government,
              'vpn_wired', bi.vpn_wired,
              'vpn_wireless', bi.vpn_wireless,
              'manufacturer', bi.manufacturer
            ) as business
           FROM air_permit_info api
           LEFT JOIN business_info bi ON api.business_id = bi.id
           WHERE api.business_id = $1 AND api.is_active = true AND api.is_deleted = false
           ORDER BY api.created_at DESC`,
          [actualBusinessId]
        );

        // 각 대기필증에 배출구 정보 추가
        for (const permit of permits) {
          const outlets = await queryAll(
            `SELECT
              outlet.*,
              (
                SELECT json_agg(df.*)
                FROM discharge_facilities df
                WHERE df.outlet_id = outlet.id
              ) as discharge_facilities,
              (
                SELECT json_agg(pf.*)
                FROM prevention_facilities pf
                WHERE pf.outlet_id = outlet.id
              ) as prevention_facilities
             FROM discharge_outlets outlet
             WHERE outlet.air_permit_id = $1
             ORDER BY outlet.outlet_number`,
            [permit.id]
          );
          permit.outlets = outlets || [];
        }
      } else {
        // 기본 정보만 조회
        permits = await queryAll(
          `SELECT * FROM air_permit_info
           WHERE business_id = $1 AND is_active = true AND is_deleted = false
           ORDER BY created_at DESC`,
          [actualBusinessId]
        );
      }

      console.log(`✅ [AIR-PERMIT] GET - 사업장별 조회 완료: ${permits.length}개`);
      return NextResponse.json({
        data: permits,
        count: permits.length
      }, {
        headers: NO_CACHE_HEADERS
      });
    }

    // 모든 대기필증 조회 - Direct PostgreSQL
    const allPermits = await queryAll(
      `SELECT
        api.*,
        json_build_object(
          'business_name', bi.business_name,
          'business_management_code', bi.business_management_code,
          'local_government', bi.local_government,
          'vpn_wired', bi.vpn_wired,
          'vpn_wireless', bi.vpn_wireless,
          'manufacturer', bi.manufacturer
        ) as business
       FROM air_permit_info api
       LEFT JOIN business_info bi ON api.business_id = bi.id
       WHERE api.is_active = true AND api.is_deleted = false
       ORDER BY api.created_at DESC`
    );

    console.log(`✅ [AIR-PERMIT] GET - 전체 조회 완료: ${allPermits.length}개`);
    return NextResponse.json({
      data: allPermits,
      count: allPermits.length
    });

  } catch (error) {
    console.error('❌ [AIR-PERMIT] GET - 조회 오류:', error);
    return NextResponse.json(
      { error: '대기필증 정보를 불러오는데 실패했습니다' },
      { status: 500 }
    );
  }
}

// POST: 새 대기필증 생성
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const body = await request.json();

    // 필수 필드 검증
    if (!body.business_id) {
      return NextResponse.json(
        { error: '사업장 ID는 필수입니다' },
        { status: 400 }
      );
    }

    // 사업장 존재 확인 - Direct PostgreSQL
    const business = await queryOne(
      `SELECT id FROM business_info
       WHERE id = $1 AND is_active = true AND is_deleted = false`,
      [body.business_id]
    );

    if (!business) {
      return NextResponse.json(
        { error: '존재하지 않는 사업장입니다' },
        { status: 404 }
      );
    }

    // 날짜 필드 검증 함수
    const validateDate = (dateStr: string, fieldName: string): string | null => {
      try {
        if (!dateStr || dateStr === '' || dateStr === '--' || dateStr.length < 8) {
          console.log(`📅 [POST] ${fieldName}: 빈 값 또는 유효하지 않은 길이 - null 반환`);
          return null;
        }
        // YYYY-MM-DD 형식 검증
        if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
          console.log(`📅 [POST] ${fieldName}: 형식 불일치 (${dateStr}) - null 반환`);
          return null;
        }
        console.log(`📅 [POST] ${fieldName}: 검증 통과 (${dateStr})`);
        return dateStr;
      } catch (dateError) {
        console.error(`🔴 [POST] 날짜 검증 오류 (${fieldName}):`, dateError);
        return null;
      }
    };

    // 날짜 검증
    const validatedFirstReportDate = validateDate(body.first_report_date, 'first_report_date');
    const validatedOperationStartDate = validateDate(body.operation_start_date, 'operation_start_date');

    // 대기필증 생성 - Direct PostgreSQL
    const insertQuery = `
      INSERT INTO air_permit_info (
        business_id, business_type, first_report_date, operation_start_date,
        annual_emission_amount, additional_info, is_active, is_deleted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const additionalInfo = {
      ...body.additional_info || {},
      category: body.category || null,
      business_name: body.business_name || null,
      pollutants: body.pollutants || []
    };

    const insertResult = await pgQuery(insertQuery, [
      business.id,
      body.business_type || null,
      validatedFirstReportDate,
      validatedOperationStartDate,
      null,
      JSON.stringify(additionalInfo),
      true,
      false
    ]);

    if (!insertResult.rows || insertResult.rows.length === 0) {
      throw new Error('대기필증 생성 실패');
    }

    const newPermit = insertResult.rows[0];
    console.log('✅ [AIR-PERMIT] POST - 대기필증 생성:', newPermit.id);

    // 배출구 및 시설 생성
    const outlets = body.outlets || [];
    for (const outlet of outlets) {
      // 배출구 생성
      const outletQuery = `
        INSERT INTO discharge_outlets (
          air_permit_id, outlet_number, outlet_name, additional_info,
          is_active, is_deleted
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const outletResult = await pgQuery(outletQuery, [
        newPermit.id,
        outlet.outlet_number || null,
        outlet.outlet_name || null,
        JSON.stringify(outlet.additional_info || {}),
        true,
        false
      ]);

      if (outletResult.rows && outletResult.rows.length > 0) {
        const createdOutlet = outletResult.rows[0];

        // 배출시설 생성
        const dischargeFacilities = outlet.discharge_facilities || [];
        for (const facility of dischargeFacilities) {
          await pgQuery(
            `INSERT INTO discharge_facilities (
              outlet_id, facility_name, capacity, quantity, additional_info,
              is_active, is_deleted
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              createdOutlet.id,
              facility.facility_name || facility.name || null,
              facility.capacity || null,
              facility.quantity || null,
              JSON.stringify(facility.additional_info || {}),
              true,
              false
            ]
          );
        }

        // 방지시설 생성
        const preventionFacilities = outlet.prevention_facilities || [];
        for (const facility of preventionFacilities) {
          await pgQuery(
            `INSERT INTO prevention_facilities (
              outlet_id, facility_name, capacity, quantity, additional_info,
              is_active, is_deleted
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              createdOutlet.id,
              facility.facility_name || facility.name || null,
              facility.capacity || null,
              facility.quantity || null,
              JSON.stringify(facility.additional_info || {}),
              true,
              false
            ]
          );
        }
      }
    }

    // 생성된 대기필증 상세 정보 조회
    const fullPermit = await queryOne(
      `SELECT
        api.*,
        json_build_object(
          'business_name', bi.business_name,
          'business_management_code', bi.business_management_code
        ) as business
       FROM air_permit_info api
       LEFT JOIN business_info bi ON api.business_id = bi.id
       WHERE api.id = $1`,
      [newPermit.id]
    );

    const fullOutlets = await queryAll(
      `SELECT
        outlet.*,
        (
          SELECT json_agg(df.*)
          FROM discharge_facilities df
          WHERE df.outlet_id = outlet.id
        ) as discharge_facilities,
        (
          SELECT json_agg(pf.*)
          FROM prevention_facilities pf
          WHERE pf.outlet_id = outlet.id
        ) as prevention_facilities
       FROM discharge_outlets outlet
       WHERE outlet.air_permit_id = $1
       ORDER BY outlet.outlet_number`,
      [newPermit.id]
    );

    fullPermit.outlets = fullOutlets || [];

    console.log(`✅ [AIR-PERMIT] POST - 생성 완료: ${fullOutlets.length}개 배출구`);
    return NextResponse.json(
      {
        message: '대기필증이 성공적으로 생성되었습니다',
        data: fullPermit
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('❌ [AIR-PERMIT] POST - 생성 오류:', error);
    return NextResponse.json(
      { error: '대기필증 생성에 실패했습니다' },
      { status: 500 }
    );
  }
}

// PUT: 대기필증 정보 업데이트
export async function PUT(request: NextRequest) {
  let body: any = null;

  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    console.log('🔄 [AIR-PERMIT] PUT - 업데이트 요청 시작');

    // Step 1: JSON 파싱
    try {
      body = await request.json();
      console.log('✅ [AIR-PERMIT] PUT - JSON 파싱 성공:', body);
    } catch (jsonError) {
      console.error('🔴 [AIR-PERMIT] PUT - JSON 파싱 실패:', jsonError);
      return NextResponse.json(
        { error: 'JSON 파싱 실패', details: jsonError instanceof Error ? jsonError.message : 'Unknown error' },
        { status: 400 }
      );
    }

    const { id, ...rawUpdateData } = body;

    // Step 2: ID 검증
    if (!id) {
      console.error('🔴 [AIR-PERMIT] PUT - ID 누락');
      return NextResponse.json(
        { error: '대기필증 ID는 필수입니다' },
        { status: 400 }
      );
    }
    console.log('✅ [AIR-PERMIT] PUT - ID 검증 통과:', id);

    // Step 3: 편집 모드 감지 - outlets 데이터 포함 여부로 판단
    const outlets = rawUpdateData.outlets || [];
    const hasOutletsData = outlets && Array.isArray(outlets) && outlets.length > 0;

    console.log('✅ [AIR-PERMIT] PUT - 배출구 정보 추출:', {
      outletCount: outlets.length,
      hasOutletsData
    });

    // Step 4: 날짜 필드 검증
    const validateDate = (dateStr: string, fieldName: string): string | null => {
      try {
        if (!dateStr || dateStr === '' || dateStr === '--' || dateStr.length < 8) {
          console.log(`📅 [PUT] ${fieldName}: 빈 값 - null 반환`);
          return null;
        }
        if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
          console.log(`📅 [PUT] ${fieldName}: 형식 불일치 (${dateStr}) - null 반환`);
          return null;
        }
        console.log(`📅 [PUT] ${fieldName}: 검증 통과 (${dateStr})`);
        return dateStr;
      } catch (dateError) {
        console.error(`🔴 [PUT] 날짜 검증 오류 (${fieldName}):`, dateError);
        return null;
      }
    };

    const validatedFirstReportDate = validateDate(rawUpdateData.first_report_date, 'first_report_date');
    const validatedOperationStartDate = validateDate(rawUpdateData.operation_start_date, 'operation_start_date');

    // Step 5: 기본 정보 업데이트
    const additionalInfo = {
      ...rawUpdateData.additional_info || {},
      category: rawUpdateData.additional_info?.category || rawUpdateData.category || null,
      business_name: rawUpdateData.additional_info?.business_name || rawUpdateData.business_name || null,
      pollutants: rawUpdateData.additional_info?.pollutants || (Array.isArray(rawUpdateData.pollutants) ? rawUpdateData.pollutants : []),
      facility_number: rawUpdateData.facility_number ?? rawUpdateData.additional_info?.facility_number ?? null,
      green_link_code: rawUpdateData.green_link_code ?? rawUpdateData.additional_info?.green_link_code ?? null,
      memo: rawUpdateData.memo ?? rawUpdateData.additional_info?.memo ?? null
    };

    const updateQuery = `
      UPDATE air_permit_info
      SET
        business_type = $1,
        first_report_date = $2,
        operation_start_date = $3,
        additional_info = $4,
        updated_at = NOW()
      WHERE id = $5 AND is_active = true AND is_deleted = false
      RETURNING *
    `;

    const updateResult = await pgQuery(updateQuery, [
      rawUpdateData.business_type || null,
      validatedFirstReportDate,
      validatedOperationStartDate,
      JSON.stringify(additionalInfo),
      id
    ]);

    if (!updateResult.rows || updateResult.rows.length === 0) {
      throw new Error('대기필증 업데이트 실패');
    }

    console.log('✅ [AIR-PERMIT] PUT - 기본 정보 업데이트 완료');

    // Step 6: 배출구 정보 업데이트 (있는 경우만)
    if (hasOutletsData) {
      console.log('💾 [AIR-PERMIT] PUT - 배출구 UPSERT 업데이트 시작');

      // 🔥 UPSERT 패턴: 기존 배출구는 UPDATE, 새 배출구는 INSERT
      for (const outlet of outlets) {
        let outletId = outlet.id;
        let outletResult;

        if (outletId && outletId !== 'new') {
          // 기존 배출구 UPDATE
          console.log(`🔄 기존 배출구 업데이트: ${outletId}`);
          outletResult = await pgQuery(
            `UPDATE discharge_outlets
             SET outlet_number = $1, outlet_name = $2, additional_info = $3, updated_at = NOW()
             WHERE id = $4 AND air_permit_id = $5
             RETURNING *`,
            [
              outlet.outlet_number || null,
              outlet.outlet_name || null,
              JSON.stringify(outlet.additional_info || {}),
              outletId,
              id
            ]
          );
        } else {
          // 새 배출구 INSERT
          console.log(`➕ 새 배출구 생성`);
          outletResult = await pgQuery(
            `INSERT INTO discharge_outlets (
              air_permit_id, outlet_number, outlet_name, additional_info,
              is_active, is_deleted
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [
              id,
              outlet.outlet_number || null,
              outlet.outlet_name || null,
              JSON.stringify(outlet.additional_info || {}),
              true,
              false
            ]
          );
        }

        if (outletResult.rows && outletResult.rows.length > 0) {
          const upsertedOutlet = outletResult.rows[0];
          outletId = upsertedOutlet.id;

          // 🔥 배출시설 UPSERT
          const dischargeFacilities = outlet.discharge_facilities || [];
          for (const facility of dischargeFacilities) {
            const facilityId = facility.id;

            if (facilityId && facilityId !== 'new') {
              // 기존 배출시설 UPDATE
              console.log(`  🔄 기존 배출시설 업데이트: ${facilityId}`);
              await pgQuery(
                `UPDATE discharge_facilities
                 SET facility_name = $1, capacity = $2, quantity = $3, additional_info = $4, updated_at = NOW()
                 WHERE id = $5 AND outlet_id = $6`,
                [
                  facility.facility_name || facility.name || null,
                  facility.capacity || null,
                  facility.quantity || null,
                  JSON.stringify(facility.additional_info || {}),
                  facilityId,
                  outletId
                ]
              );
            } else {
              // 새 배출시설 INSERT
              console.log(`  ➕ 새 배출시설 생성`);
              await pgQuery(
                `INSERT INTO discharge_facilities (
                  outlet_id, facility_name, capacity, quantity, additional_info,
                  is_active, is_deleted
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  outletId,
                  facility.facility_name || facility.name || null,
                  facility.capacity || null,
                  facility.quantity || null,
                  JSON.stringify(facility.additional_info || {}),
                  true,
                  false
                ]
              );
            }
          }

          // 🔥 방지시설 UPSERT
          const preventionFacilities = outlet.prevention_facilities || [];
          for (const facility of preventionFacilities) {
            const facilityId = facility.id;

            if (facilityId && facilityId !== 'new') {
              // 기존 방지시설 UPDATE
              console.log(`  🔄 기존 방지시설 업데이트: ${facilityId}`);
              await pgQuery(
                `UPDATE prevention_facilities
                 SET facility_name = $1, capacity = $2, quantity = $3, additional_info = $4, updated_at = NOW()
                 WHERE id = $5 AND outlet_id = $6`,
                [
                  facility.facility_name || facility.name || null,
                  facility.capacity || null,
                  facility.quantity || null,
                  JSON.stringify(facility.additional_info || {}),
                  facilityId,
                  outletId
                ]
              );
            } else {
              // 새 방지시설 INSERT
              console.log(`  ➕ 새 방지시설 생성`);
              await pgQuery(
                `INSERT INTO prevention_facilities (
                  outlet_id, facility_name, capacity, quantity, additional_info,
                  is_active, is_deleted
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  outletId,
                  facility.facility_name || facility.name || null,
                  facility.capacity || null,
                  facility.quantity || null,
                  JSON.stringify(facility.additional_info || {}),
                  true,
                  false
                ]
              );
            }
          }
        }
      }
      console.log('✅ [AIR-PERMIT] PUT - 배출구 UPSERT 업데이트 완료');
    }

    // Step 7: 최종 데이터 조회
    const updatedPermit = await queryOne(
      `SELECT
        api.*,
        json_build_object(
          'business_name', bi.business_name,
          'business_management_code', bi.business_management_code
        ) as business
       FROM air_permit_info api
       LEFT JOIN business_info bi ON api.business_id = bi.id
       WHERE api.id = $1`,
      [id]
    );

    const updatedOutlets = await queryAll(
      `SELECT
        outlet.*,
        (
          SELECT json_agg(df.*)
          FROM discharge_facilities df
          WHERE df.outlet_id = outlet.id
        ) as discharge_facilities,
        (
          SELECT json_agg(pf.*)
          FROM prevention_facilities pf
          WHERE pf.outlet_id = outlet.id
        ) as prevention_facilities
       FROM discharge_outlets outlet
       WHERE outlet.air_permit_id = $1
       ORDER BY outlet.outlet_number`,
      [id]
    );

    updatedPermit.outlets = updatedOutlets || [];

    console.log('🎉 [AIR-PERMIT] PUT - 업데이트 완료');
    return NextResponse.json({
      message: '대기필증 정보가 성공적으로 업데이트되었습니다',
      data: updatedPermit
    });

  } catch (error: any) {
    console.error('💥 [AIR-PERMIT] PUT - 업데이트 오류:', {
      message: error?.message || 'No message',
      stack: error?.stack || 'No stack'
    });

    return NextResponse.json(
      {
        error: '대기필증 정보 업데이트에 실패했습니다',
        details: error?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE: 대기필증 삭제 (논리 삭제)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const permitId = searchParams.get('id');

    if (!permitId) {
      return NextResponse.json(
        { error: '대기필증 ID는 필수입니다' },
        { status: 400 }
      );
    }

    console.log('🗑️ [AIR-PERMIT] DELETE - 삭제 시작:', permitId);

    // 대기필증 소프트 삭제 - Direct PostgreSQL
    const deleteResult = await pgQuery(
      `UPDATE air_permit_info
       SET is_deleted = true, updated_at = NOW()
       WHERE id = $1 AND is_active = true AND is_deleted = false
       RETURNING *`,
      [permitId]
    );

    if (!deleteResult.rows || deleteResult.rows.length === 0) {
      return NextResponse.json(
        { error: '대기필증을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // 관련 배출구 및 시설도 소프트 삭제
    await pgQuery(
      `UPDATE discharge_outlets
       SET is_deleted = true, updated_at = NOW()
       WHERE air_permit_id = $1`,
      [permitId]
    );

    await pgQuery(
      `UPDATE discharge_facilities
       SET is_deleted = true, updated_at = NOW()
       WHERE outlet_id IN (
         SELECT id FROM discharge_outlets WHERE air_permit_id = $1
       )`,
      [permitId]
    );

    await pgQuery(
      `UPDATE prevention_facilities
       SET is_deleted = true, updated_at = NOW()
       WHERE outlet_id IN (
         SELECT id FROM discharge_outlets WHERE air_permit_id = $1
       )`,
      [permitId]
    );

    console.log('✅ [AIR-PERMIT] DELETE - 삭제 완료:', permitId);
    return NextResponse.json({
      message: '대기필증이 성공적으로 삭제되었습니다'
    });

  } catch (error) {
    console.error('❌ [AIR-PERMIT] DELETE - 삭제 오류:', error);
    return NextResponse.json(
      { error: '대기필증 삭제에 실패했습니다' },
      { status: 500 }
    );
  }
}
