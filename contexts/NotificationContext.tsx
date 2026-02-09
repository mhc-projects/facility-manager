'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { TokenManager } from '@/lib/api-client';
import {
  subscribeToRealtime as subscribeToRealtimeManager,
  unsubscribeFromRealtime as unsubscribeFromRealtimeManager,
  reconnectRealtime as reconnectRealtimeManager
} from '@/lib/realtime-manager';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { InAppNotificationContainer, type InAppToastNotification } from '@/components/ui/InAppNotificationToast';

// 알림 타입 정의
export type NotificationCategory =
  | 'task_created' | 'task_updated' | 'task_assigned' | 'task_status_changed' | 'task_completed'
  | 'system_maintenance' | 'system_update'
  | 'security_alert' | 'login_attempt'
  | 'report_submitted' | 'report_approved'
  | 'user_created' | 'user_updated'
  | 'business_added' | 'file_uploaded'
  | 'backup_completed' | 'maintenance_scheduled';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  relatedResourceType?: string;
  relatedResourceId?: string;
  relatedUrl?: string;
  metadata?: Record<string, any>;
  createdById?: string;
  createdByName?: string;
  createdAt: string;
  expiresAt: string;
  isSystemNotification: boolean;
  isRead: boolean;
}

export interface NotificationSettings {
  taskNotifications: boolean;
  systemNotifications: boolean;
  securityNotifications: boolean;
  reportNotifications: boolean;
  userNotifications: boolean;
  businessNotifications: boolean;
  fileNotifications: boolean;
  maintenanceNotifications: boolean;
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  soundNotificationsEnabled: boolean;
  showLowPriority: boolean;
  showMediumPriority: boolean;
  showHighPriority: boolean;
  showCriticalPriority: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursEnabled: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  settings: NotificationSettings | null;
  loading: boolean;

  // 알림 관리
  fetchNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  deleteAllNotifications: () => Promise<void>;
  deleteReadNotifications: () => Promise<void>;

