import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      vin, plate_number, vehicle_name, owner_name, owner_contact,
      owner_address, local_government, device_serial, installation_date, vendor,
    } = body;

    if (!vin?.trim() || !plate_number?.trim()) {
      return NextResponse.json({ error: '차대번호와 차량번호는 필수입니다' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dpf_vehicles')
      .insert({
        vin: vin.trim(),
        plate_number: plate_number.trim(),
        vehicle_name: vehicle_name?.trim() || null,
        owner_name: owner_name?.trim() || null,
        owner_contact: owner_contact?.trim() || null,
        owner_address: owner_address?.trim() || null,
        local_government: local_government?.trim() || null,
        device_serial: device_serial?.trim() || null,
        installation_date: installation_date || null,
        vendor: vendor || 'fujino',
        raw_data: {},
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 등록된 차대번호입니다' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ vehicle: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
