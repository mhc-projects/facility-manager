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

    const { local_government, reception_date, approval_status, subsidy_claim_amount,
            subsidy_payment_date, subsidy_expected_date, self_payment_removal, notes } = body;

    const { data, error } = await supabaseAdmin
      .from('dpf_subsidy_applications')
      .insert({
        vehicle_id: vehicle.id,
        local_government: local_government?.trim() || null,
        reception_date: reception_date || null,
        approval_status: approval_status || null,
        subsidy_claim_amount: subsidy_claim_amount ?? null,
        subsidy_payment_date: subsidy_payment_date || null,
        subsidy_expected_date: subsidy_expected_date || null,
        self_payment_removal: self_payment_removal ?? null,
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
