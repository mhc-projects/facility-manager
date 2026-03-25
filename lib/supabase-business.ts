// lib/supabase-business.ts - 비즈니스 데이터 Supabase 서비스 (기존 시스템 활용)
import { supabase, supabaseAdmin, getSupabaseAdminClient } from './supabase';
import type {
  BusinessInfo,
  AirPermitInfo,
  DischargeOutlet,
  DischargeFacility,
  PreventionFacility,
  BusinessMemo,
  CreateBusinessMemoInput,
  UpdateBusinessMemoInput
} from '@/types/database';

// =====================================================
// 비즈니스 정보 관리
// =====================================================

export async function getAllBusinesses(options?: {
  limit?: number;
  offset?: number;
  search?: string;
  isActive?: boolean;
}) {
  const adminClient = getSupabaseAdminClient();

  let query = adminClient
    .from('business_info')
    .select(`
      id,
      business_name,
      business_registration_number,
      local_government,
      address,
      manager_name,
      manager_contact,
      is_active,
      created_at,
      updated_at
    `)
    .eq('is_deleted', false);

  if (options?.isActive !== undefined) {
    query = query.eq('is_active', options.isActive);
  }

  if (options?.search) {
    query = query.or(`business_name.ilike.%${options.search}%,address.ilike.%${options.search}%`);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  query = query.order('business_name');

  const { data, error } = await query;

  if (error) {
    console.error('❌ [SUPABASE] 사업장 목록 조회 실패:', error);
    throw new Error(`사업장 목록 조회 실패: ${error.message}`);
  }

  return data as BusinessInfo[];
}

export async function getBusinessById(id: string) {
  const adminClient = getSupabaseAdminClient();
  const { data, error } = await adminClient
    .from('business_info')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();

  if (error) {
    console.error('❌ [SUPABASE] 사업장 상세 조회 실패:', error);
    throw new Error(`사업장 조회 실패: ${error.message}`);
  }

  return data as BusinessInfo;
}

export async function getBusinessByName(businessName: string) {
  const { data, error } = await supabaseAdmin
    .from('business_info')
    .select('*')
    .eq('business_name', businessName)
    .eq('is_deleted', false)
    .single();

  if (error) {
    console.error('❌ [SUPABASE] 사업장명 조회 실패:', error);
    return null;
  }

  return data as BusinessInfo;
}

export async function createBusiness(businessData: Omit<BusinessInfo, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabaseAdmin
    .from('business_info')
    .insert([businessData])
    .select()
    .single();

  if (error) {
    console.error('❌ [SUPABASE] 사업장 생성 실패:', error);
    throw new Error(`사업장 생성 실패: ${error.message}`);
  }

  return data as BusinessInfo;
}

export async function updateBusiness(id: string, updates: Partial<BusinessInfo>) {
  // 1. 먼저 사업장 정보 업데이트
  const { data, error } = await supabaseAdmin
    .from('business_info')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('❌ [SUPABASE] 사업장 업데이트 실패:', error);
    throw new Error(`사업장 업데이트 실패: ${error.message}`);
  }

  // 2. 실사 일정 필드가 변경된 경우 survey_events 동기화
  const surveyFields = [
    { field: 'estimate_survey_date', type: 'estimate_survey', label: '견적실사', managerField: 'estimate_survey_manager' },
    { field: 'pre_construction_survey_date', type: 'pre_construction_survey', label: '착공전실사', managerField: 'pre_construction_survey_manager' },
    { field: 'completion_survey_date', type: 'completion_survey', label: '준공실사', managerField: 'completion_survey_manager' }
  ];

  for (const survey of surveyFields) {
    if (survey.field in updates) {
      const surveyDate = (updates as any)[survey.field];
      const surveyManager = (updates as any)[survey.managerField] || (data as any)[survey.managerField];
      const eventId = `${survey.type}-${id}`;

      try {
        if (surveyDate) {
          // 실사일이 있으면 생성 또는 업데이트
          const { error: upsertError } = await supabaseAdmin
            .from('survey_events')
            .upsert({
              id: eventId,
              title: `${data.business_name} - ${survey.label}`,
              event_date: surveyDate,
              labels: [survey.label],
              business_id: id,
              business_name: data.business_name,
              author_name: surveyManager || '미지정',
              event_type: 'survey',
              survey_type: survey.type
            }, { onConflict: 'id' });

          if (upsertError) {
            console.error(`⚠️ [SUPABASE] ${survey.label} 일정 동기화 실패:`, upsertError);
          } else {
            console.log(`✅ [SUPABASE] ${survey.label} 일정 동기화 완료:`, eventId);
          }
        } else {
          // 실사일이 삭제되면 일정도 삭제
          const { error: deleteError } = await supabaseAdmin
            .from('survey_events')
            .delete()
            .eq('id', eventId);

          if (deleteError) {
            console.error(`⚠️ [SUPABASE] ${survey.label} 일정 삭제 실패:`, deleteError);
          } else {
            console.log(`✅ [SUPABASE] ${survey.label} 일정 삭제 완료:`, eventId);
          }
        }
      } catch (syncError) {
        console.error(`⚠️ [SUPABASE] ${survey.label} 동기화 중 오류:`, syncError);
        // 동기화 실패해도 사업장 업데이트는 성공으로 간주
      }
    }
  }

  return data as BusinessInfo;
}

