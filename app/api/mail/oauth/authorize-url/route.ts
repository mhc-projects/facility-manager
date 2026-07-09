import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireSystemAdmin } from '@/lib/auth/require-system-admin';
import { buildAuthUrl } from '@/lib/services/gmail-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: Google 계정 연결 동의 화면 URL 생성 (CSRF 방지용 state를 httpOnly 쿠키에 저장)
// 공유 계정을 바꾸는 작업이라 시스템관리자(레벨4)만 허용
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const redirectUri = new URL('/api/mail/oauth/callback', request.url).toString();
    const state = randomBytes(16).toString('hex');
    const url = buildAuthUrl(redirectUri, state);

    const response = NextResponse.json({ success: true, data: { url } });
    response.cookies.set(
      'gmail_oauth_state',
      JSON.stringify({ state, employeeId: auth.user.id }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 300,
        path: '/',
      }
    );
    return response;
  } catch (error) {
    console.error('[API] GET /mail/oauth/authorize-url error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '인증 URL 생성 실패' },
      { status: 500 }
    );
  }
}
