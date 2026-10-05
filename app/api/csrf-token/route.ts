import { NextRequest, NextResponse } from 'next/server';
import { CSRFProtection } from '@/lib/security/csrf-protection';

// 요청마다 새 토큰을 발급하도록 정적 렌더링 대상에서 제외한다 (없으면 빌드 시점 토큰 하나가 다음 배포까지 모든 사용자에게 나간다)
export const dynamic = 'force-dynamic';

/**
 * CSRF 토큰 발급 API
 * GET /api/csrf-token
 */
export async function GET(request: NextRequest) {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'CSRF token generated'
    });

    // CSRF 토큰 생성 및 쿠키 설정
    const token = CSRFProtection.setCSRFToken(response);

    // 클라이언트에서 읽을 수 있도록 응답 헤더에도 추가
    response.headers.set('X-CSRF-Token', token);

    return response;
  } catch (error) {
    console.error('[CSRF] Token generation error:', error);
    return NextResponse.json(
      { success: false, message: 'CSRF token generation failed' },
      { status: 500 }
    );
  }
}
