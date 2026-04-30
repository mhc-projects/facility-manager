import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(
  request: NextRequest,
  { params }: { params: { vin: string; id: string } }
) {
  try {
    const body = await request.json();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const strFields = ['local_government', 'reception_date', 'approval_status',
                       'subsidy_payment_date', 'subsidy_expected_date', 'notes'];
    const numFields = ['subsidy_claim_amount', 'self_payment_removal'];

    for (const f of strFields) {
      if (f in body) update[f] = typeof body[f] === 'string' ? body[f]?.trim() || null : body[f] ?? null;
    }
    for (const f of numFields) {
      if (f in body) update[f] = body[f] ?? null;
    }

    const { data, error } = await supabaseAdmin
      .from('dpf_subsidy_applications')
      .update(update)
      .eq('id', params.id)
      .select()
      .single();

    if (error || !data) return NextResponse.json({ error: '이력을 찾을 수 없습니다' }, { status: 404 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { vin: string; id: string } }
) {
  try {
    const { error } = await supabaseAdmin
      .from('dpf_subsidy_applications')
      .delete()
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
