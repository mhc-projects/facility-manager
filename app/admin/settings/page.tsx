'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/ui/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { isPathHiddenForAccount } from '@/lib/auth/special-accounts';
import {
  Settings,
  Save,
  RotateCcw,
  Clock,
  AlertTriangle,
  CheckCircle,
  Bell,
  Users,
  Building,
  User,
  Sliders,
  Plug,
  Send,
  Trash2,
  Edit3,
  Eye,
  ShieldCheck,
} from 'lucide-react';
import OrganizationManagement from '@/components/admin/OrganizationManagement';
import { TokenManager } from '@/lib/api-client';

// Force dynamic rendering - this page uses useSearchParams() and auth context
export const dynamic = 'force-dynamic';

// 탭 타입 정의
type SettingsTab = 'delay-criteria' | 'notifications' | 'organization' | 'api-test';

// 지연/위험 기준 타입 정의
interface DelayCriteria {
  self: { delayed: number; risky: number; };
  subsidy: { delayed: number; risky: number; };
  as: { delayed: number; risky: number; };
  etc: { delayed: number; risky: number; };
}

// 기본값
const DEFAULT_CRITERIA: DelayCriteria = {
  self: { delayed: 7, risky: 14 },
  subsidy: { delayed: 14, risky: 20 },
  as: { delayed: 3, risky: 7 },
  etc: { delayed: 7, risky: 10 }
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, permissions } = useAuth();
  const isSystemAdmin = user?.permission_level === 4;

  useEffect(() => {
    if (user?.email && permissions?.isSpecialAccount && isPathHiddenForAccount(user.email, '/admin/settings')) {
      router.replace('/admin/business');
    }
  }, [user, permissions]);

  const tabFromUrl = searchParams.get('tab') as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabFromUrl && ['delay-criteria', 'notifications', 'organization', 'api-test'].includes(tabFromUrl)
      ? tabFromUrl
      : 'delay-criteria'
  );

  // 지연 기준 설정 상태
  const [criteria, setCriteria] = useState<DelayCriteria>(DEFAULT_CRITERIA);
  const [isLoadingCriteria, setIsLoadingCriteria] = useState(true);
  const [isSavingCriteria, setIsSavingCriteria] = useState(false);

  // 알림 설정 상태
  const [notificationStats, setNotificationStats] = useState({
    departments: 0,
    teams: 0,
    notifications: 0,
    user_notifications: 0
  });
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  // 공통 메시지 상태
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });

  // 경영지원 역할 부서 상태 (권한 4 전용)
  const [deptList, setDeptList] = useState<{ id: number; name: string; is_management_support: boolean }[]>([]);
  const [savingMgmt, setSavingMgmt] = useState(false);

  // API 테스트 상태
  const [apiTestKey, setApiTestKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiTestResult, setApiTestResult] = useState<{ status: number; body: unknown } | null>(null);
  const [apiTestLoading, setApiTestLoading] = useState(false);
  const [apiTestMethod, setApiTestMethod] = useState<'POST' | 'PATCH' | 'DELETE' | 'GET'>('POST');
  const [apiRecordId, setApiRecordId] = useState('');
  const [apiPostBody, setApiPostBody] = useState(JSON.stringify({
    business_name_raw: '테스트 사업장',
    receipt_date: new Date().toISOString().slice(0, 10),
    work_date: new Date().toISOString().slice(0, 10),
    receipt_content: 'API 연동 테스트',
    status: 'scheduled'
  }, null, 2));
  const [apiPatchBody, setApiPatchBody] = useState(JSON.stringify({
    status: 'completed',
    work_content: '작업 완료'
  }, null, 2));

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    loadCriteria();
    loadNotificationStats();
  }, []);

  // 탭 변경 시 메시지 초기화
  useEffect(() => {
    setMessage({ type: null, text: '' });
  }, [activeTab]);

  // organization 탭 진입 시 부서 목록 로드
  useEffect(() => {
    if (activeTab === 'organization' && isSystemAdmin && deptList.length === 0) {
      fetch('/api/organization/departments')
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setDeptList((data.data || []).map((d: any) => ({
              id: d.id,
              name: d.name,
              is_management_support: d.is_management_support ?? false,
            })));
          }
        })
        .catch(console.error);
    }
  }, [activeTab, isSystemAdmin]);

  // 현재 URL을 기반으로 기본 API URL 설정
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setApiBaseUrl(window.location.origin);
    }
  }, []);

  // API 테스트 실행
  const handleApiTest = async () => {
    if (!apiTestKey.trim()) {
      setApiTestResult({ status: 0, body: { error: 'API 키를 입력해주세요.' } });
      return;
    }
    const base = apiBaseUrl.trim() || window.location.origin;
    const endpoint = (apiTestMethod === 'PATCH' || apiTestMethod === 'DELETE' || apiTestMethod === 'GET')
      ? `${base}/api/external/as-records/${apiRecordId.trim()}`
      : `${base}/api/external/as-records`;

    if ((apiTestMethod === 'PATCH' || apiTestMethod === 'DELETE' || apiTestMethod === 'GET') && !apiRecordId.trim()) {
      setApiTestResult({ status: 0, body: { error: 'Record ID를 입력해주세요.' } });
      return;
    }

    setApiTestLoading(true);
    setApiTestResult(null);
    try {
      const options: RequestInit = {
        method: apiTestMethod,
        headers: {
          'Authorization': `Bearer ${apiTestKey.trim()}`,
          'Content-Type': 'application/json',
        },
      };
      if (apiTestMethod === 'POST') {
        options.body = apiPostBody;
      } else if (apiTestMethod === 'PATCH') {
        options.body = apiPatchBody;
      }

      const res = await fetch(endpoint, options);
      const body = await res.json().catch(() => ({}));
      setApiTestResult({ status: res.status, body });
    } catch (e: any) {
      setApiTestResult({ status: 0, body: { error: e.message } });
    } finally {
      setApiTestLoading(false);
    }
  };

  // 지연 기준 설정 로드
  const loadCriteria = async () => {
    try {
      setIsLoadingCriteria(true);
      const response = await fetch('/api/settings/delay-criteria');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setCriteria(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to load criteria:', error);
    } finally {
      setIsLoadingCriteria(false);
    }
  };

  // 알림 통계 로드
  const loadNotificationStats = async () => {
    try {
      setIsLoadingNotifications(true);
      const response = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-migration' })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setNotificationStats(data.counts);
        }
      }
    } catch (error) {
      console.error('Failed to load notification stats:', error);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  // 지연 기준 저장
  const handleSaveCriteria = async () => {
    try {
      setIsSavingCriteria(true);
      setMessage({ type: null, text: '' });

      const response = await fetch('/api/settings/delay-criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria)
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: '지연/위험 업무 기준이 성공적으로 저장되었습니다.' });
      } else {
        throw new Error(result.message || '저장에 실패했습니다.');
      }
    } catch (error: any) {
      console.error('Failed to save criteria:', error);
      setMessage({ type: 'error', text: error.message || '저장 중 오류가 발생했습니다.' });
    } finally {
      setIsSavingCriteria(false);
    }
  };

  // 경영지원 역할 부서 지정 (권한 4 전용)
  const handleSetManagementSupport = async (deptId: number, deptName: string) => {
    setSavingMgmt(true);
    try {
      const token = TokenManager.getToken();
      const res = await fetch('/api/organization/departments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: deptId, name: deptName, is_management_support: true }),
      });
      const data = await res.json();
      if (data.success) {
        setDeptList(prev => prev.map(d => ({ ...d, is_management_support: d.id === deptId })));
      } else {
        alert(data.error || '저장 실패');
      }
    } catch {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingMgmt(false);
    }
  };

  // 기본값으로 리셋
  const handleResetCriteria = () => {
    setCriteria(DEFAULT_CRITERIA);
    setMessage({ type: null, text: '' });
  };

  // 업무 타입별 기준 업데이트
  const updateCriteria = (taskType: keyof DelayCriteria, type: 'delayed' | 'risky', value: number) => {
    setCriteria(prev => ({
      ...prev,
      [taskType]: {
        ...prev[taskType],
        [type]: value
      }
    }));
    setMessage({ type: null, text: '' });
  };

  // 업무 타입 한글명
  const taskTypeLabels = {
    self: '자비 설치',
    subsidy: '보조금',
    as: 'AS',
    etc: '기타'
  };

  // 탭 구성
  const tabs = [
    {
      id: 'delay-criteria' as const,
      name: '지연/위험 기준',
      icon: Sliders,
      description: '업무 타입별 지연 및 위험 판단 기준'
    },
    {
      id: 'notifications' as const,
      name: '알림 관리',
      icon: Bell,
      description: '3-tier 알림 시스템 관리'
    },
    {
      id: 'organization' as const,
      name: '조직 관리',
      icon: Building,
      description: '부서 및 팀 구조 관리'
    },
    {
      id: 'api-test' as const,
      name: '외부 API',
      icon: Plug,
      description: '외부 시스템 API 연동 테스트 (에코센스 등)'
    }
  ];

  // 탭별 액션 버튼 렌더링
  const renderTabActions = () => {
    if (activeTab === 'delay-criteria') {
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetCriteria}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 text-[10px] sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
          >
            <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">기본값 리셋</span><span className="sm:hidden">리셋</span>
          </button>
          <button
            type="button"
            onClick={handleSaveCriteria}
            disabled={isSavingCriteria}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 md:px-4 md:py-2 text-[10px] sm:text-xs md:text-sm lg:text-base font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSavingCriteria ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Save className="w-3 h-3 sm:w-4 sm:h-4" />
            )}
            {isSavingCriteria ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <AdminLayout
      title="관리자 설정"
      description="시설 관리 시스템의 주요 설정을 관리합니다"
      actions={renderTabActions()}
    >
      <div className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto px-1 sm:px-4">

        {/* 알림 메시지 */}
        {message.type && (
          <div className={`mb-3 sm:mb-6 p-2 sm:p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
              <span>{message.text}</span>
            </div>
          </div>
        )}

        {/* 탭 네비게이션 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-2 sm:mb-4 md:mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-1 sm:space-x-4 md:space-x-8 px-1 sm:px-4 md:px-6 overflow-x-auto scrollbar-hide">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-1.5 sm:py-3 md:py-4 px-0.5 sm:px-1 border-b-2 font-medium text-[10px] sm:text-sm md:text-base transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-0.5 sm:gap-2">
                      <Icon className="w-3 h-3 sm:w-5 sm:h-5" />
                      <span className="hidden sm:inline">{tab.name}</span>
                      <span className="sm:hidden">{tab.name.split(' ')[0]}</span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* 현재 탭 설명 */}
          <div className="px-1 sm:px-4 md:px-6 py-1.5 sm:py-3 bg-gray-50">
            <p className="text-[10px] sm:text-sm md:text-base text-gray-600">
              {tabs.find(tab => tab.id === activeTab)?.description}
            </p>
          </div>
        </div>

        {/* 탭 콘텐츠 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">

          {/* 지연/위험 기준 설정 탭 */}
          {activeTab === 'delay-criteria' && (
            <div className="p-2 sm:p-6">
              {isLoadingCriteria ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">설정을 불러오는 중...</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 lg:gap-6">
                    {Object.entries(taskTypeLabels).map(([taskType, label]) => (
                      <div key={taskType} className="border border-gray-200 rounded-lg p-3 md:p-4 lg:p-5">
                        <h3 className="text-sm md:text-base lg:text-lg font-medium text-gray-900 mb-3 md:mb-4 flex items-center gap-2">
                          <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${
                            taskType === 'self' ? 'bg-blue-500' :
                            taskType === 'subsidy' ? 'bg-green-500' :
                            taskType === 'as' ? 'bg-orange-500' :
                            'bg-gray-500'
                          }`} />
                          {label}
                        </h3>

                        <div className="space-y-3 md:space-y-4">
                          {/* 지연 기준 */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 md:gap-2">
                              <Clock className="w-3 h-3 md:w-4 md:h-4 text-yellow-600 flex-shrink-0" />
                              <span className="text-xs md:text-sm font-medium text-gray-700">지연 기준</span>
                            </div>
                            <div className="flex items-center gap-1 md:gap-2">
                              <input
                                type="number"
                                min="1"
                                max="365"
                                value={criteria[taskType as keyof DelayCriteria].delayed}
                                onChange={(e) => updateCriteria(
                                  taskType as keyof DelayCriteria,
                                  'delayed',
                                  parseInt(e.target.value) || 1
                                )}
                                className="w-12 md:w-16 px-1.5 md:px-2 py-1 text-xs md:text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              <span className="text-xs md:text-sm text-gray-600">일</span>
                            </div>
                          </div>

                          {/* 위험 기준 */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 md:gap-2">
                              <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 text-red-600 flex-shrink-0" />
                              <span className="text-xs md:text-sm font-medium text-gray-700">위험 기준</span>
                            </div>
                            <div className="flex items-center gap-1 md:gap-2">
                              <input
                                type="number"
                                min="1"
                                max="365"
                                value={criteria[taskType as keyof DelayCriteria].risky}
                                onChange={(e) => updateCriteria(
                                  taskType as keyof DelayCriteria,
                                  'risky',
                                  parseInt(e.target.value) || 1
                                )}
                                className="w-12 md:w-16 px-1.5 md:px-2 py-1 text-xs md:text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              <span className="text-xs md:text-sm text-gray-600">일</span>
                            </div>
                          </div>

                          {/* 설명 */}
                          <div className="text-[10px] md:text-xs text-gray-500 pl-4 md:pl-6">
                            시작일로부터 각각 {criteria[taskType as keyof DelayCriteria].delayed}일, {criteria[taskType as keyof DelayCriteria].risky}일 경과 시 해당 상태로 분류됩니다.
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 안내 사항 */}
                  <div className="mt-4 md:mt-6 p-3 md:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-xs md:text-sm font-medium text-blue-900 mb-2">📌 설정 안내</h4>
                    <ul className="text-[10px] md:text-xs text-blue-800 space-y-0.5 md:space-y-1">
                      <li>• 지연 기준: 시작일로부터 설정된 일수가 지나면 '지연 업무'로 분류됩니다.</li>
                      <li>• 위험 기준: 시작일로부터 설정된 일수가 지나면 '위험 업무'로 분류됩니다.</li>
                      <li>• 일반적으로 위험 기준은 지연 기준보다 더 큰 값으로 설정합니다.</li>
                      <li>• 설정 변경은 즉시 모든 업무 목록에 반영됩니다.</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 알림 관리 탭 */}
          {activeTab === 'notifications' && (
            <div className="p-3 md:p-4 lg:p-6">
              {/* 3-tier 알림 시스템 현황 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 lg:gap-6 mb-4 md:mb-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 md:p-3 lg:p-4">
                  <div className="flex items-center gap-1 md:gap-2 lg:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-[10px] md:text-xs lg:text-sm font-medium text-blue-900">부서</p>
                      <p className="text-lg md:text-xl lg:text-2xl font-bold text-blue-700">{notificationStats.departments}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-2 md:p-3 lg:p-4">
                  <div className="flex items-center gap-1 md:gap-2 lg:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-[10px] md:text-xs lg:text-sm font-medium text-green-900">팀</p>
                      <p className="text-lg md:text-xl lg:text-2xl font-bold text-green-700">{notificationStats.teams}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 md:p-3 lg:p-4">
                  <div className="flex items-center gap-1 md:gap-2 lg:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Bell className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-[10px] md:text-xs lg:text-sm font-medium text-purple-900">알림</p>
                      <p className="text-lg md:text-xl lg:text-2xl font-bold text-purple-700">{notificationStats.notifications}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 md:p-3 lg:p-4">
                  <div className="flex items-center gap-1 md:gap-2 lg:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 md:w-5 md:h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-[10px] md:text-xs lg:text-sm font-medium text-orange-900">사용자 알림</p>
                      <p className="text-lg md:text-xl lg:text-2xl font-bold text-orange-700">{notificationStats.user_notifications}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 알림 관리 기능들 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* 알림 생성 */}
                <div className="border border-gray-200 rounded-lg p-4 md:p-5 lg:p-6">
                  <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-3 md:mb-4 flex items-center gap-2">
                    <Bell className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                    알림 생성
                  </h3>
                  <p className="text-xs md:text-sm text-gray-600 mb-3 md:mb-4">
                    개인, 팀, 전사 알림을 생성하고 관리할 수 있습니다.
                  </p>
                  <button
                    onClick={() => router.push('/admin/notifications')}
                    className="w-full px-3 md:px-4 py-2 text-sm md:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    알림 관리 페이지 열기
                  </button>
                </div>

                {/* 마이그레이션 도구 */}
                <div className="border border-gray-200 rounded-lg p-4 md:p-5 lg:p-6">
                  <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-3 md:mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                    시스템 관리
                  </h3>
                  <p className="text-xs md:text-sm text-gray-600 mb-3 md:mb-4">
                    3-tier 알림 시스템의 데이터베이스 상태를 확인하고 관리할 수 있습니다.
                  </p>
                  <button
                    onClick={() => router.push('/admin/migrate')}
                    className="w-full px-3 md:px-4 py-2 text-sm md:text-base bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    시스템 관리 도구 열기
                  </button>
                </div>
              </div>

              {/* 3-tier 시스템 정보 */}
              <div className="mt-4 md:mt-6 p-3 md:p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="text-xs md:text-sm font-medium text-gray-900 mb-2">📢 3-Tier 알림 시스템</h4>
                <ul className="text-[10px] md:text-xs text-gray-700 space-y-0.5 md:space-y-1">
                  <li>• <strong>개인 알림</strong>: 특정 사용자에게만 전달되는 개인적인 알림</li>
                  <li>• <strong>팀 알림</strong>: 특정 팀 또는 부서 구성원에게 전달되는 그룹 알림</li>
                  <li>• <strong>전사 알림</strong>: 모든 직원에게 전달되는 공지사항 및 중요 알림</li>
                  <li>• 각 알림은 우선순위와 만료일을 설정할 수 있으며, 읽음 상태를 추적합니다.</li>
                </ul>
              </div>
            </div>
          )}

          {/* 조직 관리 탭 */}
          {activeTab === 'organization' && (
            <div className="p-2 sm:p-6 space-y-6">
              <OrganizationManagement />

              {/* 경영지원 역할 부서 설정 — 권한 4 전용 */}
              {isSystemAdmin && (
                <div className="border border-amber-200 rounded-lg p-5 bg-amber-50/30">
                  <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-600" />
                    경영지원 역할 부서
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    결재 최종 승인 시 알림을 받을 부서를 지정합니다. 부서 이름이 변경되어도 지정은 유지됩니다.
                  </p>
                  <div className="space-y-2">
                    {deptList.length === 0 ? (
                      <p className="text-sm text-gray-400">부서 정보를 불러오는 중...</p>
                    ) : (
                      deptList.map(dept => (
                        <label
                          key={dept.id}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            dept.is_management_support
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="management_support_dept"
                              checked={dept.is_management_support}
                              onChange={() => handleSetManagementSupport(dept.id, dept.name)}
                              disabled={savingMgmt}
                              className="accent-amber-500"
                            />
                            <span className="text-sm font-medium text-gray-800">{dept.name}</span>
                          </div>
                          {dept.is_management_support && (
                            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                              지정됨
                            </span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                  {savingMgmt && (
                    <p className="text-xs text-amber-600 mt-2">저장 중...</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 외부 API 테스트 탭 */}
          {activeTab === 'api-test' && (
            <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
              {/* API 기본 설정 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Plug className="w-4 h-4 text-blue-600" />
                  연결 설정
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">API 베이스 URL</label>
                    <input
                      type="text"
                      value={apiBaseUrl}
                      onChange={e => setApiBaseUrl(e.target.value)}
                      placeholder="https://your-domain.com"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">API 키</label>
                    <input
                      type="text"
                      value={apiTestKey}
                      onChange={e => setApiTestKey(e.target.value)}
                      placeholder="ek_xxxxxxxxxxxx"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 메서드 선택 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">요청 설정</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(['POST', 'GET', 'PATCH', 'DELETE'] as const).map(method => (
                    <button
                      key={method}
                      onClick={() => setApiTestMethod(method)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        apiTestMethod === method
                          ? method === 'POST' ? 'bg-green-600 text-white border-green-600'
                          : method === 'GET' ? 'bg-blue-600 text-white border-blue-600'
                          : method === 'PATCH' ? 'bg-yellow-500 text-white border-yellow-500'
                          : 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>

                {/* 엔드포인트 미리보기 */}
                <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                  <span className={`text-xs font-bold mr-2 ${
                    apiTestMethod === 'POST' ? 'text-green-600'
                    : apiTestMethod === 'GET' ? 'text-blue-600'
                    : apiTestMethod === 'PATCH' ? 'text-yellow-600'
                    : 'text-red-600'
                  }`}>{apiTestMethod}</span>
                  <span className="text-xs font-mono text-gray-700">
                    {(apiBaseUrl || 'https://your-domain.com')}/api/external/as-records
                    {(apiTestMethod !== 'POST') && (
                      <span className="text-blue-600">/{apiRecordId || '{id}'}</span>
                    )}
                  </span>
                </div>

                {/* Record ID (PATCH/DELETE/GET) */}
                {apiTestMethod !== 'POST' && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Record ID (UUID)</label>
                    <input
                      type="text"
                      value={apiRecordId}
                      onChange={e => setApiRecordId(e.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">AS 레코드 생성 시 반환된 id 값을 입력하세요.</p>
                  </div>
                )}

                {/* POST Body */}
                {apiTestMethod === 'POST' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Request Body (JSON)</label>
                    <textarea
                      value={apiPostBody}
                      onChange={e => setApiPostBody(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono resize-y"
                    />
                  </div>
                )}

                {/* PATCH Body */}
                {apiTestMethod === 'PATCH' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Request Body (JSON) - 변경할 필드만 입력</label>
                    <textarea
                      value={apiPatchBody}
                      onChange={e => setApiPatchBody(e.target.value)}
                      rows={5}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono resize-y"
                    />
                  </div>
                )}

                <button
                  onClick={handleApiTest}
                  disabled={apiTestLoading}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {apiTestLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {apiTestLoading ? '요청 중...' : '요청 전송'}
                </button>
              </div>

              {/* 응답 결과 */}
              {apiTestResult && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-gray-600" />
                    응답 결과
                  </h3>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                      apiTestResult.status >= 200 && apiTestResult.status < 300
                        ? 'bg-green-100 text-green-700'
                        : apiTestResult.status >= 400
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {apiTestResult.status === 0 ? 'ERROR' : `HTTP ${apiTestResult.status}`}
                    </span>
                    {apiTestResult.status >= 200 && apiTestResult.status < 300 && (
                      <span className="text-xs text-green-600 font-medium">성공</span>
                    )}
                    {apiTestResult.status >= 400 && (
                      <span className="text-xs text-red-600 font-medium">실패</span>
                    )}
                  </div>
                  <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded-lg overflow-auto max-h-64 font-mono">
                    {JSON.stringify(apiTestResult.body, null, 2)}
                  </pre>
                  {/* POST 성공 시 ID 자동 복사 안내 */}
                  {apiTestMethod === 'POST' && apiTestResult.status === 201 && (apiTestResult.body as any)?.data?.id && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-blue-800 font-medium mb-1">생성된 레코드 ID:</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-blue-700 bg-blue-100 px-2 py-1 rounded">
                          {(apiTestResult.body as any).data.id}
                        </code>
                        <button
                          onClick={() => {
                            setApiRecordId((apiTestResult.body as any).data.id);
                            setApiTestMethod('PATCH');
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          PATCH에 사용
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* API 사용 가이드 */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">API 엔드포인트 가이드</h3>
                <div className="space-y-2 text-xs text-gray-700">
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-green-600 w-12 flex-shrink-0">POST</span>
                    <span className="font-mono">/api/external/as-records</span>
                    <span className="text-gray-500">— 새 AS 레코드 생성</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-blue-600 w-12 flex-shrink-0">GET</span>
                    <span className="font-mono">/api/external/as-records/{'{id}'}</span>
                    <span className="text-gray-500">— 특정 레코드 조회</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600 w-12 flex-shrink-0">PATCH</span>
                    <span className="font-mono">/api/external/as-records/{'{id}'}</span>
                    <span className="text-gray-500">— 레코드 수정 (변경 필드만)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-red-600 w-12 flex-shrink-0">DELETE</span>
                    <span className="font-mono">/api/external/as-records/{'{id}'}</span>
                    <span className="text-gray-500">— 레코드 삭제</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-600 font-medium mb-1">수정 가능한 status 값:</p>
                  <div className="flex flex-wrap gap-1">
                    {['scheduled', 'site_check', 'installation', 'completion_fix', 'modem_check', 'on_hold', 'finished', 'completed'].map(s => (
                      <span key={s} className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs font-mono text-gray-600">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </AdminLayout>
  );
}