export async function deleteBusiness(id: string, hardDelete: boolean = false) {
  if (hardDelete) {
    const { error } = await supabaseAdmin
      .from('business_info')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ [SUPABASE] 사업장 영구 삭제 실패:', error);
      throw new Error(`사업장 삭제 실패: ${error.message}`);
    }
  } else {
    const { error } = await supabaseAdmin
      .from('business_info')
      .update({ is_deleted: true, is_active: false })
      .eq('id', id);

    if (error) {
      console.error('❌ [SUPABASE] 사업장 소프트 삭제 실패:', error);
      throw new Error(`사업장 삭제 실패: ${error.message}`);
    }
  }

  return true;
}

// =====================================================
// 대기배출허가 정보 관리
// =====================================================

export async function getAirPermitsByBusinessId(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from('air_permit_info')
    .select(`
      *,
      business:business_info!inner(
        business_name,
        local_government
      )
    `)
    .eq('business_id', businessId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ [SUPABASE] 대기배출허가 조회 실패:', error);
    throw new Error(`대기배출허가 조회 실패: ${error.message}`);
  }

  return data as AirPermitInfo[];
}

export async function createAirPermit(permitData: Omit<AirPermitInfo, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabaseAdmin
    .from('air_permit_info')
    .insert([permitData])
    .select()
    .single();

  if (error) {
    console.error('❌ [SUPABASE] 대기배출허가 생성 실패:', error);
    throw new Error(`대기배출허가 생성 실패: ${error.message}`);
  }

  return data as AirPermitInfo;
}

// =====================================================
// 배출구 및 시설 관리
// =====================================================

export async function getOutletsByPermitId(permitId: string) {
  const { data, error } = await supabaseAdmin
    .from('discharge_outlets')
    .select(`
      *,
      discharge_facilities(*),
      prevention_facilities(*)
    `)
    .eq('air_permit_id', permitId)
    .order('outlet_number');

  if (error) {
    console.error('❌ [SUPABASE] 배출구 조회 실패:', error);
    throw new Error(`배출구 조회 실패: ${error.message}`);
  }

  return data;
}

// =====================================================
// 메모 관리
// =====================================================

export async function getBusinessMemos(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from('business_memos')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ [SUPABASE] 메모 조회 실패:', error);
    throw new Error(`메모 조회 실패: ${error.message}`);
  }

  return data as BusinessMemo[];
}

export async function createBusinessMemo(memoData: CreateBusinessMemoInput) {
  // ✅ 병렬 실행: 메모 생성과 사업장 updated_at 업데이트를 동시에 실행
  const [memoResult, updateResult] = await Promise.all([
    supabaseAdmin
      .from('business_memos')
      .insert([memoData])
      .select('*')
      .single(),
    supabaseAdmin
      .from('business_info')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', memoData.business_id)
  ]);

  const { data, error } = memoResult;
  const { error: updateError } = updateResult;

  if (error) {
    console.error('❌ [SUPABASE] 메모 생성 실패:', error);
    throw new Error(`메모 생성 실패: ${error.message}`);
  }

  if (updateError) {
    console.warn('⚠️ [SUPABASE] 사업장 updated_at 업데이트 실패:', updateError);
    // 메모 생성은 성공했으므로 에러 throw 하지 않음
  }

  return data as BusinessMemo;
}

