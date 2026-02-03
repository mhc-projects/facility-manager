'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  FileText,
  Edit3,
  Save,
  X,
  AlertTriangle,
  Clock,
  User,
  Bot,
  Plus,
  MessageSquare,
  Activity,
  Bell,
  CheckCircle,
  ExternalLink
} from 'lucide-react';
// 🔄 공유 모듈에서 단계 정의 및 헬퍼 함수 import
import {
  TaskType,
  TaskStatus,
  TaskStep,
  selfSteps,
  subsidySteps,
  etcSteps,
  asSteps,
  dealerSteps,
  outsourcingSteps,
  getStepsForType,
  getStatusLabel
} from '@/lib/task-steps';

interface BusinessProgressNote {
  id: string;
  business_name: string;
  task_id?: string;
  content: string;
  note_type: 'auto' | 'manual';
  created_by: string;
  author_name?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
  related_task?: {
    id: string;
    title: string;
    status: string;
    task_type?: TaskType;  // 업무 타입 추가
    priority: string;
  };
}

interface TaskNotification {
  id: string;
  user_id: string;
  user_name?: string;
  task_id: string;
  business_name: string;
  message: string;
  notification_type: 'delay' | 'risk' | 'status_change' | 'assignment' | 'completion';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  is_read: boolean;
  read_at?: string;
  created_at: string;
  expires_at?: string;
}

// 🔄 TaskType과 TaskStatus는 공유 모듈에서 import
// 🔄 단계 정의는 공유 모듈에서 import (lib/task-steps.ts)
// 🔄 getStatusLabel은 공유 모듈에서 import하되, type이 undefined일 수 있으므로 wrapper 함수 사용

// 상태를 한글 라벨로 변환하는 헬퍼 함수 (type이 undefined일 수 있는 경우 처리)
const getStatusLabelWithOptionalType = (type: TaskType | undefined, status: string): string => {
  if (!type) {
    // 타입이 없는 경우 etc로 기본값 설정하여 공유 모듈 함수 사용
    return getStatusLabel('etc', status)
  }
  return getStatusLabel(type, status)
}

interface BusinessProgressSectionProps {
  businessName: string;
  specialNotes: string;
  onSpecialNotesUpdate: (notes: string) => void;
}

