// app/api/dpf/vehicles/[vin]/route.ts
// 차량 상세 + 전체 이력 조회
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const vin = decodeURIComponent(params.vin);

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from('dpf_vehicles')
      .select('*')
      .eq('vin', vin)
      .eq('is_deleted', false)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json({ error: '차량을 찾을 수 없습니다' }, { status: 404 });
    }

    const vehicleId = vehicle.id;

    const [instData, inspData, subsidyData, callData] = await Promise.all([
      supabaseAdmin
        .from('dpf_device_installations')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('installation_date', { ascending: false }),

      supabaseAdmin
        .from('dpf_performance_inspections')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('inspection_date', { ascending: false }),

      supabaseAdmin
        .from('dpf_subsidy_applications')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('reception_date', { ascending: false }),

      supabaseAdmin
        .from('dpf_call_monitoring')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('monitoring_date', { ascending: false }),
    ]);

    return NextResponse.json({
      vehicle,
      installations: instData.data ?? [],
      inspections: inspData.data ?? [],
      subsidies: subsidyData.data ?? [],
      callMonitoring: callData.data ?? [],
    });
  } catch (err) {
    console.error('[DPF Vehicle Detail] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
