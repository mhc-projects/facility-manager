import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyToken } from '@/utils/auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export async function DELETE(request: NextRequest) {
  // 2026-07-25: 소셜 로그인 기능 비활성화 (현재 프론트엔드 어디에서도 사용하지 않음 - 로그인/가입 페이지에 진입 버튼 없음). 아래 원래 로직은 재활성화 시 참고용으로 남겨둔다.
  return NextResponse.json(
    { success: false, error: { code: 'FEATURE_DISABLED', message: '소셜 로그인 기능은 현재 비활성화되어 있습니다.' } },
    { status: 503 }
  );
}

/* 2026-08-06: 소셜 로그인 미사용 확인 후 원본 로직(도달 불가 코드) 주석처리 — 재사용 시 위 return을 지우고 아래를 함수 본문으로 복원
async function _disabled_DELETE(request: NextRequest) {
  try {
    // JWT 토큰 검증
    const token = request.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }
      }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: '유효하지 않은 토큰입니다.' }
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (!provider) {
      return NextResponse.json({
        success: false,
        error: { code: 'MISSING_PROVIDER', message: '소셜 로그인 제공자를 지정해주세요.' }
      }, { status: 400 });
    }

    const userId = decoded.id;

    console.log(`🔗 [SOCIAL-UNLINK] ${provider} 연동 해제 시작:`, userId);

    // 해당 제공자의 소셜 계정 연동 해제
    const { error: unlinkError } = await supabaseAdmin
      .from('social_accounts')
      .delete()
      .eq('employee_id', userId)
      .eq('provider', provider);

    if (unlinkError) {
      console.error(`❌ [SOCIAL-UNLINK] ${provider} 연동 해제 실패:`, unlinkError);
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNLINK_ERROR',
          message: `${provider} 연동 해제 중 오류가 발생했습니다.`
        }
      }, { status: 500 });
    }

    console.log(`✅ [SOCIAL-UNLINK] ${provider} 연동 해제 완료:`, userId);

    return NextResponse.json({
      success: true,
      data: {
        message: `${provider} 계정 연동이 해제되었습니다.`,
        provider: provider
      }
    });

  } catch (error) {
    console.error('❌ [SOCIAL-UNLINK] 처리 실패:', error);

    return NextResponse.json({
      success: false,
      error: {
        code: 'UNLINK_ERROR',
        message: '소셜 계정 연동 해제 중 오류가 발생했습니다.'
      }
    }, { status: 500 });
  }
}
*/