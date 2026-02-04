// app/api/equipment-field-checks/sync/[checkId]/route.ts
// 현장 확인 데이터를 사업장 정보에 반영하는 API

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 사업장 정보에 반영 (PUT)
export async function PUT(
  request: NextRequest,
  { params }: { params: { checkId: string } }
) {
  try {
    const { checkId } = params;
    const body = await request.json();
    const { synced_by } = body;

    if (!checkId) {
      return NextResponse.json({
        success: false,
        message: 'checkId가 필요합니다.'
      }, { status: 400 });
    }

    console.log(`🔄 [FIELD-CHECK-SYNC] 사업장 정보 반영 시작: ${checkId}`);

    // 현장 확인 데이터 조회
    const { data: check, error: checkError } = await supabaseAdmin
      .from('equipment_field_checks')
      .select('*')
      .eq('id', checkId)
      .single();

    if (checkError || !check) {
      return NextResponse.json({
        success: false,
        message: '현장 확인 데이터를 찾을 수 없습니다.'
      }, { status: 404 });
    }

    // 이미 반영된 경우 확인
    if (check.is_synced) {
      return NextResponse.json({
        success: false,
        message: '이미 반영된 데이터입니다.'
      }, { status: 400 });
    }

    // 트랜잭션: businesses 테이블 업데이트 + is_synced 상태 업데이트

    // 1. businesses 테이블 업데이트
    const { data: updatedBusiness, error: businessError } = await supabaseAdmin
      .from('businesses')
      .update({
        discharge_flowmeter: check.discharge_flowmeter,
        supply_flowmeter: check.supply_flowmeter,
        updated_at: new Date().toISOString()
      })
      .eq('id', check.business_id)
      .select()
      .single();

    if (businessError) {
      throw new Error(`사업장 정보 업데이트 실패: ${businessError.message}`);
    }

    // 2. is_synced 상태 업데이트
    const { data: updatedCheck, error: syncError } = await supabaseAdmin
      .from('equipment_field_checks')
      .update({
        is_synced: true,
        synced_at: new Date().toISOString(),
        synced_by: synced_by || 'Unknown'
      })
      .eq('id', checkId)
      .select()
      .single();

    if (syncError) {
      // 롤백은 안 되지만 에러 로깅
      console.error('⚠️ [FIELD-CHECK-SYNC] 반영 상태 업데이트 실패:', syncError);
    }

    console.log(`✅ [FIELD-CHECK-SYNC] 반영 완료:`, {
      checkId,
      businessId: check.business_id,
      discharge_flowmeter: check.discharge_flowmeter,
      supply_flowmeter: check.supply_flowmeter
    });

    return NextResponse.json({
      success: true,
      message: '현장 확인 데이터가 사업장 정보에 반영되었습니다.',
      data: {
        check: updatedCheck || check,
        updated_business: updatedBusiness
      }
    });

  } catch (error) {
    console.error('❌ [FIELD-CHECK-SYNC] 반영 실패:', error);
    return NextResponse.json({
      success: false,
      message: '사업장 정보 반영 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}
