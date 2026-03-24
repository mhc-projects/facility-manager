import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 푸시 구독 등록
// - JWT 있음: employee_id로 정상 저장
// - JWT 없음 + device_token: 기존 레코드의 endpoint/키 갱신 (iOS APNs 만료 대응)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription, device_token } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 구독 정보입니다.' },
        { status: 400 }
      );
    }

    const { p256dh, auth } = subscription.keys;
    if (!p256dh || !auth) {
      return NextResponse.json(
        { success: false, error: 'p256dh, auth 키가 필요합니다.' },
        { status: 400 }
      );
    }

    const userAgent = request.headers.get('user-agent') || '';
    const ipAddress = request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'unknown';
    const now = new Date().toISOString();

    // JWT 인증 시도
    const authHeader = request.headers.get('authorization');
    let userId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = verifyTokenString(authHeader.substring(7));
      if (decoded) userId = decoded.userId || decoded.id || null;
    }

    if (userId) {
      // [경로 A] 로그인 상태: employee_id + endpoint UNIQUE upsert
      const { error: upsertError } = await supabaseAdmin
        .from('push_subscriptions')
        .upsert({
          employee_id: userId,
          endpoint: subscription.endpoint,
          p256dh_key: p256dh,
          auth_key: auth,
          device_token: device_token || null,
          user_agent: userAgent,
          ip_address: ipAddress,
          is_active: true,
          last_used_at: now,
        }, { onConflict: 'employee_id,endpoint' });

      if (upsertError) {
        console.error('[PUSH] 구독 저장 실패:', upsertError);
        return NextResponse.json({ success: false, error: '구독 정보 저장에 실패했습니다.' }, { status: 500 });
      }
      console.log(`[PUSH] 사용자 ${userId} 구독 등록/갱신 완료`);

    } else if (device_token) {
      // [경로 B] 세션 만료 상태: device_token으로 기존 레코드 endpoint 갱신
      // iOS APNs endpoint가 변경되어도 누가 보낼지(employee_id)는 유지됨
      const { data: existing } = await supabaseAdmin
        .from('push_subscriptions')
        .select('id, employee_id')
        .eq('device_token', device_token)
        .eq('is_active', true)
        .single();

      if (existing) {
        await supabaseAdmin
          .from('push_subscriptions')
          .update({
            endpoint: subscription.endpoint,
            p256dh_key: p256dh,
            auth_key: auth,
            user_agent: userAgent,
            is_active: true,
            last_used_at: now,
          })
          .eq('device_token', device_token);
        console.log(`[PUSH] device_token으로 endpoint 갱신 완료 (user: ${existing.employee_id})`);
      } else {
        // device_token 레코드 없음 = 최초 기기, 로그인 후 재등록 필요
        console.log('[PUSH] device_token 레코드 없음 — 로그인 후 재등록 필요');
        return NextResponse.json({ success: true, message: '로그인 후 구독이 등록됩니다.' });
      }
    } else {
      // 로그인도 없고 device_token도 없으면 등록 불가
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    return NextResponse.json({ success: true, message: '푸시 알림 구독이 등록되었습니다.' });

  } catch (error) {
    console.error('[PUSH] 구독 등록 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 푸시 구독 해제
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }
    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }
    const userId = decoded.userId || decoded.id;

    const { error: deleteError } = await supabaseAdmin
      .from('push_subscriptions')
      .update({ is_active: false, last_used_at: new Date().toISOString() })
      .eq('employee_id', userId)
      .eq('is_active', true);

    if (deleteError) {
      console.error('[PUSH] 구독 해제 실패:', deleteError);
      return NextResponse.json({ success: false, error: '구독 해제에 실패했습니다.' }, { status: 500 });
    }

    console.log(`[PUSH] 사용자 ${userId} 구독 해제 완료`);
    return NextResponse.json({ success: true, message: '푸시 알림 구독이 해제되었습니다.' });

  } catch (error) {
    console.error('[PUSH] 구독 해제 오류:', error);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 푸시 구독 상태 확인
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }
    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }
    const userId = decoded.userId || decoded.id;

    const { data: subscription, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, created_at, last_used_at')
      .eq('employee_id', userId)
      .eq('is_active', true)
      .order('last_used_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[PUSH] 구독 상태 확인 실패:', error);
      return NextResponse.json(
        { success: false, error: '구독 상태 확인에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        isSubscribed: !!subscription,
        subscriptionInfo: subscription ? {
          created_at: subscription.created_at,
          last_used_at: subscription.last_used_at,
          endpoint: subscription.endpoint.substring(0, 50) + '...',
        } : null,
      },
    });

  } catch (error) {
    console.error('[PUSH] 구독 상태 확인 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