export default function BusinessProgressSection({
  businessName,
  specialNotes,
  onSpecialNotesUpdate
}: BusinessProgressSectionProps) {
  const { user } = useAuth();
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editNotes, setEditNotes] = useState(specialNotes);
  const [isAddingMemo, setIsAddingMemo] = useState(false);
  const [newMemoContent, setNewMemoContent] = useState('');

  // 상태 관리
  const [progressNotes, setProgressNotes] = useState<BusinessProgressNote[]>([]);
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 데이터 로딩
  useEffect(() => {
    loadProgressData();
  }, [businessName, user?.id]);

  // 특이사항 동기화
  useEffect(() => {
    setEditNotes(specialNotes);
  }, [specialNotes]);

  const loadProgressData = async () => {
    if (!businessName || !user?.id) return;

    try {
      setLoading(true);

      // 진행 현황 메모 조회 (business_memos API 사용)
      const notesResponse = await fetch(`/api/business-memos?businessName=${encodeURIComponent(businessName)}&limit=20`);
      if (notesResponse.ok) {
        const notesData = await notesResponse.json();
        if (notesData.success) {
          // 배열인지 확인 후 설정
          const notes = Array.isArray(notesData.data) ? notesData.data : [];
          setProgressNotes(notes);
        }
      }

      // 사용자 알림 조회 (업무 관련)
      const notificationsResponse = await fetch(`/api/notifications?userId=${user.id}&unreadOnly=false&limit=10`);
      if (notificationsResponse.ok) {
        const notificationsData = await notificationsResponse.json();
        if (notificationsData.success) {
          // 현재 사업장과 관련된 알림만 필터링
          const businessNotifications = notificationsData.taskNotifications?.filter(
            (notif: TaskNotification) => notif.business_name === businessName
          ) || [];
          setNotifications(businessNotifications);
        }
      }

    } catch (error) {
      console.error('진행 현황 데이터 로딩 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSpecialNotesSave = () => {
    onSpecialNotesUpdate(editNotes);
    setIsEditingNotes(false);
  };

  const handleSpecialNotesCancel = () => {
    setEditNotes(specialNotes);
    setIsEditingNotes(false);
  };

  const handleAddMemo = async () => {
    if (!newMemoContent.trim() || !user?.id) return;

    try {
      setSaving(true);
      const response = await fetch('/api/business-memos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          business_name: businessName,
          title: '수동 메모',
          content: newMemoContent.trim(),
          created_by: user.name || user.id
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setNewMemoContent('');
          setIsAddingMemo(false);
          await loadProgressData(); // 데이터 새로고침
        }
      }
    } catch (error) {
      console.error('메모 추가 오류:', error);
    } finally {
      setSaving(false);
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notification_ids: [notificationId],
          user_id: user?.id
        })
      });

      // 로컬 상태 업데이트
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId
            ? { ...notif, is_read: true, read_at: new Date().toISOString() }
            : notif
        )
      );
    } catch (error) {
      console.error('알림 읽음 처리 오류:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'in_progress': return 'text-blue-600 bg-blue-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'delayed': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'urgent': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'normal': return 'text-blue-600 bg-blue-100';
      case 'low': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* 특이사항 섹션 */}
      <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-gray-200/80 hover:shadow-2xl hover:border-gray-300/80 transition-all duration-300">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">특이사항</h2>
          </div>

          <div className="flex items-center gap-2">
            {isEditingNotes ? (
              <>
                <button
                  onClick={handleSpecialNotesSave}
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  <Save className="w-4 h-4" />
                  저장
                </button>
                <button
                  onClick={handleSpecialNotesCancel}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                >
                  <X className="w-4 h-4" />
                  취소
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditingNotes(true)}
                className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm"
              >
                <Edit3 className="w-4 h-4" />
                편집
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {!specialNotes && !isEditingNotes && (
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <AlertTriangle className="w-5 h-5 text-gray-400" />
              <p className="text-gray-500">특이사항이 없습니다. 편집 버튼을 눌러 내용을 추가하세요.</p>
            </div>
          )}

          {isEditingNotes ? (
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              placeholder="특이사항을 입력하세요. 예: 시설 위치 변경, 추가 점검 필요 사항, 안전 주의사항 등"
            />
          ) : specialNotes ? (
            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{specialNotes}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* 업무 진행 현황 섹션 */}
      <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-gray-200/80 hover:shadow-2xl hover:border-gray-300/80 transition-all duration-300">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">업무 진행 현황</h2>
          </div>

          <button
            onClick={() => setIsAddingMemo(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            메모 추가
          </button>
        </div>

        {/* 새 메모 추가 폼 */}
        {isAddingMemo && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-1 bg-blue-100 rounded">
                <MessageSquare className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <textarea
                  value={newMemoContent}
                  onChange={(e) => setNewMemoContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  placeholder="진행 현황 메모를 입력하세요..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsAddingMemo(false);
                  setNewMemoContent('');
                }}
                className="px-3 py-1 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddMemo}
                disabled={!newMemoContent.trim() || saving}
                className="px-3 py-1 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                {saving ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                저장
              </button>
            </div>
          </div>
        )}

        {/* 진행 현황 메모 목록 */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-gray-600">진행 현황을 불러오는 중...</span>
            </div>
          ) : !progressNotes || progressNotes.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <MessageSquare className="w-5 h-5 text-gray-400" />
              <p className="text-gray-500">아직 진행 현황 메모가 없습니다. 첫 번째 메모를 추가해보세요.</p>
            </div>
          ) : (
            (progressNotes || []).map((note) => (
              <div key={note.id} className="p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1 rounded ${note.note_type === 'auto' ? 'bg-green-100' : 'bg-blue-100'}`}>
                      {note.note_type === 'auto' ? (
                        <Bot className="w-4 h-4 text-green-600" />
                      ) : (
                        <User className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {note.note_type === 'auto' ? '시스템 자동' : note.author_name || '사용자'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(note.created_at)}
                    </span>
                  </div>

                  {note.related_task && (
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(note.related_task.status)}`}>
                        {getStatusLabelWithOptionalType(note.related_task.task_type, note.related_task.status)}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(note.related_task.priority)}`}>
                        {note.related_task.priority}
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-gray-800 leading-relaxed mb-2">{note.content}</p>

                {note.related_task && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 border-t pt-2">
                    <ExternalLink className="w-3 h-3" />
                    <span>관련 업무: {note.related_task.title}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 알림 섹션 */}
      {notifications.length > 0 && (
        <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-yellow-200/80 hover:shadow-2xl hover:border-yellow-300/80 transition-all duration-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Bell className="w-6 h-6 text-yellow-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">업무 알림</h2>
            <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-full">
              {notifications.filter(n => !n.is_read).length}개 읽지 않음
            </span>
          </div>

          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg border transition-colors ${
                  notification.is_read
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1 rounded ${getPriorityColor(notification.priority)}`}>
                      <Bell className="w-3 h-3" />
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {notification.notification_type === 'delay' ? '지연 알림' :
                       notification.notification_type === 'risk' ? '위험 알림' :
                       notification.notification_type === 'status_change' ? '상태 변경' :
                       notification.notification_type === 'assignment' ? '업무 배정' :
                       '업무 완료'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(notification.created_at)}
                    </span>
                  </div>

                  {!notification.is_read && (
                    <button
                      onClick={() => markNotificationAsRead(notification.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      읽음 표시
                    </button>
                  )}
                </div>

                <p className="text-gray-800 text-sm leading-relaxed">{notification.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}