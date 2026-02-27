// lib/hooks/useSimpleNotifications.ts - Supabase Realtime 기반 알림 시스템 + 권한 필터링
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  read: boolean;
  related_url?: string;
  metadata?: Record<string, any>;
  type?: 'global' | 'task';
}

export interface UseSimpleNotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  isConnected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'connecting';
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearNotification: (notificationId: string) => void;
  clearAllNotifications: () => void;
  refreshNotifications: () => Promise<void>;
  isPollingMode: boolean;
  reconnect: () => Promise<void>;
}

// user_created 등 관리자 전용 카테고리
const ADMIN_ONLY_CATEGORIES = ['user_created', 'user_updated'];
const ADMIN_PERMISSION_THRESHOLD = 3;

export function useSimpleNotifications(
  userId?: string,
  userPermissionLevel?: number
): UseSimpleNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readStateCache, setReadStateCache] = useState<Set<string>>(new Set());
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'disconnected' | 'error' | 'connecting'
  >('connecting');
  const channelRef = useRef<RealtimeChannel | null>(null);

  // 권한 기반 필터링
  const filterByPermission = useCallback(
    (items: NotificationItem[]): NotificationItem[] => {
      return items.filter(notif => {
        if (ADMIN_ONLY_CATEGORIES.includes(notif.category || '')) {
          return (userPermissionLevel ?? 1) >= ADMIN_PERMISSION_THRESHOLD;
        }
        return true;
      });
    },
    [userPermissionLevel]
  );

  // 알림 로드
  const loadNotifications = useCallback(async () => {
    try {
      // 전역 알림 로드
      const { data: globalNotifications, error: globalError } = await supabase
        .from('notifications')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .not('title', 'like', '%테스트%')
        .not('title', 'like', '%🧪%')
        .not('message', 'like', '%테스트%')
        .not('created_by_name', 'in', '("System Test", "테스트 관리자")')
        .order('created_at', { ascending: false })
        .limit(20);

      if (globalError) {
        console.error('🔴 [SIMPLE-NOTIFICATIONS] 전역 알림 로드 오류:', globalError);
      }

      let taskNotifications: any[] = [];

      // 사용자별 업무 알림 로드
      if (userId) {
        const { data: userTaskNotifications, error: taskError } = await supabase
          .from('task_notifications')
          .select('*')
          .eq('user_id', userId)
          .eq('is_read', false)
          .gt('expires_at', new Date().toISOString())
          .not('message', 'like', '%테스트%')
          .not('message', 'like', '%🧪%')
          .not('user_id', 'eq', 'test-user')
          .order('created_at', { ascending: false })
          .limit(20);

        if (taskError) {
          console.error('🔴 [SIMPLE-NOTIFICATIONS] 업무 알림 로드 오류:', taskError);
        } else {
          taskNotifications = userTaskNotifications || [];
        }
      }

      // 알림 병합 및 표준화
      const globalItems: NotificationItem[] = (globalNotifications || []).map(notif => ({
        id: notif.id,
        title: notif.title,
        message: notif.message,
        category: notif.category,
        priority: notif.priority as NotificationItem['priority'],
        timestamp: notif.created_at,
        read: readStateCache.has(notif.id),
        related_url: notif.related_url,
        metadata: notif.metadata,
        type: 'global' as const
      }));

      const taskItems: NotificationItem[] = taskNotifications.map(notif => ({
        id: notif.id,
        title:
          notif.notification_type === 'assignment' ? '새 업무 배정' :
          notif.notification_type === 'status_change' ? '업무 상태 변경' :
          notif.notification_type === 'unassignment' ? '업무 배정 해제' : '업무 알림',
        message: notif.message,
        category: notif.notification_type,
        priority: (
          notif.priority === 'urgent' ? 'critical' :
          notif.priority === 'high' ? 'high' : 'medium'
        ) as NotificationItem['priority'],
        timestamp: notif.created_at,
        read: readStateCache.has(notif.id) || notif.is_read,
        related_url: `/admin/tasks?task=${notif.task_id}`,
        metadata: {
          ...notif.metadata,
          task_id: notif.task_id,
          business_name: notif.business_name,
          notification_type: notif.notification_type
        },
        type: 'task' as const
      }));

      const combined = filterByPermission([...globalItems, ...taskItems])
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setNotifications(combined);
    } catch (error) {
      console.error('🔴 [SIMPLE-NOTIFICATIONS] 알림 로드 실패:', error);
    }
  }, [userId, readStateCache, filterByPermission]);

  // Supabase Realtime 구독 설정
  useEffect(() => {
    let mounted = true;

    // 초기 로드
    loadNotifications();

    // Realtime 채널 구독 (notifications 테이블 INSERT 감시)
    const channel = supabase
      .channel(`simple-notifications:${userId || 'anon'}`)
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

          // 만료 확인
          if (newNotif.expires_at && new Date(newNotif.expires_at) < new Date()) return;

          // 테스트 알림 무시
          if (
            newNotif.title?.includes('테스트') ||
            newNotif.title?.includes('🧪') ||
            newNotif.message?.includes('테스트') ||
            newNotif.created_by_name === 'System Test' ||
            newNotif.created_by_name === '테스트 관리자'
          ) return;

          // 관리자 전용 알림 권한 확인
          if (ADMIN_ONLY_CATEGORIES.includes(newNotif.category || '')) {
            if ((userPermissionLevel ?? 1) < ADMIN_PERMISSION_THRESHOLD) {
              console.log('⛔ [SIMPLE-NOTIFICATIONS] 권한 부족 - 알림 무시:', {
                category: newNotif.category,
                userLevel: userPermissionLevel,
                required: ADMIN_PERMISSION_THRESHOLD
              });
              return;
            }
          }

          console.log('🔔 [SIMPLE-NOTIFICATIONS] 실시간 알림 수신:', {
            id: newNotif.id,
            category: newNotif.category,
            title: newNotif.title
          });

          const newItem: NotificationItem = {
            id: newNotif.id,
            title: newNotif.title,
            message: newNotif.message,
            category: newNotif.category,
            priority: newNotif.priority as NotificationItem['priority'],
            timestamp: newNotif.created_at,
            read: false,
            related_url: newNotif.related_url,
            metadata: newNotif.metadata,
            type: 'global'
          };

          setNotifications(prev => {
            if (prev.some(n => n.id === newItem.id)) return prev;
            return [newItem, ...prev].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
          });

          // 브라우저 알림
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newItem.title, {
              body: newItem.message,
              icon: '/favicon.ico',
              tag: newItem.id,
              requireInteraction: newItem.priority === 'critical'
            });
          }
        }
      )
      .subscribe((status) => {
        if (!mounted) return;
        console.log('📡 [SIMPLE-NOTIFICATIONS] Realtime 구독 상태:', status);

        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnectionStatus('error');
        } else if (status === 'TIMED_OUT') {
          setConnectionStatus('disconnected');
        }
      });

    channelRef.current = channel;

    return () => {
      mounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, userPermissionLevel]); // 유저 또는 권한 변경 시 재구독

  // 알림 읽음 처리
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const notification = notifications.find(n => n.id === notificationId);
      if (!notification) return;

      setReadStateCache(prev => new Set([...prev, notificationId]));

      if (notification.type === 'task') {
        await supabase
          .from('task_notifications')
          .update({ is_read: true })
          .eq('id', notificationId);
      }

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error('🔴 [SIMPLE-NOTIFICATIONS] 읽음 처리 실패:', error);
    }
  }, [notifications]);

  // 모든 알림 읽음 처리
  const markAllAsRead = useCallback(async () => {
    try {
      if (userId) {
        await supabase
          .from('task_notifications')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false);
      }

      const allIds = notifications.map(n => n.id);
      setReadStateCache(prev => new Set([...prev, ...allIds]));
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('🔴 [SIMPLE-NOTIFICATIONS] 모든 읽음 처리 실패:', error);
    }
  }, [userId, notifications]);

  // 알림 제거
  const clearNotification = useCallback(async (notificationId: string) => {
    try {
      const notification = notifications.find(n => n.id === notificationId);
      if (!notification) return;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));

      if (notification.type === 'task') {
        await fetch('/api/notifications/history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
          },
          body: JSON.stringify({ action: 'archive_specific', notificationIds: [notificationId] })
        });
      } else {
        await fetch(`/api/notifications/${notificationId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
        });
      }
    } catch (error) {
      console.error('🔴 [SIMPLE-NOTIFICATIONS] 알림 제거 오류:', error);
    }
  }, [notifications]);

  // 모든 알림 제거
  const clearAllNotifications = useCallback(async () => {
    try {
      if (userId) {
        await fetch('/api/notifications/history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
          },
          body: JSON.stringify({ action: 'archive_read', olderThanDays: 0 })
        });
      }

      setNotifications([]);
      setReadStateCache(new Set());
    } catch (error) {
      console.error('🔴 [SIMPLE-NOTIFICATIONS] 알림 정리 오류:', error);
      setNotifications([]);
    }
  }, [userId]);

  // 새로고침
  const refreshNotifications = useCallback(async () => {
    await loadNotifications();
  }, [loadNotifications]);

  // 재연결
  const reconnect = useCallback(async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setConnectionStatus('connecting');
    await loadNotifications();
  }, [loadNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
    refreshNotifications,
    isPollingMode: false, // Realtime 모드
    reconnect
  };
}
