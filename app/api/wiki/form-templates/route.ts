import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      const { data, error } = await supabaseAdmin
        .from('form_templates')
        .select('*')
        .eq('is_active', true);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ templates: data ?? [] });
    }

    const { data, error } = await supabaseAdmin
      .from('form_templates')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ template: data ?? null });
  } catch (err) {
    console.error('[Form Templates] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
