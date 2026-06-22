// 미들웨어 전용 내부 접속 로그 수신 API (외부 호출 불가)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 내부 공유 시크릿 검증 - 미들웨어에서만 호출 가능
  const secret = request.headers.get('x-internal-secret');
  if (!secret || secret !== process.env.INTERNAL_LOG_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from('user_access_logs').insert({
    user_id:    body.user_id    || '',
    email:      body.email      || '',
    name:       body.name       || '',
    ip_address: body.ip_address || 'unknown',
    path:       body.path       || '',
    method:     body.method     || 'GET',
    user_agent: body.user_agent || '',
  });

  if (error) {
    console.error('[INTERNAL-LOG] INSERT 실패:', error.message);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
