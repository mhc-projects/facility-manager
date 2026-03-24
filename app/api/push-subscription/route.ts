import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 푸시 구독 등록
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = verifyAuth() as any;
    if (authError) {
      return NextResponse.json({ success: false, error: authError }, { status: 401 });
    }

    const body = await request.json();
    const { subscription } = body;

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

    // endpoint 기준 upsert
    const { error: upsertError } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        employee_id: user.id,
        endpoint: subscription.endpoint,
        p256dh_key: p256dh,
        auth_key: auth,
        user_agent: userAgent,
        ip_address: ipAddress,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'endpoint',
      });

    if (upsertError) {
      console.error('구독 저장 실패:', upsertError);
      return NextResponse.json(
        { success: false, error: '구독 정보 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log(`[PUSH] 사용자 ${user.id} 구독 등록/갱신 완료`);

    return NextResponse.json({
      success: true,
      message: '푸시 알림 구독이 등록되었습니다.',
    });

  } catch (error) {
    console.error('[PUSH] 구독 등록 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 푸시 구독 해제
export async function DELETE(_request: NextRequest) {
  try {
    const { user, error: authError } = verifyAuth() as any;
    if (authError) {
      return NextResponse.json({ success: false, error: authError }, { status: 401 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('employee_id', user.id)
      .eq('is_active', true);

    if (deleteError) {
      console.error('[PUSH] 구독 해제 실패:', deleteError);
      return NextResponse.json(
        { success: false, error: '구독 해제에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log(`[PUSH] 사용자 ${user.id} 구독 해제 완료`);

    return NextResponse.json({
      success: true,
      message: '푸시 알림 구독이 해제되었습니다.',
    });

  } catch (error) {
    console.error('[PUSH] 구독 해제 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 푸시 구독 상태 확인
export async function GET(_request: NextRequest) {
  try {
    const { user, error: authError } = verifyAuth() as any;
    if (authError) {
      return NextResponse.json({ success: false, error: authError }, { status: 401 });
    }

    const { data: subscription, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, created_at, updated_at')
      .eq('employee_id', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
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
          updated_at: subscription.updated_at,
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
