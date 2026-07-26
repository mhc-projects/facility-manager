import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { toKSTDateString } from '@/utils/date-utils';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// GET /api/air-permits/[id] - 개별 대기필증 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { id } = params;
    const url = new URL(request.url);
    const includeBusinessInfo = url.searchParams.get('include_business') === 'true';
    const includeOutlets = url.searchParams.get('include_outlets') === 'true';

    try {
      console.log(`🔍 [AIR-PERMIT-DETAIL] 대기필증 상세 조회: ${id}`);

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
            business_management_code,
            local_government,
            address,
            manager_name,
            manager_contact,
            business_contact
          )` : ''}
        `)
        .eq('id', id)
        .eq('is_deleted', false)
        .single();

      const { data: airPermit, error } = await query;

      if (error) {
        console.error('❌ [AIR-PERMIT-DETAIL] 조회 실패:', error);
        return createErrorResponse(`대기필증 조회 실패: ${error.message}`, 404);
      }

      // ✅ 날짜 필드 정규화 (timestamptz → date string)
      if (airPermit.first_report_date) {
        const originalDate = airPermit.first_report_date
        airPermit.first_report_date = toKSTDateString(airPermit.first_report_date)
        console.log(`📅 first_report_date 정규화: ${originalDate} → ${airPermit.first_report_date}`)
      }
      if (airPermit.operation_start_date) {
        const originalDate = airPermit.operation_start_date
        airPermit.operation_start_date = toKSTDateString(airPermit.operation_start_date)
        console.log(`📅 operation_start_date 정규화: ${originalDate} → ${airPermit.operation_start_date}`)
      }

      const response: any = { air_permit: airPermit };

      // 배출구 정보 포함
      if (includeOutlets) {
        const { data: outlets, error: outletsError } = await adminClient
          .from('discharge_outlets')
          .select(`
            id,
            outlet_number,
            outlet_name,
            additional_info,
            created_at,
            updated_at
          `)
          .eq('air_permit_id', id)
          .order('outlet_number');

        if (!outletsError) {
          response.outlets = outlets;
          console.log(`📋 [AIR-PERMIT-DETAIL] 배출구 ${outlets.length}개 포함`);
        }
      }

      console.log(`✅ [AIR-PERMIT-DETAIL] 조회 완료: ${(airPermit as any).business_type}`);

      return createSuccessResponse(response);

    } catch (error) {
      console.error('❌ [AIR-PERMIT-DETAIL] 조회 실패:', error);
      return createErrorResponse(
        error instanceof Error ? error.message : '대기필증 조회에 실패했습니다',
        500
      );
    }
  } catch (error) {
    console.error('❌ [AIR-PERMIT-DETAIL] 조회 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '대기필증 조회에 실패했습니다',
      500
    );
  }
}

// PUT /api/air-permits/[id] - 대기필증 정보 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { id } = params;
    const updateData = await request.json();

    console.log(`📝 [AIR-PERMIT-UPDATE] 대기필증 업데이트: ${id}`);
    console.log('📅 [AIR-PERMIT-UPDATE] 날짜 필드 입력값:', {
      first_report_date: updateData.first_report_date,
      operation_start_date: updateData.operation_start_date
    });

    // ✅ 날짜 필드 타임존 보정 (date string → timestamptz with KST)
    // PostgreSQL이 timestamptz 타입으로 저장하므로 KST 타임존 명시
    let first_report_date = updateData.first_report_date
    let operation_start_date = updateData.operation_start_date

    if (first_report_date && !first_report_date.includes('T')) {
      // "2022-02-04" → "2022-02-04T00:00:00+09:00"
      first_report_date = `${first_report_date}T00:00:00+09:00`
      console.log(`📅 first_report_date KST 변환: ${updateData.first_report_date} → ${first_report_date}`)
    }

    if (operation_start_date && !operation_start_date.includes('T')) {
      // "2022-02-04" → "2022-02-04T00:00:00+09:00"
      operation_start_date = `${operation_start_date}T00:00:00+09:00`
      console.log(`📅 operation_start_date KST 변환: ${updateData.operation_start_date} → ${operation_start_date}`)
    }

    const adminClient = getSupabaseAdminClient();

    const { data: updatedPermit, error } = await adminClient
      .from('air_permit_info')
      .update({
        business_type: updateData.business_type,
        annual_emission_amount: updateData.annual_emission_amount,
        annual_pollutant_emission: updateData.annual_pollutant_emission,
        first_report_date: first_report_date,  // KST 타임존 포함
        operation_start_date: operation_start_date,  // KST 타임존 포함
        additional_info: updateData.additional_info,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ [AIR-PERMIT-UPDATE] 업데이트 실패:', error);
      return createErrorResponse(`대기필증 업데이트 실패: ${error.message}`, 500);
    }

    // ✅ 응답 데이터도 정규화 (timestamptz → date string)
    if (updatedPermit) {
      if (updatedPermit.first_report_date) {
        updatedPermit.first_report_date = toKSTDateString(updatedPermit.first_report_date)
      }
      if (updatedPermit.operation_start_date) {
        updatedPermit.operation_start_date = toKSTDateString(updatedPermit.operation_start_date)
      }
    }

    console.log('✅ [AIR-PERMIT-UPDATE] 업데이트 완료:', {
      business_type: (updatedPermit as any).business_type,
      first_report_date: (updatedPermit as any).first_report_date,
      operation_start_date: (updatedPermit as any).operation_start_date
    });

    return createSuccessResponse({
      air_permit: updatedPermit,
      message: '대기필증 정보가 성공적으로 업데이트되었습니다'
    });

  } catch (error) {
    console.error('❌ [AIR-PERMIT-UPDATE] 업데이트 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '대기필증 업데이트에 실패했습니다',
      500
    );
  }
}

// DELETE /api/air-permits/[id] - 대기필증 삭제 (소프트 삭제)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { id } = params;
    const url = new URL(request.url);
    const hardDelete = url.searchParams.get('hard') === 'true';

    console.log(`🗑️ [AIR-PERMIT-DELETE] 대기필증 삭제: ${id} (hard: ${hardDelete})`);

    const adminClient = getSupabaseAdminClient();

    if (hardDelete) {
      // 하드 삭제
      const { error } = await adminClient
        .from('air_permit_info')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ [AIR-PERMIT-DELETE] 영구 삭제 실패:', error);
        return createErrorResponse(`대기필증 삭제 실패: ${error.message}`, 500);
      }
    } else {
      // 소프트 삭제
      const { error } = await adminClient
        .from('air_permit_info')
        .update({ is_deleted: true, is_active: false })
        .eq('id', id);

      if (error) {
        console.error('❌ [AIR-PERMIT-DELETE] 소프트 삭제 실패:', error);
        return createErrorResponse(`대기필증 삭제 실패: ${error.message}`, 500);
      }
    }

    console.log('✅ [AIR-PERMIT-DELETE] 삭제 완료');

    return createSuccessResponse({
      message: hardDelete ? '대기필증이 영구 삭제되었습니다' : '대기필증이 삭제되었습니다'
    });

  } catch (error) {
    console.error('❌ [AIR-PERMIT-DELETE] 삭제 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '대기필증 삭제에 실패했습니다',
      500
    );
  }
}