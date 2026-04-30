import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const vin = decodeURIComponent(params.vin);
    const body = await request.json();

    const { data: vehicle, error: vErr } = await supabaseAdmin
      .from('dpf_vehicles')
      .select('id')
      .eq('vin', vin)
      .eq('is_deleted', false)
      .single();

    if (vErr || !vehicle) {
      return NextResponse.json({ error: '차량을 찾을 수 없습니다' }, { status: 404 });
    }

    const { action_type, serial_number, installer_company, installation_date,
            management_number, sales_office, notes } = body;

    if (!action_type) {
      return NextResponse.json({ error: '동작 유형은 필수입니다' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dpf_device_installations')
      .insert({
        vehicle_id: vehicle.id,
        action_type,
        serial_number: serial_number?.trim() || null,
        installer_company: installer_company?.trim() || null,
        installation_date: installation_date || null,
        management_number: management_number?.trim() || null,
        sales_office: sales_office?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ record: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
