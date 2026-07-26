// app/api/air-permits/route.ts - 대기필증 정보 API (기존 스키마 호환)
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// GET /api/air-permits - 대기필증 목록 조회
export const GET = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  console.log('🔍 [AIR-PERMITS] 대기필증 목록 조회 시작');

  const url = new URL(request.url);
  const businessId = url.searchParams.get('business_id');
  const search = url.searchParams.get('search');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const includeBusinessInfo = url.searchParams.get('include_business') === 'true';
  const includeOutlets = url.searchParams.get('include_outlets') === 'true';

  try {
    const adminClient = getSupabaseAdminClient();

    let query = adminClient
      .from('air_permit_info')
      .select(`
        id,
        business_id,
        business_type,
        annual_emission_amount,
        annual_pollutant_emission,
        first_report_date,
        operation_start_date,
        additional_info,
        is_active,
        created_at,
        updated_at
        ${includeBusinessInfo ? `,
        business_info!inner(
          id,
          business_name,
          local_government,
          address,
          manager_name,
          manager_contact
        )` : ''}
        ${includeOutlets ? `,
        discharge_outlets(
          id,
          outlet_number,
          outlet_name,
          additional_info
        )` : ''}
      `)
      .eq('is_deleted', false);

    // 특정 사업장의 대기필증만 조회
    if (businessId) {
      query = query.eq('business_id', businessId);
    }

    // 검색 조건 (business_type 검색)
    if (search) {
      query = query.ilike('business_type', `%${search}%`);
    }

    // 페이징
    if (limit) {
      query = query.limit(limit);
    }
    if (offset) {
      query = query.range(offset, offset + limit - 1);
    }

    query = query.order('created_at', { ascending: false });

    const { data: airPermits, error } = await query;

    if (error) {
      console.error('❌ [AIR-PERMITS] 조회 실패:', error);
      return createErrorResponse(`대기필증 조회 실패: ${error.message}`, 500);
    }

    console.log(`✅ [AIR-PERMITS] ${airPermits.length}개 대기필증 조회 완료`);

    return createSuccessResponse({
      air_permits: airPermits,
      count: airPermits.length,
      metadata: {
        businessId,
        search,
        limit,
        offset,
        includeBusinessInfo,
        includeOutlets,
        dataSource: 'supabase'
      }
    });

  } catch (error) {
    console.error('❌ [AIR-PERMITS] 서버 오류:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '대기필증 조회에 실패했습니다',
      500
    );
  }
}, { logLevel: 'info' });

// POST /api/air-permits - 새 대기필증 생성
export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  console.log('📝 [AIR-PERMITS] 대기필증 생성 요청');

  try {
    const permitData = await request.json();
    console.log('📝 [AIR-PERMITS] 대기필증 생성:', {
      businessId: permitData.business_id,
      businessType: permitData.business_type
    });

    // 필수 필드 검증
    if (!permitData.business_id) {
      return createErrorResponse('사업장 ID는 필수입니다', 400);
    }

    const adminClient = getSupabaseAdminClient();

    const { data: newPermit, error } = await adminClient
      .from('air_permit_info')
      .insert([{
        business_id: permitData.business_id,
        business_type: permitData.business_type || '일반',
        annual_emission_amount: permitData.annual_emission_amount || null,
        annual_pollutant_emission: permitData.annual_pollutant_emission || null,
        first_report_date: permitData.first_report_date || null,
        operation_start_date: permitData.operation_start_date || null,
        additional_info: permitData.additional_info || {},
        is_active: true,
        is_deleted: false
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ [AIR-PERMITS] 생성 실패:', error);
      return createErrorResponse(`대기필증 생성 실패: ${error.message}`, 500);
    }

    console.log('✅ [AIR-PERMITS] 대기필증 생성 완료:', newPermit.id);

    return createSuccessResponse({
      air_permit: newPermit,
      message: '대기필증이 성공적으로 생성되었습니다'
    });

  } catch (error) {
    console.error('❌ [AIR-PERMITS] 생성 오류:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '대기필증 생성에 실패했습니다',
      500
    );
  }
}, { logLevel: 'info' });