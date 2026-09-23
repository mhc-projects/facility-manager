// app/api/dpf/vehicles/[vin]/route.ts
// 차량 상세 + 전체 이력 조회
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(
  request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const vin = decodeURIComponent(params.vin);
    const body = await request.json();
    const {
      plate_number, vehicle_name, owner_name, owner_contact,
      owner_address, local_government, device_serial, installation_date, vendor,
      engine_type, device_type, trust_grade, plate_number_original,
      grade_management, management_direction,
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
    if (engine_type !== undefined) updateData.engine_type = engine_type?.trim() || null;
    if (device_type !== undefined) updateData.device_type = device_type?.trim() || null;
    if (trust_grade !== undefined) updateData.trust_grade = trust_grade?.trim() || null;
    if (plate_number_original !== undefined) updateData.plate_number_original = plate_number_original?.trim() || null;
    if (grade_management !== undefined) updateData.grade_management = grade_management?.trim() || null;
    if (management_direction !== undefined) updateData.management_direction = management_direction?.trim() || null;

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
  request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

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
  request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

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

    const [instData, inspData, subsidyData, callData, serviceRecordData] = await Promise.all([
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

      supabaseAdmin
        .from('dpf_service_records')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .eq('is_deleted', false)
        .order('reception_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
    ]);

    // 슈퍼관리자(4)가 ?include_deleted=1로 요청하면 소프트 삭제된 접수 건을 별도 필드로 준다(영구 삭제 UI용).
    // serviceRecords에 섞지 않는 이유: 탭 건수 배지·차량 삭제 경고 건수 등 기존 소비처가 활성 건만 전제한다.
    let deletedServiceRecords: unknown[] = [];
    if (request.nextUrl.searchParams.get('include_deleted') === '1' && auth.user.permission_level >= 4) {
      const { data } = await supabaseAdmin
        .from('dpf_service_records')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .eq('is_deleted', true)
        .order('updated_at', { ascending: false });
      deletedServiceRecords = data ?? [];
    }

    const serviceRecordIds = (serviceRecordData.data ?? []).map((r: { id: string }) => r.id);
    const attachmentCounts: Record<string, number> = {};
    if (serviceRecordIds.length > 0) {
      const { data: attachRows } = await supabaseAdmin
        .from('dpf_service_record_attachments')
        .select('record_id')
        .in('record_id', serviceRecordIds);
      for (const row of attachRows ?? []) {
        attachmentCounts[row.record_id] = (attachmentCounts[row.record_id] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      vehicle,
      installations: instData.data ?? [],
      inspections: inspData.data ?? [],
      subsidies: subsidyData.data ?? [],
      callMonitoring: callData.data ?? [],
      serviceRecords: serviceRecordData.data ?? [],
      deletedServiceRecords,
      attachmentCounts,
    });
  } catch (err) {
    console.error('[DPF Vehicle Detail] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
