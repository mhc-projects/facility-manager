'use client';

import { supabase } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';
type EventCallback = (payload: RealtimePostgresChangesPayload<any>) => void;
type StatusCallback = (state: ConnectionState, error?: string) => void;

interface Subscription {
  id: string;
  tableName: string;
  eventTypes: ('INSERT' | 'UPDATE' | 'DELETE')[];
  callback: EventCallback;
  statusCallback?: StatusCallback;
}

/**
 * 전역 Realtime 연결 관리자
 * 앱 전체에서 단일 연결을 재사용하여 즉시 연결 경험 제공
 */
class RealtimeManager {
  private static instance: RealtimeManager;
  private channel: RealtimeChannel | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private subscriptions = new Map<string, Subscription>();
  private connectionPromise: Promise<void> | null = null;
  private connectionError: string | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): RealtimeManager {
    if (!RealtimeManager.instance) {
      RealtimeManager.instance = new RealtimeManager();
    }
    return RealtimeManager.instance;
  }

  /**
   * 백그라운드 연결 초기화 (로그인 시 호출)
   * 실제 페이지에서 구독하기 전에 미리 연결을 시작
   */
  async initializeConnection(): Promise<void> {
    if (this.isInitialized || this.connectionPromise) {
      return this.connectionPromise || Promise.resolve();
    }

    this.isInitialized = true;
    logger.info('REALTIME', '백그라운드 연결 초기화 시작');

    this.connectionPromise = this.establishConnection();
    return this.connectionPromise;
  }

  /**
   * 실제 Supabase 연결 설정
   * IMPORTANT: 모든 .on() 리스너를 추가한 후에 .subscribe()를 호출해야 함
   */
  private async establishConnection(): Promise<void> {
    try {
      this.connectionState = 'connecting';
      this.notifyStatusSubscribers('connecting');

      // 기존 채널 정리
      if (this.channel) {
        await this.channel.unsubscribe();
        this.channel = null;
      }

      // 전역 채널 생성 - 고정된 이름 사용
      const channelName = 'global-notifications';
      this.channel = supabase.channel(channelName, {
        config: {
          presence: {
            key: 'user_id'
          },
          broadcast: {
            ack: true,
            self: false
          }
        }
      });

      // 🔧 FIX: 구독하기 전에 모든 리스너를 먼저 등록
      this.addAllTableSubscriptions();

      // 채널 구독 (리스너 등록 후)
      const subscriptionStatus = await this.channel.subscribe((status, error) => {
        logger.debug('REALTIME', `상태 변경: ${status}`, error ? { error } : undefined);

        switch (status) {
          case 'SUBSCRIBED':
            this.connectionState = 'connected';
            this.connectionError = null;
            this.notifyStatusSubscribers('connected');
            logger.info('REALTIME', '전역 연결 성공');
            break;

          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
          case 'CLOSED':
            this.connectionState = 'disconnected';
            this.connectionError = error?.message || `연결 오류: ${status}`;
            this.notifyStatusSubscribers('disconnected', this.connectionError);
            logger.error('REALTIME', '연결 실패', this.connectionError);
            break;
        }
      });

      logger.debug('REALTIME', '전역 채널 구독 시작', subscriptionStatus);

    } catch (error) {
      logger.error('REALTIME', '연결 설정 오류', error);
      this.connectionState = 'disconnected';
      this.connectionError = error instanceof Error ? error.message : '알 수 없는 오류';
      this.notifyStatusSubscribers('disconnected', this.connectionError);
      throw error;
    }
  }

  /**
   * 모든 등록된 구독의 리스너를 채널에 추가
   */
  private addAllTableSubscriptions(): void {
    if (!this.channel) return;

    this.subscriptions.forEach(subscription => {
      subscription.eventTypes.forEach(eventType => {
        this.channel!.on(
          'postgres_changes',
          {
            event: eventType,
            schema: 'public',
            table: subscription.tableName
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            logger.debug('REALTIME', `${eventType} 이벤트 수신`, {
              table: subscription.tableName,
              subscriptionId: subscription.id,
              recordId: payload.new?.id || payload.old?.id
            });
            subscription.callback(payload);
          }
        );
      });

      logger.debug('REALTIME', `리스너 등록: ${subscription.tableName} (${subscription.id})`);
    });
  }

  /**
   * 테이블별 구독 등록
   * 🔧 FIX: 새 구독 추가 시 채널을 재연결하여 리스너를 올바르게 등록
   */
  subscribe(
    id: string,
    tableName: string,
    eventTypes: ('INSERT' | 'UPDATE' | 'DELETE')[],
    callback: EventCallback,
    statusCallback?: StatusCallback
  ): void {
    const subscription: Subscription = {
      id,
      tableName,
      eventTypes,
      callback,
      statusCallback
    };

    this.subscriptions.set(id, subscription);
    logger.info('REALTIME', `구독 등록: ${tableName} (${id})`);

    // 🔧 FIX: 이미 연결된 경우, 채널을 재연결하여 새 리스너 추가
    if (this.channel && this.connectionState === 'connected') {
      logger.debug('REALTIME', '새 구독 추가로 인한 채널 재연결');
      statusCallback?.('connecting');

      // 채널 재연결 (기존 구독 + 새 구독 모두 포함)
      // 'connected' 콜백은 notifyStatusSubscribers에서만 발생 (채널 실제 SUBSCRIBED 이후)
      this.reconnectInternal().catch((error) => {
        statusCallback?.('disconnected', error.message);
      });
    } else {
      // 아직 연결 안 된 경우 초기 연결
      statusCallback?.('connecting');
      // 'connected' 콜백은 notifyStatusSubscribers에서만 발생 (채널 실제 SUBSCRIBED 이후)
      this.initializeConnection().catch((error) => {
        statusCallback?.('disconnected', error.message);
      });
    }
  }

  /**
   * 채널 재연결 (모든 리스너 재등록) - 내부용
   */
  private async reconnectInternal(): Promise<void> {
    logger.info('REALTIME', '채널 재연결 시작');
    this.connectionPromise = this.establishConnection();
    return this.connectionPromise;
  }

  /**
   * 채널에 테이블 구독 추가 (단일)
   * ⚠️ DEPRECATED: addAllTableSubscriptions()를 사용하세요
   * 이 메서드는 호환성을 위해 유지되지만, 새 코드에서는 사용하지 마세요.
   */
  private addTableSubscription(subscription: Subscription): void {
    // 더 이상 사용되지 않음 - addAllTableSubscriptions()로 대체됨
    logger.warn('REALTIME', 'addTableSubscription() is deprecated');
  }

  /**
   * 채널에서 테이블 구독 제거
   */
  private removeTableSubscription(subscription: Subscription): void {
    if (!this.channel) return;

    // postgres_changes 이벤트 리스너 제거
    subscription.eventTypes.forEach(eventType => {
      // Supabase Realtime의 off 메서드를 사용하여 이벤트 리스너 제거
      // 주의: 실제로 이벤트 리스너를 완전히 제거하려면 채널을 재생성해야 할 수 있음
      logger.debug('REALTIME', `${eventType} 이벤트 리스너 제거 시도`, {
        table: subscription.tableName,
        subscriptionId: subscription.id
      });
    });

    // 참고: Supabase Realtime은 개별 postgres_changes 리스너를 제거하는 API가 없으므로,
    // 구독 목록에서만 제거하고 실제 채널 정리는 모든 구독이 해제될 때 수행
  }

  /**
   * 구독 해제
   */
  unsubscribe(id: string): void {
    const subscription = this.subscriptions.get(id);
    if (subscription) {
      // 채널에서 구독 제거
      this.removeTableSubscription(subscription);

      // 구독 목록에서 제거
      this.subscriptions.delete(id);
      logger.info('REALTIME', `구독 해제: ${subscription.tableName} (${id})`);
    }

    // 모든 구독이 해제되면 채널 정리
    if (this.subscriptions.size === 0 && this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
      this.connectionState = 'disconnected';
      this.isInitialized = false;
      this.connectionPromise = null;
      logger.info('REALTIME', '전역 채널 정리 완료');
    }
  }

  /**
   * 연결 상태 확인
   */
  getConnectionState(): {
    state: ConnectionState;
    error: string | null;
    subscriberCount: number;
  } {
    return {
      state: this.connectionState,
      error: this.connectionError,
      subscriberCount: this.subscriptions.size
    };
  }

  /**
   * 상태 변경 알림
   */
  private notifyStatusSubscribers(state: ConnectionState, error?: string): void {
    this.subscriptions.forEach(sub => {
      sub.statusCallback?.(state, error);
    });
  }

  /**
   * 강제 재연결
   */
  async reconnect(): Promise<void> {
    logger.info('REALTIME', '강제 재연결 시작');
    this.isInitialized = false;
    this.connectionPromise = null;

    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }

    await this.initializeConnection();
  }
}

// 전역 인스턴스 내보내기
export const realtimeManager = RealtimeManager.getInstance();

// 편의 함수들
export function initializeRealtimeConnection(): Promise<void> {
  return realtimeManager.initializeConnection();
}

export function subscribeToRealtime(
  id: string,
  tableName: string,
  eventTypes: ('INSERT' | 'UPDATE' | 'DELETE')[],
  callback: EventCallback,
  statusCallback?: StatusCallback
): void {
  realtimeManager.subscribe(id, tableName, eventTypes, callback, statusCallback);
}

export function unsubscribeFromRealtime(id: string): void {
  realtimeManager.unsubscribe(id);
}

export function getRealtimeConnectionState() {
  return realtimeManager.getConnectionState();
}

export function reconnectRealtime(): Promise<void> {
  return realtimeManager.reconnect();
}