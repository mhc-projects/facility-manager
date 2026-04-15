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
  Factory,
  Plus,
  Pencil,
  Trash2,
  X,
  GripVertical,
  Tag,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from 'lucide-react';
import OrganizationManagement from '@/components/admin/OrganizationManagement';
import { TokenManager } from '@/lib/api-client';

// 탭 타입 정의
type SettingsTab = 'delay-criteria' | 'organization' | 'manufacturers' | 'progress-categories';

// 제조사 타입
interface Manufacturer {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

// 진행구분 타입
interface ProgressCategory {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

// 진행구분 실사용 현황 타입
interface ProgressCategoryUsage {
  progress_status: string;
  business_count: number;
}

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
    tabFromUrl && ['delay-criteria', 'organization', 'manufacturers', 'progress-categories'].includes(tabFromUrl)
      ? tabFromUrl
      : 'delay-criteria'
  );

  // 제조사 관리 상태
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [isLoadingManufacturers, setIsLoadingManufacturers] = useState(false);
  const [newManufacturerName, setNewManufacturerName] = useState('');
  const [isAddingManufacturer, setIsAddingManufacturer] = useState(false);
  const [editingManufacturer, setEditingManufacturer] = useState<Manufacturer | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSavingManufacturer, setIsSavingManufacturer] = useState(false);

  // 진행구분 관리 상태
  const [progressCategories, setProgressCategories] = useState<ProgressCategory[]>([]);
  const [isLoadingProgressCategories, setIsLoadingProgressCategories] = useState(false);
  const [newProgressCategoryName, setNewProgressCategoryName] = useState('');
  const [isAddingProgressCategory, setIsAddingProgressCategory] = useState(false);
  const [editingProgressCategory, setEditingProgressCategory] = useState<ProgressCategory | null>(null);
  const [editingProgressName, setEditingProgressName] = useState('');
  const [isSavingProgressCategory, setIsSavingProgressCategory] = useState(false);
  // 마이그레이션 상태
  const [usageList, setUsageList] = useState<ProgressCategoryUsage[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [migrateFrom, setMigrateFrom] = useState('');
  const [migrateTo, setMigrateTo] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

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

  // manufacturers 탭 진입 시 제조사 목록 로드
  useEffect(() => {
    if (activeTab === 'manufacturers' && manufacturers.length === 0) {
      loadManufacturers();
    }
  }, [activeTab]);

  const loadManufacturers = async () => {
    setIsLoadingManufacturers(true);
    try {
      const res = await fetch('/api/settings/manufacturers');
      const data = await res.json();
      if (data.success) setManufacturers(data.data);
    } catch (e) {
      console.error('제조사 목록 로드 실패:', e);
    } finally {
      setIsLoadingManufacturers(false);
    }
  };

  const handleAddManufacturer = async () => {
    const name = newManufacturerName.trim();
    if (!name) return;
    setIsAddingManufacturer(true);
    try {
      const res = await fetch('/api/settings/manufacturers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        setManufacturers(prev => [...prev, data.data]);
        setNewManufacturerName('');
        setMessage({ type: 'success', text: `'${name}' 제조사가 추가되었습니다.` });
      } else {
        setMessage({ type: 'error', text: data.message || '추가에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '추가 중 오류가 발생했습니다.' });
    } finally {
      setIsAddingManufacturer(false);
    }
  };

  const handleUpdateManufacturer = async () => {
    if (!editingManufacturer) return;
    const name = editingName.trim();
    if (!name) return;
    setIsSavingManufacturer(true);
    try {
      const res = await fetch('/api/settings/manufacturers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingManufacturer.id, name }),
      });
      const data = await res.json();
      if (data.success) {
        setManufacturers(prev => prev.map(m => m.id === editingManufacturer.id ? data.data : m));
        setEditingManufacturer(null);
        setEditingName('');
        setMessage({ type: 'success', text: '제조사 이름이 수정되었습니다.' });
      } else {
        setMessage({ type: 'error', text: data.message || '수정에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '수정 중 오류가 발생했습니다.' });
    } finally {
      setIsSavingManufacturer(false);
    }
  };

  const handleToggleManufacturerActive = async (m: Manufacturer) => {
    try {
      const res = await fetch('/api/settings/manufacturers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, is_active: !m.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        setManufacturers(prev => prev.map(item => item.id === m.id ? data.data : item));
      } else {
        setMessage({ type: 'error', text: data.message || '상태 변경에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '상태 변경 중 오류가 발생했습니다.' });
    }
  };

  // ─────────── 진행구분 관리 핸들러 ───────────

  useEffect(() => {
    if (activeTab === 'progress-categories') {
      if (progressCategories.length === 0) loadProgressCategories();
      loadUsage();
    }
  }, [activeTab]);

  const loadProgressCategories = async () => {
    setIsLoadingProgressCategories(true);
    try {
      const res = await fetch('/api/settings/progress-categories');
      const data = await res.json();
      if (data.success) setProgressCategories(data.data);
    } catch (e) {
      console.error('진행구분 목록 로드 실패:', e);
    } finally {
      setIsLoadingProgressCategories(false);
    }
  };

  const loadUsage = async () => {
    setIsLoadingUsage(true);
    try {
      const res = await fetch('/api/settings/progress-categories/migrate');
      const data = await res.json();
      if (data.success) setUsageList(data.data);
    } catch (e) {
      console.error('진행구분 사용 현황 로드 실패:', e);
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const handleAddProgressCategory = async () => {
    const name = newProgressCategoryName.trim();
    if (!name) return;
    setIsAddingProgressCategory(true);
    try {
      const res = await fetch('/api/settings/progress-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        setProgressCategories(prev => [...prev, data.data]);
        setNewProgressCategoryName('');
        setMessage({ type: 'success', text: `'${name}' 진행구분이 추가되었습니다.` });
      } else {
        setMessage({ type: 'error', text: data.message || '추가에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '추가 중 오류가 발생했습니다.' });
    } finally {
      setIsAddingProgressCategory(false);
    }
  };

  const handleUpdateProgressCategory = async () => {
    if (!editingProgressCategory) return;
    const name = editingProgressName.trim();
    if (!name) return;
    setIsSavingProgressCategory(true);
    try {
      const res = await fetch('/api/settings/progress-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingProgressCategory.id, name }),
      });
      const data = await res.json();
      if (data.success) {
        setProgressCategories(prev => prev.map(c => c.id === editingProgressCategory.id ? data.data : c));
        setEditingProgressCategory(null);
        setEditingProgressName('');
        setMessage({ type: 'success', text: '진행구분이 수정되었습니다.' });
      } else {
        setMessage({ type: 'error', text: data.message || '수정에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '수정 중 오류가 발생했습니다.' });
    } finally {
      setIsSavingProgressCategory(false);
    }
  };

  const handleToggleProgressCategoryActive = async (c: ProgressCategory) => {
    try {
      const res = await fetch('/api/settings/progress-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        setProgressCategories(prev => prev.map(item => item.id === c.id ? data.data : item));
      } else {
        setMessage({ type: 'error', text: data.message || '상태 변경에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '상태 변경 중 오류가 발생했습니다.' });
    }
  };

  const handleDeleteProgressCategory = async (c: ProgressCategory) => {
    if (!confirm(`'${c.name}' 진행구분을 삭제하시겠습니까?\n이미 등록된 사업장 데이터에는 영향을 주지 않습니다.`)) return;
    try {
      const res = await fetch(`/api/settings/progress-categories?id=${c.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setProgressCategories(prev => prev.filter(item => item.id !== c.id));
        setMessage({ type: 'success', text: `'${c.name}' 진행구분이 삭제되었습니다.` });
      } else {
        setMessage({ type: 'error', text: data.message || '삭제에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '삭제 중 오류가 발생했습니다.' });
    }
  };

  const handleReorderProgressCategory = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= progressCategories.length) return;

    const current = progressCategories[index];
    const target = progressCategories[targetIndex];

    // 로컬 상태 즉시 업데이트 (optimistic)
    const newList = [...progressCategories];
    newList[index] = { ...target, sort_order: current.sort_order };
    newList[targetIndex] = { ...current, sort_order: target.sort_order };
    setProgressCategories(newList);

    try {
      await Promise.all([
        fetch('/api/settings/progress-categories', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: current.id, sort_order: target.sort_order }),
        }),
        fetch('/api/settings/progress-categories', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: target.id, sort_order: current.sort_order }),
        }),
      ]);
    } catch {
      // 실패 시 원래 순서로 복구
      setProgressCategories(progressCategories);
      setMessage({ type: 'error', text: '순서 변경 중 오류가 발생했습니다.' });
    }
  };

  const handleMigrate = async () => {
    if (!migrateTo) { setMessage({ type: 'error', text: '변경될 진행구분을 선택해주세요.' }); return; }
    const fromLabel = migrateFrom || '(없음)';
    const target = usageList.find(u => u.progress_status === migrateFrom);
    const count = Number(target?.business_count ?? 0);
    if (!confirm(`'${fromLabel}' 진행구분의 사업장 ${count}개를 '${migrateTo}'로 일괄 변경하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setIsMigrating(true);
    try {
      const res = await fetch('/api/settings/progress-categories/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: migrateFrom, to: migrateTo }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setMigrateFrom('');
        setMigrateTo('');
        loadUsage(); // 현황 새로고침
      } else {
        setMessage({ type: 'error', text: data.message || '변경에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '변경 중 오류가 발생했습니다.' });
    } finally {
      setIsMigrating(false);
    }
  };

  // ─────────── 제조사 삭제 핸들러 ───────────

  const handleDeleteManufacturer = async (m: Manufacturer) => {
    if (!confirm(`'${m.name}' 제조사를 삭제하시겠습니까?\n이미 등록된 사업장 데이터에는 영향을 주지 않습니다.`)) return;
    try {
      const res = await fetch(`/api/settings/manufacturers?id=${m.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setManufacturers(prev => prev.filter(item => item.id !== m.id));
        setMessage({ type: 'success', text: `'${m.name}' 제조사가 삭제되었습니다.` });
      } else {
        setMessage({ type: 'error', text: data.message || '삭제에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '삭제 중 오류가 발생했습니다.' });
    }
  };

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
    {
      id: 'manufacturers' as const,
      name: '제조사 관리',
      icon: Factory,
      description: '사업장에서 선택 가능한 제조사 목록 관리'
    },
    {
      id: 'progress-categories' as const,
      name: '진행구분 관리',
      icon: Tag,
      description: '사업장 진행구분 항목 관리 및 일괄 변경'
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


          {/* 제조사 관리 탭 */}
          {activeTab === 'manufacturers' && (
            <div className="p-2 sm:p-6">
              <div className="max-w-lg">
                {/* 추가 폼 */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">새 제조사 추가</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newManufacturerName}
                      onChange={(e) => setNewManufacturerName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddManufacturer()}
                      placeholder="제조사 이름 입력"
                      maxLength={100}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={handleAddManufacturer}
                      disabled={isAddingManufacturer || !newManufacturerName.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      {isAddingManufacturer ? '추가 중...' : '추가'}
                    </button>
                  </div>
                </div>

                {/* 제조사 목록 */}
                {isLoadingManufacturers ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                  </div>
                ) : manufacturers.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">등록된 제조사가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {manufacturers.map((m) => (
                      <div
                        key={m.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          m.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

                        {editingManufacturer?.id === m.id ? (
                          <>
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateManufacturer();
                                if (e.key === 'Escape') { setEditingManufacturer(null); setEditingName(''); }
                              }}
                              autoFocus
                              maxLength={100}
                              className="flex-1 px-2 py-1 border border-blue-400 rounded text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={handleUpdateManufacturer}
                              disabled={isSavingManufacturer || !editingName.trim()}
                              className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingManufacturer(null); setEditingName(''); }}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className={`flex-1 text-sm font-medium ${m.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                              {m.name}
                            </span>
                            {!m.is_active && (
                              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">비활성</span>
                            )}
                            {/* 활성화 토글 */}
                            <button
                              type="button"
                              onClick={() => handleToggleManufacturerActive(m)}
                              className={`text-xs px-2 py-1 rounded border transition-colors ${
                                m.is_active
                                  ? 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                                  : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                              }`}
                              title={m.is_active ? '비활성화' : '활성화'}
                            >
                              {m.is_active ? '숨기기' : '표시'}
                            </button>
                            {/* 이름 편집 */}
                            <button
                              type="button"
                              onClick={() => { setEditingManufacturer(m); setEditingName(m.name); }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="이름 수정"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {/* 삭제 */}
                            <button
                              type="button"
                              onClick={() => handleDeleteManufacturer(m)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    📌 <strong>숨기기</strong>는 사업장 등록 폼의 제조사 선택 목록에서 해당 제조사를 숨깁니다. 이미 등록된 사업장 데이터에는 영향을 주지 않습니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 진행구분 관리 탭 */}
          {activeTab === 'progress-categories' && (
            <div className="p-2 sm:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* ① 항목 관리 */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-600" />
                    진행구분 항목 관리
                  </h4>

                  {/* 추가 폼 */}
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">새 진행구분 추가</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newProgressCategoryName}
                        onChange={(e) => setNewProgressCategoryName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddProgressCategory()}
                        placeholder="진행구분 이름 입력"
                        maxLength={100}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={handleAddProgressCategory}
                        disabled={isAddingProgressCategory || !newProgressCategoryName.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {isAddingProgressCategory ? '추가 중...' : '추가'}
                      </button>
                    </div>
                  </div>

                  {/* 목록 */}
                  {isLoadingProgressCategories ? (
                    <div className="flex items-center justify-center h-24">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                    </div>
                  ) : progressCategories.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">등록된 진행구분이 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {progressCategories.map((c, idx) => (
                        <div
                          key={c.id}
                          className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                            c.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
                          }`}
                        >
                          {/* 순서 버튼 */}
                          <div className="flex flex-col gap-0.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleReorderProgressCategory(idx, 'up')}
                              disabled={idx === 0}
                              className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              title="위로"
                            ><ArrowUp className="w-3 h-3" /></button>
                            <button
                              type="button"
                              onClick={() => handleReorderProgressCategory(idx, 'down')}
                              disabled={idx === progressCategories.length - 1}
                              className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              title="아래로"
                            ><ArrowDown className="w-3 h-3" /></button>
                          </div>
                          {editingProgressCategory?.id === c.id ? (
                            <>
                              <input
                                type="text"
                                value={editingProgressName}
                                onChange={(e) => setEditingProgressName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateProgressCategory();
                                  if (e.key === 'Escape') { setEditingProgressCategory(null); setEditingProgressName(''); }
                                }}
                                autoFocus
                                maxLength={100}
                                className="flex-1 px-2 py-1 border border-blue-400 rounded text-sm focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                type="button"
                                onClick={handleUpdateProgressCategory}
                                disabled={isSavingProgressCategory || !editingProgressName.trim()}
                                className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                              >저장</button>
                              <button
                                type="button"
                                onClick={() => { setEditingProgressCategory(null); setEditingProgressName(''); }}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                              ><X className="w-4 h-4" /></button>
                            </>
                          ) : (
                            <>
                              <span className={`flex-1 text-sm font-medium ${c.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                                {c.name}
                              </span>
                              {!c.is_active && (
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">비활성</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleProgressCategoryActive(c)}
                                className={`text-xs px-2 py-1 rounded border transition-colors ${
                                  c.is_active
                                    ? 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                                    : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                                }`}
                              >{c.is_active ? '숨기기' : '표시'}</button>
                              <button
                                type="button"
                                onClick={() => { setEditingProgressCategory(c); setEditingProgressName(c.name); }}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="이름 수정"
                              ><Pencil className="w-3.5 h-3.5" /></button>
                              <button
                                type="button"
                                onClick={() => handleDeleteProgressCategory(c)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="삭제"
                              ><Trash2 className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-800">
                      📌 <strong>숨기기</strong>는 사업장 등록 폼에서 해당 항목을 숨깁니다. 이미 등록된 사업장 데이터에는 영향을 주지 않습니다.
                    </p>
                  </div>
                </div>

                {/* ② 일괄 변경 (마이그레이션) */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-orange-500" />
                    기존 사업장 진행구분 일괄 변경
                  </h4>
                  <p className="text-xs text-gray-500 mb-5">
                    등록된 사업장의 진행구분을 다른 값으로 일괄 변경합니다. 항목을 정리하거나 이름을 바꿀 때 사용하세요.
                  </p>

                  {/* 현황 테이블 */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-600">현재 사용 중인 진행구분 현황</span>
                      <button
                        type="button"
                        onClick={loadUsage}
                        disabled={isLoadingUsage}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >새로고침</button>
                    </div>
                    {isLoadingUsage ? (
                      <div className="flex items-center justify-center h-16">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-gray-600">진행구분</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-600">사업장 수</th>
                            </tr>
                          </thead>
                          <tbody>
                            {usageList.length === 0 ? (
                              <tr><td colSpan={2} className="text-center py-4 text-gray-400">데이터 없음</td></tr>
                            ) : usageList.map((u, i) => (
                              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-800">
                                  {u.progress_status || <span className="text-gray-400 italic">(없음)</span>}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-gray-700">{u.business_count}개</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* 변경 폼 */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                    <p className="text-xs font-medium text-orange-800">⚠️ 아래 선택한 진행구분을 가진 모든 사업장이 변경됩니다.</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">변경 전</label>
                        <select
                          value={migrateFrom}
                          onChange={(e) => setMigrateFrom(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-orange-400 bg-white"
                        >
                          <option value="">(없음 / 미지정)</option>
                          {usageList.filter(u => u.progress_status).map(u => (
                            <option key={u.progress_status} value={u.progress_status}>
                              {u.progress_status} ({u.business_count}개)
                            </option>
                          ))}
                        </select>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-4" />
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">변경 후</label>
                        <select
                          value={migrateTo}
                          onChange={(e) => setMigrateTo(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-orange-400 bg-white"
                        >
                          <option value="">선택하세요</option>
                          {progressCategories.map(c => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleMigrate}
                      disabled={isMigrating || !migrateTo || migrateFrom === migrateTo}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isMigrating ? (
                        <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />변경 중...</>
                      ) : (
                        <><RefreshCw className="w-4 h-4" />일괄 변경 실행</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
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