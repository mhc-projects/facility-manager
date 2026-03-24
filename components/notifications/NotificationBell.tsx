'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock, User, FolderOpen, AlertCircle, X, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useNotification } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 사용자 인증 상태 확인
  const { user, loading: authLoading } = useAuth();

  // Supabase Realtime 기반 알림 시스템 사용
  const {
    notifications,
    unreadCount,
    loading,
    isConnected,
    isConnecting,
    connectionError,
    lastEventTime,
    markAsRead,
    markAllAsRead,
    reconnectRealtime
  } = useNotification();

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 알림 클릭 핸들러 - 사업장 상세 모달로 이동
  const handleNotificationClick = (notification: any) => {
    console.log('🔔 [NOTIFICATION-CLICK] 알림 클릭:', notification);

    // 업무 알림인 경우 사업장 관리 페이지로 이동
    if (notification.relatedResourceType === 'task' ||
        notification.category.includes('task') ||
        notification.metadata?.business_name) {

      const businessName = notification.metadata?.business_name;

      if (businessName) {
        console.log('📍 [NOTIFICATION-CLICK] 사업장으로 이동:', businessName);

        // 사업장 관리 페이지로 이동 (사업장명을 URL 파라미터로 전달)
        const encodedBusinessName = encodeURIComponent(businessName);
        router.push(`/admin/business?business=${encodedBusinessName}&focus=tasks`);

        // 알림을 읽음으로 처리
        if (!notification.isRead) {
          markAsRead(notification.id);
        }
      } else {
        console.warn('⚠️ [NOTIFICATION-CLICK] 사업장 정보 없음, 기본 업무 페이지로 이동');
        router.push('/admin/tasks');
      }
    } else {
      // 일반 알림인 경우 기존 URL 사용
      if (notification.relatedUrl) {
        console.log('🔗 [NOTIFICATION-CLICK] 기존 URL로 이동:', notification.relatedUrl);
        router.push(notification.relatedUrl);
      }

      // 알림을 읽음으로 처리
      if (!notification.isRead) {
        markAsRead(notification.id);
      }
    }
  };

  // 알림 읽음 처리는 useNotification 훅에서 제공하는 함수 사용

  // 알림 카테고리별 아이콘
  const getNotificationIcon = (category: string) => {
    switch (category) {
      case 'task_created':
      case 'task_updated':
      case 'task_assigned':
      case 'task_status_changed':
      case 'task_completed':
        return <Check className="h-4 w-4" />;
      case 'system_maintenance':
      case 'system_update':
        return <AlertCircle className="h-4 w-4" />;
      case 'security_alert':
      case 'login_attempt':
        return <AlertCircle className="h-4 w-4" />;
      case 'report_submitted':
      case 'report_approved':
        return <FolderOpen className="h-4 w-4" />;
      case 'user_created':
      case 'user_updated':
        return <User className="h-4 w-4" />;
      case 'business_added':
      case 'file_uploaded':
        return <FolderOpen className="h-4 w-4" />;
      case 'backup_completed':
      case 'maintenance_scheduled':
        return <Clock className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  // 우선순위별 색상
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-red-600 bg-red-100';
      case 'high':
        return 'text-orange-600 bg-orange-100';
      case 'medium':
        return 'text-blue-600 bg-blue-100';
      case 'low':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  // 시간 표시 포맷
  const formatTime = (dateString: string) => {
    const now = new Date();
    const notificationTime = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - notificationTime.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) {
      return '방금 전';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}분 전`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}시간 전`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)}일 전`;
    }
  };

  // 사용자가 로그인하지 않았으면 알림 벨 숨기기
  if (authLoading || !user) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 알림 벨 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors duration-200"
        title={
          isConnected
            ? `Supabase Realtime 연결됨${lastEventTime ? ` (마지막 이벤트: ${lastEventTime.toLocaleTimeString()})` : ''}`
            : isConnecting
            ? 'Supabase Realtime 연결 중...'
            : connectionError
            ? `연결 오류: ${connectionError}`
            : '오프라인'
        }
      >
        <Bell className="h-6 w-6" />

        {/* 읽지 않은 알림 카운트 */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Supabase Realtime 연결 상태 표시 */}
        <span className={`absolute -bottom-1 -left-1 w-3 h-3 rounded-full ${
          isConnected
            ? 'bg-green-500'
            : isConnecting
            ? 'bg-yellow-500 animate-pulse'
            : connectionError
            ? 'bg-red-500'
            : 'bg-gray-400'
        }`} />

        {/* 연결 오류 시 경고 표시 */}
        {connectionError && (
          <AlertCircle className="absolute -top-0.5 -right-0.5 h-3 w-3 text-red-500" />
        )}
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-semibold text-gray-900">알림</h3>

              {/* 연결 상태 표시 */}
              <div className="flex items-center space-x-1">
                {isConnected ? (
                  <div title="Supabase Realtime 연결됨">
                    <Wifi className="h-4 w-4 text-green-500" />
                  </div>
                ) : isConnecting ? (
                  <div title="연결 중...">
                    <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />
                  </div>
                ) : (
                  <div title="연결 끊김">
                    <WifiOff className="h-4 w-4 text-red-500" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* 재연결 버튼 (연결이 끊어진 경우에만 표시) */}
              {!isConnected && !isConnecting && (
                <button
                  onClick={reconnectRealtime}
                  className="p-1 text-blue-600 hover:text-blue-800"
                  title="재연결"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}

              {/* 모두 읽음 버튼 */}
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  모두 읽음
                </button>
              )}

              {/* 닫기 버튼 */}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 알림 목록 */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : notifications.filter(n => !n.isRead).length > 0 ? (
              <div className="divide-y divide-gray-200">
                {/* 알림창에서는 읽지 않은 알림만 표시 (읽은 알림은 숨김) */}
                {[...notifications]
                  .filter(notification => !notification.isRead) // 읽지 않은 알림만 필터링
                  .sort((a, b) => {
                    // 1. 우선순위 순으로 (critical > high > medium > low)
                    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
                    if (a.priority !== b.priority) {
                      return priorityOrder[b.priority] - priorityOrder[a.priority];
                    }
                    // 2. 최신 순으로
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                  })
                  .map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 transition-colors duration-200 ${
                      !notification.isRead ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      {/* 아이콘 */}
                      <div className={`p-2 rounded-full ${getPriorityColor(notification.priority)}`}>
                        {getNotificationIcon(notification.category)}
                      </div>

                      {/* 내용 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${!notification.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {notification.message}
                            </p>

                            {/* 추가 정보 */}
                            {(notification.createdByName || notification.relatedResourceType || notification.metadata) && (
                              <div className="flex items-center space-x-2 mt-2 text-xs text-gray-500">
                                {notification.createdByName && (
                                  <span>보낸이: {notification.createdByName}</span>
                                )}
                                {notification.relatedResourceType && (
                                  <span>유형: {notification.relatedResourceType}</span>
                                )}
                                {notification.metadata?.business_name && (
                                  <span>사업장: {notification.metadata.business_name}</span>
                                )}
                              </div>
                            )}

                            <p className="text-xs text-gray-500 mt-2">
                              {formatTime(notification.createdAt)}
                            </p>
                          </div>

                          {/* 읽음 처리 버튼 */}
                          {!notification.isRead && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="ml-2 p-1 text-gray-400 hover:text-gray-600"
                              title="읽음 표시"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          handleNotificationClick(notification);
                        }}
                        className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors duration-200"
                      >
                        보기
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <Bell className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">새로운 알림이 없습니다</p>
              </div>
            )}
          </div>

          {/* 더보기 버튼 - 항상 표시 */}
          <div className="border-t border-gray-200 p-2">
            <button
              onClick={() => {
                setIsOpen(false);
                window.location.href = '/notifications';
              }}
              className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium py-2 hover:bg-gray-50 rounded-md transition-colors duration-200"
            >
              모든 알림 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}