import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeAndSave } from '@/lib/services/gmail-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: Google OAuth 동의 후 리다이렉트되는 콜백. 브라우저 최상위 이동이라 Authorization
// 헤더가 없으므로, /authorize-url에서 심어둔 httpOnly state 쿠키로 CSRF를 검증한다.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const redirectTarget = new URL('/admin/mail', request.url);

  const stateCookie = request.cookies.get('gmail_oauth_state')?.value;
  let parsedCookie: { state: string; employeeId: string } | null = null;
  try {
    parsedCookie = stateCookie ? JSON.parse(stateCookie) : null;
  } catch {
    parsedCookie = null;
  }

  const respondWith = (searchParam: string, value: string) => {
    redirectTarget.searchParams.set(searchParam, value);
    const response = NextResponse.redirect(redirectTarget);
    response.cookies.set('gmail_oauth_state', '', { maxAge: 0, path: '/' });
    return response;
  };

  if (oauthError) {
    return respondWith('mail_error', oauthError);
  }

  if (!code || !state || !parsedCookie || parsedCookie.state !== state) {
    return respondWith('mail_error', 'invalid_state');
  }

  try {
    const redirectUri = new URL('/api/mail/oauth/callback', request.url).toString();
    const { email } = await exchangeCodeAndSave({
      code,
      redirectUri,
      connectedBy: parsedCookie.employeeId,
    });
    return respondWith('mail_connected', email);
  } catch (error) {
    console.error('[API] GET /mail/oauth/callback error:', error);
    return respondWith('mail_error', error instanceof Error ? error.message : 'unknown');
  }
}
