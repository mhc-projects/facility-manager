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

  try {
    console.log('🔐 [KAKAO-LOGIN] 카카오 로그인 요청 받음');

    // 카카오 로그인 파라미터 설정
    const kakaoAuthURL = 'https://kauth.kakao.com/oauth/authorize';
    const clientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID || 'd429d4772afee7301d3ab0e4f903b94e';
    // Vercel 배포와 로컬 개발 모두 지원하는 동적 URL 생성
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = process.env.NODE_ENV === 'production'
      ? process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL
      : `localhost:${process.env.PORT || 3000}`;
    const redirectUri = `${protocol}://${host}/api/auth/social/kakao/callback`;
    const state = Math.random().toString(36).substring(2, 15);

    // 카카오 OAuth URL 생성
    const kakaoLoginUrl = new URL(kakaoAuthURL);
    kakaoLoginUrl.searchParams.set('client_id', clientId);
    kakaoLoginUrl.searchParams.set('redirect_uri', redirectUri);
    kakaoLoginUrl.searchParams.set('response_type', 'code');
    kakaoLoginUrl.searchParams.set('state', state);
    kakaoLoginUrl.searchParams.set('scope', 'profile_nickname,account_email');

    console.log('🎯 [KAKAO-LOGIN] 카카오 로그인 URL 생성:', {
      clientId: clientId.substring(0, 10) + '...',
      redirectUri,
      state
    });

    // 카카오 로그인 페이지로 리다이렉트
    return NextResponse.redirect(kakaoLoginUrl.toString());

  } catch (error) {
    console.error('❌ [KAKAO-LOGIN] 카카오 로그인 시작 오류:', error);

    const errorUrl = new URL('/', request.url);
    errorUrl.searchParams.set('error', '카카오 로그인을 시작할 수 없습니다.');
    return NextResponse.redirect(errorUrl);
  }
}