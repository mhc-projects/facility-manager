import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 카카오 웹훅 이벤트 인터페이스
interface KakaoWebhookEvent {
  event_type: 'user.unlink' | 'user.revoke';
  user_id: string;
  app_id: string;
  referrer_type: string;
  timestamp: number;
}

// 웹훅 서명 검증 (선택사항 - 카카오에서 제공하는 경우)
function verifyWebhookSignature(payload: string, signature: string): boolean {
  // 카카오에서 웹훅 서명을 제공하는 경우 여기서 검증
  // 현재는 기본적인 검증만 수행
  return true;
}

// 사용자 계정 비활성화 처리
async function handleUserUnlink(kakaoUserId: string) {
  try {
    // 1. 소셜 계정 비활성화
    const { error: socialError } = await supabaseAdmin
      .from('social_accounts')
      .update({
        is_active: false,
        unlinked_at: new Date().toISOString()
      })
      .eq('provider', 'kakao')
      .eq('provider_id', kakaoUserId);

    if (socialError) {
      console.error('❌ [WEBHOOK] 소셜 계정 비활성화 실패:', socialError);
    }

    // 2. 연결된 직원 계정 찾기
    const { data: socialAccount } = await supabaseAdmin
      .from('social_accounts')
      .select('user_id')
      .eq('provider', 'kakao')
      .eq('provider_id', kakaoUserId)
      .single();

    if (socialAccount?.user_id) {
      // 3. 직원 계정 비활성화 (선택사항 - 정책에 따라)
      const { error: employeeError } = await supabaseAdmin
        .from('employees')
        .update({
          social_login_enabled: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', socialAccount.user_id);

      if (employeeError) {
        console.error('❌ [WEBHOOK] 직원 계정 업데이트 실패:', employeeError);
      }
    }

    console.log('✅ [WEBHOOK] 사용자 연결 해제 처리 완료:', kakaoUserId);
  } catch (error) {
    console.error('❌ [WEBHOOK] 사용자 연결 해제 처리 오류:', error);
  }
}

// 사용자 동의 철회 처리
async function handleUserRevoke(kakaoUserId: string) {
  try {
    // 동의 철회 시에는 모든 데이터를 삭제해야 할 수 있음
    const { error: deleteError } = await supabaseAdmin
      .from('social_accounts')
      .delete()
      .eq('provider', 'kakao')
      .eq('provider_id', kakaoUserId);

    if (deleteError) {
      console.error('❌ [WEBHOOK] 소셜 계정 삭제 실패:', deleteError);
    }

    console.log('✅ [WEBHOOK] 사용자 동의 철회 처리 완료:', kakaoUserId);
  } catch (error) {
    console.error('❌ [WEBHOOK] 사용자 동의 철회 처리 오류:', error);
  }
}

export async function POST(request: NextRequest) {
  // 2026-07-25: 소셜 로그인 기능 비활성화 (현재 프론트엔드 어디에서도 사용하지 않음 - 로그인/가입 페이지에 진입 버튼 없음). 아래 원래 로직은 재활성화 시 참고용으로 남겨둔다.
  return NextResponse.json(
    { success: false, error: { code: 'FEATURE_DISABLED', message: '소셜 로그인 기능은 현재 비활성화되어 있습니다.' } },
    { status: 503 }
  );
}

/* 2026-08-06: 소셜 로그인 미사용 확인 후 원본 로직(도달 불가 코드) 주석처리 — 재사용 시 위 return을 지우고 아래를 함수 본문으로 복원
async function _disabled_POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-kakao-signature') || '';

    console.log('📥 [WEBHOOK] 카카오 웹훅 요청 받음:', {
      hasBody: !!body,
      hasSignature: !!signature,
      bodyLength: body.length
    });

    // 서명 검증 (카카오에서 제공하는 경우)
    if (signature && !verifyWebhookSignature(body, signature)) {
      console.error('❌ [WEBHOOK] 서명 검증 실패');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // JSON 파싱
    let event: KakaoWebhookEvent;
    try {
      event = JSON.parse(body);
    } catch (parseError) {
      console.error('❌ [WEBHOOK] JSON 파싱 실패:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    console.log('📋 [WEBHOOK] 이벤트 상세:', {
      eventType: event.event_type,
      userId: event.user_id,
      appId: event.app_id,
      timestamp: event.timestamp
    });

    // 이벤트 타입별 처리
    switch (event.event_type) {
      case 'user.unlink':
        await handleUserUnlink(event.user_id);
        break;

      case 'user.revoke':
        await handleUserRevoke(event.user_id);
        break;

      default:
        console.log('⚠️ [WEBHOOK] 알 수 없는 이벤트 타입:', event.event_type);
        break;
    }

    // 성공 응답 (카카오는 2xx 응답을 기대함)
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ [WEBHOOK] 웹훅 처리 오류:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
*/

// GET 요청은 웹훅 URL 검증용 (카카오에서 요구할 수 있음)
export async function GET(request: NextRequest) {
  // 2026-07-25: 소셜 로그인 기능 비활성화 (현재 프론트엔드 어디에서도 사용하지 않음 - 로그인/가입 페이지에 진입 버튼 없음). 아래 원래 로직은 재활성화 시 참고용으로 남겨둔다.
  return NextResponse.json(
    { success: false, error: { code: 'FEATURE_DISABLED', message: '소셜 로그인 기능은 현재 비활성화되어 있습니다.' } },
    { status: 503 }
  );
}

/* 2026-08-06: 소셜 로그인 미사용 확인 후 원본 로직(도달 불가 코드) 주석처리 — 재사용 시 위 return을 지우고 아래를 함수 본문으로 복원
async function _disabled_GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');

  console.log('🔍 [WEBHOOK] 웹훅 URL 검증 요청:', { challenge });

  if (challenge) {
    // 챌린지 응답 (카카오에서 URL 검증시 사용)
    return NextResponse.json({ challenge });
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Kakao webhook endpoint is ready',
    timestamp: new Date().toISOString()
  });
}
*/