export async function updateBusinessMemo(id: string, updates: UpdateBusinessMemoInput) {
  // 1단계: 메모 업데이트 (business_id 조회 필요)
  const { data, error } = await supabaseAdmin
    .from('business_memos')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('❌ [SUPABASE] 메모 업데이트 실패:', error);
    throw new Error(`메모 업데이트 실패: ${error.message}`);
  }

  // ✅ 2단계: 메모 수정 시 사업장 updated_at 업데이트 (병렬 실행 불가 - business_id 필요)
  if (data?.business_id) {
    // 메모 업데이트 성공 후 사업장 업데이트 (순차 실행 필요)
    const { error: updateError } = await supabaseAdmin
      .from('business_info')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', data.business_id);

    if (updateError) {
      console.warn('⚠️ [SUPABASE] 사업장 updated_at 업데이트 실패:', updateError);
      // 메모 수정은 성공했으므로 에러 throw 하지 않음
    }
  }

  return data as BusinessMemo;
}

export async function deleteBusinessMemo(id: string) {
  // ✅ 최적화: DELETE와 SELECT를 결합하여 쿼리 1개 절약 (3개 → 2개)
  // ⚠️ single() 대신 maybeSingle() 사용: 이미 삭제된 경우 0 rows 허용
  const { data: memo, error } = await supabaseAdmin
    .from('business_memos')
    .delete()
    .eq('id', id)
    .select('business_id')
    .maybeSingle();

  if (error) {
    console.error('❌ [SUPABASE] 메모 삭제 실패:', error);
    throw new Error(`메모 삭제 실패: ${error.message}`);
  }

  // ✅ 메모 삭제 시 사업장 updated_at 업데이트 (리스트 상단 표시)
  if (memo?.business_id) {
    const { error: updateError } = await supabaseAdmin
      .from('business_info')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', memo.business_id);

    if (updateError) {
      console.warn('⚠️ [SUPABASE] 사업장 updated_at 업데이트 실패:', updateError);
      // 메모 삭제는 성공했으므로 에러 throw 하지 않음
    }
  }

  return true;
}

// =====================================================
// 검색 및 통계
// =====================================================

export async function searchBusinesses(query: string, limit: number = 20) {
  const { data, error } = await supabaseAdmin
    .from('business_info')
    .select('id, business_name, local_government, address, manager_name, manager_contact, business_management_code, delivery_date, installation_date, manufacturer')
    .or(`business_name.ilike.%${query}%,address.ilike.%${query}%,manager_name.ilike.%${query}%`)
    .eq('is_deleted', false)
    .eq('is_active', true)
    .limit(limit)
    .order('business_name');

  if (error) {
    console.error('❌ [SUPABASE] 사업장 검색 실패:', error);
    throw new Error(`사업장 검색 실패: ${error.message}`);
  }

  return data;
}

export async function getBusinessStats() {
  const { data, error } = await supabaseAdmin
    .from('business_stats')
    .select('*')
    .single();

  if (error) {
    console.error('❌ [SUPABASE] 통계 조회 실패:', error);
    throw new Error(`통계 조회 실패: ${error.message}`);
  }

  return data;
}

// =====================================================
// 유틸리티 함수
// =====================================================

export async function getBusinessWithPermits(businessName: string) {
  const { data, error } = await supabaseAdmin
    .rpc('get_business_with_permits', {
      business_name_param: businessName
    });

  if (error) {
    console.error('❌ [SUPABASE] 사업장+허가 조회 실패:', error);
    throw new Error(`사업장 정보 조회 실패: ${error.message}`);
  }

  return data;
}

// 레거시 호환성을 위한 간단한 사업장명 목록 조회
export async function getBusinessNamesList() {
  const { data, error } = await supabaseAdmin
    .from('business_info')
    .select('business_name')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .order('business_name');

  if (error) {
    console.error('❌ [SUPABASE] 사업장명 목록 조회 실패:', error);
    throw new Error(`사업장명 목록 조회 실패: ${error.message}`);
  }

  return data.map(item => item.business_name);
}