// 안정화된 알림 훅 - Supabase Realtime 구독 + 권한 기반 필터링
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Notification {
  id: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  isRead: boolean;
  category: string;
  related_url?: string;
  metadata?: Record<string, any>;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  connectionStatus: 'connected' | 'connecting' | 'degraded' | 'offline';
  lastUpdated: number;
}

// user_created 카테고리 알림은 permission_level >= 3 이상만 표시
const ADMIN_ONLY_CATEGORIES = ['user_created', 'user_updated'];
const ADMIN_PERMISSION_THRESHOLD = 3;

export function useSimpleNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    connectionStatus: 'offline',
    lastUpdated: 0
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const cacheKey = 'notifications-cache';
  const maxCacheAge = 5 * 60 * 1000; // 5분

  // 현재 사용자의 permission_level (role 필드가 permission_level과 동일)
  const userPermissionLevel = (user as any)?.permission_level ?? (user as any)?.role ?? 1;

  // 권한 기반 알림 필터링
  const filterByPermission = useCallback((notifications: Notification[]): Notification[] => {
    return notifications.filter(notif => {
      if (ADMIN_ONLY_CATEGORIES.includes(notif.category)) {
        return userPermissionLevel >= ADMIN_PERMISSION_THRESHOLD;
      }
      return true;
    });
  }, [userPermissionLevel]);

  // 로컬 캐시 관리
  const saveToCache = useCallback((notifications: Notification[]) => {
    try {
      const cacheData = { notifications, timestamp: Date.now() };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch {
      // 캐시 저장 실패는 무시
    }
  }, []);

  const loadFromCache = useCallback((): Notification[] => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return [];

      const data = JSON.parse(cached);
      const age = Date.now() - data.timestamp;

      if (age < maxCacheAge) {
        return data.notifications || [];
      }
    } catch {
      // 캐시 로드 실패는 무시
    }
    return [];
  }, []);

  // DB에서 알림 목록 조회
  const fetchNotifications = useCallback(async (): Promise<Notification[]> => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .not('title', 'like', '%테스트%')
        .not('title', 'like', '%🧪%')
        .not('message', 'like', '%테스트%')
        .not('created_by_name', 'in', '("System Test", "테스트 관리자")')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('알림 조회 실패:', error);
        return loadFromCache();
      }

      const notifications: Notification[] = (data || []).map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        priority: n.priority as Notification['priority'],
        createdAt: n.created_at,
        isRead: false, // 전역 알림은 로컬 읽음 상태 관리
        category: n.category || '',
        related_url: n.related_url,
        metadata: n.metadata
      }));

      const filtered = filterByPermission(notifications);
      saveToCache(filtered);
      return filtered;
    } catch (error) {
      console.error('알림 조회 중 예외:', error);
      return loadFromCache();
    }
  }, [user, filterByPermission, loadFromCache, saveToCache]);

  // 알림 읽음 처리
  const markAsRead = useCallback(async (notificationId: string) => {
    setState(prev => ({
      ...prev,
      notifications: prev.notifications.map(n =>
        n.id === notificationId ? { ...n, isRead: true } : n
      )
    }));
  }, []);

  // 수동 새로고침
  const refresh = useCallback(async () => {
    const notifications = await fetchNotifications();
    setState(prev => ({
      ...prev,
      notifications,
      lastUpdated: Date.now()
    }));
  }, [fetchNotifications]);

  // Supabase Realtime 구독 설정
  useEffect(() => {
    if (!user) return;

    let mounted = true;

    const setupRealtime = async () => {
      // 초기 데이터 로드 (캐시 우선)
      const cached = loadFromCache();
      if (cached.length > 0 && mounted) {
        setState(prev => ({ ...prev, notifications: cached }));
      }

      // DB에서 최신 데이터 로드
      const fresh = await fetchNotifications();
      if (mounted) {
        setState(prev => ({
          ...prev,
          notifications: fresh,
          connectionStatus: 'connecting',
          lastUpdated: Date.now()
        }));
      }

      // Realtime 채널 구독
      const channel = supabase
        .channel(`notifications:global`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications'
          },
          (payload) => {
            if (!mounted) return;

            const newNotif = payload.new as any;

            // 만료된 알림 무시
            if (newNotif.expires_at && new Date(newNotif.expires_at) < new Date()) {
              return;
            }

            // 테스트 알림 무시
            if (
              newNotif.title?.includes('테스트') ||
              newNotif.title?.includes('🧪') ||
              newNotif.message?.includes('테스트') ||
              newNotif.created_by_name === 'System Test' ||
              newNotif.created_by_name === '테스트 관리자'
            ) {
              return;
            }

            const notification: Notification = {
              id: newNotif.id,
              title: newNotif.title,
              message: newNotif.message,
              priority: newNotif.priority as Notification['priority'],
              createdAt: newNotif.created_at,
              isRead: false,
              category: newNotif.category || '',
              related_url: newNotif.related_url,
              metadata: newNotif.metadata
            };

            // 권한 기반 필터링
            if (ADMIN_ONLY_CATEGORIES.includes(notification.category)) {
              const currentPermLevel =
                (user as any)?.permission_level ?? (user as any)?.role ?? 1;
              if (currentPermLevel < ADMIN_PERMISSION_THRESHOLD) {
                console.log('⛔ [NOTIFICATIONS] 권한 부족으로 알림 무시:', {
                  category: notification.category,
                  userLevel: currentPermLevel,
                  required: ADMIN_PERMISSION_THRESHOLD
                });
                return;
              }
            }

            console.log('🔔 [NOTIFICATIONS] 실시간 알림 수신:', {
              id: notification.id,
              category: notification.category,
              title: notification.title
            });

            setState(prev => {
              // 중복 방지
              if (prev.notifications.some(n => n.id === notification.id)) return prev;

              const updated = [notification, ...prev.notifications].slice(0, 100);
              saveToCache(updated);

              return {
                ...prev,
                notifications: updated,
                lastUpdated: Date.now()
              };
            });

            // 브라우저 알림
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(notification.title, {
                body: notification.message,
                icon: '/icon-192x192.png',
                tag: notification.id
              });
            }
          }
        )
        .subscribe((status) => {
          if (!mounted) return;
          console.log('📡 [NOTIFICATIONS] Realtime 구독 상태:', status);

          if (status === 'SUBSCRIBED') {
            setState(prev => ({ ...prev, connectionStatus: 'connected' }));
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setState(prev => ({ ...prev, connectionStatus: 'degraded' }));
          }
        });

      channelRef.current = channel;
    };

    setupRealtime();

    return () => {
      mounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id]); // user.id가 바뀔 때만 재구독

  // 읽지 않은 알림 수 계산
  useEffect(() => {
    const unreadCount = state.notifications.filter(n => !n.isRead).length;
    setState(prev => ({ ...prev, unreadCount }));
  }, [state.notifications]);

  return {
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    connectionStatus: state.connectionStatus,
    lastUpdated: state.lastUpdated,
    markAsRead,
    refresh
  };
}
