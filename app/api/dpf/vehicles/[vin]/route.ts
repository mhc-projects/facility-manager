// app/api/dpf/vehicles/[vin]/route.ts
// 차량 상세 + 전체 이력 조회
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(
  request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const vin = decodeURIComponent(params.vin);
    const body = await request.json();
    const {
      plate_number, vehicle_name, owner_name, owner_contact,
      owner_address, local_government, device_serial, installation_date, vendor,
    } = body;

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (plate_number !== undefined) updateData.plate_number = plate_number?.trim() || null;
    if (vehicle_name !== undefined) updateData.vehicle_name = vehicle_name?.trim() || null;
    if (owner_name !== undefined) updateData.owner_name = owner_name?.trim() || null;
    if (owner_contact !== undefined) updateData.owner_contact = owner_contact?.trim() || null;
    if (owner_address !== undefined) updateData.owner_address = owner_address?.trim() || null;
    if (local_government !== undefined) updateData.local_government = local_government?.trim() || null;
    if (device_serial !== undefined) updateData.device_serial = device_serial?.trim() || null;
    if (installation_date !== undefined) updateData.installation_date = installation_date || null;
    if (vendor !== undefined) updateData.vendor = vendor;

    const { data, error } = await supabaseAdmin
      .from('dpf_vehicles')
      .update(updateData)
      .eq('vin', vin)
      .eq('is_deleted', false)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? '차량을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ vehicle: data });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const vin = decodeURIComponent(params.vin);

    const { error } = await supabaseAdmin
      .from('dpf_vehicles')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('vin', vin);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

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
