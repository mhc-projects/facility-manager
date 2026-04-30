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

    const { monitoring_date, monitoring_yn, satisfaction_score, memo, call_agent } = body;

    const { data, error } = await supabaseAdmin
      .from('dpf_call_monitoring')
      .insert({
        vehicle_id: vehicle.id,
        monitoring_date: monitoring_date || null,
        monitoring_yn: monitoring_yn ?? null,
        satisfaction_score: satisfaction_score ?? null,
        memo: memo?.trim() || null,
        call_agent: call_agent?.trim() || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ record: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
