// app/api/equipment-field-checks/route.ts
// 측정기기 현장 확인 데이터 관리 API

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 현장 확인 데이터 조회 (GET)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!businessId) {
      return NextResponse.json({
        success: false,
        message: 'businessId가 필요합니다.'
      }, { status: 400 });
    }

    console.log(`🔍 [FIELD-CHECK] 현장 확인 데이터 조회: ${businessId}`);

    // 현장 확인 데이터 조회 (최신순)
    const { data: checks, error, count } = await supabaseAdmin
      .from('equipment_field_checks')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('checked_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    // 가장 최근 체크 데이터
    const latestCheck = checks && checks.length > 0 ? checks[0] : null;

    console.log(`✅ [FIELD-CHECK] 조회 완료: ${checks?.length || 0}개`);

    return NextResponse.json({
      success: true,
      data: {
        checks: checks || [],
        total_count: count || 0,
        latest_check: latestCheck
      }
    });

  } catch (error) {
    console.error('❌ [FIELD-CHECK] 조회 실패:', error);
    return NextResponse.json({
      success: false,
      message: '현장 확인 데이터 조회 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

// 현장 확인 데이터 저장 (POST)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      businessId,
      discharge_flowmeter,
      supply_flowmeter,
      checked_by,
      check_location,
      notes
    } = body;

    // 필수 필드 검증
    if (!businessId) {
      return NextResponse.json({
        success: false,
        message: 'businessId가 필요합니다.'
      }, { status: 400 });
    }

    if (discharge_flowmeter === undefined || supply_flowmeter === undefined) {
      return NextResponse.json({
        success: false,
        message: '측정기기 수량이 필요합니다.'
      }, { status: 400 });
    }

    console.log(`📝 [FIELD-CHECK] 현장 확인 데이터 저장:`, {
      businessId,
      discharge_flowmeter,
      supply_flowmeter,
      checked_by
    });

    // 현장 확인 데이터 저장
    const { data, error } = await supabaseAdmin
      .from('equipment_field_checks')
      .insert({
        business_id: businessId,
        discharge_flowmeter: discharge_flowmeter || 0,
        supply_flowmeter: supply_flowmeter || 0,
        checked_by: checked_by || null,
        check_location: check_location || null,
        notes: notes || null,
        is_synced: false
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ [FIELD-CHECK] 저장 완료: ${data.id}`);

    return NextResponse.json({
      success: true,
      message: '현장 확인 데이터가 저장되었습니다.',
      data: {
        check: data
      }
    });

  } catch (error) {
    console.error('❌ [FIELD-CHECK] 저장 실패:', error);
    return NextResponse.json({
      success: false,
      message: '현장 확인 데이터 저장 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}
