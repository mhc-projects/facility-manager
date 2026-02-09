import { NextRequest, NextResponse } from 'next/server';
import { CSRFProtection } from '@/lib/security/csrf-protection';

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
