// 접속 감사 로그 조회 API (권한 레벨 4 전용)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Next.js fetch 캐시를 우회하기 위해 요청마다 클라이언트 생성
function makeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, opts?: RequestInit) =>
          fetch(url, { ...opts, cache: 'no-store' }),
      },
    }
  );
}

export async function GET(request: NextRequest) {
  // 인증 확인
  const token =
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    request.cookies.get('session_token')?.value ||
    request.headers.get('cookie')?.match(/session_token=([^;]+)/)?.[1];

  if (!token) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });
  }

  // 권한 레벨 4(슈퍼관리자) 전용
  if ((payload.permission_level ?? 0) < 4) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  const ip = searchParams.get('ip');
  const from = searchParams.get('from'); // YYYY-MM-DD
  const to = searchParams.get('to');     // YYYY-MM-DD
  const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 5000);

  const supabaseAdmin = makeClient();

  let query = supabaseAdmin
    .from('user_access_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) query = query.eq('user_id', userId);
  if (ip) query = query.ilike('ip_address', `%${ip}%`);
  if (from) query = query.gte('created_at', `${from}T00:00:00+09:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59+09:00`);

  const { data, error } = await query;

  if (error) {
    console.error('[ACCESS-LOGS] DB 조회 오류:', error);
    return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
