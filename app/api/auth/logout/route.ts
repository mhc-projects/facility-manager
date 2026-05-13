import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export async function POST(request: NextRequest) {
  try {
    console.log('✅ [AUTH] 로그아웃 요청 처리');

    // 응답 생성
    const response = NextResponse.json({
      success: true,
      data: {
        message: '성공적으로 로그아웃되었습니다.'
      },
      timestamp: new Date().toISOString()
    });

    // 쿠키 삭제 (login API에서 설정한 쿠키 이름과 동일하게)
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookies.set('session_token', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 0,
      path: '/'
    });
    response.cookies.set('auth_ready', '', {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 0,
      path: '/'
    });

    console.log('🍪 [AUTH] 인증 쿠키 삭제 완료');

    return response;

  } catch (error) {
    console.error('❌ [AUTH] 로그아웃 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '로그아웃 처리 중 오류가 발생했습니다.'
        }
      },
      { status: 500 }
    );
  }
}