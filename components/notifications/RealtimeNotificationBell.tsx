'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Clock, User, FolderOpen, AlertCircle, X, Wifi, WifiOff, RefreshCw, Zap } from 'lucide-react';
import { useSimpleNotifications } from '@/lib/hooks/useSimpleNotifications';

interface RealtimeNotificationBellProps {
  userId?: string;
  userPermissionLevel?: number; // 권한 레벨 (3 이상이면 관리자 알림 수신)
}

export default function RealtimeNotificationBell({ userId, userPermissionLevel }: RealtimeNotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showConnectionStatus, setShowConnectionStatus] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Realtime 기반 알림 시스템 (권한 레벨 전달)
  const {
    notifications,
    unreadCount,
    isConnected,
    connectionStatus,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
    refreshNotifications,
    isPollingMode,
    reconnect
  } = useSimpleNotifications(userId, userPermissionLevel);

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // 새 알림 시 브라우저 알림 표시
  useEffect(() => {
    if (notifications.length > 0 && !notifications[0].read) {
      const latestNotification = notifications[0];

      // 브라우저 알림 표시 (권한이 있는 경우)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(latestNotification.title, {
          body: latestNotification.message,
          icon: '/favicon.ico',
          tag: latestNotification.id, // 중복 방지
          requireInteraction: latestNotification.priority === 'critical'
        });
      }
    }
  }, [notifications]);

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

  // 알림 카테고리별 아이콘
  const getNotificationIcon = (category: string) => {
    switch (category) {
      case 'task_created':
      case 'task_assigned':
      case 'assignment':
        return <FolderOpen className="w-4 h-4 text-blue-500" />;
      case 'task_status_changed':
      case 'status_change':
        return <Clock className="w-4 h-4 text-orange-500" />;
      case 'task_completed':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'system_update':
      case 'system_maintenance':
        return <Zap className="w-4 h-4 text-purple-500" />;
      case 'security_alert':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'user_created':
      case 'user_updated':
        return <User className="w-4 h-4 text-gray-500" />;
      default:
        return <Bell className="w-4 h-4 text-gray-400" />;
    }
  };

  // 우선순위별 스타일
  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'border-l-4 border-red-500 bg-red-50';
      case 'high':
        return 'border-l-4 border-orange-500 bg-orange-50';
      case 'medium':
        return 'border-l-4 border-blue-500 bg-blue-50';
      case 'low':
      default:
        return 'border-l-4 border-gray-300 bg-gray-50';
    }
  };

  // 시간 포맷팅
  const formatTime = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return time.toLocaleDateString();
  };

  // 연결 상태 아이콘
  const getConnectionIcon = () => {
    if (connectionStatus === 'connecting') {
      return <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />;
    } else if (isConnected) {
      return isPollingMode ?
        <Clock className="w-4 h-4 text-blue-500" /> :
        <Wifi className="w-4 h-4 text-green-500" />;
    } else {
      return <WifiOff className="w-4 h-4 text-red-500" />;
    }
  };

  // 연결 상태 텍스트 (간소화)
  const getConnectionText = () => {
    if (connectionStatus === 'connecting') return '동기화 중...';
    if (isConnected) return '정상 연결';
    return '오프라인';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 알림 벨 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        title={`알림 ${unreadCount > 0 ? `(${unreadCount}개 읽지 않음)` : ''}`}
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 알림 드롭다운 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border z-50 max-h-96 overflow-hidden">
          {/* 헤더 */}
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-gray-900">알림</h3>
              <span className="text-xs text-gray-500">
                ({notifications.length}개)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {/* 연결 상태 표시 */}
              <button
                onClick={() => setShowConnectionStatus(!showConnectionStatus)}
                className="flex items-center space-x-1 text-xs px-2 py-1 rounded-full bg-white border hover:bg-gray-50"
                title={getConnectionText()}
              >
                {getConnectionIcon()}
                <span className="hidden sm:inline">{getConnectionText()}</span>
              </button>

              {/* 모두 읽음 버튼 */}
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                  title="모든 알림 읽음 처리"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>모두 읽음</span>
                </button>
              )}
            </div>
          </div>

          {/* 연결 문제 시에만 상태 정보 표시 */}
          {(!isConnected || connectionStatus === 'error') && (
            <div className="px-4 py-3 bg-amber-50 border-b text-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-amber-600" />
                  <span className="text-amber-800 font-medium">연결 문제</span>
                </div>
                <button
                  onClick={reconnect}
                  className="flex items-center gap-1 px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  재연결
                </button>
              </div>
              <p className="text-xs text-amber-700">
                실시간 알림이 지연될 수 있습니다. 재연결을 시도하거나 새로고침해주세요.
              </p>
            </div>
          )}

          {/* 알림 목록 */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm mb-3">새로운 알림이 없습니다</p>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    // 히스토리 페이지로 이동 (향후 구현)
                    window.location.href = '/notifications/history';
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  이전 알림 보기
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer ${
                      !notification.read ? getPriorityStyle(notification.priority) : 'bg-white'
                    }`}
                    onClick={() => {
                      if (!notification.read) {
                        markAsRead(notification.id);
                      }
                      if (notification.related_url) {
                        window.location.href = notification.related_url;
                      }
                    }}
                  >
                    <div className="flex items-start space-x-3">
                      {/* 아이콘 */}
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.category || '')}
                      </div>

                      {/* 내용 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className={`text-sm ${!notification.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </p>
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                            <div className="flex items-center space-x-2 mt-2">
                              <span className="text-xs text-gray-400">
                                {formatTime(notification.timestamp)}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                notification.type === 'task' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {notification.type === 'task' ? '업무' : '시스템'}
                              </span>
                              {notification.priority === 'critical' && (
                                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-800 rounded-full">
                                  긴급
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 읽음/제거 버튼 */}
                          <div className="flex items-center space-x-1 ml-2">
                            {!notification.read && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notification.id);
                                }}
                                className="p-1 text-gray-400 hover:text-blue-600"
                                title="읽음 처리"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                clearNotification(notification.id);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600"
                              title="알림 제거"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 푸터 */}
          <div className="px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
            <button
              onClick={() => {
                setIsOpen(false);
                window.location.href = '/notifications/history';
              }}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center space-x-1"
            >
              <FolderOpen className="w-3 h-3" />
              <span>이전 알림 보기</span>
            </button>

            {notifications.length > 0 && (
              <button
                onClick={refreshNotifications}
                className="text-xs text-gray-600 hover:text-gray-800 flex items-center space-x-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>새로고침</span>
              </button>
            )}
            <button
              onClick={clearAllNotifications}
              className="text-xs text-red-600 hover:text-red-800"
            >
              모든 알림 제거
            </button>
          </div>
        </div>
      )}
    </div>
  );
}