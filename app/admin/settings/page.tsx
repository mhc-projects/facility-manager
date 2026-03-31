'use client';

import React, { useState, useEffect, Suspense } from 'react';
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
  Building,
  Sliders,
  ShieldCheck,
} from 'lucide-react';
import OrganizationManagement from '@/components/admin/OrganizationManagement';
import { TokenManager } from '@/lib/api-client';

// 탭 타입 정의
type SettingsTab = 'delay-criteria' | 'organization';

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

function AdminSettingsContent() {
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
    tabFromUrl && ['delay-criteria', 'organization'].includes(tabFromUrl)
      ? tabFromUrl
      : 'delay-criteria'
  );

  // 지연 기준 설정 상태
  const [criteria, setCriteria] = useState<DelayCriteria>(DEFAULT_CRITERIA);
  const [isLoadingCriteria, setIsLoadingCriteria] = useState(true);
  const [isSavingCriteria, setIsSavingCriteria] = useState(false);

  // 공통 메시지 상태
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });

  // 전자결재 관리 역할 팀 상태 (권한 4 전용)
  const [deptList, setDeptList] = useState<{ id: number; name: string; is_management_support: boolean }[]>([]);
  const [teamList, setTeamList] = useState<{ id: number; name: string; department_id: number; is_management_support: boolean }[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [savingMgmt, setSavingMgmt] = useState(false);

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    loadCriteria();
  }, []);

  // 탭 변경 시 메시지 초기화
  useEffect(() => {
    setMessage({ type: null, text: '' });
  }, [activeTab]);

  // organization 탭 진입 시 부서 + 팀 목록 로드
  useEffect(() => {
    if (activeTab === 'organization' && isSystemAdmin && deptList.length === 0) {
      // 부서 목록 로드
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

      // 팀 목록 로드
      fetch('/api/organization/teams')
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            const teams = (data.data || []).map((t: any) => ({
              id: t.id,
              name: t.name,
              department_id: t.department_id,
              is_management_support: t.is_management_support ?? false,
            }));
            setTeamList(teams);
            // 현재 지정된 팀이 있으면 해당 부서를 자동 선택
            const mgmtTeam = teams.find((t: any) => t.is_management_support);
            if (mgmtTeam) {
              setSelectedDeptId(mgmtTeam.department_id);
            }
          }
        })
        .catch(console.error);
    }
  }, [activeTab, isSystemAdmin]);

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

  // 전자결재 관리 역할 팀 지정 (권한 4 전용)
  const handleSetManagementSupportTeam = async (team: { id: number; name: string; department_id: number }) => {
    setSavingMgmt(true);
    try {
      const token = TokenManager.getToken();
      const res = await fetch('/api/organization/teams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: team.id, name: team.name, department_id: team.department_id, is_management_support: true }),
      });
      const data = await res.json();
      if (data.success) {
        setTeamList(prev => prev.map(t => ({ ...t, is_management_support: t.id === team.id })));
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
      id: 'organization' as const,
      name: '조직 관리',
      icon: Building,
      description: '부서 및 팀 구조 관리'
    },
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


          {/* 조직 관리 탭 */}
          {activeTab === 'organization' && (
            <div className="p-2 sm:p-6 space-y-6">
              <OrganizationManagement />

              {/* 전자결재 관리 역할 팀 설정 — 권한 4 전용 */}
              {isSystemAdmin && (
                <div className="border border-amber-200 rounded-lg p-5 bg-amber-50/30">
                  <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-600" />
                    전자결재 관리 역할 팀
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    결재 최종 승인 시 알림을 받고, 결재완료 문서를 열람/처리확인할 수 있는 팀을 지정합니다.
                  </p>

                  {/* 1단계: 부서 선택 */}
                  <p className="text-xs font-medium text-gray-600 mb-2">부서 선택</p>
                  <div className="space-y-2 mb-4">
                    {deptList.length === 0 ? (
                      <p className="text-sm text-gray-400">부서 정보를 불러오는 중...</p>
                    ) : (
                      deptList.map(dept => {
                        const hasSelectedTeam = teamList.some(t => t.department_id === dept.id && t.is_management_support);
                        return (
                          <button
                            key={dept.id}
                            type="button"
                            onClick={() => setSelectedDeptId(prev => prev === dept.id ? null : dept.id)}
                            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                              selectedDeptId === dept.id
                                ? 'border-amber-400 bg-amber-50'
                                : hasSelectedTeam
                                  ? 'border-amber-200 bg-amber-50/50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <span className="text-sm font-medium text-gray-800">{dept.name}</span>
                            <div className="flex items-center gap-2">
                              {hasSelectedTeam && (
                                <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                                  지정된 팀 있음
                                </span>
                              )}
                              <span className="text-xs text-gray-400">
                                {selectedDeptId === dept.id ? '▲' : '▼'}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* 2단계: 선택한 부서의 팀 목록 */}
                  {selectedDeptId && (
                    <>
                      <p className="text-xs font-medium text-gray-600 mb-2">
                        {deptList.find(d => d.id === selectedDeptId)?.name} — 팀 선택
                      </p>
                      <div className="space-y-2 ml-4">
                        {teamList.filter(t => t.department_id === selectedDeptId).length === 0 ? (
                          <p className="text-sm text-gray-400">등록된 팀이 없습니다.</p>
                        ) : (
                          teamList.filter(t => t.department_id === selectedDeptId).map(team => (
                            <label
                              key={team.id}
                              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                                team.is_management_support
                                  ? 'border-amber-400 bg-amber-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="management_support_team"
                                  checked={team.is_management_support}
                                  onChange={() => handleSetManagementSupportTeam(team)}
                                  disabled={savingMgmt}
                                  className="accent-amber-500"
                                />
                                <span className="text-sm font-medium text-gray-800">{team.name}</span>
                              </div>
                              {team.is_management_support && (
                                <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                                  지정됨
                                </span>
                              )}
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  )}

                  {savingMgmt && (
                    <p className="text-xs text-amber-600 mt-2">저장 중...</p>
                  )}
                </div>
              )}
            </div>
          )}


        </div>
      </div>
    </AdminLayout>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-gray-500">로딩 중...</div></div>}>
      <AdminSettingsContent />
    </Suspense>
  );
}