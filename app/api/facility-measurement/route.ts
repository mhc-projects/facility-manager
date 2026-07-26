// app/api/facility-measurement/route.ts - 시설 측정기기 정보 관리 API
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { memoryCache } from '@/lib/cache';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/facility-measurement?id={facility_id}&type={discharge|prevention}
 * 시설 측정기기 정보 조회
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const facilityId = searchParams.get('id');
    const facilityType = searchParams.get('type'); // 'discharge' or 'prevention'

    if (!facilityId || !facilityType) {
      return NextResponse.json(
        { success: false, error: '시설 ID와 타입이 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`[FACILITY-MEASUREMENT] GET - Facility ID: ${facilityId}, Type: ${facilityType}`);

    const tableName = facilityType === 'discharge' ? 'discharge_facilities' : 'prevention_facilities';

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('id', facilityId)
      .single();

    if (error) {
      console.error('[FACILITY-MEASUREMENT] Supabase 조회 오류:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '시설을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log('[FACILITY-MEASUREMENT] 조회 성공:', {
      id: data.id,
      facility_name: data.facility_name,
      discharge_ct: data.discharge_ct,
      exemption_reason: data.exemption_reason,
      ph: data.ph,
      pressure: data.pressure,
      temperature: data.temperature,
      pump: data.pump,
      fan: data.fan,
      remarks: data.remarks
    });

    return NextResponse.json({
      success: true,
      facility: {
        id: data.id,
        facility_name: data.facility_name,
        capacity: data.capacity,
        quantity: data.quantity,
        facility_number: data.facility_number,
        // 배출시설 필드
        dischargeCT: data.discharge_ct,
        exemptionReason: data.exemption_reason,
        // 방지시설 필드
        ph: data.ph,
        pressure: data.pressure,
        temperature: data.temperature,
        pump: data.pump,
        fan: data.fan,
        // 공통 필드
        remarks: data.remarks,
        last_updated_at: data.last_updated_at,
        last_updated_by: data.last_updated_by
      }
    });

  } catch (error) {
    console.error('[FACILITY-MEASUREMENT] GET 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/facility-measurement
 * 시설 측정기기 정보 업데이트
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const {
      id,
      type,
      // 배출시설 필드
      dischargeCT,
      exemptionReason,
      // 방지시설 필드
      ph,
      pressure,
      temperature,
      pump,
      fan,
      // 공통 필드
      remarks,
      last_updated_by
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '시설 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        { success: false, error: '시설 타입(discharge/prevention)이 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`[FACILITY-MEASUREMENT] PUT - ID: ${id}, Type: ${type}`, {
      dischargeCT,
      exemptionReason,
      ph,
      pressure,
      temperature,
      pump,
      fan,
      remarks
    });

    const tableName = type === 'discharge' ? 'discharge_facilities' : 'prevention_facilities';

    // 업데이트할 데이터 준비
    const updateData: any = {
      last_updated_at: new Date().toISOString(),
      last_updated_by: last_updated_by || '관리자'
    };

    // 배출시설 필드
    if (type === 'discharge') {
      if (dischargeCT !== undefined) {
        updateData.discharge_ct = dischargeCT;
      }
      if (exemptionReason !== undefined && exemptionReason !== 'none') {
        updateData.exemption_reason = exemptionReason;
      } else {
        updateData.exemption_reason = null;
      }
    }

    // 방지시설 필드
    if (type === 'prevention') {
      // 빈 문자열('')은 '0'으로 처리, undefined/null만 제외
      if (ph !== undefined && ph !== null) {
        updateData.ph = ph === '' ? '0' : ph;
      }
      if (pressure !== undefined && pressure !== null) {
        updateData.pressure = pressure === '' ? '0' : pressure;
      }
      if (temperature !== undefined && temperature !== null) {
        updateData.temperature = temperature === '' ? '0' : temperature;
      }
      if (pump !== undefined && pump !== null) {
        updateData.pump = pump === '' ? '0' : pump;
      }
      if (fan !== undefined && fan !== null) {
        updateData.fan = fan === '' ? '0' : fan;
      }
    }

    // 공통 필드
    if (remarks !== undefined) {
      updateData.remarks = remarks || null;
    }

    // ID로 직접 업데이트
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[FACILITY-MEASUREMENT] Supabase 업데이트 오류:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '시설을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log('[FACILITY-MEASUREMENT] 업데이트 성공:', {
      id: data.id,
      tableName: tableName,
      business_name: data.business_name,
      outlet_number: data.outlet_number,
      facility_number: data.facility_number,
      discharge_ct: data.discharge_ct,
      exemption_reason: data.exemption_reason,
      ph: data.ph,
      pressure: data.pressure,
      temperature: data.temperature,
      pump: data.pump,
      fan: data.fan,
      remarks: data.remarks,
      last_updated_at: data.last_updated_at,
      last_updated_by: data.last_updated_by
    });

    // 캐시 무효화: 시설이 업데이트되면 해당 사업장의 캐시를 클리어해야 함
    // 하지만 여기서는 business_name을 알 수 없으므로, 클라이언트에서 refresh=true로 재조회하도록 함
    console.log(`✅ [FACILITY-MEASUREMENT] 시설 업데이트 완료 (ID: ${id}). 클라이언트에서 캐시 갱신 필요`)

    return NextResponse.json({
      success: true,
      message: '시설 정보가 성공적으로 업데이트되었습니다.',
      facility: {
        id: data.id,
        // camelCase로 변환하여 반환
        dischargeCT: data.discharge_ct,
        exemptionReason: data.exemption_reason,
        ph: data.ph,
        pressure: data.pressure,
        temperature: data.temperature,
        pump: data.pump,
        fan: data.fan,
        remarks: data.remarks,
        last_updated_at: data.last_updated_at,
        last_updated_by: data.last_updated_by
      }
    });

  } catch (error) {
    console.error('[FACILITY-MEASUREMENT] PUT 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
