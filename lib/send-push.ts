// 서버사이드 Web Push 발송 유틸리티
// 모든 알림 발생 지점에서 이 함수를 호출하여 네이티브 푸시 알림을 발송합니다.
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase';

// VAPID 설정 초기화 (모듈 로드 시 1회)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@facility.blueon-iot.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[PUSH] VAPID 환경변수가 설정되지 않았습니다. 푸시 알림이 비활성화됩니다.');
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  category?: string;
  icon?: string;
  badge?: string;
  tag?: string;
}

/**
 * 특정 사용자에게 Web Push 알림을 발송합니다.
 * 실패해도 예외를 throw하지 않으므로 메인 비즈니스 로직에 영향 없습니다.
 */
export async function sendWebPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  try {
    const { data: subscriptions, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh_key, auth_key')
      .eq('employee_id', userId)
      .eq('is_active', true);

    if (error || !subscriptions || subscriptions.length === 0) return;

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192.svg',
      badge: payload.badge || '/icon-192.svg',
      tag: payload.tag || 'facility-notification',
      data: {
        url: payload.url || '/',
        category: payload.category,
      },
    });

    // 모든 구독 장치에 병렬 발송
    const results = await Promise.allSettled(
      subscriptions.map((sub: { endpoint: string; p256dh_key: string; auth_key: string }) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh_key,
              auth: sub.auth_key,
            },
          },
          notificationPayload,
          {
            urgency: 'high',  // Android Doze 모드 우회 (FCM 높은 우선순위)
            TTL: 86400,       // 24시간 내 미수신 시 재시도 (iOS/Android 공통)
          },
        ),
      ),
    );

    // 만료된 구독(410 Gone) 비활성화
    const expiredEndpoints: string[] = [];
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const err = result.reason as any;
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          expiredEndpoints.push(subscriptions[idx].endpoint);
        } else {
          console.warn(`[PUSH] 발송 실패 (user: ${userId}):`, err?.message);
        }
      }
    });

    if (expiredEndpoints.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .update({ is_active: false })
        .in('endpoint', expiredEndpoints);
      console.log(`[PUSH] 만료된 구독 ${expiredEndpoints.length}개 비활성화`);
    }
  } catch (err) {
    console.error('[PUSH] sendWebPushToUser 오류:', err);
  }
}

/**
 * 여러 사용자에게 동시에 Web Push 알림을 발송합니다.
 */
export async function sendWebPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || userIds.length === 0) return;

  await Promise.allSettled(
    userIds.map((userId) => sendWebPushToUser(userId, payload)),
  );
}
