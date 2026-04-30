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

    const fields = ['inspection_date', 'inspection_agency', 'inspection_type', 'pass_yn',
                    'kd147_before', 'kd147_after', 'lugdown_before', 'lugdown_after',
                    'free_accel_before', 'free_accel_after', 'notes'];

    for (const f of fields) {
      if (f in body) {
        if (typeof body[f] === 'string') update[f] = body[f]?.trim() || null;
        else update[f] = body[f] ?? null;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('dpf_performance_inspections')
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
      .from('dpf_performance_inspections')
      .delete()
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
