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

    const { inspection_date, inspection_agency, inspection_type, pass_yn,
            kd147_before, kd147_after, lugdown_before, lugdown_after,
            free_accel_before, free_accel_after, notes } = body;

    const { data, error } = await supabaseAdmin
      .from('dpf_performance_inspections')
      .insert({
        vehicle_id: vehicle.id,
        inspection_date: inspection_date || null,
        inspection_agency: inspection_agency?.trim() || null,
        inspection_type: inspection_type || null,
        pass_yn: pass_yn ?? null,
        kd147_before: kd147_before ?? null,
        kd147_after: kd147_after ?? null,
        lugdown_before: lugdown_before ?? null,
        lugdown_after: lugdown_after ?? null,
        free_accel_before: free_accel_before ?? null,
        free_accel_after: free_accel_after ?? null,
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
