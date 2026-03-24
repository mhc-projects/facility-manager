'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseSupabaseRealtimeOptions {
  tableName?: string;
  eventTypes?: ('INSERT' | 'UPDATE' | 'DELETE')[];
  onNotification?: (payload: RealtimePostgresChangesPayload<any>) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  autoConnect?: boolean;
  reconnectDelay?: number;
}

interface RealtimeState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  lastEvent: Date | null;
  subscriptionCount: number;
}

/**
 * Supabase Realtime 전용 훅 - WebSocket 완전 대체
 * 안정적인 연결 관리와 즉시 알림 수신을 위한 최적화된 구현
 */
export function useSupabaseRealtime(options: UseSupabaseRealtimeOptions = {}) {
  const {
    tableName = 'notifications',
    eventTypes = ['INSERT', 'UPDATE'],
    onNotification,
    onConnect,
    onDisconnect,
    onError,
    autoConnect = true,
    reconnectDelay = 1000
  } = options;

  const [state, setState] = useState<RealtimeState>({
    isConnected: false,
    isConnecting: false,
    connectionError: null,
    lastEvent: null,
    subscriptionCount: 0
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const isComponentMountedRef = useRef(true);
  const isSubscribingRef = useRef(false); // 중복 구독 방지 플래그
  const subscriptionCountRef = useRef(0); // stale closure 방지: 항상 최신 카운트 유지

  // 콜백 함수들을 ref로 저장하여 의존성 문제 해결
  const onNotificationRef = useRef(onNotification);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // ✅ FIX: 콜백을 동기적으로 업데이트 (race condition 방지)
  // useEffect는 비동기적이므로 Realtime 이벤트가 ref 업데이트 전에 도착할 수 있음
  // ref는 mutable이므로 렌더 중 직접 할당해도 안전함
  onNotificationRef.current = onNotification;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  onErrorRef.current = onError;

  // 연결 상태 업데이트 함수
  const updateState = useCallback((updates: Partial<RealtimeState>) => {
    if (!isComponentMountedRef.current) return;
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // 채널 구독
  const subscribe = useCallback(async () => {
    if (!isComponentMountedRef.current) return;

    // 이미 구독 중이면 중복 실행 방지
    if (isSubscribingRef.current) {
      console.log('⚠️ [REALTIME] 이미 구독 진행 중 - 중복 구독 방지');
      return;
    }

    isSubscribingRef.current = true;

    try {
      updateState({ isConnecting: true, connectionError: null });

      // 기존 채널 정리
      if (channelRef.current) {
        await channelRef.current.unsubscribe();
        channelRef.current = null;
      }

      // 새 채널 생성 - 고유한 채널명으로 충돌 방지
      // postgres_changes만 사용하므로 최소한의 설정으로 단순화
      const channelName = `realtime:${tableName}:${Date.now()}`;
      const channel = supabase.channel(channelName);

      // 데이터베이스 변경 사항 구독
      eventTypes.forEach(eventType => {
        channel.on(
          'postgres_changes',
          {
            event: eventType,
            schema: 'public',
            table: tableName
          },
          (payload: any) => {
            if (!isComponentMountedRef.current) return;

            // Phase 1: 프로덕션에서는 이벤트 수신 로그 최소화
            if (process.env.NODE_ENV !== 'production') {
              console.log(`📡 [REALTIME] ${eventType} 이벤트 수신:`, {
                table: tableName,
                eventType,
                timestamp: new Date().toISOString(),
                recordId: payload.new?.id || payload.old?.id
              });
            }

            subscriptionCountRef.current += 1;
            updateState({
              lastEvent: new Date(),
              subscriptionCount: subscriptionCountRef.current
            });

            onNotificationRef.current?.(payload);
          }
        );
      });

      // 채널 구독 및 상태 관리
      const subscriptionStatus = await channel.subscribe((status, error) => {
        if (!isComponentMountedRef.current) return;

        // Phase 1: 프로덕션에서는 성공 로그만 표시, 에러는 warn으로 처리
        const isProduction = process.env.NODE_ENV === 'production';
        if (status === 'SUBSCRIBED' && !isProduction) {
          console.log(`📡 [REALTIME] 구독 상태 변경: ${status}`);
        } else if (status !== 'SUBSCRIBED' && error) {
          console.warn(`⚠️ [REALTIME] 구독 상태: ${status}`, error.message);
        }

        switch (status) {
          case 'SUBSCRIBED':
            reconnectAttemptsRef.current = 0;
            isSubscribingRef.current = false; // 구독 완료
            updateState({
              isConnected: true,
              isConnecting: false,
              connectionError: null
            });
            onConnectRef.current?.();
            break;

          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
          case 'CLOSED':
            isSubscribingRef.current = false; // 구독 실패 - 플래그 해제

            // Phase 1: 프로덕션 환경에서는 조용히 재연결 (사용자 경험 개선)
            const isProduction = process.env.NODE_ENV === 'production';

            updateState({
              isConnected: false,
              isConnecting: false,
              connectionError: error?.message || `연결 오류: ${status}`
            });
            onDisconnectRef.current?.();

            // 자동 재연결 시도
            if (autoConnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
              reconnectAttemptsRef.current++;
              const delay = Math.min(reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);

              // 프로덕션에서는 첫 2회 시도는 조용히 처리 (콘솔 로그 최소화)
              if (!isProduction || reconnectAttemptsRef.current > 2) {
                console.log(`🔄 [REALTIME] 재연결 시도 ${reconnectAttemptsRef.current}/${maxReconnectAttempts} (${delay}ms 후)`);
              }

              reconnectTimeoutRef.current = setTimeout(() => {
                if (isComponentMountedRef.current) {
                  subscribe();
                }
              }, delay);
            } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
              // 프로덕션에서는 최대 재연결 실패를 조용히 처리
              if (isProduction) {
                console.warn('⚠️ [REALTIME] 연결 불안정 - 백그라운드에서 재시도 중');
              } else {
                const errorMessage = `최대 재연결 시도 횟수 초과 (${maxReconnectAttempts}회)`;
                updateState({ connectionError: errorMessage });
                onErrorRef.current?.(new Error(errorMessage));
              }
            }
            break;
        }
      });

      channelRef.current = channel;

      // Phase 1: 프로덕션에서는 구독 시작 로그 최소화
      if (process.env.NODE_ENV !== 'production') {
        console.log('📡 [REALTIME] 채널 구독 시작:', {
          channelName,
          tableName,
          eventTypes,
          status: subscriptionStatus
        });
      }

    } catch (error) {
      // Phase 1: 프로덕션에서는 에러를 warn으로 처리하고 조용히 재시도
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️ [REALTIME] 일시적 연결 문제 - 자동 재시도 중');
      } else {
        console.error('❌ [REALTIME] 구독 오류:', error);
      }

      isSubscribingRef.current = false; // 오류 발생 - 플래그 해제
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      updateState({
        isConnected: false,
        isConnecting: false,
        connectionError: errorMessage
      });

      // 프로덕션에서는 에러 콜백 호출 안 함 (조용한 실패)
      if (process.env.NODE_ENV !== 'production') {
        onErrorRef.current?.(error instanceof Error ? error : new Error(errorMessage));
      }
    }
  }, [tableName, eventTypes, autoConnect, reconnectDelay, updateState]);

  // 구독 해제
  const unsubscribe = useCallback(async () => {
    console.log('📡 [REALTIME] 구독 해제 시작');

    // 구독 플래그 해제
    isSubscribingRef.current = false;

    // 재연결 타이머 정리
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // 채널 구독 해제
    if (channelRef.current) {
      try {
        await channelRef.current.unsubscribe();
        console.log('✅ [REALTIME] 채널 구독 해제 완료');
      } catch (error) {
        console.error('❌ [REALTIME] 구독 해제 오류:', error);
      }
      channelRef.current = null;
    }

    updateState({
      isConnected: false,
      isConnecting: false,
      connectionError: null
    });
  }, [updateState]);

  // 수동 재연결
  const reconnect = useCallback(() => {
    console.log('🔄 [REALTIME] 수동 재연결 시도');
    reconnectAttemptsRef.current = 0;
    isSubscribingRef.current = false; // 플래그 초기화
    subscribe();
  }, [subscribe]);


  // 연결 상태 확인
  const checkConnection = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return false;

    // Supabase 채널의 상태 확인
    return channel.state === 'joined';
  }, []);

  // 초기 연결
  useEffect(() => {
    let mounted = true;
    isComponentMountedRef.current = true;

    if (autoConnect) {
      subscribe();
    }

    return () => {
      mounted = false;
      isComponentMountedRef.current = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]); // subscribe/unsubscribe 의존성 제거 - 안정적인 참조 유지

  // 페이지 가시성 변경 시 자동 재연결
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && autoConnect && !state.isConnected && isComponentMountedRef.current) {
        console.log('👁️ [REALTIME] 페이지 활성화 - 자동 재연결');
        reconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, state.isConnected]); // reconnect 의존성 제거

  // 온라인/오프라인 상태 감지
  useEffect(() => {
    const handleOnline = () => {
      if (autoConnect && !state.isConnected && isComponentMountedRef.current) {
        console.log('🌐 [REALTIME] 온라인 상태 복구 - 자동 재연결');
        reconnect();
      }
    };

    const handleOffline = () => {
      console.log('📡 [REALTIME] 오프라인 상태 감지');
      updateState({ connectionError: '네트워크 연결이 끊어졌습니다.' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, state.isConnected]); // reconnect, updateState 의존성 제거

  return {
    // 상태
    isConnected: state.isConnected,
    isConnecting: state.isConnecting,
    connectionError: state.connectionError,
    lastEvent: state.lastEvent,
    subscriptionCount: state.subscriptionCount,

    // 액션
    subscribe,
    unsubscribe,
    reconnect,
    checkConnection,

    // 채널 참조 (고급 사용)
    channel: channelRef.current
  };
}

// Supabase Realtime 상태 체크 유틸리티
export function checkSupabaseRealtimeHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const testChannel = supabase.channel('health-check', {
      config: { presence: { key: 'test' } }
    });

    const timeout = setTimeout(() => {
      testChannel.unsubscribe();
      resolve(false);
    }, 5000);

    testChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        testChannel.unsubscribe();
        resolve(true);
      }
    });
  });
}

// 타입 내보내기
export type { UseSupabaseRealtimeOptions, RealtimeState };