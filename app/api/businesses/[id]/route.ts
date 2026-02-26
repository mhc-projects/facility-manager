// app/api/businesses/[id]/route.ts - 개별 사업장 관리 API
import { NextRequest, NextResponse } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import {
  getBusinessById,
  updateBusiness,
  deleteBusiness,
  getAirPermitsByBusinessId,
  getBusinessMemos
} from '@/lib/supabase-business';
import { verifyToken } from '@/utils/auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// GET /api/businesses/[id] - 개별 사업장 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 인증 확인
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];

    if (!token) {
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const tokenPayload = await verifyToken(token);
    if (!tokenPayload) {
      return createErrorResponse('유효하지 않은 토큰입니다', 401);
    }

    const { id: businessId } = params;
    const url = new URL(request.url);
    const includeAirPermits = url.searchParams.get('include_air_permits') === 'true';
    const includeMemos = url.searchParams.get('include_memos') === 'true';

    // 사업장 기본 정보 조회
    const businessResult = await getBusinessById(businessId);
    if (!(businessResult as any).success) {
      return createErrorResponse((businessResult as any).error || '사업장 조회에 실패했습니다', 404);
    }

    const responseData: any = {
      business: (businessResult as any).data
    };

    // 대기필증 정보 포함
    if (includeAirPermits) {
      const airPermitsResult = await getAirPermitsByBusinessId(businessId);
      if ((airPermitsResult as any).success) {
        responseData.air_permits = (airPermitsResult as any).data;
      }
    }

    // 메모 정보 포함
    if (includeMemos) {
      const memosResult = await getBusinessMemos(businessId);
      if ((memosResult as any).success) {
        responseData.memos = (memosResult as any).data;
      }
    }

    return createSuccessResponse(responseData);

  } catch (error) {
    console.error('❌ [BUSINESS-GET] 조회 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '사업장 조회에 실패했습니다',
      500
    );
  }
}

// PUT /api/businesses/[id] - 사업장 정보 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 인증 확인
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];

    if (!token) {
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const tokenPayload = await verifyToken(token);
    if (!tokenPayload) {
      return createErrorResponse('유효하지 않은 토큰입니다', 401);
    }

    const { id: businessId } = params;
    const updateData = await request.json();

    const result = await updateBusiness(businessId, updateData);

    if (!(result as any).success) {
      return createErrorResponse((result as any).error || '사업장 업데이트에 실패했습니다', 500);
    }

    return createSuccessResponse({
      business: (result as any).data,
      message: '사업장 정보가 성공적으로 업데이트되었습니다'
    });

  } catch (error) {
    console.error('❌ [BUSINESS-PUT] 업데이트 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '사업장 업데이트에 실패했습니다',
      500
    );
  }
}

// DELETE /api/businesses/[id] - 사업장 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 인증 확인
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];

    if (!token) {
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const tokenPayload = await verifyToken(token);
    if (!tokenPayload) {
      return createErrorResponse('유효하지 않은 토큰입니다', 401);
    }

    const { id: businessId } = params;

    // 사진이 등록된 사업장은 삭제 불가
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';
    if (!force) {
      const { supabaseAdmin } = await import('@/lib/supabase');
      const { count } = await supabaseAdmin
        .from('uploaded_files')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId);

      if (count && count > 0) {
        return createErrorResponse(
          `이 사업장에 등록된 사진 ${count}장이 있어 삭제할 수 없습니다. 사진을 먼저 삭제하거나 ?force=true 를 사용하세요.`,
          409
        );
      }
    }

    const result = await deleteBusiness(businessId);

    if (!(result as any).success) {
      return createErrorResponse((result as any).error || '사업장 삭제에 실패했습니다', 500);
    }

    return createSuccessResponse({
      message: '사업장이 성공적으로 삭제되었습니다'
    });

  } catch (error) {
    console.error('❌ [BUSINESS-DELETE] 삭제 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '사업장 삭제에 실패했습니다',
      500
    );
  }
}