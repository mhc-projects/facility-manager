import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export async function GET(request: NextRequest) {
  // 2026-07-25: 소셜 로그인 기능 비활성화 (현재 프론트엔드 어디에서도 사용하지 않음 - 로그인/가입 페이지에 진입 버튼 없음). 아래 원래 로직은 재활성화 시 참고용으로 남겨둔다.
  return NextResponse.json(
    { success: false, error: { code: 'FEATURE_DISABLED', message: '소셜 로그인 기능은 현재 비활성화되어 있습니다.' } },
    { status: 503 }
  );

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // 팝업 창에서 처리하기 위한 HTML 응답
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>네이버 로그인 처리 중...</title>
      <meta charset="utf-8">
    </head>
    <body>
      <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="text-align: center;">
          <div style="margin-bottom: 20px;">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #00C73C; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 0 auto;"></div>
          </div>
          <p>네이버 로그인 처리 중...</p>
        </div>
      </div>

      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>

      <script>
        (async function() {
          try {
            const code = ${JSON.stringify(code).replace(/</g, '\\u003c')};
            const state = ${JSON.stringify(state).replace(/</g, '\\u003c')};
            const error = ${JSON.stringify(error).replace(/</g, '\\u003c')};

            if (error) {
              window.opener?.postMessage({
                type: 'SOCIAL_LOGIN_ERROR',
                error: '네이버 로그인이 취소되었거나 오류가 발생했습니다.'
              }, window.location.origin);
              window.close();
              return;
            }

            if (!code || !state) {
              window.opener?.postMessage({
                type: 'SOCIAL_LOGIN_ERROR',
                error: '네이버 인증 정보를 받지 못했습니다.'
              }, window.location.origin);
              window.close();
              return;
            }

            // state 값 검증 (CSRF 보호)
            const storedState = sessionStorage.getItem('naver_state');
            if (state !== storedState) {
              window.opener?.postMessage({
                type: 'SOCIAL_LOGIN_ERROR',
                error: '네이버 로그인 보안 검증에 실패했습니다.'
              }, window.location.origin);
              window.close();
              return;
            }

            // sessionStorage에서 state 제거
            sessionStorage.removeItem('naver_state');

            // 백엔드 API 호출
            const response = await fetch('/api/auth/social/naver', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ code, state })
            });

            const data = await response.json();

            if (data.success) {
              window.opener?.postMessage({
                type: 'SOCIAL_LOGIN_SUCCESS',
                data: data.data
              }, window.location.origin);
            } else {
              window.opener?.postMessage({
                type: 'SOCIAL_LOGIN_ERROR',
                error: data.error?.message || '네이버 로그인 중 오류가 발생했습니다.'
              }, window.location.origin);
            }

            window.close();
          } catch (error) {
            console.error('네이버 로그인 콜백 처리 오류:', error);
            window.opener?.postMessage({
              type: 'SOCIAL_LOGIN_ERROR',
              error: '네이버 로그인 처리 중 오류가 발생했습니다.'
            }, window.location.origin);
            window.close();
          }
        })();
      </script>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}