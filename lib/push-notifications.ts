// 브라우저 푸시 알림 관리
'use client';

export interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  actions?: { action: string; title: string; icon?: string }[];
  requireInteraction?: boolean;
  silent?: boolean;
}

class PushNotificationManager {
  private static instance: PushNotificationManager;
  private registration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;

  // VAPID 공개 키 (환경변수에서 읽음)
  private readonly VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

  private constructor() {}

  static getInstance(): PushNotificationManager {
    if (!PushNotificationManager.instance) {
      PushNotificationManager.instance = new PushNotificationManager();
    }
    return PushNotificationManager.instance;
  }

  // 푸시 알림 권한 요청
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      throw new Error('이 브라우저는 알림을 지원하지 않습니다.');
    }

    if ('serviceWorker' in navigator) {
      try {
        // 서비스 워커 등록
        this.registration = await navigator.serviceWorker.register('/sw.js');
        console.log('서비스 워커 등록 성공:', this.registration);
      } catch (error) {
        console.error('서비스 워커 등록 실패:', error);
      }
    }

    let permission = Notification.permission;

    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'granted') {
      await this.setupPushSubscription();
    }

    return permission;
  }

  // 푸시 구독 설정
  private async setupPushSubscription(): Promise<void> {
    if (!this.registration) {
      throw new Error('서비스 워커가 등록되지 않았습니다.');
    }

    try {
      // 기존 구독 확인
      this.subscription = await this.registration.pushManager.getSubscription();

      if (!this.subscription) {
        // 새 구독 생성
        this.subscription = await this.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY) as BufferSource
        });
      }

      // 서버에 구독 정보 전송
      await this.sendSubscriptionToServer(this.subscription);

    } catch (error) {
      console.error('푸시 구독 설정 실패:', error);
      throw error;
    }
  }

  // 서버에 구독 정보 전송
  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/push-subscription', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription: subscription.toJSON()
        })
      });

      if (!response.ok) {
        throw new Error('구독 정보 전송 실패');
      }

    } catch (error) {
      console.error('서버 구독 정보 전송 실패:', error);
      throw error;
    }
  }

  // 로컬 알림 표시
  async showNotification(options: PushNotificationOptions): Promise<void> {
    if (Notification.permission !== 'granted') {
      console.warn('알림 권한이 허용되지 않았습니다.');
      return;
    }

    const notificationOptions: any = {
      body: options.body,
      icon: options.icon || '/icon-192x192.png',
      badge: options.badge || '/badge-72x72.png',
      tag: options.tag,
      data: options.data,
      actions: options.actions,
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
      timestamp: Date.now()
    };

    if (this.registration) {
      // 서비스 워커를 통한 알림
      await this.registration.showNotification(options.title, notificationOptions);
    } else {
      // 일반 브라우저 알림
      new Notification(options.title, notificationOptions);
    }
  }

  // 테스트 알림
  async showTestNotification(): Promise<void> {
    await this.showNotification({
      title: '테스트 알림',
      body: '푸시 알림이 정상적으로 작동합니다!',
      tag: 'test-notification',
      requireInteraction: false
    });
  }

  // 업무 관련 알림
  async showTaskNotification(type: string, taskTitle: string, message: string, taskId: string): Promise<void> {
    let title = '';
    let icon = '/icon-192x192.png';

    switch (type) {
      case 'task_assigned':
        title = '새 업무 배정';
        icon = '/icons/task-assigned.png';
        break;
      case 'task_completed':
        title = '업무 완료';
        icon = '/icons/task-completed.png';
        break;
      case 'task_comment':
        title = '새 댓글';
        icon = '/icons/comment.png';
        break;
      case 'mention':
        title = '멘션';
        icon = '/icons/mention.png';
        break;
      default:
        title = '알림';
    }

    await this.showNotification({
      title,
      body: `${taskTitle}: ${message}`,
      icon,
      tag: `task-${taskId}`,
      data: {
        type,
        taskId,
        url: `/admin/tasks?task=${taskId}`
      },
      actions: [
        {
          action: 'view',
          title: '확인',
          icon: '/icons/view.png'
        },
        {
          action: 'dismiss',
          title: '닫기',
          icon: '/icons/close.png'
        }
      ],
      requireInteraction: true
    });
  }

  // 구독 해제
  async unsubscribe(): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;

      // 서버에서도 구독 정보 제거
      try {
        const token = localStorage.getItem('auth_token');
        await fetch('/api/push-subscription', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (error) {
        console.error('서버 구독 해제 실패:', error);
      }
    }
  }

  // 현재 구독 상태 확인
  async isSubscribed(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    this.subscription = await this.registration.pushManager.getSubscription();
    return this.subscription !== null;
  }

  // 알림 권한 상태 확인
  getPermissionStatus(): NotificationPermission {
    return Notification.permission;
  }

  // VAPID 키 변환 유틸리티
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

// 싱글톤 인스턴스 내보내기
export const pushNotificationManager = PushNotificationManager.getInstance();

// React Hook
import { useState, useEffect } from 'react';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 초기 상태 확인
    if ('Notification' in window) {
      setPermission(Notification.permission);
      pushNotificationManager.isSubscribed().then(setIsSubscribed);
    }
  }, []);

  const requestPermission = async () => {
    setIsLoading(true);
    try {
      const newPermission = await pushNotificationManager.requestPermission();
      setPermission(newPermission);
      if (newPermission === 'granted') {
        const subscribed = await pushNotificationManager.isSubscribed();
        setIsSubscribed(subscribed);
      }
    } catch (error) {
      console.error('알림 권한 요청 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    try {
      await pushNotificationManager.unsubscribe();
      setIsSubscribed(false);
    } catch (error) {
      console.error('구독 해제 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const showTestNotification = async () => {
    try {
      await pushNotificationManager.showTestNotification();
    } catch (error) {
      console.error('테스트 알림 실패:', error);
    }
  };

  return {
    permission,
    isSubscribed,
    isLoading,
    requestPermission,
    unsubscribe,
    showTestNotification,
    isSupported: 'Notification' in window && 'serviceWorker' in navigator
  };
}