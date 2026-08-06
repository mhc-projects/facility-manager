// app/api/business-info/route.ts - 특정 사업장 상세 정보 조회
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export const GET = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const businessName = searchParams.get('businessName');

    if (!businessName) {
      return createErrorResponse('사업장명이 필요합니다', 400);
    }

    console.log('🏢 [BUSINESS-INFO] 사업장 상세 정보 조회:', businessName);

    // business_info 테이블에서 해당 사업장 상세 정보 조회
    const { data: businessInfo, error: businessError } = await supabaseAdmin
      .from('business_info')
      .select(`
        id,
        business_name,
        address,
        manager_name,
        manager_contact,
        manager_position,
        business_contact,
        business_registration_number,
        representative,
        industry,
        ph_meter,
        differential_pressure_meter,
        temperature_meter,
        discharge_current_meter,
        fan_current_meter,
        pump_current_meter,
        gateway,
        air_permit_info!inner(
          id,
          permit_number,
          is_active
        )
      `)
      .eq('business_name', businessName)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .eq('air_permit_info.is_active', true)
      .single();

    if (businessError) {
      console.error('🔴 [BUSINESS-INFO] 조회 오류:', businessError);
      return createErrorResponse('사업장 정보를 찾을 수 없습니다', 404);
    }

    if (!businessInfo) {
      console.log('📋 [BUSINESS-INFO] 사업장 정보 없음:', businessName);
      return createErrorResponse('사업장 정보를 찾을 수 없습니다', 404);
    }

    // 기기 수량 계산
    const equipmentCounts = {
      phSensor: businessInfo.ph_meter || 0,
      differentialPressureMeter: businessInfo.differential_pressure_meter || 0,
      temperatureMeter: businessInfo.temperature_meter || 0,
      dischargeCT: businessInfo.discharge_current_meter || 0,
      fanCT: businessInfo.fan_current_meter || 0,
      pumpCT: businessInfo.pump_current_meter || 0,
      gateway: businessInfo.gateway || 0,
      totalDevices: (businessInfo.ph_meter || 0) +
                    (businessInfo.differential_pressure_meter || 0) +
                    (businessInfo.temperature_meter || 0) +
                    (businessInfo.discharge_current_meter || 0) +
                    (businessInfo.fan_current_meter || 0) +
                    (businessInfo.pump_current_meter || 0) +
                    (businessInfo.gateway || 0)
    };

    // 응답 데이터 포맷팅
    const formattedData = {
      found: true,
      businessName: businessInfo.business_name,
      manager: businessInfo.manager_name,
      position: businessInfo.manager_position,
      contact: businessInfo.manager_contact,
      address: businessInfo.address,

      // Supabase 확장 정보
      id: businessInfo.id,
      사업장명: businessInfo.business_name,
      주소: businessInfo.address,
      담당자명: businessInfo.manager_name,
      담당자연락처: businessInfo.manager_contact,
      담당자직급: businessInfo.manager_position,
      사업장연락처: businessInfo.business_contact,
      사업자등록번호: businessInfo.business_registration_number,
      대표자: businessInfo.representative,
      업종: businessInfo.industry,

      // 측정기기 수량 정보
      equipmentCounts,

      // 대기필증 정보
      airPermitInfo: businessInfo.air_permit_info
    };

    console.log('✅ [BUSINESS-INFO] 조회 성공:', {
      businessName: formattedData.businessName,
      totalDevices: equipmentCounts.totalDevices,
      airPermits: businessInfo.air_permit_info?.length || 0
    });

    return createSuccessResponse(formattedData);

  } catch (error: any) {
    console.error('🔴 [BUSINESS-INFO] 오류:', error?.message || error);
    return createErrorResponse('사업장 정보 조회 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });