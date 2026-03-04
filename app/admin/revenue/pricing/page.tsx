'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { withAuth, useAuth } from '@/contexts/AuthContext';
import { TokenManager } from '@/lib/api-client';
import AdminLayout from '@/components/ui/AdminLayout';
import StatsCard from '@/components/ui/StatsCard';
import Modal, { ModalActions, ConfirmModal } from '@/components/ui/Modal';
import { CommissionRateManager } from '@/components/CommissionRateManager';
import {
  DollarSign,
  Edit,
  Save,
  Plus,
  AlertTriangle,
  History,
  Settings,
  Building2,
  Calculator,
  FileText,
  Trash2,
  Loader2,
  Percent
} from 'lucide-react';

// 날짜 포맷 함수 (yyyy-mm-dd 형식)
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    return dateString;
  }
}

// 가격 포맷 함수 (천 단위 구분, 소수점 제거)
function formatPrice(amount: number): string {
  return Math.round(amount).toLocaleString('ko-KR');
}

// 제조사 이름 매핑 함수
function getManufacturerName(manufacturer: string): string {
  const names: Record<string, string> = {
    'ecosense': '에코센스',
    'cleanearth': '크린어스',
    'gaia_cns': '가이아씨앤에스',
    'evs': '이브이에스'
  };
  return names[manufacturer] || manufacturer;
}

// 제조사별 색상 클래스 함수
function getManufacturerColorClass(manufacturer: string): string {
  const colors: Record<string, string> = {
    'ecosense': 'bg-blue-100 text-blue-800 border-blue-200',
    'cleanearth': 'bg-green-100 text-green-800 border-green-200',
    'gaia_cns': 'bg-purple-100 text-purple-800 border-purple-200',
    'evs': 'bg-orange-100 text-orange-800 border-orange-200'
  };
  return colors[manufacturer] || 'bg-gray-100 text-gray-800 border-gray-200';
}

interface GovernmentPricing {
  id: string;
  equipment_type: string;
  equipment_name: string;
  official_price: number;
  manufacturer_price: number;
  installation_cost: number;
  effective_from: string;
  effective_to?: string;
  announcement_number?: string;
  is_active: boolean;
}

interface SalesOfficeSetting {
  id: string;
  sales_office: string;
  commission_type: 'percentage' | 'per_unit';
  commission_percentage?: number;
  commission_per_unit?: number;
  effective_from: string;
  is_active: boolean;
}

interface SurveyCost {
  id: string;
  survey_type: 'estimate' | 'pre_construction' | 'completion';
  survey_name: string;
  base_cost: number;
  effective_from: string;
  is_active: boolean;
}

interface ManufacturerPricing {
  id: string;
  equipment_type: string;
  equipment_name: string;
  manufacturer: 'ecosense' | 'cleanearth' | 'gaia_cns' | 'evs';
  cost_price: number;
  effective_from: string;
  effective_to?: string;
  notes?: string;
  is_active: boolean;
}

interface InstallationCost {
  id: string;
  equipment_type: string;
  equipment_name: string;
  base_installation_cost: number;
  effective_from: string;
  effective_to?: string;
  notes?: string;
  is_active: boolean;
}

interface DealerPricing {
  id: string;
  equipment_type: string;
  equipment_name: string;
  dealer_cost_price: number;
  dealer_selling_price: number;
  margin_rate: number;
  manufacturer?: string;
  effective_from: string;
  effective_to?: string;
  notes?: string;
  is_active: boolean;
}

function PricingManagement() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('government');
  const [governmentPricing, setGovernmentPricing] = useState<GovernmentPricing[]>([]);
  const [salesOfficeSettings, setSalesOfficeSettings] = useState<SalesOfficeSetting[]>([]);
  const [surveyCosts, setSurveyCosts] = useState<SurveyCost[]>([]);
  const [manufacturerPricing, setManufacturerPricing] = useState<ManufacturerPricing[]>([]);
  const [installationCosts, setInstallationCosts] = useState<InstallationCost[]>([]);
  const [dealerPricing, setDealerPricing] = useState<DealerPricing[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 편집 관련 상태
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editType, setEditType] = useState<'government' | 'sales' | 'survey' | 'manufacturer' | 'installation' | 'dealer'>('government');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  // AuthContext에서 권한 정보 가져오기
  const { user, permissions } = useAuth();
  const userPermission = user?.permission_level || 0;

  useEffect(() => {
    loadAllData();
  }, []);

  const getAuthHeaders = () => {
    const token = TokenManager.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadGovernmentPricing(),
        loadSalesOfficeSettings(),
        loadSurveyCosts(),
        loadManufacturerPricing(),
        loadInstallationCosts(),
        loadDealerPricing()
      ]);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGovernmentPricing = async () => {
    try {
      const response = await fetch('/api/revenue/government-pricing', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setGovernmentPricing(data.data.pricing || []);
      }
    } catch (error) {
      console.error('정부 고시가 로드 오류:', error);
    }
  };

  const loadSalesOfficeSettings = async () => {
    try {
      const response = await fetch('/api/revenue/sales-office-settings', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setSalesOfficeSettings(data.data.settings || []);
      }
    } catch (error) {
      console.error('영업점 설정 로드 오류:', error);
    }
  };

  const loadSurveyCosts = async () => {
    try {
      const response = await fetch('/api/revenue/survey-costs', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setSurveyCosts(data.data || []);
      } else {
        console.error('실사비용 로드 실패:', data.message);
        // 실패 시 기본 데이터 사용
        setSurveyCosts([
          {
            id: '1',
            survey_type: 'estimate',
            survey_name: '견적실사',
            base_cost: 100000,
            effective_from: '2025-01-01',
            is_active: true
          },
          {
            id: '2',
            survey_type: 'pre_construction',
            survey_name: '착공전실사',
            base_cost: 150000,
            effective_from: '2025-01-01',
            is_active: true
          },
          {
            id: '3',
            survey_type: 'completion',
            survey_name: '준공실사',
            base_cost: 200000,
            effective_from: '2025-01-01',
            is_active: true
          }
        ]);
      }
    } catch (error) {
      console.error('실사비용 로드 오류:', error);
      // 오류 시 기본 데이터 사용
      setSurveyCosts([
        {
          id: '1',
          survey_type: 'estimate',
          survey_name: '견적실사',
          base_cost: 100000,
          effective_from: '2025-01-01',
          is_active: true
        },
        {
          id: '2',
          survey_type: 'pre_construction',
          survey_name: '착공전실사',
          base_cost: 150000,
          effective_from: '2025-01-01',
          is_active: true
        },
        {
          id: '3',
          survey_type: 'completion',
          survey_name: '준공실사',
          base_cost: 200000,
          effective_from: '2025-01-01',
          is_active: true
        }
      ]);
    }
  };

  const loadManufacturerPricing = async () => {
    try {
      const response = await fetch('/api/revenue/manufacturer-pricing', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setManufacturerPricing(data.data.pricing || []);
      }
    } catch (error) {
      console.error('제조사별 원가 로드 오류:', error);
    }
  };

  const loadInstallationCosts = async () => {
    try {
      const response = await fetch('/api/revenue/installation-cost', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setInstallationCosts(data.data.costs || []);
      }
    } catch (error) {
      console.error('기본 설치비 로드 오류:', error);
    }
  };

  const loadDealerPricing = async () => {
    try {
      const response = await fetch('/api/revenue/dealer-pricing', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setDealerPricing(data.data || []);
      }
    } catch (error) {
      console.error('대리점 가격 로드 오류:', error);
    }
  };

  const handleEdit = (item: any, type: 'government' | 'sales' | 'survey' | 'manufacturer' | 'installation' | 'dealer') => {
    setEditingItem(item);
    setEditType(type);
    setIsEditModalOpen(true);
  };

  const handleSave = async (formData: any) => {
    setSaving(true);
    try {
      let endpoint = '';
      let method = 'POST';
      const isEditMode = !!editingItem;

      switch (editType) {
        case 'government':
          endpoint = '/api/revenue/government-pricing';
          break;
        case 'sales':
          endpoint = '/api/revenue/sales-office-settings';
          break;
        case 'survey':
          endpoint = '/api/revenue/survey-costs';
          method = isEditMode ? 'PATCH' : 'POST';
          break;
        case 'manufacturer':
          endpoint = '/api/revenue/manufacturer-pricing';
          method = isEditMode ? 'PATCH' : 'POST';
          break;
        case 'installation':
          endpoint = '/api/revenue/installation-cost';
          method = isEditMode ? 'PATCH' : 'POST';
          break;
        case 'dealer':
          endpoint = '/api/revenue/dealer-pricing';
          method = isEditMode ? 'PUT' : 'POST';
          break;
      }

      const response = await fetch(endpoint, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        // 원가 변경 시 매출 관리 페이지의 pricing 캐시 무효화
        sessionStorage.removeItem('revenue_pricing_cache');
        sessionStorage.removeItem('revenue_pricing_cache_time');
        alert('저장되었습니다.');
        setIsEditModalOpen(false);
        setEditingItem(null);
        loadAllData();
      } else {
        alert('저장 실패: ' + data.message);
      }
    } catch (error) {
      console.error('저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) {
      console.log('⚠️ deleteItem이 없습니다');
      return;
    }

    console.log('🗑️ 삭제 시작:', { id: deleteItem.id, type: editType, name: deleteItem.equipment_name });

    try {
      let endpoint = '';

      switch (editType) {
        case 'government':
          endpoint = `/api/revenue/government-pricing?id=${deleteItem.id}`;
          break;
        case 'sales':
          endpoint = `/api/revenue/sales-office-settings?id=${deleteItem.id}`;
          break;
        case 'survey':
          endpoint = `/api/revenue/survey-costs?id=${deleteItem.id}`;
          break;
        case 'manufacturer':
          endpoint = `/api/revenue/manufacturer-pricing?id=${deleteItem.id}`;
          break;
        case 'installation':
          endpoint = `/api/revenue/installation-cost?id=${deleteItem.id}`;
          break;
        case 'dealer':
          endpoint = `/api/revenue/dealer-pricing?id=${deleteItem.id}`;
          break;
      }

      console.log('🌐 DELETE 요청:', endpoint);

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      console.log('📡 응답 상태:', response.status);

      const data = await response.json();
      console.log('📦 응답 데이터:', data);

      if (data.success) {
        // 원가 변경 시 매출 관리 페이지의 pricing 캐시 무효화
        sessionStorage.removeItem('revenue_pricing_cache');
        sessionStorage.removeItem('revenue_pricing_cache_time');
        alert('삭제되었습니다.');
        setIsDeleteModalOpen(false);
        setDeleteItem(null);
        console.log('🔄 데이터 재로드 시작...');
        await loadAllData();
        console.log('✅ 데이터 재로드 완료');
      } else {
        alert('삭제 실패: ' + data.message);
        console.error('❌ 삭제 실패:', data.message);
      }
    } catch (error) {
      console.error('❌ 삭제 오류:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const openDeleteModal = (item: any, type: 'government' | 'sales' | 'survey' | 'manufacturer' | 'installation' | 'dealer') => {
    setDeleteItem(item);
    setEditType(type);
    setIsDeleteModalOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(amount);
  };

  const tabs = [
    { id: 'government', label: '환경부 고시가', icon: FileText },
    { id: 'manufacturer', label: '제조사별 원가', icon: Settings },
    { id: 'installation', label: '기본 설치비', icon: DollarSign },
    { id: 'dealer', label: '대리점 가격', icon: Building2 },
    { id: 'sales', label: '영업점 설정', icon: Building2 },
    { id: 'commission', label: '제조사별 수수료율', icon: Percent },
    { id: 'survey', label: '실사비용', icon: Calculator }
  ];

  return (
    <AdminLayout
      title="원가 관리"
      description="환경부 고시가, 제조사별 원가, 대리점 가격, 영업점 설정, 실사비용 관리"
      actions={
        <button
          onClick={() => router.push('/admin/revenue')}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
        >
          <DollarSign className="w-4 h-4" />
          매출 대시보드
        </button>
      }
    >
      <div className="space-y-6">

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatsCard
            title="활성 기기 종류"
            value={`${governmentPricing.filter(p => p.is_active).length}개`}
            icon={FileText}
            color="blue"
            description="환경부 고시가 등록 기기"
          />
          <StatsCard
            title="제조사별 원가"
            value={`${manufacturerPricing.filter(p => p.is_active).length}개`}
            icon={Settings}
            color="orange"
            description="제조사별 기기 원가"
          />
          <StatsCard
            title="대리점 가격"
            value={`${dealerPricing.filter(p => p.is_active).length}개`}
            icon={Building2}
            color="green"
            description="대리점 판매 가격"
          />
          <StatsCard
            title="영업점 수"
            value={`${salesOfficeSettings.length}개`}
            icon={Building2}
            color="purple"
            description="등록된 영업점"
          />
        </div>

        {/* 탭 네비게이션 */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 rounded-t-lg sm:rounded-t-xl overflow-x-auto">
            <nav className="flex space-x-4 sm:space-x-8 px-3 sm:px-6 min-w-max">
              {tabs.map(tab => {
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 py-3 sm:py-4 px-2 sm:px-0 border-b-2 transition-all duration-200 text-xs sm:text-sm font-medium whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-3 sm:p-4 md:p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-600" />
                <span className="text-gray-600">데이터를 불러오는 중...</span>
              </div>
            ) : (
              <>
                {/* 환경부 고시가 탭 */}
                {activeTab === 'government' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <h3 className="text-base md:text-lg font-semibold">환경부 고시가 관리</h3>
                      <button
                        onClick={() => handleEdit(null, 'government')}
                        className="px-3 md:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">새 가격 추가</span>
                        <span className="sm:hidden">추가</span>
                      </button>
                    </div>

                    {/* 모바일 카드뷰 */}
                    <div className="md:hidden space-y-3">
                      {governmentPricing.map(pricing => (
                        <div key={pricing.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="font-semibold text-gray-900">{pricing.equipment_name}</h4>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              pricing.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {pricing.is_active ? '활성' : '비활성'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                            <div>
                              <div className="text-gray-500">환경부 고시가</div>
                              <div className="font-mono font-semibold text-green-700">{formatCurrency(pricing.official_price)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">제조사 원가</div>
                              <div className="font-mono font-semibold text-red-700">{formatCurrency(pricing.manufacturer_price)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">설치비용</div>
                              <div className="font-mono font-medium">{formatCurrency(pricing.installation_cost)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">시행일</div>
                              <div className="font-medium">{formatDate(pricing.effective_from)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                            <button
                              onClick={() => handleEdit(pricing, 'government')}
                              className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-1"
                            >
                              <Edit className="w-3 h-3" />
                              수정
                            </button>
                            <button
                              onClick={() => openDeleteModal(pricing, 'government')}
                              className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 데스크톱 테이블뷰 */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-4 py-2 text-left">기기명</th>
                            <th className="border border-gray-300 px-4 py-2 text-right">환경부 고시가</th>
                            <th className="border border-gray-300 px-4 py-2 text-right">제조사 원가</th>
                            <th className="border border-gray-300 px-4 py-2 text-right">설치비용</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">시행일</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">상태</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {governmentPricing.map(pricing => (
                            <tr key={pricing.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2">{pricing.equipment_name}</td>
                              <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                                {formatCurrency(pricing.official_price)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                                {formatCurrency(pricing.manufacturer_price)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                                {formatCurrency(pricing.installation_cost)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {formatDate(pricing.effective_from)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  pricing.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {pricing.is_active ? '활성' : '비활성'}
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleEdit(pricing, 'government')}
                                    className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                                    title="수정"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => openDeleteModal(pricing, 'government')}
                                    className="p-1 text-red-600 hover:text-red-800 transition-colors"
                                    title="삭제"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 영업점 설정 탭 */}
                {activeTab === 'sales' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <h3 className="text-base md:text-lg font-semibold">영업점 수수료 설정</h3>
                      <button
                        onClick={() => handleEdit(null, 'sales')}
                        className="px-3 md:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">새 설정 추가</span>
                        <span className="sm:hidden">추가</span>
                      </button>
                    </div>

                    {/* 모바일 카드뷰 */}
                    <div className="md:hidden space-y-3">
                      {salesOfficeSettings.map(setting => (
                        <div key={setting.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="font-semibold text-gray-900">{setting.sales_office}</h4>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              setting.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {setting.is_active ? '활성' : '비활성'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                            <div>
                              <div className="text-gray-500">수수료 방식</div>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                setting.commission_type === 'percentage' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {setting.commission_type === 'percentage' ? '매출 비율' : '기기당 단가'}
                              </span>
                            </div>
                            <div>
                              <div className="text-gray-500">수수료율</div>
                              <div className="font-mono font-semibold text-blue-700">
                                {setting.commission_type === 'percentage'
                                  ? `${setting.commission_percentage}%`
                                  : formatCurrency(setting.commission_per_unit || 0)
                                }
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-gray-500">시행일</div>
                              <div className="font-medium">{formatDate(setting.effective_from)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                            <button
                              onClick={() => handleEdit(setting, 'sales')}
                              className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-1"
                            >
                              <Edit className="w-3 h-3" />
                              수정
                            </button>
                            <button
                              onClick={() => openDeleteModal(setting, 'sales')}
                              className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 데스크톱 테이블뷰 */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-4 py-2 text-left">영업점</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">수수료 방식</th>
                            <th className="border border-gray-300 px-4 py-2 text-right">수수료율</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">시행일</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">상태</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesOfficeSettings.map(setting => (
                            <tr key={setting.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2 font-medium">{setting.sales_office}</td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  setting.commission_type === 'percentage' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                }`}>
                                  {setting.commission_type === 'percentage' ? '매출 비율' : '기기당 단가'}
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                                {setting.commission_type === 'percentage'
                                  ? `${setting.commission_percentage}%`
                                  : formatCurrency(setting.commission_per_unit || 0)
                                }
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {formatDate(setting.effective_from)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  setting.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {setting.is_active ? '활성' : '비활성'}
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleEdit(setting, 'sales')}
                                    className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                                    title="수정"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => openDeleteModal(setting, 'sales')}
                                    className="p-1 text-red-600 hover:text-red-800 transition-colors"
                                    title="삭제"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 실사비용 탭 */}
                {activeTab === 'survey' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <h3 className="text-base md:text-lg font-semibold">실사비용 관리</h3>
                      <button
                        onClick={() => handleEdit(null, 'survey')}
                        className="px-3 md:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">새 비용 추가</span>
                        <span className="sm:hidden">추가</span>
                      </button>
                    </div>

                    {/* 모바일 카드뷰 */}
                    <div className="md:hidden space-y-3">
                      {surveyCosts.map(cost => (
                        <div key={cost.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-1">{cost.survey_name}</h4>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                cost.survey_type === 'estimate' ? 'bg-yellow-100 text-yellow-800' :
                                cost.survey_type === 'pre_construction' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {cost.survey_type}
                              </span>
                            </div>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              cost.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {cost.is_active ? '활성' : '비활성'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                            <div>
                              <div className="text-gray-500">기본 비용</div>
                              <div className="font-mono font-semibold text-blue-700">{formatCurrency(cost.base_cost)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">시행일</div>
                              <div className="font-medium">{formatDate(cost.effective_from)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                            <button
                              onClick={() => handleEdit(cost, 'survey')}
                              className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-1"
                            >
                              <Edit className="w-3 h-3" />
                              수정
                            </button>
                            <button
                              onClick={() => openDeleteModal(cost, 'survey')}
                              className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 데스크톱 테이블뷰 */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-4 py-2 text-left">실사 유형</th>
                            <th className="border border-gray-300 px-4 py-2 text-left">실사명</th>
                            <th className="border border-gray-300 px-4 py-2 text-right">기본 비용</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">시행일</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">상태</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {surveyCosts.map(cost => (
                            <tr key={cost.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  cost.survey_type === 'estimate' ? 'bg-yellow-100 text-yellow-800' :
                                  cost.survey_type === 'pre_construction' ? 'bg-blue-100 text-blue-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {cost.survey_type}
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 font-medium">{cost.survey_name}</td>
                              <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                                {formatCurrency(cost.base_cost)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {formatDate(cost.effective_from)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  cost.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {cost.is_active ? '활성' : '비활성'}
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleEdit(cost, 'survey')}
                                    className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                                    title="수정"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => openDeleteModal(cost, 'survey')}
                                    className="p-1 text-red-600 hover:text-red-800 transition-colors"
                                    title="삭제"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 제조사별 수수료율 탭 */}
                {activeTab === 'commission' && (
                  <CommissionRateManager />
                )}

                {/* 제조사별 원가 탭 */}
                {activeTab === 'manufacturer' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <h3 className="text-base md:text-lg font-semibold">제조사별 원가 관리</h3>
                      <button
                        onClick={() => handleEdit(null, 'manufacturer')}
                        className="px-3 md:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">새 제조사 원가 추가</span>
                        <span className="sm:hidden">추가</span>
                      </button>
                    </div>

                    {/* 제조사별 그룹화된 뷰 */}
                    {(() => {
                      // 제조사별로 데이터 그룹화
                      const groupedByManufacturer = manufacturerPricing.reduce((acc, pricing) => {
                        if (!acc[pricing.manufacturer]) {
                          acc[pricing.manufacturer] = [];
                        }
                        acc[pricing.manufacturer].push(pricing);
                        return acc;
                      }, {} as Record<string, typeof manufacturerPricing>);

                      const manufacturers = Object.keys(groupedByManufacturer).sort();

                      return manufacturers.map(manufacturer => {
                        const items = groupedByManufacturer[manufacturer];

                        return (
                          <div key={manufacturer} className="space-y-3">
                            {/* 제조사 헤더 */}
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getManufacturerColorClass(manufacturer)}`}>
                              <Building2 className="w-5 h-5" />
                              <h4 className="font-bold text-lg">{getManufacturerName(manufacturer)}</h4>
                              <span className="ml-auto text-sm font-medium">({items.length}개 기기)</span>
                            </div>

                            {/* 모바일 카드뷰 */}
                            <div className="md:hidden space-y-3">
                              {items.map(pricing => (
                                <div key={pricing.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                                  <div className="flex items-start justify-between mb-3">
                                    <h4 className="font-semibold text-gray-900">{pricing.equipment_name}</h4>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      pricing.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {pricing.is_active ? '활성' : '비활성'}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                    <div>
                                      <div className="text-gray-500">원가</div>
                                      <div className="font-mono font-semibold text-red-700">₩{formatPrice(pricing.cost_price)}</div>
                                    </div>
                                    <div>
                                      <div className="text-gray-500">시행일</div>
                                      <div className="font-medium">{formatDate(pricing.effective_from)}</div>
                                    </div>
                                    {pricing.effective_to && (
                                      <div className="col-span-2">
                                        <div className="text-gray-500">종료일</div>
                                        <div className="font-medium">{formatDate(pricing.effective_to)}</div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                                    <button
                                      onClick={() => handleEdit(pricing, 'manufacturer')}
                                      className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-1"
                                    >
                                      <Edit className="w-3 h-3" />
                                      수정
                                    </button>
                                    <button
                                      onClick={() => openDeleteModal(pricing, 'manufacturer')}
                                      className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      삭제
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* 데스크톱 테이블뷰 */}
                            <div className="hidden md:block overflow-x-auto">
                              <table className="w-full border-collapse border border-gray-300">
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="border border-gray-300 px-4 py-2 text-left">기기명</th>
                                    <th className="border border-gray-300 px-4 py-2 text-right">원가</th>
                                    <th className="border border-gray-300 px-4 py-2 text-center">시행일</th>
                                    <th className="border border-gray-300 px-4 py-2 text-center">종료일</th>
                                    <th className="border border-gray-300 px-4 py-2 text-center">상태</th>
                                    <th className="border border-gray-300 px-4 py-2 text-center">작업</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map(pricing => (
                                    <tr key={pricing.id} className="hover:bg-gray-50">
                                      <td className="border border-gray-300 px-4 py-2 font-medium">{pricing.equipment_name}</td>
                                      <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                                        ₩{formatPrice(pricing.cost_price)}
                                      </td>
                                      <td className="border border-gray-300 px-4 py-2 text-center">
                                        {formatDate(pricing.effective_from)}
                                      </td>
                                      <td className="border border-gray-300 px-4 py-2 text-center">
                                        {formatDate(pricing.effective_to)}
                                      </td>
                                      <td className="border border-gray-300 px-4 py-2 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                          pricing.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                          {pricing.is_active ? '활성' : '비활성'}
                                        </span>
                                      </td>
                                      <td className="border border-gray-300 px-4 py-2 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          <button
                                            onClick={() => handleEdit(pricing, 'manufacturer')}
                                            className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                                            title="수정"
                                          >
                                            <Edit className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={() => openDeleteModal(pricing, 'manufacturer')}
                                            className="p-1 text-red-600 hover:text-red-800 transition-colors"
                                            title="삭제"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* 기본 설치비 탭 */}
                {activeTab === 'installation' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <h3 className="text-base md:text-lg font-semibold">기본 설치비 관리</h3>
                      <button
                        onClick={() => handleEdit(null, 'installation')}
                        className="px-3 md:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">새 설치비 추가</span>
                        <span className="sm:hidden">추가</span>
                      </button>
                    </div>

                    {/* 모바일 카드뷰 */}
                    <div className="md:hidden space-y-3">
                      {installationCosts.map(cost => (
                        <div key={cost.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="font-semibold text-gray-900">{cost.equipment_name}</h4>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              cost.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {cost.is_active ? '활성' : '비활성'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                            <div className="col-span-2">
                              <div className="text-gray-500">기본 설치비</div>
                              <div className="font-mono font-semibold text-blue-700">₩{formatPrice(cost.base_installation_cost)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">시행일</div>
                              <div className="font-medium">{formatDate(cost.effective_from)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">종료일</div>
                              <div className="font-medium">{formatDate(cost.effective_to)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                            <button
                              onClick={() => handleEdit(cost, 'installation')}
                              className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-1 transition-colors"
                            >
                              <Edit className="w-3 h-3" />
                              수정
                            </button>
                            <button
                              onClick={() => openDeleteModal(cost, 'installation')}
                              className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-1 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 데스크톱 테이블뷰 */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-4 py-2 text-left">기기명</th>
                            <th className="border border-gray-300 px-4 py-2 text-right">기본 설치비</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">시행일</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">종료일</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">상태</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {installationCosts.map(cost => (
                            <tr key={cost.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2 font-medium">{cost.equipment_name}</td>
                              <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                                ₩{formatPrice(cost.base_installation_cost)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {formatDate(cost.effective_from)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {formatDate(cost.effective_to)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  cost.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {cost.is_active ? '활성' : '비활성'}
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleEdit(cost, 'installation')}
                                    className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                                    title="수정"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => openDeleteModal(cost, 'installation')}
                                    className="p-1 text-red-600 hover:text-red-800 transition-colors"
                                    title="삭제"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 대리점 가격 탭 */}
                {activeTab === 'dealer' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <h3 className="text-base md:text-lg font-semibold">대리점 가격 관리</h3>
                      <button
                        onClick={() => handleEdit(null, 'dealer')}
                        className="px-3 md:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">새 대리점 가격 추가</span>
                        <span className="sm:hidden">추가</span>
                      </button>
                    </div>

                    {/* 모바일 카드뷰 */}
                    <div className="md:hidden space-y-3">
                      {dealerPricing.map(pricing => (
                        <div key={pricing.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-1">{pricing.equipment_name}</h4>
                              {pricing.manufacturer && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  pricing.manufacturer === '에코센스' ? 'bg-blue-100 text-blue-800' :
                                  pricing.manufacturer === '크린어스' ? 'bg-green-100 text-green-800' :
                                  pricing.manufacturer === '가이아씨앤에스' ? 'bg-purple-100 text-purple-800' :
                                  pricing.manufacturer === '이브이에스' ? 'bg-orange-100 text-orange-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {pricing.manufacturer}
                                </span>
                              )}
                            </div>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              pricing.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {pricing.is_active ? '활성' : '비활성'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                            <div>
                              <div className="text-gray-500">공급가</div>
                              <div className="font-mono font-semibold text-blue-700">{formatCurrency(pricing.dealer_cost_price)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">판매가</div>
                              <div className="font-mono font-semibold text-green-700">{formatCurrency(pricing.dealer_selling_price)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">마진율</div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                {(typeof pricing.margin_rate === 'number' ? pricing.margin_rate : parseFloat(pricing.margin_rate || '0')).toFixed(2)}%
                              </span>
                            </div>
                            <div>
                              <div className="text-gray-500">시행일</div>
                              <div className="font-medium">{formatDate(pricing.effective_from)}</div>
                            </div>
                            {pricing.effective_to && (
                              <div className="col-span-2">
                                <div className="text-gray-500">종료일</div>
                                <div className="font-medium">{formatDate(pricing.effective_to)}</div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                            <button
                              onClick={() => handleEdit(pricing, 'dealer')}
                              className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-1"
                            >
                              <Edit className="w-3 h-3" />
                              수정
                            </button>
                            <button
                              onClick={() => openDeleteModal(pricing, 'dealer')}
                              className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 데스크톱 테이블뷰 */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-4 py-2 text-left">기기명</th>
                            <th className="border border-gray-300 px-4 py-2 text-left">제조사</th>
                            <th className="border border-gray-300 px-4 py-2 text-right">공급가</th>
                            <th className="border border-gray-300 px-4 py-2 text-right">판매가</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">마진율</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">시행일</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">종료일</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">상태</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dealerPricing.map(pricing => (
                            <tr key={pricing.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2 font-medium">{pricing.equipment_name}</td>
                              <td className="border border-gray-300 px-4 py-2">
                                {pricing.manufacturer ? (
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    pricing.manufacturer === '에코센스' ? 'bg-blue-100 text-blue-800' :
                                    pricing.manufacturer === '크린어스' ? 'bg-green-100 text-green-800' :
                                    pricing.manufacturer === '가이아씨앤에스' ? 'bg-purple-100 text-purple-800' :
                                    pricing.manufacturer === '이브이에스' ? 'bg-orange-100 text-orange-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {pricing.manufacturer}
                                  </span>
                                ) : '-'}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                                {formatCurrency(pricing.dealer_cost_price)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                                {formatCurrency(pricing.dealer_selling_price)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  {(typeof pricing.margin_rate === 'number' ? pricing.margin_rate : parseFloat(pricing.margin_rate || '0')).toFixed(2)}%
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {formatDate(pricing.effective_from)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {formatDate(pricing.effective_to)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  pricing.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {pricing.is_active ? '활성' : '비활성'}
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleEdit(pricing, 'dealer')}
                                    className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                                    title="수정"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => openDeleteModal(pricing, 'dealer')}
                                    className="p-1 text-red-600 hover:text-red-800 transition-colors"
                                    title="삭제"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 편집 모달 */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={`${editingItem ? '수정' : '추가'} - ${
            editType === 'government' ? '환경부 고시가' :
            editType === 'manufacturer' ? '제조사별 원가' :
            editType === 'installation' ? '기본 설치비' :
            editType === 'dealer' ? '대리점 가격' :
            editType === 'sales' ? '영업점 설정' : '실사비용'
          }`}
          size="md"
        >
          <EditForm
            item={editingItem}
            type={editType}
            onSave={handleSave}
            onCancel={() => {
              setIsEditModalOpen(false);
              setEditingItem(null);
            }}
            saving={saving}
          />
        </Modal>

        {/* 삭제 확인 모달 */}
        <ConfirmModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setDeleteItem(null);
          }}
          onConfirm={handleDelete}
          title="삭제 확인"
          message={`"${deleteItem?.equipment_name || deleteItem?.sales_office || deleteItem?.survey_name || ''}" 항목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
          variant="danger"
        />
      </div>
    </AdminLayout>
  );
}

// 편집 폼 컴포넌트
function EditForm({ item, type, onSave, onCancel, saving }: {
  item: any;
  type: 'government' | 'sales' | 'survey' | 'manufacturer' | 'installation' | 'dealer';
  onSave: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (item) {
      setFormData(item);
    } else {
      // 새 항목 초기값 설정
      const defaultData: any = {
        effective_from: new Date().toISOString().split('T')[0],
        is_active: true
      };

      // sales 타입인 경우 commission_type 기본값 설정
      if (type === 'sales') {
        defaultData.commission_type = 'percentage';
      }

      setFormData(defaultData);
    }
  }, [item, type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {type === 'government' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">기기명</label>
            <input
              type="text"
              value={formData.equipment_name || ''}
              onChange={(e) => setFormData({...formData, equipment_name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">환경부 고시가</label>
            <input
              type="number"
              value={formData.official_price || ''}
              onChange={(e) => setFormData({...formData, official_price: Number(e.target.value)})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">제조사 원가</label>
            <input
              type="number"
              value={formData.manufacturer_price || ''}
              onChange={(e) => setFormData({...formData, manufacturer_price: Number(e.target.value)})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">활성 상태</span>
            </label>
          </div>
        </>
      )}

      {type === 'sales' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">영업점</label>
            <input
              type="text"
              value={formData.sales_office || ''}
              onChange={(e) => setFormData({...formData, sales_office: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">수수료 방식</label>
            <select
              value={formData.commission_type || 'percentage'}
              onChange={(e) => setFormData({...formData, commission_type: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="percentage">매출 비율</option>
              <option value="per_unit">기기당 단가</option>
            </select>
          </div>
          {formData.commission_type === 'percentage' ? (
            <div>
              <label className="block text-sm font-medium mb-1">수수료율 (%)</label>
              <input
                type="number"
                step="0.1"
                value={formData.commission_percentage ?? ''}
                onChange={(e) => setFormData({...formData, commission_percentage: Number(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">기기당 수수료</label>
              <input
                type="number"
                value={formData.commission_per_unit ?? ''}
                onChange={(e) => setFormData({...formData, commission_per_unit: Number(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">활성 상태</span>
            </label>
          </div>
        </>
      )}

      {type === 'manufacturer' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">
              기기 종류 (코드) {item?.id && <span className="text-xs text-gray-500">(수정 불가)</span>}
            </label>
            <input
              type="text"
              value={formData.equipment_type || ''}
              onChange={(e) => setFormData({...formData, equipment_type: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="예: ph_meter"
              disabled={!!item?.id}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">기기명</label>
            <input
              type="text"
              value={formData.equipment_name || ''}
              onChange={(e) => setFormData({...formData, equipment_name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="예: PH센서"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">제조사</label>
            <select
              value={formData.manufacturer || ''}
              onChange={(e) => setFormData({...formData, manufacturer: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">선택하세요</option>
              <option value="ecosense">에코센스</option>
              <option value="cleanearth">크린어스</option>
              <option value="gaia_cns">가이아씨앤에스</option>
              <option value="evs">이브이에스</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">원가 (₩)</label>
            <input
              type="number"
              value={formData.cost_price ?? ''}
              onChange={(e) => setFormData({...formData, cost_price: Number(e.target.value)})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">시행일</label>
            <input
              type="date"
              value={formData.effective_from || ''}
              onChange={(e) => setFormData({...formData, effective_from: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">종료일 (선택)</label>
            <input
              type="date"
              value={formData.effective_to || ''}
              onChange={(e) => setFormData({...formData, effective_to: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">비고</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
              placeholder="원가 변경 사유 등"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">활성 상태</span>
            </label>
          </div>
        </>
      )}

      {type === 'installation' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">
              기기 종류 (코드) {item?.id && <span className="text-xs text-gray-500">(수정 불가)</span>}
            </label>
            <input
              type="text"
              value={formData.equipment_type || ''}
              onChange={(e) => setFormData({...formData, equipment_type: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="예: ph_meter"
              disabled={!!item?.id}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">기기명</label>
            <input
              type="text"
              value={formData.equipment_name || ''}
              onChange={(e) => setFormData({...formData, equipment_name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="예: PH센서"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">기본 설치비 (₩)</label>
            <input
              type="number"
              value={formData.base_installation_cost ?? ''}
              onChange={(e) => setFormData({...formData, base_installation_cost: Number(e.target.value)})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">시행일</label>
            <input
              type="date"
              value={formData.effective_from || ''}
              onChange={(e) => setFormData({...formData, effective_from: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">종료일 (선택)</label>
            <input
              type="date"
              value={formData.effective_to || ''}
              onChange={(e) => setFormData({...formData, effective_to: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">비고</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
              placeholder="설치비 변경 사유 등"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">활성 상태</span>
            </label>
          </div>
        </>
      )}

      {type === 'dealer' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">
              기기 종류 (코드) {item?.id && <span className="text-xs text-gray-500">(수정 불가)</span>}
            </label>
            <input
              type="text"
              value={formData.equipment_type || ''}
              onChange={(e) => setFormData({...formData, equipment_type: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="예: sensor"
              disabled={!!item?.id}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">기기명</label>
            <input
              type="text"
              value={formData.equipment_name || ''}
              onChange={(e) => setFormData({...formData, equipment_name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="예: PH센서"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">공급가 (원가) (₩)</label>
            <input
              type="number"
              value={formData.dealer_cost_price ?? ''}
              onChange={(e) => setFormData({...formData, dealer_cost_price: Number(e.target.value)})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">판매가 (₩)</label>
            <input
              type="number"
              value={formData.dealer_selling_price ?? ''}
              onChange={(e) => setFormData({...formData, dealer_selling_price: Number(e.target.value)})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">제조사 (선택)</label>
            <select
              value={formData.manufacturer || ''}
              onChange={(e) => setFormData({...formData, manufacturer: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">선택 안함</option>
              <option value="에코센스">에코센스</option>
              <option value="크린어스">크린어스</option>
              <option value="가이아씨앤에스">가이아씨앤에스</option>
              <option value="이브이에스">이브이에스</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">시행일</label>
            <input
              type="date"
              value={formData.effective_from || ''}
              onChange={(e) => setFormData({...formData, effective_from: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">종료일 (선택)</label>
            <input
              type="date"
              value={formData.effective_to || ''}
              onChange={(e) => setFormData({...formData, effective_to: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">비고</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
              placeholder="대리점 가격 변경 사유 등"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">활성 상태</span>
            </label>
          </div>
        </>
      )}

      {type === 'survey' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">실사 유형</label>
            <select
              value={formData.survey_type || ''}
              onChange={(e) => setFormData({...formData, survey_type: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={!!item?.id}
            >
              <option value="">선택하세요</option>
              <option value="estimate">견적실사</option>
              <option value="pre_construction">착공전실사</option>
              <option value="completion">준공실사</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">실사명</label>
            <input
              type="text"
              value={formData.survey_name || ''}
              onChange={(e) => setFormData({...formData, survey_name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="예: 견적실사"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">기본 비용 (₩)</label>
            <input
              type="number"
              value={formData.base_cost ?? ''}
              onChange={(e) => setFormData({...formData, base_cost: Number(e.target.value)})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">시행일</label>
            <input
              type="date"
              value={formData.effective_from || ''}
              onChange={(e) => setFormData({...formData, effective_from: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">종료일 (선택)</label>
            <input
              type="date"
              value={formData.effective_to || ''}
              onChange={(e) => setFormData({...formData, effective_to: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">활성 상태</span>
            </label>
          </div>
        </>
      )}

      {/* 시행일 공통 필드 (survey 타입이 아닐 때만 표시) */}
      {type !== 'survey' && type !== 'manufacturer' && type !== 'installation' && type !== 'dealer' && (
        <div>
          <label className="block text-sm font-medium mb-1">시행일</label>
          <input
            type="date"
            value={formData.effective_from || ''}
            onChange={(e) => setFormData({...formData, effective_from: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              저장 중...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              저장
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// withAuth HOC로 권한 체크 (권한 3 이상 필요)
export default withAuth(PricingManagement, undefined, 3);