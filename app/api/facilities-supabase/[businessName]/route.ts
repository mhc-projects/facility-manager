// app/api/facilities-supabase/[businessName]/route.ts - Supabase 기반 시설 정보 API
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, query as pgQuery } from '@/lib/supabase-direct';
import { memoryCache } from '@/lib/cache';
import { FacilitiesData, Facility } from '@/types';
import { generateFacilityNumbering, type FacilityNumberingResult } from '@/utils/facility-numbering';
import { AirPermitWithOutlets } from '@/types/database';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// HTTP 캐시 헤더 설정
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=60', // 5분 캐시, 1분 stale
  'CDN-Cache-Control': 'public, max-age=600', // CDN에서 10분 캐시
};

export async function GET(
  request: NextRequest,
  { params }: { params: { businessName: string } }
) {
  const startTime = Date.now();
  
  try {
    const businessName = decodeURIComponent(params.businessName);
    console.log('🏭 [FACILITIES-SUPABASE] API 시작:', businessName);
    
    // 입력 검증
    if (!businessName || businessName.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: '사업장명이 유효하지 않습니다.' },
        { status: 400, headers: CACHE_HEADERS }
      );
    }
    
    const cacheKey = `facilities-supabase:${businessName}`;
    
    // 강제 캐시 무효화 옵션
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';
    if (forceRefresh) {
      console.log('🔄 [FACILITIES-SUPABASE] 강제 캐시 클리어');
      memoryCache.delete(cacheKey);
    }
    
    // 캐시 확인
    const cached = memoryCache.get(cacheKey);
    if (cached && !forceRefresh) {
      console.log(`🏭 [FACILITIES-SUPABASE] 캐시에서 데이터 반환 (${Date.now() - startTime}ms)`);
      return NextResponse.json({ success: true, data: cached }, { headers: CACHE_HEADERS });
    }

    console.log('🏭 [FACILITIES-SUPABASE] 대기필증 관리 데이터에서 조회 시작');
    
    // 1. 사업장 정보 조회 (전체 정보 포함) - Direct PostgreSQL
    console.log(`🔍 [FACILITIES-SUPABASE] 사업장 조회: "${businessName}"`);
    const business = await queryOne(
      `SELECT
        id, business_name, address, business_contact, manager_name,
        manager_contact, manager_position, representative_name,
        business_registration_number, business_type, manufacturer
       FROM business_info
       WHERE business_name = $1`,
      [businessName]
    );

    console.log(`🔍 [FACILITIES-SUPABASE] 사업장 조회 결과:`, business);

    if (!business) {
      console.log(`🏭 [FACILITIES-SUPABASE] ⚠️ "${businessName}" 사업장을 찾을 수 없습니다`);
      const emptyResult = {
        facilities: { discharge: [], prevention: [] },
        outlets: { outlets: [1], count: 1, maxOutlet: 1, minOutlet: 1 },
        dischargeCount: 0,
        preventionCount: 0,
        businessInfo: {
          businessName: businessName,
          사업장명: businessName,
          주소: '정보 없음',
          사업장연락처: '정보 없음',
          담당자명: '정보 없음',
          담당자연락처: '정보 없음',
          담당자직급: '정보 없음',
          대표자: '정보 없음',
          사업자등록번호: '정보 없음',
          업종: '정보 없음'
        },
        note: '해당 사업장을 찾을 수 없습니다.',
        source: 'air-permit-management'
      };
      memoryCache.set(cacheKey, emptyResult, 1);
      return NextResponse.json({ success: true, data: emptyResult }, { headers: CACHE_HEADERS });
    }

    // 2. 대기필증 정보 조회 (삭제되지 않은 가장 최근 것) - Direct PostgreSQL
    console.log(`🔍 [FACILITIES-SUPABASE] 대기필증 조회: business_id="${business.id}"`);
    const airPermit = await queryOne(
      `SELECT id FROM air_permit_info
       WHERE business_id = $1 AND is_deleted = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [business.id]
    );

    console.log(`🔍 [FACILITIES-SUPABASE] 대기필증 조회 결과:`, airPermit);

    if (!airPermit) {
      console.log(`🏭 [FACILITIES-SUPABASE] ⚠️ "${businessName}" 대기필증을 찾을 수 없습니다`);
      const emptyResult = {
        facilities: { discharge: [], prevention: [] },
        outlets: { outlets: [1], count: 1, maxOutlet: 1, minOutlet: 1 },
        dischargeCount: 0,
        preventionCount: 0,
        note: '해당 사업장의 대기필증을 찾을 수 없습니다.',
        source: 'air-permit-management'
      };
      memoryCache.set(cacheKey, emptyResult, 1);
      return NextResponse.json({ success: true, data: emptyResult }, { headers: CACHE_HEADERS });
    }

    // 3. 배출구 정보 조회 (게이트웨이 정보 포함) - Direct PostgreSQL
    const outlets = await queryAll(
      `SELECT id, outlet_number, outlet_name, gateway_number, vpn_type
       FROM discharge_outlets
       WHERE air_permit_id = $1
       ORDER BY outlet_number`,
      [airPermit.id]
    );

    const outletIds = outlets?.map(o => o.id) || [];
    console.log(`🔍 [FACILITIES-SUPABASE] 배출구 조회 완료:`, {
      outletIds,
      outletsCount: outlets?.length
    });

    // 3-1. 배출시설 정보 별도 조회 - Direct PostgreSQL
    console.log(`🔍 [FACILITIES-SUPABASE] 배출시설 별도 조회 시작`);
    const dischargeFacilities = outletIds.length > 0 ? await queryAll(
      `SELECT
        id, outlet_id, facility_name, capacity, quantity, facility_number,
        notes, discharge_ct, exemption_reason, remarks,
        last_updated_at, last_updated_by
       FROM discharge_facilities
       WHERE outlet_id = ANY($1)`,
      [outletIds]
    ) : [];

    // 배출시설 총 수량 계산 (quantity 필드 합산)
    const totalDischargeQuantity = dischargeFacilities?.reduce((sum, f) => sum + (f.quantity || 1), 0) || 0;

    console.log(`🔍 [FACILITIES-SUPABASE] 배출시설 조회 완료:`, {
      레코드수: dischargeFacilities?.length || 0,
      총수량: totalDischargeQuantity,
      facilities: dischargeFacilities
    });

    // 4. 방지시설 정보 별도 조회 - Direct PostgreSQL
    console.log(`🔍 [FACILITIES-SUPABASE] 방지시설 별도 조회 시작:`, {
      outletIds,
      outletsCount: outlets?.length
    });

    const preventionFacilities = outletIds.length > 0 ? await queryAll(
      `SELECT
        id, outlet_id, facility_name, capacity, quantity, facility_number,
        notes, ph, pressure, temperature, pump, fan, remarks,
        last_updated_at, last_updated_by
       FROM prevention_facilities
       WHERE outlet_id = ANY($1)`,
      [outletIds]
    ) : [];

    console.log(`🔍 [FACILITIES-SUPABASE] 방지시설 조회 완료:`, {
      count: preventionFacilities?.length || 0,
      facilities: preventionFacilities
    });

    const dischargeData: any[] = [];
    const preventionData: any[] = [];

    // 배출구 ID to outlet_number 매핑 생성
    const outletIdToNumber: { [key: string]: number } = {};
    outlets?.forEach((outlet: any) => {
      outletIdToNumber[outlet.id] = outlet.outlet_number;
    });

    // 배출시설 데이터 변환 (별도 조회 결과 사용)
    dischargeFacilities?.forEach((facility: any) => {
      const outletNumber = outletIdToNumber[facility.outlet_id];

      // 🔍 각 배출시설 레코드의 ID와 측정기기 정보 로깅
      console.log(`📋 [FACILITIES-SUPABASE] 배출시설 레코드 발견:`, {
        id: facility.id,
        outlet_id: facility.outlet_id,
        outlet_number: outletNumber,
        number: facility.facility_number,
        name: facility.facility_name,
        dischargeCT: facility.discharge_ct,
        exemptionReason: facility.exemption_reason
      });

      if (outletNumber) {
        dischargeData.push({
          id: facility.id, // 🔧 시설 ID 추가 (측정기기 업데이트용)
          outlet_number: outletNumber,
          facility_number: facility.facility_number,
          facility_name: facility.facility_name,
          capacity: facility.capacity,
          quantity: facility.quantity,
          notes: facility.notes,
          // 측정기기 필드 추가 (이중 제공: Business 페이지용 + Admin 모달용)
          dischargeCT: facility.discharge_ct,                 // Business 페이지용
          exemptionReason: facility.exemption_reason,         // Business 페이지용
          discharge_ct: facility.discharge_ct,                // Admin 모달용
          exemption_reason: facility.exemption_reason,        // Admin 모달용
          remarks: facility.remarks,
          last_updated_at: facility.last_updated_at,
          last_updated_by: facility.last_updated_by
        });
      }
    });

    // 방지시설 데이터 변환 (별도 조회 결과 사용)
    preventionFacilities?.forEach((facility: any) => {
      const outletNumber = outletIdToNumber[facility.outlet_id];

      // 🔍 각 방지시설 레코드의 ID와 측정기기 정보 로깅
      console.log(`📋 [FACILITIES-SUPABASE] 방지시설 레코드 발견:`, {
        id: facility.id,
        outlet_id: facility.outlet_id,
        outlet_number: outletNumber,
        number: facility.facility_number,
        name: facility.facility_name,
        ph: facility.ph,
        pressure: facility.pressure,
        temperature: facility.temperature,
        pump: facility.pump,
        fan: facility.fan
      });

      if (outletNumber) {
        preventionData.push({
          id: facility.id, // 🔧 시설 ID 추가 (측정기기 업데이트용)
          outlet_number: outletNumber,
          facility_number: facility.facility_number,
          facility_name: facility.facility_name,
          capacity: facility.capacity,
          quantity: facility.quantity,
          notes: facility.notes,
          // 측정기기 필드 추가 (이중 제공: Business 페이지용 + Admin 모달용)
          ph: facility.ph,                                    // Business 페이지용
          pressure: facility.pressure,                        // Business 페이지용
          temperature: facility.temperature,                  // Business 페이지용
          pump: facility.pump,                                // Business 페이지용
          fan: facility.fan,                                  // Business 페이지용
          ph_meter: facility.ph,                              // Admin 모달용
          differential_pressure_meter: facility.pressure,     // Admin 모달용
          temperature_meter: facility.temperature,            // Admin 모달용
          pump_ct: facility.pump,                             // Admin 모달용
          fan_ct: facility.fan,                               // Admin 모달용
          remarks: facility.remarks,
          last_updated_at: facility.last_updated_at,
          last_updated_by: facility.last_updated_by
        });
      }
    });

    console.log('🏭 [FACILITIES-SUPABASE] 대기필증 관리에서 조회 완료:', {
      discharge: dischargeData.length,
      prevention: preventionData.length,
      outlets: outlets?.length || 0
    });

    // 🎯 시설 데이터 변환 (어드민과 동일한 데이터베이스 번호 사용)
    const facilities: FacilitiesData = {
      discharge: dischargeData.map(facility => ({
        id: facility.id, // 🔧 시설 ID 추가 (측정기기 업데이트용)
        outlet: facility.outlet_number,
        number: facility.facility_number, // 🔧 어드민과 동일한 데이터베이스 값 사용
        name: facility.facility_name,
        capacity: facility.capacity,
        quantity: facility.quantity,
        displayName: `배출구${facility.outlet_number}-배출시설${facility.facility_number}`,
        notes: facility.notes,
        // 측정기기 필드 추가 (이중 제공: Business 페이지용 + Admin 모달용)
        dischargeCT: facility.dischargeCT,                    // Business 페이지용
        exemptionReason: facility.exemptionReason,            // Business 페이지용
        discharge_ct: facility.discharge_ct,                  // Admin 모달용
        exemption_reason: facility.exemption_reason,          // Admin 모달용
        remarks: facility.remarks,
        last_updated_at: facility.last_updated_at,
        last_updated_by: facility.last_updated_by
      })),
      prevention: preventionData.map(facility => {
        // 🔍 방지시설 측정기기 데이터 디버깅
        console.log(`📊 [FACILITIES-SUPABASE] 방지시설 ${facility.outlet_number}-${facility.facility_number} 측정기기:`, {
          ph: facility.ph,
          pressure: facility.pressure,
          temperature: facility.temperature,
          pump: facility.pump,
          fan: facility.fan
        });

        return {
          id: facility.id, // 🔧 시설 ID 추가 (측정기기 업데이트용)
          outlet: facility.outlet_number,
          number: facility.facility_number, // 🔧 어드민과 동일한 데이터베이스 값 사용
          name: facility.facility_name,
          capacity: facility.capacity,
          quantity: facility.quantity,
          displayName: `배출구${facility.outlet_number}-방지시설${facility.facility_number}`,
          notes: facility.notes,
          // 측정기기 필드 추가 (이중 제공: Business 페이지용 + Admin 모달용)
          ph: facility.ph,                                    // Business 페이지용
          pressure: facility.pressure,                        // Business 페이지용
          temperature: facility.temperature,                  // Business 페이지용
          pump: facility.pump,                                // Business 페이지용
          fan: facility.fan,                                  // Business 페이지용
          ph_meter: facility.ph_meter,                        // Admin 모달용
          differential_pressure_meter: facility.differential_pressure_meter, // Admin 모달용
          temperature_meter: facility.temperature_meter,      // Admin 모달용
          pump_ct: facility.pump_ct,                          // Admin 모달용
          fan_ct: facility.fan_ct,                            // Admin 모달용
          remarks: facility.remarks,
          last_updated_at: facility.last_updated_at,
          last_updated_by: facility.last_updated_by
        };
      })
    };

    // 🎯 어드민 시스템과 동일한 시설번호 생성 (AirPermitWithOutlets 구조 변환)
    const airPermitData: AirPermitWithOutlets = {
      id: airPermit.id,
      business_id: business.id,
      business_type: business.business_type || '',
      annual_emission_amount: null,
      pollutants: [],
      emission_limits: {},
      additional_info: {},
      is_active: true,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      outlets: outlets?.map(outlet => {
        // 이 배출구에 속한 배출시설 필터링
        const outletDischargeFacilities = dischargeFacilities?.filter(
          f => f.outlet_id === outlet.id
        ) || [];

        // 이 배출구에 속한 방지시설 필터링
        const outletPreventionFacilities = preventionFacilities?.filter(
          f => f.outlet_id === outlet.id
        ) || [];

        console.log(`🔍 [FACILITY-NUMBERING] 배출구 ${outlet.outlet_number} 시설 정보:`, {
          discharge: outletDischargeFacilities.length,
          prevention: outletPreventionFacilities.length
        });

        return {
          id: outlet.id,
          air_permit_id: airPermit.id,
          outlet_number: outlet.outlet_number,
          outlet_name: outlet.outlet_name || `배출구 ${outlet.outlet_number}`,
          stack_height: null,
          stack_diameter: null,
          flow_rate: null,
          additional_info: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          discharge_facilities: outletDischargeFacilities.map(facility => ({
            id: facility.id,
            outlet_id: outlet.id,
            facility_name: facility.facility_name,
            facility_code: null,
            capacity: facility.capacity,
            quantity: facility.quantity,
            operating_conditions: {},
            measurement_points: [],
            device_ids: [],
            additional_info: { notes: facility.notes },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })),
          prevention_facilities: outletPreventionFacilities.map(facility => ({
            id: facility.id,
            outlet_id: outlet.id,
            facility_name: facility.facility_name,
            facility_code: null,
            capacity: facility.capacity,
            quantity: facility.quantity,
            efficiency_rating: null,
            media_type: null,
            maintenance_interval: null,
            operating_conditions: {},
            measurement_points: [],
            device_ids: [],
            additional_info: { notes: facility.notes },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }))
        };
      }) || []
    };

    // 🎯 어드민 시스템과 동일한 시설번호 생성
    const facilityNumbering = generateFacilityNumbering(airPermitData);

    // 🔧 생성된 번호로 null 값 보정 (모든 사업장에서 일관된 번호 표시)
    facilities.discharge.forEach((facility, index) => {
      if (facility.number === null || facility.number === undefined) {
        console.log(`🔧 [NULL-FIX] 배출시설 null 보정 시도:`, {
          name: facility.name,
          outlet: facility.outlet,
          capacity: facility.capacity
        });

        // 생성된 번호에서 해당 시설의 번호 찾기
        const outletFacilities = facilityNumbering.outlets.find(o => o.outletNumber === facility.outlet);

        if (outletFacilities && outletFacilities.dischargeFacilities.length > 0) {
          // 시설 이름 + 용량으로 매칭 시도
          let facilityInfo = outletFacilities.dischargeFacilities.find(f =>
            f.facilityName === facility.name && f.capacity === facility.capacity
          );

          // 매칭 실패 시 이름만으로 매칭
          if (!facilityInfo) {
            facilityInfo = outletFacilities.dischargeFacilities.find(f =>
              f.facilityName === facility.name
            );
          }

          // 여전히 매칭 실패 시 배출구 내 순서대로 번호 할당
          if (!facilityInfo && outletFacilities.dischargeFacilities[index]) {
            facilityInfo = outletFacilities.dischargeFacilities[index];
          }

          // 최종 fallback: 배출구의 첫 번째 시설 번호 사용
          if (!facilityInfo && outletFacilities.dischargeFacilities.length > 0) {
            facilityInfo = outletFacilities.dischargeFacilities[0];
          }

          if (facilityInfo) {
            facility.number = facilityInfo.facilityNumber;
            facility.displayName = `배출구${facility.outlet}-배출시설${facility.number}`;
            console.log(`✅ [NULL-FIX] 배출시설 번호 보정 성공:`, {
              name: facility.name,
              assignedNumber: facility.number
            });
          } else {
            console.warn(`⚠️ [NULL-FIX] 배출시설 번호 보정 실패:`, {
              name: facility.name,
              outlet: facility.outlet
            });
          }
        }
      }
    });

    facilities.prevention.forEach((facility, index) => {
      if (facility.number === null || facility.number === undefined) {
        console.log(`🔧 [NULL-FIX] 방지시설 null 보정 시도:`, {
          name: facility.name,
          outlet: facility.outlet,
          capacity: facility.capacity
        });

        // 생성된 번호에서 해당 시설의 번호 찾기
        const outletFacilities = facilityNumbering.outlets.find(o => o.outletNumber === facility.outlet);

        if (outletFacilities && outletFacilities.preventionFacilities.length > 0) {
          // 시설 이름 + 용량으로 매칭 시도
          let facilityInfo = outletFacilities.preventionFacilities.find(f =>
            f.facilityName === facility.name && f.capacity === facility.capacity
          );

          // 매칭 실패 시 이름만으로 매칭
          if (!facilityInfo) {
            facilityInfo = outletFacilities.preventionFacilities.find(f =>
              f.facilityName === facility.name
            );
          }

          // 여전히 매칭 실패 시 배출구 내 순서대로 번호 할당
          if (!facilityInfo && outletFacilities.preventionFacilities[index]) {
            facilityInfo = outletFacilities.preventionFacilities[index];
          }

          // 최종 fallback: 배출구의 첫 번째 시설 번호 사용
          if (!facilityInfo && outletFacilities.preventionFacilities.length > 0) {
            facilityInfo = outletFacilities.preventionFacilities[0];
          }

          if (facilityInfo) {
            facility.number = facilityInfo.facilityNumber;
            facility.displayName = `배출구${facility.outlet}-방지시설${facility.number}`;
            console.log(`✅ [NULL-FIX] 방지시설 번호 보정 성공:`, {
              name: facility.name,
              assignedNumber: facility.number
            });
          } else {
            console.warn(`⚠️ [NULL-FIX] 방지시설 번호 보정 실패:`, {
              name: facility.name,
              outlet: facility.outlet
            });
          }
        }
      }
    });

    console.log('🏭 [FACILITIES-SUPABASE] 변환 결과:', {
      discharge: facilities.discharge.length,
      prevention: facilities.prevention.length,
      facilityNumbering: {
        totalDischarge: facilityNumbering.totalDischargeFacilities,
        totalPrevention: facilityNumbering.totalPreventionFacilities
      },
      번호보정: {
        discharge: facilities.discharge.map(f => `${f.name}: ${f.number}`),
        prevention: facilities.prevention.map(f => `${f.name}: ${f.number}`)
      },
      시간: `${Date.now() - startTime}ms`
    });
    
    // 시설 수량 계산 (quantity 고려)
    const dischargeCount = facilities.discharge.reduce((total, facility) => total + facility.quantity, 0);
    const preventionCount = facilities.prevention.reduce((total, facility) => total + facility.quantity, 0);
    
    // 사업장 정보 구성
    const businessInfo = {
      id: business.id, // 🔑 사업장 ID 추가 (facility-management API 호출에 필요)
      businessName: business.business_name,
      사업장명: business.business_name,
      주소: business.address || '정보 없음',
      사업장연락처: business.business_contact || '정보 없음',
      담당자명: business.manager_name || '정보 없음',
      담당자연락처: business.manager_contact || '정보 없음',
      담당자직급: business.manager_position || '정보 없음',
      대표자: business.representative_name || '정보 없음',
      사업자등록번호: business.business_registration_number || '정보 없음',
      업종: business.business_type || '정보 없음'
    };
    
    // outlet ID to 게이트웨이 정보 매핑 생성
    const outletIdToGateway: { [key: string]: { gateway_number?: string; vpn_type?: string } } = {};
    outlets?.forEach((outlet: any) => {
      outletIdToGateway[outlet.id] = {
        gateway_number: outlet.gateway_number,
        vpn_type: outlet.vpn_type
      };
    });

    // 🎯 결과 데이터 구성 (어드민 시설번호 정보 포함)
    const resultData = {
      facilities,
      outlets: analyzeOutlets(facilities),
      dischargeCount,
      preventionCount,
      businessInfo,
      facilityNumbering: {
        ...facilityNumbering,
        // ✅ outlets 배열에 id, gateway_number, vpn_type 필드 추가
        outlets: facilityNumbering.outlets.map(outlet => {
          const gatewayInfo = outletIdToGateway[outlet.outletId] || {};
          return {
            ...outlet,
            id: outlet.outletId, // UI에서 outlet.id로 접근 가능하도록
            gateway_number: gatewayInfo.gateway_number || null,
            vpn_type: gatewayInfo.vpn_type || null
          };
        })
      }, // 🎯 어드민과 동일한 시설번호 정보 포함
      lastUpdated: new Date().toISOString(),
      processingTime: Date.now() - startTime,
      source: 'air-permit-management'
    };

    // 데이터가 없는 경우 처리
    if (facilities.discharge.length === 0 && facilities.prevention.length === 0) {
      console.log(`🏭 [FACILITIES-SUPABASE] ⚠️ "${businessName}" 사업장에서 시설을 찾을 수 없습니다`);
      const emptyResult = {
        facilities: { discharge: [], prevention: [] },
        outlets: { outlets: [1], count: 1, maxOutlet: 1, minOutlet: 1 },
        dischargeCount: 0,
        preventionCount: 0,
        businessInfo,
        note: '해당 사업장의 대기필증 시설 정보를 찾을 수 없습니다.',
        source: 'air-permit-management'
      };
      
      // 짧은 시간 캐시 (재시도 가능하도록)
      memoryCache.set(cacheKey, emptyResult, 1);
      
      return NextResponse.json(
        { success: true, data: emptyResult },
        { headers: CACHE_HEADERS }
      );
    }
    
    // 캐시 저장 (성공 시 긴 시간)
    memoryCache.set(cacheKey, resultData, 10);
    
    console.log(`🏭 [FACILITIES-SUPABASE] ✅ 성공적으로 완료 (${Date.now() - startTime}ms)`);

    return NextResponse.json(
      { success: true, data: resultData },
      { headers: CACHE_HEADERS }
    );
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`🏭 [FACILITIES-SUPABASE] ❌ 오류 발생 (${processingTime}ms):`, error);
    
    // 구체적인 에러 메시지 제공
    let errorMessage = '시설 정보 조회 실패';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('database') || error.message.includes('supabase')) {
        errorMessage = '데이터베이스 접근 오류';
        statusCode = 503;
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        errorMessage = '네트워크 연결 오류';
        statusCode = 503;
      } else if (error.message.includes('authorization') || error.message.includes('permission')) {
        errorMessage = '접근 권한 오류';
        statusCode = 403;
      }
    }
    
    return NextResponse.json(
      { 
        success: false, 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined,
        processingTime
      },
      { 
        status: statusCode,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate', // 에러는 캐시하지 않음
        }
      }
    );
  }
}

// POST: 시설 정보 추가/수정
export async function POST(
  request: NextRequest,
  { params }: { params: { businessName: string } }
) {
  try {
    const businessName = decodeURIComponent(params.businessName);
    const body = await request.json();

    console.log('🏭 [FACILITIES-SUPABASE] 시설 정보 저장 시작:', businessName);

    const { discharge = [], prevention = [] } = body;

    // 1. 사업장 정보 조회하여 business_id 획득
    const business = await queryOne(
      'SELECT id FROM business_info WHERE business_name = $1',
      [businessName]
    );

    if (!business) {
      throw new Error(`사업장 "${businessName}"을 찾을 수 없습니다.`);
    }

    // 2. 대기필증 정보 조회
    const airPermit = await queryOne(
      'SELECT id FROM air_permit_info WHERE business_id = $1 AND is_deleted = false ORDER BY created_at DESC LIMIT 1',
      [business.id]
    );

    if (!airPermit) {
      throw new Error(`사업장 "${businessName}"의 대기필증을 찾을 수 없습니다.`);
    }

    // 3. 배출구 정보 조회하여 outlet_number → outlet_id 매핑 생성
    const outlets = await queryAll(
      'SELECT id, outlet_number FROM discharge_outlets WHERE air_permit_id = $1',
      [airPermit.id]
    );

    const outletNumberToId: { [key: number]: string } = {};
    outlets?.forEach((outlet: any) => {
      outletNumberToId[outlet.outlet_number] = outlet.id;
    });

    console.log('🏭 [FACILITIES-SUPABASE] 배출구 매핑:', outletNumberToId);

    // 4. 기존 데이터 삭제 (전체 교체) - Direct PostgreSQL
    const [deleteDischarge, deletePrevention] = await Promise.allSettled([
      pgQuery(
        'DELETE FROM discharge_facilities WHERE business_name = $1',
        [businessName]
      ),
      pgQuery(
        'DELETE FROM prevention_facilities WHERE business_name = $1',
        [businessName]
      )
    ]);

    if (deleteDischarge.status === 'rejected') {
      console.error('🏭 [FACILITIES-SUPABASE] 기존 배출시설 삭제 실패:', deleteDischarge.reason);
    }
    if (deletePrevention.status === 'rejected') {
      console.error('🏭 [FACILITIES-SUPABASE] 기존 방지시설 삭제 실패:', deletePrevention.reason);
    }

    // 5. 새 데이터 삽입 - Direct PostgreSQL
    const promises = [];

    if (discharge.length > 0) {
      // Build multi-row insert query
      const values: any[] = [];
      const valueStrings: string[] = [];
      let paramIndex = 1;

      discharge.forEach((facility: any) => {
        const outletId = outletNumberToId[facility.outlet];
        if (!outletId) {
          console.warn(`⚠️ [FACILITIES-SUPABASE] 배출구 ${facility.outlet}에 대한 outlet_id를 찾을 수 없습니다.`);
          return;
        }

        valueStrings.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`
        );
        values.push(
          outletId,  // ✅ outlet_id 추가
          businessName,
          facility.outlet,
          facility.number,
          facility.name,
          facility.capacity,
          facility.quantity || 1,
          facility.notes || null,
          facility.dischargeCT || facility.discharge_ct || null,
          facility.exemptionReason || facility.exemption_reason || null,
          facility.remarks || null
        );
        paramIndex += 11;  // 10 → 11로 변경
      });

      if (valueStrings.length > 0) {
        const dischargeInsertQuery = `
          INSERT INTO discharge_facilities (
            outlet_id, business_name, outlet_number, facility_number, facility_name,
            capacity, quantity, notes, discharge_ct, exemption_reason, remarks
          ) VALUES ${valueStrings.join(', ')}
        `;

        promises.push(pgQuery(dischargeInsertQuery, values));
      }
    }

    if (prevention.length > 0) {
      // Build multi-row insert query
      const values: any[] = [];
      const valueStrings: string[] = [];
      let paramIndex = 1;

      prevention.forEach((facility: any) => {
        const outletId = outletNumberToId[facility.outlet];
        if (!outletId) {
          console.warn(`⚠️ [FACILITIES-SUPABASE] 배출구 ${facility.outlet}에 대한 outlet_id를 찾을 수 없습니다.`);
          return;
        }

        valueStrings.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, $${paramIndex + 12}, $${paramIndex + 13})`
        );
        values.push(
          outletId,  // ✅ outlet_id 추가
          businessName,
          facility.outlet,
          facility.number,
          facility.name,
          facility.capacity,
          facility.quantity || 1,
          facility.notes || null,
          facility.ph || facility.ph_meter || null,
          facility.pressure || facility.differential_pressure_meter || null,
          facility.temperature || facility.temperature_meter || null,
          facility.pump || facility.pump_ct || null,
          facility.fan || facility.fan_ct || null,
          facility.remarks || null
        );
        paramIndex += 14;  // 13 → 14로 변경
      });

      if (valueStrings.length > 0) {
        const preventionInsertQuery = `
          INSERT INTO prevention_facilities (
            outlet_id, business_name, outlet_number, facility_number, facility_name,
            capacity, quantity, notes, ph, pressure, temperature, pump, fan, remarks
          ) VALUES ${valueStrings.join(', ')}
        `;

        promises.push(pgQuery(preventionInsertQuery, values));
      }
    }

    const results = await Promise.allSettled(promises);

    // 에러 체크
    const errors = results.filter(result => result.status === 'rejected');
    if (errors.length > 0) {
      console.error('🏭 [FACILITIES-SUPABASE] 저장 중 일부 실패:', errors);
      throw new Error('일부 시설 정보 저장에 실패했습니다.');
    }
    
    // 캐시 무효화
    memoryCache.delete(`facilities-supabase:${businessName}`);
    
    console.log('🏭 [FACILITIES-SUPABASE] ✅ 시설 정보 저장 완료');
    
    return NextResponse.json({
      success: true,
      message: '시설 정보가 성공적으로 저장되었습니다.',
      savedCounts: {
        discharge: discharge.length,
        prevention: prevention.length
      }
    });
    
  } catch (error) {
    console.error('🏭 [FACILITIES-SUPABASE] ❌ 저장 실패:', error);
    
    return NextResponse.json(
      {
        success: false,
        message: '시설 정보 저장 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
      },
      { status: 500 }
    );
  }
}

// 배출구 분석 함수
function analyzeOutlets(facilities: FacilitiesData) {
  const allOutlets = [
    ...facilities.discharge.map(f => f.outlet || 1),
    ...facilities.prevention.map(f => f.outlet || 1)
  ];
  
  const uniqueOutlets = [...new Set(allOutlets)].sort((a, b) => a - b);
  
  if (uniqueOutlets.length === 0) uniqueOutlets.push(1);

  return {
    outlets: uniqueOutlets,
    count: uniqueOutlets.length,
    maxOutlet: Math.max(...uniqueOutlets),
    minOutlet: Math.min(...uniqueOutlets)
  };
}