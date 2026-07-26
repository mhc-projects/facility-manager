// app/api/air-permits/outlets/[outletId]/route.ts - 배출구 게이트웨이 정보 관리 API
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 배출구 정보 조회 (GET)
export async function GET(
  request: NextRequest,
  { params }: { params: { outletId: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { outletId } = params;

    if (!outletId) {
      return NextResponse.json({
        success: false,
        message: '배출구 ID가 필요합니다.'
      }, { status: 400 });
    }

    console.log(`📊 [OUTLET-GATEWAY] 배출구 정보 조회: ${outletId}`);

    const { data, error } = await supabaseAdmin
      .from('discharge_outlets')
      .select('*')
      .eq('id', outletId)
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ [OUTLET-GATEWAY] 배출구 정보 조회 완료`);

    return NextResponse.json({
      success: true,
      data: {
        outlet: data
      }
    });

  } catch (error) {
    console.error('❌ [OUTLET-GATEWAY] 배출구 정보 조회 실패:', error);
    return NextResponse.json({
      success: false,
      message: '배출구 정보 조회 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

// 배출구 게이트웨이 정보 업데이트 (PUT)
export async function PUT(
  request: NextRequest,
  { params }: { params: { outletId: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { outletId } = params;
    const body = await request.json();
    const { gateway_number, vpn_type } = body;

    if (!outletId) {
      return NextResponse.json({
        success: false,
        message: '배출구 ID가 필요합니다.'
      }, { status: 400 });
    }

    // ✅ undefined 필드는 업데이트에서 제외 (부분 업데이트)
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (gateway_number !== undefined) {
      // 게이트웨이 번호 형식 검증
      if (gateway_number && !/^gateway([1-9]|[1-4][0-9]|50)$/.test(gateway_number)) {
        return NextResponse.json({
          success: false,
          message: '게이트웨이 번호 형식이 올바르지 않습니다. (gateway1 ~ gateway50)'
        }, { status: 400 });
      }
      updateData.gateway_number = gateway_number || null;
    }

    if (vpn_type !== undefined) {
      // VPN 타입 검증
      if (vpn_type && !['유선', '무선'].includes(vpn_type)) {
        return NextResponse.json({
          success: false,
          message: 'VPN 연결 방식은 유선 또는 무선이어야 합니다.'
        }, { status: 400 });
      }
      updateData.vpn_type = vpn_type || null;
    }

    console.log(`📊 [OUTLET-GATEWAY] 배출구 게이트웨이 정보 업데이트: ${outletId}`, updateData);

    // 배출구 게이트웨이 정보 업데이트
    const { data, error } = await supabaseAdmin
      .from('discharge_outlets')
      .update(updateData)
      .eq('id', outletId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ [OUTLET-GATEWAY] 게이트웨이 정보 업데이트 완료`);

    return NextResponse.json({
      success: true,
      message: '배출구 게이트웨이 정보가 성공적으로 업데이트되었습니다.',
      data: {
        outlet: data
      }
    });

  } catch (error) {
    console.error('❌ [OUTLET-GATEWAY] 게이트웨이 정보 업데이트 실패:', error);
    return NextResponse.json({
      success: false,
      message: '게이트웨이 정보 업데이트 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

// 배출구 게이트웨이 정보 삭제 (DELETE)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { outletId: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { outletId } = params;

    if (!outletId) {
      return NextResponse.json({
        success: false,
        message: '배출구 ID가 필요합니다.'
      }, { status: 400 });
    }

    console.log(`📊 [OUTLET-GATEWAY] 배출구 게이트웨이 정보 삭제: ${outletId}`);

    // 게이트웨이 정보만 null로 설정 (배출구 자체는 삭제하지 않음)
    const { data, error } = await supabaseAdmin
      .from('discharge_outlets')
      .update({
        gateway_number: null,
        vpn_type: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', outletId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ [OUTLET-GATEWAY] 게이트웨이 정보 삭제 완료`);

    return NextResponse.json({
      success: true,
      message: '배출구 게이트웨이 정보가 성공적으로 삭제되었습니다.',
      data: {
        outlet: data
      }
    });

  } catch (error) {
    console.error('❌ [OUTLET-GATEWAY] 게이트웨이 정보 삭제 실패:', error);
    return NextResponse.json({
      success: false,
      message: '게이트웨이 정보 삭제 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}