  // 알림 생성
  createNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'expiresAt' | 'isRead'>) => Promise<void>;

  // 설정 관리
  updateSettings: (newSettings: Partial<NotificationSettings>) => Promise<void>;

  // Supabase Realtime 연결 상태
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  lastEventTime: Date | null;

  // 실시간 업데이트
  subscribeToRealtime: () => void;
  unsubscribeFromRealtime: () => void;
  reconnectRealtime: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // 인앱 토스트 알림 상태 (Banner 모드 대응)
  const [inAppToasts, setInAppToasts] = useState<InAppToastNotification[]>([]);

  // Supabase Realtime 실시간 알림 처리 - 테이블 미존재 시 graceful degradation
  const [realtimeConnectionState, setRealtimeConnectionState] = useState({
    isConnected: false,
    isConnecting: false,
    connectionError: null as string | null,
    lastEventTime: null as Date | null
  });

  // 🚀 Global Realtime Manager 사용 - 즉시 연결 경험 제공
  useEffect(() => {
    if (!user) return;

    const subscriptionId = `notifications-${user.id}`;

    logger.info('NOTIFICATIONS', 'Global Realtime Manager 구독 시작');

    // Optimistic UI: 즉시 연결 상태 표시
    setRealtimeConnectionState({
      isConnected: true,
      isConnecting: false,
      connectionError: null,
      lastEventTime: new Date()
    });

    // Global Manager를 통한 구독
    subscribeToRealtimeManager(
      subscriptionId,
      'task_notifications',
      ['INSERT', 'UPDATE'],
      handleRealtimeNotification,
      (state: 'connected' | 'connecting' | 'disconnected', error?: string) => {
        logger.debug('REALTIME', `연결 상태 업데이트: ${state}`, error ? { error } : undefined);

        // 연결 상태 업데이트
        if (state === 'connected') {
          setRealtimeConnectionState({
            isConnected: true,
            isConnecting: false,
            connectionError: null,
            lastEventTime: new Date()
          });
        } else if (state === 'connecting') {
          setRealtimeConnectionState(prev => ({
            ...prev,
            isConnecting: true,
            connectionError: null
          }));
        } else if (state === 'disconnected') {
          // 테이블 미존재 오류는 무시 (graceful degradation)
          if (error && !error.includes('relation')) {
            setRealtimeConnectionState(prev => ({
              ...prev,
              isConnected: false,
              isConnecting: false,
              connectionError: error
            }));
          }
        }
      }
    );

    return () => {
      logger.info('NOTIFICATIONS', 'Global Realtime Manager 구독 해제');
      unsubscribeFromRealtimeManager(subscriptionId);
    };
  }, [user]);

  // 단순화된 연결 상태 (Optimistic UI 적용)
  const isConnected = realtimeConnectionState.isConnected;
  const isConnecting = realtimeConnectionState.isConnecting;
  const connectionError = realtimeConnectionState.connectionError;
  const lastEventTime = realtimeConnectionState.lastEventTime;

  // 실시간 알림 처리 함수
  function handleRealtimeNotification(payload: RealtimePostgresChangesPayload<any>) {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      logger.debug('REALTIME', '알림 이벤트 수신', {
        eventType,
        recordId: (newRecord as any)?.id || (oldRecord as any)?.id,
        timestamp: new Date().toISOString()
      });

      if (eventType === 'INSERT' && newRecord) {
        // ✅ FIX: 현재 로그인한 사용자의 알림만 처리
        if (newRecord.user_id !== user?.id) {
          logger.debug('REALTIME', 'INSERT: 다른 사용자의 알림 - 무시', {
            notificationUserId: newRecord.user_id,
            currentUserId: user?.id
          });
          return;
        }

        logger.debug('REALTIME', 'INSERT: 새 알림 추가');

        // task_notifications 구조에 맞게 새 알림 추가
        const newNotification: Notification = {
          id: newRecord.id,
          title: `업무 알림: ${newRecord.business_name}`,
          message: newRecord.message,
          category: (newRecord.notification_type || 'task_updated') as NotificationCategory,
          priority: newRecord.priority as NotificationPriority,
          relatedResourceType: 'task',
          relatedResourceId: newRecord.task_id,
          relatedUrl: `/admin/tasks/${newRecord.task_id}`,
          metadata: { business_name: newRecord.business_name, task_id: newRecord.task_id },
          createdById: newRecord.user_id,
          createdByName: newRecord.user_name,
          createdAt: newRecord.created_at,
          expiresAt: newRecord.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isSystemNotification: false,
          isRead: newRecord.is_read
        };

        // 중복 방지: 이미 존재하는 알림인지 확인
        setNotifications(prev => {
          const exists = prev.some(n => n.id === newRecord.id);
          if (exists) {
            logger.debug('REALTIME', 'INSERT: 중복 알림 감지 - 기존 알림 업데이트');
            return prev.map(n => n.id === newRecord.id ? newNotification : n);
          }
          logger.debug('REALTIME', 'INSERT: 새 알림 추가 완료');
          return [newNotification, ...prev.slice(0, 49)]; // 최대 50개 유지
        });

        // 브라우저 알림 표시
        // settings가 로드되지 않았을 때는 기본값 true 사용 (defaultSettings.pushNotificationsEnabled: true)
        const pushEnabled = settings?.pushNotificationsEnabled ?? true;

        logger.debug('BROWSER-NOTIFICATION', '브라우저 알림 조건 확인:', {
          pushEnabled,
          settingsLoaded: settings !== null,
          notificationSupported: 'Notification' in window,
          permission: typeof Notification !== 'undefined' ? Notification.permission : 'undefined',
          title: newNotification.title
        });

        if (pushEnabled && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const notification = new Notification(newNotification.title, {
              body: newNotification.message,
              icon: '/icon.png',
              badge: '/icon.png',
              tag: newNotification.id,
              requireInteraction: newNotification.priority === 'critical' || newNotification.priority === 'high',
              silent: false
            });

            logger.info('BROWSER-NOTIFICATION', '브라우저 알림 생성 성공');

            notification.onclick = () => {
              logger.debug('BROWSER-NOTIFICATION', '브라우저 알림 클릭됨');
              if (newNotification.relatedUrl) {
                window.focus();
                window.open(newNotification.relatedUrl, '_blank');
              }
              notification.close();
            };
          } catch (error) {
            logger.error('BROWSER-NOTIFICATION', '브라우저 알림 생성 실패', error);
          }
        } else {
          logger.warn('BROWSER-NOTIFICATION', '브라우저 알림 조건 미충족', {
            pushEnabled,
            settingsLoaded: settings !== null,
            hasNotificationAPI: 'Notification' in window,
            permission: typeof Notification !== 'undefined' ? Notification.permission : 'undefined'
          });
        }

        // 인앱 토스트 알림 표시 (Banner 모드 대응)
        // 브라우저 알림이 활성화되어 있으면 인앱 토스트도 함께 표시
        if (pushEnabled) {
          // Priority 매핑: medium -> normal
          const toastPriority = newNotification.priority === 'medium' ? 'normal' : newNotification.priority;

          const toastNotification: InAppToastNotification = {
            id: newNotification.id,
            title: newNotification.title,
            message: newNotification.message,
            priority: toastPriority as 'low' | 'normal' | 'high' | 'critical',
            onClick: newNotification.relatedUrl ? () => {
              window.open(newNotification.relatedUrl, '_blank');
            } : undefined
          };

          setInAppToasts(prev => [toastNotification, ...prev.slice(0, 4)]); // 최대 5개 유지
        }

        // 소리 알림 (settings가 로드되지 않았을 때는 기본값 true 사용)
        const soundEnabled = settings?.soundNotificationsEnabled ?? true;
        if (soundEnabled) {
          playNotificationSound(newNotification.priority);
        }

      } else if (eventType === 'UPDATE' && newRecord) {
        // ✅ FIX: 현재 로그인한 사용자의 알림만 처리
        if (newRecord.user_id !== user?.id) {
          logger.debug('REALTIME', 'UPDATE: 다른 사용자의 알림 - 무시', {
            notificationUserId: newRecord.user_id,
            currentUserId: user?.id
          });
          return;
        }

        // is_deleted가 true로 변경된 경우 삭제 처리 (소프트 삭제)
        if (newRecord.is_deleted === true) {
          logger.debug('REALTIME', 'UPDATE: 소프트 삭제 감지 - UI에서 제거');
          setNotifications(prev =>
            prev.filter(notification => notification.id !== newRecord.id)
          );
        } else {
          // 일반 알림 상태 업데이트 (읽음 처리 등)
          logger.debug('REALTIME', 'UPDATE: 알림 상태 업데이트');
          setNotifications(prev =>
            prev.map(notification =>
              notification.id === newRecord.id
                ? { ...notification, isRead: newRecord.is_read }
                : notification
            )
          );
        }
      } else if (eventType === 'DELETE' && oldRecord) {
        // 실제 DELETE 이벤트 처리
        logger.debug('REALTIME', 'DELETE: 알림 삭제');
        setNotifications(prev =>
          prev.filter(notification => notification.id !== oldRecord.id)
        );
      }
    } catch (error) {
      logger.error('REALTIME', '알림 처리 오류', error);
    }
  }

  // 알림 목록 조회 - Supabase Realtime으로 실시간 업데이트되므로 초기 로드만 담당
  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);

      const token = TokenManager.getToken();
      if (!token || token === 'null' || token === 'undefined' || token.trim() === '') {
        logger.warn('NOTIFICATIONS', '토큰이 없음 - 알림 조회 스킵');
        setLoading(false);
        return;
      }

      // 토큰 형식 검증 (JWT 기본 구조 체크)
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        logger.warn('NOTIFICATIONS', 'JWT 토큰 형식이 잘못됨 - 알림 조회 스킵');
        setLoading(false);
        return;
      }

      // 토큰 유효성 검사
      if (!TokenManager.isTokenValid(token)) {
        logger.warn('NOTIFICATIONS', '토큰이 만료됨 - 알림 조회 스킵');
        setLoading(false);
        return;
      }

      logger.debug('NOTIFICATIONS', '토큰 확인됨, 알림 조회 시작');

      // 일반 알림과 업무 알림을 동시에 조회
      const [generalResponse, taskResponse] = await Promise.all([
        fetch('/api/notifications', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch('/api/notifications?taskNotifications=true', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ]);

      // 인증 오류인 경우 토큰 정리
      if (generalResponse.status === 401 || taskResponse.status === 401) {
        logger.warn('NOTIFICATIONS', '인증 만료됨 - 토큰 정리');
        TokenManager.removeTokens();
        setLoading(false);
        return;
      }

      logger.debug('NOTIFICATIONS', 'API 응답 상태', {
        generalStatus: generalResponse.status,
        taskStatus: taskResponse.status,
        generalOk: generalResponse.ok,
        taskOk: taskResponse.ok
      });

      // 개별 응답 처리 (하나가 실패해도 다른 하나는 성공할 수 있음)
      let generalData: any = { success: true, data: [] };
      let taskData: any = { success: true, taskNotifications: [] };

      // 일반 알림 처리
      if (generalResponse.ok) {
        try {
          generalData = await generalResponse.json();
          const generalCount = generalData?.data?.notifications?.length || generalData?.notifications?.length || 0;
          logger.info('NOTIFICATIONS', `일반 알림 조회 성공: ${generalCount}개`);
        } catch (error) {
          logger.error('NOTIFICATIONS', '일반 알림 JSON 파싱 실패', error);
          generalData = { success: false, data: [] };
        }
      } else {
        logger.warn('NOTIFICATIONS', `일반 알림 API 실패: ${generalResponse.status} ${generalResponse.statusText}`);
      }

      // 업무 알림 처리 (500 오류 허용)
      if (taskResponse.ok) {
        try {
          taskData = await taskResponse.json();
          const taskCount = taskData?.data?.taskNotifications?.length || taskData?.taskNotifications?.length || 0;
          logger.info('NOTIFICATIONS', `업무 알림 조회 성공: ${taskCount}개`);
        } catch (error) {
          logger.error('NOTIFICATIONS', '업무 알림 JSON 파싱 실패', error);
          taskData = { success: false, taskNotifications: [] };
        }
      } else if (taskResponse.status === 500) {
        logger.warn('NOTIFICATIONS', '업무 알림 API 500 오류 - task_notifications 테이블 미존재로 예상됨');
        // 500 오류인 경우에도 빈 데이터로 처리하여 일반 알림은 정상 동작하도록 함
        try {
          const errorData = await taskResponse.json();
          logger.debug('NOTIFICATIONS', '500 오류 상세', errorData);
          if (errorData.success === false && errorData.taskNotifications) {
            // API에서 graceful degradation 응답을 준 경우
            taskData = errorData;
          }
        } catch (error) {
          logger.warn('NOTIFICATIONS', '500 오류 응답 파싱 불가 - 빈 데이터 사용');
        }
      } else {
        logger.warn('NOTIFICATIONS', `업무 알림 API 기타 오류: ${taskResponse.status} ${taskResponse.statusText}`);
      }

      const allNotifications: Notification[] = [];

      // 일반 알림 변환 (기존 notifications 테이블)
      // API 응답 구조: { success: true, data: { notifications: [], count: 0, unreadCount: 0 } }
      const generalNotificationsArray = generalData?.data?.notifications || generalData?.notifications || [];
      if (generalData.success && Array.isArray(generalNotificationsArray)) {
        const generalNotifications = generalNotificationsArray.map((notif: any) => ({
          id: notif.id,
          title: notif.title,
          message: notif.message,
          category: notif.category as NotificationCategory,
          priority: notif.priority as NotificationPriority,
          relatedResourceType: notif.relatedResourceType,
          relatedResourceId: notif.relatedResourceId,
          relatedUrl: notif.relatedUrl,
          metadata: notif.metadata || {},
          createdById: notif.createdById,
          createdByName: notif.createdByName,
          createdAt: notif.createdAt,
          expiresAt: notif.expiresAt,
          isSystemNotification: notif.isSystemNotification,
          isRead: notif.isRead
        }));
        allNotifications.push(...generalNotifications);
      }

      // 업무 알림 변환 (task_notifications 테이블)
      // API 응답 구조: { success: true, data: { taskNotifications: [], count: 0, unreadCount: 0 } }
      const taskNotificationsArray = taskData?.data?.taskNotifications || taskData?.taskNotifications || [];
      if (taskData.success && Array.isArray(taskNotificationsArray)) {
        const taskNotifications = taskNotificationsArray.map((notif: any) => ({
          id: `task-${notif.id}`, // ID 충돌 방지
          title: `업무 할당: ${notif.business_name}`, // 업무 알림 제목
          message: notif.message,
          category: 'task_assigned' as NotificationCategory,
          priority: (notif.priority === 'urgent' ? 'critical' : notif.priority) as NotificationPriority,
          relatedResourceType: 'task',
          relatedResourceId: notif.task_id,
          relatedUrl: `/admin/tasks/${notif.task_id}`,
          metadata: {
            business_name: notif.business_name,
            task_id: notif.task_id,
            notification_type: notif.notification_type
          },
          createdById: notif.user_id,
          createdByName: notif.user_name || '시스템',
          createdAt: notif.created_at,
          expiresAt: notif.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isSystemNotification: false,
          isRead: notif.is_read
        }));
        allNotifications.push(...taskNotifications);
      }

      // 생성 시간 순으로 정렬 (최신 순)
      allNotifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setNotifications(allNotifications);

      logger.info('NOTIFICATIONS', '초기 알림 로드 완료', {
        total: allNotifications.length,
        unread: allNotifications.filter((n: any) => !n.isRead).length,
        general: generalData.success ? (generalData.data?.length || 0) : 0,
        tasks: taskData.success ? (taskData.taskNotifications?.length || 0) : 0,
        generalApiOk: generalResponse.ok,
        taskApiOk: taskResponse.ok
      });
    } catch (error) {
      logger.error('NOTIFICATIONS', '알림 조회 오류', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 알림 설정 조회
  const fetchSettings = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/notifications/settings', {
        headers: {
          'Authorization': `Bearer ${TokenManager.getToken()}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          logger.warn('NOTIFICATIONS', '인증 실패 - 캐시된 설정 확인 후 기본 설정 사용');

          // 먼저 캐시된 설정이 있는지 확인
          const cachedSettings = localStorage.getItem('notification-settings');
          if (cachedSettings) {
            try {
              const parsed = JSON.parse(cachedSettings);
              setSettings(parsed);
              logger.info('NOTIFICATIONS', '캐시된 설정 로드 성공');
              return;
            } catch (error) {
              logger.warn('NOTIFICATIONS', '캐시된 설정 파싱 실패', error);
            }
          }

          // 캐시된 설정이 없으면 기본 설정 사용
          const defaultSettings = {
            taskNotifications: true,
            systemNotifications: true,
            securityNotifications: true,
            reportNotifications: true,
            userNotifications: true,
            businessNotifications: true,
            fileNotifications: true,
            maintenanceNotifications: true,
            pushNotificationsEnabled: true,
            emailNotificationsEnabled: false,
            soundNotificationsEnabled: true,
            showLowPriority: true,
            showMediumPriority: true,
            showHighPriority: true,
            showCriticalPriority: true,
            quietHoursStart: '22:00:00',
            quietHoursEnd: '08:00:00',
            quietHoursEnabled: false
          };
          setSettings(defaultSettings);

          // 기본 설정을 캐시에 저장
          localStorage.setItem('notification-settings', JSON.stringify(defaultSettings));
          logger.info('NOTIFICATIONS', '기본 설정 적용 및 캐시 저장');
          return;
        }
        throw new Error('알림 설정을 불러오는데 실패했습니다.');
      }

      const data = await response.json();
      if (data.success) {
        setSettings(data.data);
        // 성공적으로 로드된 설정을 캐시에 저장
        localStorage.setItem('notification-settings', JSON.stringify(data.data));
        logger.info('NOTIFICATIONS', '설정 로드 성공 및 캐시 저장');
      }
    } catch (error) {
      logger.error('NOTIFICATIONS', '알림 설정 조회 오류', error);
    }
  }, [user]);

  // 알림 읽음 처리
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;

    logger.debug('OPTIMISTIC', `markAsRead 시작 - ID: ${notificationId}`);

    // 낙관적 업데이트: 즉시 UI에서 읽음 처리
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === notificationId
          ? { ...notification, isRead: true }
          : notification
      )
    );

    try {
      const token = TokenManager.getToken();
      if (!token || !TokenManager.isTokenValid(token)) {
        logger.warn('OPTIMISTIC', 'markAsRead: 토큰이 유효하지 않음 - 롤백');
        // 낙관적 업데이트 롤백
        setNotifications(prev =>
          prev.map(notification =>
            notification.id === notificationId
              ? { ...notification, isRead: false }
              : notification
          )
        );
        return;
      }

      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        logger.error('OPTIMISTIC', 'markAsRead API 실패 - 롤백');
        // 실패 시 롤백
        setNotifications(prev =>
          prev.map(notification =>
            notification.id === notificationId
              ? { ...notification, isRead: false }
              : notification
          )
        );
        throw new Error('알림 읽음 처리에 실패했습니다.');
      }

      logger.info('NOTIFICATIONS', 'markAsRead 완료');
    } catch (error) {
      logger.error('NOTIFICATIONS', '알림 읽음 처리 오류', error);
    }
  }, [user]);

  // 모든 알림 읽음 처리 (낙관적 업데이트 + 롤백)
  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    logger.debug('OPTIMISTIC', '모든 알림 읽음 처리 시작');

    // 이전 상태 백업 (롤백용)
    const previousNotifications = [...notifications];

    // 낙관적 업데이트: 즉시 UI 업데이트
    setNotifications(prev => {
      const updated = prev.map(notification => ({ ...notification, isRead: true }));
      logger.debug('OPTIMISTIC', '낙관적 UI 업데이트', {
        before: prev.filter(n => !n.isRead).length,
        after: 0
      });
      return updated;
    });

    try {
      const token = TokenManager.getToken();
      if (!token || !TokenManager.isTokenValid(token)) {
        logger.warn('OPTIMISTIC', 'markAllAsRead: 토큰이 유효하지 않음 - 롤백');
        // 롤백
        setNotifications(previousNotifications);
        return;
      }

      const response = await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      logger.debug('NOTIFICATIONS', 'markAllAsRead API 응답', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        // 실패 시 롤백
        logger.error('OPTIMISTIC', 'markAllAsRead API 실패 - 롤백');
        setNotifications(previousNotifications);
        throw new Error(`모든 알림 읽음 처리에 실패했습니다. Status: ${response.status}`);
      }

      const data = await response.json();
      logger.info('NOTIFICATIONS', '서버 응답', data);

      // Realtime 연결이 없는 경우에만 서버 상태 재확인
      if (!isConnected) {
        logger.warn('NOTIFICATIONS', 'Realtime 연결 없음 - 서버에서 최신 상태 확인');
        setTimeout(() => {
          fetchNotifications();
        }, 1000);
      }

    } catch (error) {
      logger.error('NOTIFICATIONS', '모든 알림 읽음 처리 오류', error);
      // 오류 발생 시 롤백 (이미 위에서 롤백했지만 안전을 위해 재확인)
      setNotifications(previousNotifications);
      throw error;
    }
  }, [user, notifications, isConnected, fetchNotifications]);

  // 알림 삭제
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user) return;

    logger.debug('OPTIMISTIC', `deleteNotification 시작 - ID: ${notificationId}`);

    // 삭제 전 알림 백업 (롤백용)
    let deletedNotification: Notification | undefined;
    setNotifications(prev => {
      deletedNotification = prev.find(n => n.id === notificationId);
      return prev;
    });

    // 낙관적 업데이트: 즉시 UI에서 제거
    setNotifications(prev =>
      prev.filter(notification => notification.id !== notificationId)
    );

    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${TokenManager.getToken()}`
        }
      });

      if (!response.ok) {
        logger.error('OPTIMISTIC', 'deleteNotification API 실패 - 롤백');
        // 실패 시 롤백: 삭제된 알림을 다시 추가
        if (deletedNotification) {
          setNotifications(prev => [deletedNotification!, ...prev]);
        }

        // 403 오류 시 권한 부족 메시지 표시
        if (response.status === 403) {
          const errorData = await response.json();
          const errorMessage = errorData.error?.message || '알림을 삭제할 권한이 없습니다.';

          setInAppToasts(prev => [{
            id: `delete-error-${Date.now()}`,
            title: '❌ 삭제 실패',
            message: errorMessage,
            priority: 'high'
          }, ...prev.slice(0, 4)]);
        }

        throw new Error('알림 삭제에 실패했습니다.');
      }

      // 삭제 성공 토스트 메시지 표시
      const result = await response.json();
      const successMessage = result.data?.message || '알림이 삭제되었습니다.';

      setInAppToasts(prev => [{
        id: `delete-success-${Date.now()}`,
        title: '✅ 삭제 완료',
        message: successMessage,
        priority: 'normal'
      }, ...prev.slice(0, 4)]);

      logger.info('NOTIFICATIONS', 'deleteNotification 완료');
    } catch (error) {
      logger.error('NOTIFICATIONS', '알림 삭제 오류', error);
    }
  }, [user]);

  // 모든 알림 완전 삭제
  const deleteAllNotifications = useCallback(async () => {
    if (!user) return;

    try {
      const token = TokenManager.getToken();
      if (!token || !TokenManager.isTokenValid(token)) {
        logger.warn('NOTIFICATIONS', 'deleteAllNotifications: 토큰이 유효하지 않음');
        return;
      }

      const response = await fetch('/api/notifications/delete-all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('모든 알림 삭제에 실패했습니다.');
      }

      const data = await response.json();
      logger.info('NOTIFICATIONS', '모든 알림 삭제 완료', data.data);

      // 로컬 상태 초기화
      setNotifications([]);

    } catch (error) {
      logger.error('NOTIFICATIONS', '모든 알림 삭제 오류', error);
      throw error;
    }
  }, [user]);

  // 읽은 알림만 삭제
  const deleteReadNotifications = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/notifications/delete-all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TokenManager.getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deleteType: 'read'
        })
      });

      if (!response.ok) {
        throw new Error('읽은 알림 삭제에 실패했습니다.');
      }

      const data = await response.json();
      logger.info('NOTIFICATIONS', '읽은 알림 삭제 완료', data.data);

      // 로컬 상태 업데이트 (읽은 알림만 제거)
      setNotifications(prev =>
        prev.filter(notification => !notification.isRead)
      );

    } catch (error) {
      logger.error('NOTIFICATIONS', '읽은 알림 삭제 오류', error);
      throw error;
    }
  }, [user]);

  // 알림 생성
  const createNotification = useCallback(async (
    notification: Omit<Notification, 'id' | 'createdAt' | 'expiresAt' | 'isRead'>
  ) => {
    if (!user) return;

    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TokenManager.getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(notification)
      });

      if (!response.ok) {
        throw new Error('알림 생성에 실패했습니다.');
      }

      const data = await response.json();
      if (data.success) {
        // 실시간으로 알림이 추가되므로 여기서는 별도 처리 불필요
        logger.info('NOTIFICATIONS', '알림이 생성되었습니다', data.data);
      }
    } catch (error) {
      logger.error('NOTIFICATIONS', '알림 생성 오류', error);
    }
  }, [user]);

  // 설정 업데이트
  const updateSettings = useCallback(async (newSettings: Partial<NotificationSettings>) => {
    if (!user) return;

    try {
      const response = await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${TokenManager.getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSettings)
      });

      if (!response.ok) {
        throw new Error('알림 설정 업데이트에 실패했습니다.');
      }

      const data = await response.json();
      if (data.success) {
        const updatedSettings = (prev: NotificationSettings | null) => prev ? { ...prev, ...newSettings } : null;
        const newSettingsData = updatedSettings(settings);
        setSettings(newSettingsData);

        // 업데이트된 설정을 캐시에 저장
        if (newSettingsData) {
          localStorage.setItem('notification-settings', JSON.stringify(newSettingsData));
          logger.info('NOTIFICATIONS', '설정 업데이트 성공 및 캐시 갱신');
        }
      }
    } catch (error) {
      logger.error('NOTIFICATIONS', '알림 설정 업데이트 오류', error);
    }
  }, [user]);

  // 실시간 구독 관리 - Global Realtime Manager 사용
  const subscribeToRealtime = useCallback(() => {
    logger.debug('REALTIME', '수동 구독 요청 (자동 연결로 인해 이미 구독됨)');
    // Global Manager는 자동으로 연결되므로 별도 작업 불필요
  }, []);

  const unsubscribeFromRealtime = useCallback(() => {
    logger.debug('REALTIME', '수동 구독 해제 요청');
    if (user) {
      const subscriptionId = `notifications-${user.id}`;
      unsubscribeFromRealtimeManager(subscriptionId);
    }
  }, [user]);

  const reconnectRealtime = useCallback(() => {
    logger.debug('REALTIME', '수동 재연결');
    reconnectRealtimeManager();
  }, []);

  // 알림 소리 재생
  const playNotificationSound = useCallback((priority: NotificationPriority) => {
    try {
      // Web Audio API를 사용하여 프로그래밍 방식으로 알림 소리 생성
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // 우선순위별 다른 주파수와 패턴
      let frequencies: number[];
      let duration: number;

      switch (priority) {
        case 'critical':
          // 긴급: 높은 음 3번 연속 (1000Hz, 1200Hz, 1000Hz)
          frequencies = [1000, 1200, 1000];
          duration = 0.15;
          break;
        case 'high':
          // 높음: 높은 음 2번 (800Hz, 1000Hz)
          frequencies = [800, 1000];
          duration = 0.15;
          break;
        case 'medium':
          // 보통: 중간 음 1번 (600Hz)
          frequencies = [600];
          duration = 0.2;
          break;
        case 'low':
          // 낮음: 낮은 음 1번 (400Hz)
          frequencies = [400];
          duration = 0.2;
          break;
        default:
          frequencies = [500];
          duration = 0.2;
      }

      const volume = 0.3; // 적당한 볼륨
      let currentTime = audioContext.currentTime;

      // 각 주파수 음을 순차적으로 재생
      frequencies.forEach((frequency) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine'; // 부드러운 사인파

        // 볼륨 페이드 인/아웃 (클릭 소리 방지)
        gainNode.gain.setValueAtTime(0, currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(volume, currentTime + duration - 0.01);
        gainNode.gain.linearRampToValueAtTime(0, currentTime + duration);

        oscillator.start(currentTime);
        oscillator.stop(currentTime + duration);

        currentTime += duration + 0.05; // 각 음 사이에 50ms 간격
      });

      logger.debug('NOTIFICATIONS', '알림 소리 재생 시작', { priority, frequencies });
    } catch (error) {
      logger.error('NOTIFICATIONS', '알림 소리 재생 오류', error);
    }
  }, []);

  // 브라우저 알림 권한 요청
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  // 읽지 않은 알림 수 계산
  const unreadCount = useMemo(() => {
    return notifications.filter(notification => !notification.isRead).length;
  }, [notifications]);

  // 사용자 로그인 시 초기화
  useEffect(() => {
    if (user) {
      fetchNotifications();
      fetchSettings();
      requestNotificationPermission();
      // Realtime 연결은 Global Manager에서 자동 관리
    } else {
      setNotifications([]);
      setSettings(null);
      // 로그아웃 시 구독 해제는 Global Manager에서 자동 처리
    }
  }, [user, fetchNotifications, fetchSettings, requestNotificationPermission]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    settings,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    deleteReadNotifications,
    createNotification,
    updateSettings,
    isConnected,
    isConnecting,
    connectionError,
    lastEventTime,
    subscribeToRealtime,
    unsubscribeFromRealtime,
    reconnectRealtime
  };

  // 인앱 토스트 닫기 핸들러
  const handleCloseToast = useCallback((id: string) => {
    setInAppToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <InAppNotificationContainer
        notifications={inAppToasts}
        onClose={handleCloseToast}
      />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

// 알림 헬퍼 함수들
export const notificationHelpers = {
  // 카테고리별 아이콘 매핑
  getCategoryIcon: (category: NotificationCategory): string => {
    const iconMap: Record<NotificationCategory, string> = {
      'task_created': '📝',
      'task_updated': '✏️',
      'task_assigned': '👤',
      'task_status_changed': '🔄',
      'task_completed': '✅',
      'system_maintenance': '🔧',
      'system_update': '🆙',
      'security_alert': '🚨',
      'login_attempt': '🔐',
      'report_submitted': '📊',
      'report_approved': '✅',
      'user_created': '👤',
      'user_updated': '👤',
      'business_added': '🏢',
      'file_uploaded': '📎',
      'backup_completed': '💾',
      'maintenance_scheduled': '📅'
    };
    return iconMap[category] || '📢';
  },

  // 우선순위별 색상 매핑
  getPriorityColor: (priority: NotificationPriority): string => {
    const colorMap: Record<NotificationPriority, string> = {
      'low': 'text-gray-600 bg-gray-100',
      'medium': 'text-blue-600 bg-blue-100',
      'high': 'text-orange-600 bg-orange-100',
      'critical': 'text-red-600 bg-red-100'
    };
    return colorMap[priority];
  },

  // 상대 시간 표시
  getRelativeTime: (timestamp: string): string => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return '방금 전';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일 전`;

    return date.toLocaleDateString('ko-KR');
  }
};