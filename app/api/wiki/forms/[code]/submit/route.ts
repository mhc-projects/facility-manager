// app/api/wiki/forms/[code]/submit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const { vehicleId, businessId, values, status = 'submitted' } = await request.json();

    const { data: template } = await supabaseAdmin
      .from('form_templates')
      .select('id')
      .eq('code', params.code)
      .single();

    if (!template) {
      return NextResponse.json({ error: '서식을 찾을 수 없습니다' }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from('form_submissions')
      .insert({
        template_id: template.id,
        vehicle_id: vehicleId ?? null,
        business_id: businessId ?? null,
        values,
        status,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, submission: data });
  } catch (err) {
    console.error('[Form Submit] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
