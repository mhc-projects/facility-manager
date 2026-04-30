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
    const update: Record<string, unknown> = {};

    if ('monitoring_date' in body) update.monitoring_date = body.monitoring_date || null;
    if ('monitoring_yn' in body) update.monitoring_yn = body.monitoring_yn ?? null;
    if ('satisfaction_score' in body) update.satisfaction_score = body.satisfaction_score ?? null;
    if ('memo' in body) update.memo = body.memo?.trim() || null;
    if ('call_agent' in body) update.call_agent = body.call_agent?.trim() || null;

    const { data, error } = await supabaseAdmin
      .from('dpf_call_monitoring')
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
      .from('dpf_call_monitoring')
      .delete()
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
