'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { TokenManager } from '@/lib/api-client';
import AdminLayout from '@/components/ui/AdminLayout';
import { ProtectedPage } from '@/components/auth/ProtectedPage';
import { AuthLevel, AUTH_LEVEL_DESCRIPTIONS } from '@/lib/auth/AuthLevels';
import StatsCard from '@/components/ui/StatsCard';
import Modal, { ModalActions } from '@/components/ui/Modal';
import MultiSelectDropdown from '@/components/ui/MultiSelectDropdown';
import TwoStageDropdown from '@/components/ui/TwoStageDropdown';
import { MANUFACTURER_NAMES } from '@/constants/manufacturers';
import { calculateBusinessRevenue, type PricingData } from '@/lib/revenue-calculator';
import { allSteps } from '@/lib/task-steps';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useIsMobile } from '@/hooks/useIsMobile';
import { CacheManager } from '@/utils/cache-manager';
import { PaymentDateCell } from '@/components/admin/PaymentDateCell';

// Code Splitting: 무거운 모달 및 디스플레이 컴포넌트를 동적 로딩
const InvoiceDisplay = dynamic(() => import('@/components/business/InvoiceDisplay').then(mod => ({ default: mod.InvoiceDisplay })), {
  loading: () => <div className="text-center py-4">로딩 중...</div>,
  ssr: false
});

const BusinessRevenueModal = dynamic(() => import('@/components/business/BusinessRevenueModal'), {
  loading: () => <div className="text-center py-4">로딩 중...</div>,
  ssr: false
});

// Business 상세 모달은 페이지 이동으로 처리 (더 이상 필요 없음)

import {
  BarChart3,
  Calculator,
  TrendingUp,
  DollarSign,
  Building2,
  Calendar,
  FileText,
  Search,
  Filter,
  Download,
  Loader2,
  Settings,
  ChevronDown,
  ShoppingCart,
  PackagePlus
} from 'lucide-react';

interface BusinessInfo {
  id: string;
  business_name: string;
  sales_office: string;
  address?: string;
  manager_name?: string;
  manager_contact?: string;
  [key: string]: any;
}

interface RevenueCalculation {
  id: string;
  business_id: string;
  business_name: string;
  sales_office: string;
  business_category?: string;
  calculation_date: string;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  sales_commission: number;
  adjusted_sales_commission?: number;
  survey_costs: number;
  installation_costs: number;
  installation_extra_cost?: number;
  net_profit: number;
  equipment_breakdown: any[];
  cost_breakdown: any;
}

interface DashboardStats {
  total_businesses: number;
  total_revenue: number;
  total_profit: number;
  average_margin: string;
  top_performing_office: string;
}

function RevenueDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);
  const [riskMap, setRiskMap] = useState<Record<string, string | null>>({}); // 위험도 별도 상태 (businesses 재계산 방지)
  const [calculations, setCalculations] = useState<RevenueCalculation[]>([]);
  const [selectedOffices, setSelectedOffices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [revenueFilter, setRevenueFilter] = useState({
    min: '',
    max: ''
  });

  // 🔧 통합 로딩 상태 머신 (3단계 구현)
  const [dataLoadingState, setDataLoadingState] = useState<'idle' | 'loading-prices' | 'loading-businesses' | 'ready' | 'error'>('idle');

  // 동적 가격 데이터
  const [officialPrices, setOfficialPrices] = useState<Record<string, number>>({});
  const [manufacturerPrices, setManufacturerPrices] = useState<Record<string, Record<string, number>>>({});
  const [pricesLoaded, setPricesLoaded] = useState(false);

  // 영업비용 및 실사비용 데이터
  const [salesOfficeSettings, setSalesOfficeSettings] = useState<Record<string, any>>({});
  const [surveyCostSettings, setSurveyCostSettings] = useState<Record<string, number>>({});
  const [baseInstallationCosts, setBaseInstallationCosts] = useState<Record<string, number>>({});
  const [costSettingsLoaded, setCostSettingsLoaded] = useState(false);

  // 🔧 DB 계산 결과 매핑 (business_id → CalculationResult) - calculations 배열에서 자동 생성
  // 더 이상 Batch API를 호출하지 않고 DB에 저장된 최신 계산 결과만 사용

  // 제조사별 수수료율 데이터 (영업점 → 제조사 → 수수료율)
  const [commissionRates, setCommissionRates] = useState<Record<string, Record<string, number>>>({});
  const [commissionRatesLoaded, setCommissionRatesLoaded] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]); // 카테고리(진행구분) 필터
  const [selectedProjectYears, setSelectedProjectYears] = useState<string[]>([]); // 설치 연도 필터
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]); // 월별 필터 (1-12) - 설치일 기준
  const [selectedSurveyMonths, setSelectedSurveyMonths] = useState<string[]>([]); // 실사 월 필터 ['견적|1', '착공|2', '준공|9']
  const [selectedInvoiceYears, setSelectedInvoiceYears] = useState<string[]>([]); // 세금계산서 발행 연도 필터
  const [selectedInvoiceMonths, setSelectedInvoiceMonths] = useState<string[]>([]); // 세금계산서 발행 월 필터
  const [showReceivablesOnly, setShowReceivablesOnly] = useState(false); // 미수금 필터
  const [showUninstalledOnly, setShowUninstalledOnly] = useState(false); // 미설치 필터
  // 미수금 필터 활성화 시 업무관리 연동
  const [taskStatusMap, setTaskStatusMap] = useState<Record<string, Array<{ task_type: string; status: string }>>>({});
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<string[]>([]); // 업무단계 다중 선택
  const [selectedRiskLevels, setSelectedRiskLevels] = useState<string[]>([]); // 위험도 다중 선택
  const [isFilterExpanded, setIsFilterExpanded] = useState(false); // 필터 섹션 접기/펼치기 상태 (기본값: 접힌 상태)
  const [sortField, setSortField] = useState<string>('business_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [selectedEquipmentBusiness, setSelectedEquipmentBusiness] = useState<any>(null);
  const [quickCalcBusiness, setQuickCalcBusiness] = useState<string>(''); // 빈 상태용 빠른 계산 선택

  const { user } = useAuth();
  const userPermission = user?.permission_level || 0;


  useEffect(() => {
    console.log('🔄 [COMPONENT-LIFECYCLE] Revenue 페이지 마운트됨');
    // ✅ 통합 초기화 함수 실행
    initializeData();

    return () => {
      console.log('🔄 [COMPONENT-LIFECYCLE] Revenue 페이지 언마운트됨');
    };
  }, []);

  // ✅ 2단계 + 3단계: 통합 데이터 초기화 함수 (레이스 컨디션 완전 제거)
  const initializeData = async () => {
    try {
      console.log('🚀 [INIT] Step 1: 가격 데이터 로드 시작');
      setDataLoadingState('loading-prices');

      await loadPricingData();

      console.log('🚀 [INIT] Step 2: 사업장 데이터 로드 시작');
      setDataLoadingState('loading-businesses');

      await Promise.all([
        loadBusinesses(),
        loadCalculations(),
        loadTaskStatuses()
      ]);

      console.log('✅ [INIT] Step 3: 모든 데이터 로드 완료');
      setDataLoadingState('ready');

    } catch (error) {
      console.error('❌ [INIT] 데이터 초기화 실패:', error);
      setDataLoadingState('error');
      alert('데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.');
    }
  };

  // URL 파라미터로 자동 모달 열기 (from Business page)
  useEffect(() => {
    const businessId = searchParams?.get('businessId');
    const openRevenueModal = searchParams?.get('openRevenueModal');

    // 조건 체크
    if (!businessId || openRevenueModal !== 'true' || businesses.length === 0) {
      return;
    }

    // 해당 business 찾기
    const targetBusiness = businesses.find(b => b.id === businessId);

    if (targetBusiness) {
      console.log('🔗 [URL Navigation] Revenue 모달 자동 열기:', targetBusiness.business_name);

      // Revenue 모달 열기
      setSelectedEquipmentBusiness(targetBusiness);
      setShowEquipmentModal(true);

      // URL 정리 (파라미터 제거)
      window.history.replaceState({}, '', '/admin/revenue');
    } else {
      console.warn('⚠️ [URL Navigation] 사업장을 찾을 수 없음:', businessId);
      // 파라미터만 제거
      window.history.replaceState({}, '', '/admin/revenue');
    }
  }, [searchParams, businesses]);

  // 🔄 Cross-tab synchronization: Listen for cache updates from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Cache field update broadcast from another tab
      if (e.key === 'cache-field-update' && e.newValue) {
        try {
          const update = JSON.parse(e.newValue);
          const { businessId, field, value } = update;

          console.log(`📡 [Cross-Tab Sync] Received update from another tab: ${field} for ${businessId.slice(0, 8)}...`);

          // Update local cache immediately
          CacheManager.updateBusinessField(businessId, field, value);

          // Update UI state if needed
          if (field === 'risk') {
            setRiskMap(prev => ({ ...prev, [businessId]: value }));
          } else if (field === 'payment_scheduled_date') {
            setBusinesses(prev =>
              prev.map(b => b.id === businessId ? { ...b, payment_scheduled_date: value } : b)
            );
          }
        } catch (error) {
          console.error('[Cross-Tab Sync] Error processing field update:', error);
        }
      }

      // Full cache invalidation broadcast
      if (e.key === 'cache-invalidate-timestamp') {
        console.log('📡 [Cross-Tab Sync] Cache invalidation broadcast received');
        CacheManager.invalidateAll();
        // Optionally reload data
        if (pricesLoaded) {
          loadBusinesses();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [pricesLoaded]);

  const getAuthHeaders = () => {
    const token = TokenManager.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  // 업무단계 고유 라벨 목록 (중복 제거)
  const uniqueTaskStepLabels = useMemo(() => {
    const seen = new Set<string>();
    return allSteps.filter(step => {
      if (seen.has(step.label)) return false;
      seen.add(step.label);
      return true;
    });
  }, []);

  // 업무 상태 맵 로드
  const loadTaskStatuses = async () => {
    try {
      const response = await fetch('/api/business-task-status', { headers: getAuthHeaders() });
      const data = await response.json();
      if (data.success) {
        setTaskStatusMap(data.data);
      }
    } catch (error) {
      console.error('[loadTaskStatuses] 오류:', error);
    }
  };

  // 위험도 업데이트 (낙관적 업데이트 + 즉시 캐시 동기화)
  const handleRiskUpdate = (businessId: string, risk: '상' | '중' | '하' | null) => {
    // 롤백용 이전 값 보존
    const previousRisk = riskMap[businessId] ?? null;

    // 즉시 riskMap만 업데이트 (businesses 변경 없음 → filteredBusinesses 재계산 없음)
    setRiskMap(prev => ({ ...prev, [businessId]: risk }));

    // 즉시 캐시 업데이트 (UI 상태와 캐시 동기화)
    CacheManager.updateBusinessField(businessId, 'risk', risk);
    CacheManager.broadcastFieldUpdate(businessId, 'risk', risk);

    // API는 백그라운드에서 실행 (UI 블로킹 없음)
    fetch(`/api/business-risk/${businessId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ risk }),
    }).then(response => {
      if (!response.ok) throw new Error('위험도 업데이트 실패');
      console.log(`✅ [handleRiskUpdate] DB 업데이트 완료: ${businessId.slice(0, 8)}...`);
    }).catch(error => {
      console.error('[handleRiskUpdate] 오류:', error);
      // 실패 시 롤백 (UI 상태 + 캐시)
      setRiskMap(prev => ({ ...prev, [businessId]: previousRisk }));
      CacheManager.updateBusinessField(businessId, 'risk', previousRisk);
      CacheManager.broadcastFieldUpdate(businessId, 'risk', previousRisk);
    });
  };

  // 입금예정일 업데이트 (낙관적 업데이트 + 즉시 캐시 동기화)
  const handlePaymentDateUpdate = async (businessId: string, date: string | null): Promise<void> => {
    // 롤백용 이전 값 보존
    const business = businesses.find(b => b.id === businessId);
    const previousDate = business?.payment_scheduled_date ?? null;

    try {
      // 즉시 캐시 업데이트 (UI 상태와 캐시 동기화)
      CacheManager.updateBusinessField(businessId, 'payment_scheduled_date', date);
      CacheManager.broadcastFieldUpdate(businessId, 'payment_scheduled_date', date);

      // API 호출 (동기적 처리로 컴포넌트가 로딩 상태 관리)
      const response = await fetch(`/api/businesses/${businessId}/payment-date`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ payment_scheduled_date: date }),
      });

      if (!response.ok) {
        throw new Error('입금예정일 업데이트 실패');
      }

      console.log(`✅ [handlePaymentDateUpdate] DB 업데이트 완료: ${businessId.slice(0, 8)}...`);

      // 성공 시 businesses 배열도 업데이트 (전체 리렌더링 없이 해당 항목만)
      setBusinesses(prev =>
        prev.map(b => b.id === businessId ? { ...b, payment_scheduled_date: date } : b)
      );

    } catch (error) {
      console.error('[handlePaymentDateUpdate] 오류:', error);
      // 실패 시 캐시 롤백
      CacheManager.updateBusinessField(businessId, 'payment_scheduled_date', previousDate);
      CacheManager.broadcastFieldUpdate(businessId, 'payment_scheduled_date', previousDate);
      throw error; // PaymentDateCell 컴포넌트에서 롤백 처리
    }
  };

  // 🚀 SessionStorage 캐싱 유틸리티
  const CACHE_KEYS = {
    PRICING: 'revenue_pricing_cache',
    BUSINESSES: 'revenue_businesses_cache',
    CALCULATIONS: 'revenue_calculations_cache',
    CACHE_TIME: 'revenue_cache_time'
  };
  const CACHE_DURATION = 5 * 60 * 1000; // 5분

  const getCachedData = (key: string) => {
    try {
      console.log(`🔍 [CACHE-DEBUG] ${key} 조회 시작`);

      const cacheTime = sessionStorage.getItem(CACHE_KEYS.CACHE_TIME);
      if (!cacheTime) {
        console.log(`❌ [CACHE-DEBUG] ${key} → CACHE_TIME 없음 (첫 로드)`);
        return null;
      }

      const elapsed = Date.now() - parseInt(cacheTime);
      console.log(`⏱️ [CACHE-DEBUG] ${key} → 캐시 시간: ${(elapsed / 1000).toFixed(1)}초 전 (만료: ${CACHE_DURATION / 1000}초)`);

      if (elapsed > CACHE_DURATION) {
        console.log(`⏰ [CACHE] 캐시 만료됨 (5분 초과) → 클리어`);
        clearCache();
        return null;
      }

      const cached = sessionStorage.getItem(key);
      if (cached) {
        console.log(`✅ [CACHE] ${key} 캐시 히트 (${(elapsed / 1000).toFixed(1)}초 전)`);
        return JSON.parse(cached);
      } else {
        console.log(`❌ [CACHE-DEBUG] ${key} → 데이터 없음 (다른 키는 있지만 이 키는 없음)`);
      }
    } catch (error) {
      console.warn('⚠️ [CACHE] 캐시 읽기 오류:', error);
    }
    return null;
  };

  const setCachedData = (key: string, data: any) => {
    try {
      const dataSize = JSON.stringify(data).length;
      const dataSizeKB = (dataSize / 1024).toFixed(1);

      // 🚨 5MB 초과 시 캐싱 생략 (SessionStorage 용량 제한)
      if (dataSize > 5 * 1024 * 1024) {
        console.warn(`⚠️ [CACHE] ${key} 데이터가 너무 큼 (${dataSizeKB} KB) → 캐싱 생략`);
        return;
      }

      sessionStorage.setItem(key, JSON.stringify(data));
      sessionStorage.setItem(CACHE_KEYS.CACHE_TIME, Date.now().toString());
      console.log(`💾 [CACHE] ${key} 캐시 저장 완료 (크기: ${dataSizeKB} KB, 시간: ${new Date().toLocaleTimeString()})`);
    } catch (error) {
      // QuotaExceededError 처리
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn(`⚠️ [CACHE] ${key} SessionStorage 용량 초과 → 캐싱 불가 (데이터가 너무 큼)`);
        // 기존 캐시 클리어 후 재시도하지 않음 (다른 페이지 캐시 유지)
      } else {
        console.warn('⚠️ [CACHE] 캐시 저장 오류:', error);
      }
    }
  };

  const clearCache = () => {
    console.log('🗑️ [CACHE] 캐시 클리어 시작');
    console.trace('🔍 [CACHE-DEBUG] clearCache() 호출 스택:');
    Object.values(CACHE_KEYS).forEach(key => sessionStorage.removeItem(key));
    console.log('✅ [CACHE] 캐시 클리어 완료');
  };

  // Business 상세 기능은 페이지 이동으로 처리 (코드 제거됨)

  // 동적 가격 데이터 로드 (병렬 처리 + SessionStorage 캐싱)
  const loadPricingData = async () => {
    try {
      const startTime = performance.now();

      // 🚀 캐시 확인
      const cachedPricing = getCachedData(CACHE_KEYS.PRICING);
      if (cachedPricing) {
        setOfficialPrices(cachedPricing.official);
        setManufacturerPrices(cachedPricing.manufacturer);
        setSalesOfficeSettings(cachedPricing.salesOffice);
        setSurveyCostSettings(cachedPricing.surveyCost);
        setBaseInstallationCosts(cachedPricing.installation);
        setCommissionRates(cachedPricing.commission);
        setPricesLoaded(true);
        setCostSettingsLoaded(true);
        setCommissionRatesLoaded(true);

        const endTime = performance.now();
        console.log(`⚡ [PRICING] 캐시에서 로드 완료 (${(endTime - startTime).toFixed(0)}ms)`);
        return;
      }

      console.log('⚡ [PRICING] 가격 데이터 병렬 로드 시작');

      // ✅ 성능 개선: 6개 API를 병렬로 호출 (3초+ → 0.5초)
      const [
        govResponse,
        manuResponse,
        salesOfficeResponse,
        surveyCostResponse,
        installCostResponse,
        commissionResponse
      ] = await Promise.all([
        fetch('/api/revenue/government-pricing', { headers: getAuthHeaders() }),
        fetch('/api/revenue/manufacturer-pricing', { headers: getAuthHeaders() }),
        fetch('/api/revenue/sales-office-settings', { headers: getAuthHeaders() }),
        fetch('/api/revenue/survey-costs', { headers: getAuthHeaders() }),
        fetch('/api/revenue/installation-cost', { headers: getAuthHeaders() }),
        fetch('/api/revenue/commission-rates', { headers: getAuthHeaders() })
      ]);

      // JSON 파싱도 병렬 처리
      const [
        govData,
        manuData,
        salesOfficeData,
        surveyCostData,
        installCostData,
        commissionData
      ] = await Promise.all([
        govResponse.json(),
        manuResponse.json(),
        salesOfficeResponse.json(),
        surveyCostResponse.json(),
        installCostResponse.json(),
        commissionResponse.json()
      ]);

      // 환경부 고시가 처리
      if (govData.success) {
        const govPrices: Record<string, number> = {};
        govData.data.pricing.forEach((item: any) => {
          govPrices[item.equipment_type] = item.official_price;
        });
        setOfficialPrices(govPrices);
      }

      // 제조사별 원가 처리
      // ✅ 제조사 이름 정규화: 대소문자 무시 + 공백 제거로 매칭 성공률 향상
      if (manuData.success) {
        const manuPrices: Record<string, Record<string, number>> = {};
        manuData.data.pricing.forEach((item: any) => {
          const normalizedManufacturer = item.manufacturer.toLowerCase().trim();
          if (!manuPrices[normalizedManufacturer]) {
            manuPrices[normalizedManufacturer] = {};
          }
          // 🔧 PostgreSQL DECIMAL 타입이 문자열로 반환되므로 Number()로 변환
          manuPrices[normalizedManufacturer][item.equipment_type] = Number(item.cost_price) || 0;
        });
        setManufacturerPrices(manuPrices);
        console.log('✅ [PRICING] 제조사별 원가 로드 완료:', manuPrices);
        console.log('✅ [PRICING] 로드된 제조사 목록:', Object.keys(manuPrices));
      }

      // 영업점별 비용 설정 처리
      if (salesOfficeData.success) {
        const salesSettings: Record<string, any> = {};
        salesOfficeData.data.settings.forEach((item: any) => {
          salesSettings[item.sales_office] = item;
        });
        setSalesOfficeSettings(salesSettings);
      }

      // 실사비용 설정 처리
      if (surveyCostData.success) {
        const surveyCosts: Record<string, number> = {};
        surveyCostData.data.forEach((item: any) => {
          surveyCosts[item.survey_type] = Number(item.base_cost) || 0;
        });
        setSurveyCostSettings(surveyCosts);
      }

      // 기본 설치비 처리
      if (installCostData.success) {
        const installCosts: Record<string, number> = {};
        installCostData.data.costs.forEach((item: any) => {
          installCosts[item.equipment_type] = item.base_installation_cost;
        });
        setBaseInstallationCosts(installCosts);
      }

      // 제조사별 수수료율 처리
      if (commissionData.success && commissionData.data.offices) {
        const rates: Record<string, Record<string, number>> = {};
        commissionData.data.offices.forEach((office: any) => {
          rates[office.sales_office] = {};
          office.rates.forEach((rate: any) => {
            rates[office.sales_office][rate.manufacturer] = rate.commission_rate;
          });
        });
        setCommissionRates(rates);
        setCommissionRatesLoaded(true);
      } else {
        console.warn('⚠️ [COMMISSION] 수수료율 로드 실패:', { success: commissionData.success, hasOffices: !!commissionData.data?.offices });
      }

      setPricesLoaded(true);
      setCostSettingsLoaded(true);

      // 🚀 캐시 저장
      const pricingCache = {
        official: govData.success ? Object.fromEntries(
          govData.data.pricing.map((item: any) => [item.equipment_type, item.official_price])
        ) : {},
        manufacturer: manuData.success ? (() => {
          const manuPrices: Record<string, Record<string, number>> = {};
          manuData.data.pricing.forEach((item: any) => {
            const normalizedManufacturer = item.manufacturer.toLowerCase().trim();
            if (!manuPrices[normalizedManufacturer]) {
              manuPrices[normalizedManufacturer] = {};
            }
            manuPrices[normalizedManufacturer][item.equipment_type] = Number(item.cost_price) || 0;
          });
          return manuPrices;
        })() : {},
        salesOffice: salesOfficeData.success ? salesOfficeData.data.settings.reduce((acc: any, item: any) => {
          acc[item.sales_office] = { sales_cost_rate: item.sales_cost_rate };
          return acc;
        }, {}) : {},
        surveyCost: surveyCostData.success ? surveyCostData.data.reduce((acc: any, item: any) => {
          acc[item.survey_type] = item.base_cost;
          return acc;
        }, {}) : {},
        installation: installCostData.success ? installCostData.data.costs.reduce((acc: any, item: any) => {
          acc[item.equipment_type] = item.base_installation_cost; // ✅ 올바른 필드명 사용
          return acc;
        }, {}) : {},
        commission: commissionData.success ? (() => {
          const rates: Record<string, Record<string, number>> = {};
          commissionData.data.offices.forEach((office: any) => {
            rates[office.sales_office] = {};
            office.rates.forEach((rate: any) => {
              rates[office.sales_office][rate.manufacturer] = rate.commission_rate;
            });
          });
          return rates;
        })() : {}
      };
      setCachedData(CACHE_KEYS.PRICING, pricingCache);

      const endTime = performance.now();
      console.log(`✅ [PRICING] 가격 데이터 병렬 로드 완료 (${(endTime - startTime).toFixed(0)}ms)`);
    } catch (error) {
      console.error('❌ [PRICING] 가격 데이터 로드 오류:', error);
      // 로드 실패 시 하드코딩된 기본값 사용
      setPricesLoaded(true);
      setCostSettingsLoaded(true);
    }
  };

  // 환경부 고시가 (매출 단가) - 기본값 (API 로드 실패 시 사용)
  const OFFICIAL_PRICES: Record<string, number> = {
    'ph_meter': 1000000,
    'differential_pressure_meter': 400000,
    'temperature_meter': 500000,
    'discharge_current_meter': 300000,
    'fan_current_meter': 300000,
    'pump_current_meter': 300000,
    'gateway': 1600000, // @deprecated
    'gateway_1_2': 1600000, // 게이트웨이(1,2) - 매출금액 동일
    'gateway_3_4': 1600000, // 게이트웨이(3,4) - 매출금액 동일
    'vpn_wired': 400000,
    'vpn_wireless': 400000,
    'explosion_proof_differential_pressure_meter_domestic': 800000,
    'explosion_proof_temperature_meter_domestic': 1500000,
    'expansion_device': 800000,
    'relay_8ch': 300000,
    'relay_16ch': 1600000,
    'main_board_replacement': 350000,
    'multiple_stack': 480000
  };

  // 🔧 제조사별 원가 (매입 단가) - API의 DEFAULT_COSTS와 완전히 동일하게 유지
  const MANUFACTURER_COSTS: Record<string, number> = {
    'ph_meter': 250000,
    'differential_pressure_meter': 100000,
    'temperature_meter': 125000,
    'discharge_current_meter': 80000,
    'fan_current_meter': 80000,
    'pump_current_meter': 80000,
    'gateway': 1000000, // @deprecated - API와 동일하게 수정 (이전: 200000)
    'gateway_1_2': 1000000, // 게이트웨이(1,2) - 에코센스 매입금액
    'gateway_3_4': 1420000, // 게이트웨이(3,4) - 에코센스 매입금액 (다름!)
    'vpn_wired': 100000,
    'vpn_wireless': 120000,
    'explosion_proof_differential_pressure_meter_domestic': 150000,
    'explosion_proof_temperature_meter_domestic': 180000,
    'expansion_device': 120000,
    'relay_8ch': 80000,
    'relay_16ch': 150000,
    'main_board_replacement': 100000,
    'multiple_stack': 120000
  };

  // 기기별 기본 설치비
  const INSTALLATION_COSTS: Record<string, number> = {
    'ph_meter': 0,
    'differential_pressure_meter': 0,
    'temperature_meter': 0,
    'discharge_current_meter': 0,
    'fan_current_meter': 0,
    'pump_current_meter': 0,
    'gateway': 0, // @deprecated
    'gateway_1_2': 0,
    'gateway_3_4': 0,
    'vpn_wired': 0,
    'vpn_wireless': 0,
    'explosion_proof_differential_pressure_meter_domestic': 0,
    'explosion_proof_temperature_meter_domestic': 0,
    'expansion_device': 0,
    'relay_8ch': 0,
    'relay_16ch': 0,
    'main_board_replacement': 0,
    'multiple_stack': 0
  };

  const EQUIPMENT_FIELDS = [
    'ph_meter', 'differential_pressure_meter', 'temperature_meter',
    'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
    'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless', // ✅ gateway removed (deprecated)
    'explosion_proof_differential_pressure_meter_domestic',
    'explosion_proof_temperature_meter_domestic', 'expansion_device',
    'relay_8ch', 'relay_16ch', 'main_board_replacement', 'multiple_stack'
  ];

  // 🔧 Fallback 계산 함수 완전 제거 - DB 저장 결과만 사용

  const loadBusinesses = async () => {
    const startTime = performance.now();

    try {
      // 🚀 캐시 확인
      const cachedBusinesses = getCachedData(CACHE_KEYS.BUSINESSES);
      if (cachedBusinesses) {
        setBusinesses(cachedBusinesses);
        const cachedRiskMap: Record<string, string | null> = {};
        for (const b of cachedBusinesses) {
          if (b.receivable_risk !== undefined) {
            cachedRiskMap[b.id] = b.receivable_risk ?? null;
          }
        }
        setRiskMap(cachedRiskMap);
        const endTime = performance.now();
        console.log(`⚡ [LOAD-BUSINESSES] 캐시에서 ${cachedBusinesses.length}개 로드 완료 (${(endTime - startTime).toFixed(0)}ms)`);
        return;
      }

      console.log('📊 [LOAD-BUSINESSES] 사업장 데이터 로드 시작');

      // ✅ 전체 사업장 데이터 조회 (매출 계산을 위해 전체 데이터 필요)
      // 기본 limit: 2000개 (현재 1509개 사업장 커버)
      const response = await fetch('/api/business-info-direct', {
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (data.success) {
        const businessData = data.data || [];
        console.log(`📊 [LOAD-BUSINESSES] ${businessData.length}개 사업장 조회 완료`);

        // 🔧 기존 클라이언트 계산 로직 제거, businesses를 그대로 저장
        setBusinesses(businessData);

        // 위험도 상태를 별도 맵으로 초기화 (클릭 시 전체 재계산 방지)
        const initialRiskMap: Record<string, string | null> = {};
        for (const b of businessData) {
          if (b.receivable_risk !== undefined) {
            initialRiskMap[b.id] = b.receivable_risk ?? null;
          }
        }
        setRiskMap(initialRiskMap);

        // 🚀 캐시 저장
        setCachedData(CACHE_KEYS.BUSINESSES, businessData);

        const endTime = performance.now();
        console.log(`✅ [LOAD-BUSINESSES] 사업장 로드 완료 (${(endTime - startTime).toFixed(0)}ms)`);

        // ⚠️ 자동 재계산 비활성화: 관리자가 수동으로 "전체 재계산" 버튼을 사용
        // 페이지 로드 시 DB에 저장된 기존 계산 결과만 표시
        console.log('ℹ️ [LOAD-BUSINESSES] 자동 재계산 비활성화 - 수동 재계산 버튼 사용 필요');
      } else {
        console.error('🔴 [REVENUE] 사업장 로드 실패:', data.message);
      }
    } catch (error) {
      console.error('🔴 [REVENUE] 사업장 목록 로드 오류:', error);
    }
  };

  // 🔧 Batch API를 호출하여 모든 사업장의 계산 결과를 DB에 저장
  const loadBatchCalculations = async (businessIds: number[]) => {
    if (businessIds.length === 0) {
      console.log('⚠️ [BATCH-CALC] 계산할 사업장이 없습니다');
      return;
    }

    console.log(`🚀 [BATCH-CALC] ${businessIds.length}개 사업장 계산 요청 (DB 저장 포함)`);
    try {
      const token = TokenManager.getToken();
      const response = await fetch('/api/revenue/calculate-batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          business_ids: businessIds,
          save_result: true  // 🔑 DB에 저장
        })
      });

      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        console.log(`✅ [BATCH-CALC] ${data.data.length}개 사업장 계산 완료 (DB 저장 완료)`);

        // DB에 저장 완료 후 calculations 재로드
        await loadCalculations();
      } else {
        console.error('❌ [BATCH-CALC] API 응답 오류:', data.message);
      }
    } catch (error) {
      console.error('❌ [BATCH-CALC] API 호출 오류:', error);
    }
  };

  const loadCalculations = async () => {
    console.log('📊 [LOAD-CALCULATIONS] 계산 결과 로드 시작');
    console.log('🔍 [LOAD-CALCULATIONS-DEBUG] 현재 SessionStorage 상태:', {
      hasCalculationsCache: !!sessionStorage.getItem(CACHE_KEYS.CALCULATIONS),
      hasCacheTime: !!sessionStorage.getItem(CACHE_KEYS.CACHE_TIME),
      cacheTime: sessionStorage.getItem(CACHE_KEYS.CACHE_TIME),
      elapsed: sessionStorage.getItem(CACHE_KEYS.CACHE_TIME)
        ? `${((Date.now() - parseInt(sessionStorage.getItem(CACHE_KEYS.CACHE_TIME)!)) / 1000).toFixed(1)}초`
        : 'N/A',
      cacheExpired: sessionStorage.getItem(CACHE_KEYS.CACHE_TIME)
        ? (Date.now() - parseInt(sessionStorage.getItem(CACHE_KEYS.CACHE_TIME)!)) > CACHE_DURATION
        : true
    });

    setLoading(true);
    try {
      // 🚀 캐시 확인 (페이지 재방문 시 API 호출 생략)
      const cachedCalculations = getCachedData(CACHE_KEYS.CALCULATIONS);
      if (cachedCalculations) {
        setCalculations(cachedCalculations);
        console.log('✅ [LOAD-CALCULATIONS] 캐시에서 로드 완료:', cachedCalculations.length, '개 (API 호출 생략)');
        setLoading(false);
        return;
      }

      console.log('⚠️ [LOAD-CALCULATIONS-DEBUG] 캐시 미스 → API 호출 진행');

      const params = new URLSearchParams();
      // 다중 선택 필터는 클라이언트에서 처리하므로 서버 필터는 제거
      if (selectedOffices.length === 1) params.append('sales_office', selectedOffices[0]);
      // ✅ 캐시 사용 시에는 타임스탬프 제거 (불필요)
      // limit 파라미터 제거 (API 기본값 10000 사용)

      console.log('📊 [LOAD-CALCULATIONS] API 호출 시작 (캐시 없음)');

      const response = await fetch(`/api/revenue/calculate?${params}`, {
        headers: {
          ...getAuthHeaders()
          // ✅ Cache-Control 제거 (SessionStorage 캐싱 사용)
        }
      });
      const data = await response.json();

      if (data.success) {
        const calculations = data.data.calculations || [];
        setCalculations(calculations);

        // 💾 캐시 저장
        setCachedData(CACHE_KEYS.CALCULATIONS, calculations);

        console.log('✅ [LOAD-CALCULATIONS] API 로드 완료:', calculations.length, '개 (캐시 저장 완료)');
        // calculateStats는 useEffect에서 필터링된 데이터로 자동 계산됨
      }
    } catch (error) {
      console.error('🔴 [LOAD-CALCULATIONS] 계산 결과 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 매출 재계산 함수 (권한 레벨 4 전용)
  const handleRecalculate = async (businessId: string, businessName: string) => {
    try {
      console.log('🔄 [RECALCULATE] 재계산 시작:', { businessId, businessName });

      const response = await fetch('/api/revenue/recalculate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ businessId })
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ ${businessName}의 매출 정보가 재계산되었습니다.`);

        // 즉시 데이터 다시 로드 (캐시 무시)
        console.log('🔄 [RECALCULATE] 데이터 재로드 시작...');
        await Promise.all([
          loadBusinesses(),
          loadCalculations()
        ]);
        console.log('✅ [RECALCULATE] 데이터 재로드 완료');
      } else {
        alert(`❌ 재계산 실패: ${data.message}`);
        console.error('❌ [RECALCULATE] 실패:', data.message);
      }
    } catch (error) {
      console.error('❌ [RECALCULATE] 오류:', error);
      alert('재계산 중 오류가 발생했습니다.');
    }
  };

  // 전체 재계산 함수 (권한 레벨 4 전용)
  const handleRecalculateAll = async () => {
    try {
      if (!confirm(`⚠️ 전체 사업장 재계산\n\n총 ${sortedBusinesses.length}개 사업장의 매출 정보를 모두 재계산하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 기존 계산 기록이 모두 삭제됩니다.`)) {
        return;
      }

      console.log('🔄 [RECALCULATE-ALL] 전체 재계산 시작...');
      setLoading(true);

      // 🗑️ 캐시 클리어 (최신 데이터로 갱신하기 위해)
      clearCache();

      const response = await fetch('/api/revenue/recalculate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ recalculateAll: true })
      });

      const data = await response.json();

      if (data.success) {
        const { total, success, fail } = data.data;
        alert(`✅ 전체 재계산 완료\n\n전체: ${total}개\n성공: ${success}개\n실패: ${fail}개`);

        // 즉시 데이터 다시 로드
        console.log('🔄 [RECALCULATE-ALL] 데이터 재로드 시작...');
        await Promise.all([
          loadBusinesses(),
          loadCalculations()
        ]);
        console.log('✅ [RECALCULATE-ALL] 데이터 재로드 완료');
      } else {
        alert(`❌ 전체 재계산 실패: ${data.message}`);
        console.error('❌ [RECALCULATE-ALL] 실패:', data.message);
      }
    } catch (error) {
      console.error('❌ [RECALCULATE-ALL] 오류:', error);
      alert('전체 재계산 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const calculateRevenue = async (businessId: string) => {
    if (!businessId) return;

    setIsCalculating(true);
    try {
      const response = await fetch('/api/revenue/calculate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          business_id: businessId,
          calculation_date: new Date().toISOString().split('T')[0],
          save_result: userPermission >= 3
        })
      });

      const data = await response.json();

      if (data.success) {
        const newCalculation = data.data.calculation;

        // 기존 calculations 배열에서 동일한 business_id가 있으면 업데이트, 없으면 추가
        setCalculations(prevCalcs => {
          const existingIndex = prevCalcs.findIndex(c => c.business_id === businessId);

          if (existingIndex >= 0) {
            // 기존 계산 결과 업데이트
            const updated = [...prevCalcs];
            updated[existingIndex] = {
              ...newCalculation,
              id: prevCalcs[existingIndex].id // 기존 ID 유지
            };
            return updated;
          } else {
            // 새로운 계산 결과 추가
            return [...prevCalcs, newCalculation];
          }
        });

        // 통계는 useEffect에서 필터링된 데이터로 자동 계산됨

        alert('매출 계산이 완료되었습니다.');

        // 사업장 목록만 새로고침 (계산 결과는 이미 위에서 업데이트됨)
        await loadBusinesses();
      } else {
        alert('계산 실패: ' + data.message);
      }
    } catch (error) {
      console.error('매출 계산 오류:', error);
      alert('매출 계산 중 오류가 발생했습니다.');
    } finally {
      setIsCalculating(false);
    }
  };

  const calculateAllBusinesses = async () => {
    if (!businesses.length || userPermission < 3) return;

    setIsCalculating(true);
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    try {
      // 계산이 필요한 사업장만 필터링
      const businessesToCalculate = businesses.filter(b => {
        const hasCalculation = calculations.some(c => c.business_id === b.id);
        if (hasCalculation) {
          skippedCount++;
        }
        return !hasCalculation;
      });

      if (businessesToCalculate.length === 0) {
        alert('모든 사업장이 이미 계산되어 있습니다.');
        setIsCalculating(false);
        return;
      }

      for (const business of businessesToCalculate) {
        try {
          const response = await fetch('/api/revenue/calculate', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              business_id: business.id,
              calculation_date: new Date().toISOString().split('T')[0],
              save_result: true
            })
          });

          const data = await response.json();
          if (data.success) {
            successCount++;
          } else {
            errorCount++;
            console.error(`❌ [BULK-CALCULATE] ${business.business_name} 계산 실패:`, data.message);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ [BULK-CALCULATE] ${business.business_name} 오류:`, error);
        }

        // 서버 부하 방지를 위한 짧은 지연
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const message = `일괄 계산 완료\n\n✅ 성공: ${successCount}건\n❌ 실패: ${errorCount}건\n⏭️ 건너뜀: ${skippedCount}건`;
      alert(message);

      // 계산 완료 후 데이터 새로고침 (계산 결과 + 사업장 목록)
      await Promise.all([
        loadCalculations(),
        loadBusinesses()
      ]);
    } catch (error) {
      console.error('일괄 계산 오류:', error);
      alert('일괄 계산 중 오류가 발생했습니다.');
    } finally {
      setIsCalculating(false);
    }
  };

  const formatCurrency = (amount: number | undefined | null) => {
    const value = Number(amount) || 0;
    if (isNaN(value)) return '₩0';
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(value);
  };

  const exportData = async () => {
    if (!sortedBusinesses.length) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('매출관리');

    // 금액 컬럼 인덱스 (1-based): 환경부고시가(J), 매출(K), 발주금액(L), 기본설치비(M), 영업비(N), 실사비(O)
    const CURRENCY_COLS = [10, 11, 12, 13, 14, 15];

    // 헤더
    sheet.columns = [
      { header: '설치날짜',    key: 'installation_date',    width: 14 },
      { header: '설치팀',      key: 'installation_team',    width: 12 },
      { header: '매출처',      key: 'revenue_source',       width: 20 },
      { header: '영업점',      key: 'sales_office',         width: 12 },
      { header: '지역대구분',  key: 'region_category',      width: 16 },
      { header: '지자체',      key: 'local_government',     width: 14 },
      { header: '사업장명',    key: 'business_name',        width: 24 },
      { header: '제조사',      key: 'manufacturer',         width: 14 },
      { header: '장착구분',    key: 'progress_status',      width: 14 },
      { header: '환경부고시가', key: 'official_price_total', width: 16 },
      { header: '매출',        key: 'total_revenue',        width: 16 },
      { header: '발주금액',    key: 'total_cost',           width: 16 },
      { header: '기본설치비',  key: 'installation_costs',   width: 16 },
      { header: '영업비',      key: 'sales_commission',     width: 16 },
      { header: '실사비',      key: 'survey_costs',         width: 16 },
    ];

    // 헤더 스타일
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF4472C4' } }
      };
    });

    // 환경부고시가 계산: Σ(고시가 × 수량) - 추가공사비/협의사항 제외
    const EQUIPMENT_EXPORT_FIELDS = [
      'ph_meter', 'differential_pressure_meter', 'temperature_meter',
      'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
      'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
      'explosion_proof_differential_pressure_meter_domestic',
      'explosion_proof_temperature_meter_domestic', 'expansion_device',
      'relay_8ch', 'relay_16ch', 'main_board_replacement', 'multiple_stack'
    ];

    sortedBusinesses.forEach(business => {
      const b = business as any;

      // 지역대구분: 주소에서 첫 두 단어 추출 (예: '경상북도 문경시')
      const addressParts = (b.address || '').trim().split(/\s+/);
      const regionCategory = addressParts.slice(0, 2).join(' ');

      // 제조사 한글 변환
      const manufacturerKo = b.manufacturer
        ? (MANUFACTURER_NAMES[b.manufacturer as keyof typeof MANUFACTURER_NAMES] || b.manufacturer)
        : '';

      // 환경부고시가 합계: 고시가 × 수량 합산
      const officialPriceTotal = EQUIPMENT_EXPORT_FIELDS.reduce((sum, field) => {
        const qty = Number(b[field]) || 0;
        const price = officialPrices[field] || 0;
        return sum + qty * price;
      }, 0);

      const row = sheet.addRow({
        installation_date:    b.installation_date || '',
        installation_team:    b.installation_team || '',
        revenue_source:       b.revenue_source || '',
        sales_office:         b.sales_office || '',
        region_category:      regionCategory,
        local_government:     b.local_government || '',
        business_name:        b.business_name || '',
        manufacturer:         manufacturerKo,
        progress_status:      b.progress_status || '',
        official_price_total: officialPriceTotal,
        total_revenue:        b.total_revenue || 0,
        total_cost:           b.total_cost || 0,
        installation_costs:   b.installation_costs || 0,
        sales_commission:     b.sales_commission || 0,
        survey_costs:         b.survey_costs || 0,
      });

      // 금액 컬럼 숫자 서식 적용 (천단위 콤마)
      CURRENCY_COLS.forEach(colIdx => {
        const cell = row.getCell(colIdx);
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right' };
      });
    });

    const today = new Date().toISOString().split('T')[0];
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `매출관리_${today}.xlsx`;
    link.click();
  };

  const filteredCalculations = calculations.filter(calc =>
    !searchTerm ||
    calc.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    calc.sales_office.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 🎯 PricingData 안정화 (객체 참조 변경 방지)
  const pricingData = useMemo<PricingData>(() => ({
    officialPrices,
    manufacturerPrices,
    salesOfficeSettings,
    surveyCostSettings,
    baseInstallationCosts
  }), [
    officialPrices,
    manufacturerPrices,
    salesOfficeSettings,
    surveyCostSettings,
    baseInstallationCosts
  ]);

  // ✅ 실시간 매출 계산 (useMemo로 성능 최적화)
  const filteredBusinesses = useMemo(() => {
    // 🔄 State Machine: 데이터가 준비되지 않았으면 빈 배열 반환
    if (dataLoadingState !== 'ready') {
      return [];
    }

    return businesses.filter(business => {
      // 검색어 필터
      const searchMatch = !searchTerm ||
        business.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (business.sales_office && business.sales_office.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (business.manager_name && business.manager_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (business.address && business.address.toLowerCase().includes(searchTerm.toLowerCase()));

      // 드롭다운 필터 (다중 선택)
      const officeMatch = selectedOffices.length === 0 || selectedOffices.includes(business.sales_office || '');
      const regionMatch = selectedRegions.length === 0 || selectedRegions.some(region =>
        business.address && business.address.toLowerCase().includes(region.toLowerCase())
      );
      const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(business.progress_status || '');
      const installYear = business.installation_date ? String(new Date(business.installation_date).getFullYear()) : '';
      const yearMatch = selectedProjectYears.length === 0 || (installYear && selectedProjectYears.includes(installYear));

      // 월별 필터 (설치일 기준, 다중 선택)
      let monthMatch = true;
      if (selectedMonths.length > 0) {
        const installDate = business.installation_date;
        if (installDate) {
          const date = new Date(installDate);
          const month = String(date.getMonth() + 1);
          monthMatch = selectedMonths.includes(month);
        } else {
          monthMatch = false;  // 설치일 없으면 제외
        }
      }

      // 실사 월 필터 ['견적|1', '착공|2', '준공|9']
      let surveyMonthMatch = true;
      if (selectedSurveyMonths.length > 0) {
        surveyMonthMatch = false;

        for (const selection of selectedSurveyMonths) {
          const [type, monthStr] = selection.split('|');
          const targetMonth = parseInt(monthStr, 10);

          let surveyDate: string | null = null;
          if (type === '견적') surveyDate = business.estimate_survey_date;
          else if (type === '착공') surveyDate = business.pre_construction_survey_date;
          else if (type === '준공') surveyDate = business.completion_survey_date;

          if (surveyDate) {
            const date = new Date(surveyDate);
            const surveyMonth = date.getMonth() + 1;
            if (surveyMonth === targetMonth) {
              surveyMonthMatch = true;
              break;
            }
          }
        }
      }

      // 세금계산서 발행일 필터 (invoice_1st_date, invoice_2nd_date, invoice_advance_date, invoice_balance_date, invoice_additional_date 중 하나라도 일치하면 포함)
      let invoiceMatch = true;
      if (selectedInvoiceYears.length > 0 || selectedInvoiceMonths.length > 0) {
        const b = business as any;
        const invoiceDates = [
          b.invoice_1st_date,
          b.invoice_2nd_date,
          b.invoice_advance_date,
          b.invoice_balance_date,
          b.invoice_additional_date,
        ].filter(Boolean) as string[];

        invoiceMatch = invoiceDates.some(dateStr => {
          const d = new Date(dateStr);
          const yearStr = String(d.getFullYear());
          const monthStr = String(d.getMonth() + 1);
          const yearOk = selectedInvoiceYears.length === 0 || selectedInvoiceYears.includes(yearStr);
          const monthOk = selectedInvoiceMonths.length === 0 || selectedInvoiceMonths.includes(monthStr);
          return yearOk && monthOk;
        });
      }

      return searchMatch && officeMatch && regionMatch && categoryMatch && yearMatch && monthMatch && surveyMonthMatch && invoiceMatch;
    }).map((business) => {
      // ✅ 실시간 계산 적용 (Admin 대시보드와 동일한 계산식)
      const calculatedData = calculateBusinessRevenue(business, pricingData);

      // 기기 수 계산
      const equipmentFields = [
        'ph_meter', 'differential_pressure_meter', 'temperature_meter',
        'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
        'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
        'explosion_proof_differential_pressure_meter_domestic',
        'explosion_proof_temperature_meter_domestic', 'expansion_device',
        'relay_8ch', 'relay_16ch', 'main_board_replacement', 'multiple_stack'
      ];

      const totalEquipment = equipmentFields.reduce((sum, field) => {
        return sum + (business[field as keyof BusinessInfo] as number || 0);
      }, 0);

      // ✅ 실시간 계산 결과 사용
      const actualTotalCost = calculatedData.total_cost;
      const grossProfit = calculatedData.gross_profit;
      const salesCommission = calculatedData.sales_commission;
      const surveyCosts = calculatedData.survey_costs;
      const installationCosts = calculatedData.installation_costs;
      const installationExtraCost = calculatedData.installation_extra_cost;
      const netProfit = calculatedData.net_profit;

    // 미수금 계산 (진행구분에 따라 다르게 계산)
    let totalReceivables = 0;
    const progressStatus = business.progress_status || '';
    const normalizedCategory = progressStatus.trim();

    if (normalizedCategory === '보조금' || normalizedCategory === '보조금 동시진행') {
      // 보조금: 1차 + 2차 + 추가공사비
      const receivable1st = ((business as any).invoice_1st_amount || 0) - ((business as any).payment_1st_amount || 0);
      const receivable2nd = ((business as any).invoice_2nd_amount || 0) - ((business as any).payment_2nd_amount || 0);
      // 추가공사비는 계산서가 발행된 경우에만 미수금 계산 (invoice_additional_date 존재 여부 확인)
      const hasAdditionalInvoice = (business as any).invoice_additional_date;
      const receivableAdditional = hasAdditionalInvoice
        ? (business.additional_cost || 0) - ((business as any).payment_additional_amount || 0)
        : 0;
      totalReceivables = receivable1st + receivable2nd + receivableAdditional;
    } else if (normalizedCategory === '자비' || normalizedCategory === '대리점' || normalizedCategory === 'AS') {
      // 자비: 선금 + 잔금
      const receivableAdvance = ((business as any).invoice_advance_amount || 0) - ((business as any).payment_advance_amount || 0);
      const receivableBalance = ((business as any).invoice_balance_amount || 0) - ((business as any).payment_balance_amount || 0);
      totalReceivables = receivableAdvance + receivableBalance;
    }

      return {
        ...business,
        // ✅ 실시간 계산 결과 사용 (Admin 대시보드와 동일한 계산식)
        total_revenue: calculatedData.total_revenue,
        total_cost: calculatedData.total_cost,
        net_profit: calculatedData.net_profit,
        gross_profit: calculatedData.gross_profit,
        sales_commission: calculatedData.sales_commission,
        adjusted_sales_commission: calculatedData.adjusted_sales_commission,
        survey_costs: calculatedData.survey_costs,
        installation_costs: calculatedData.installation_costs,
        installation_extra_cost: calculatedData.installation_extra_cost, // ✅ 추가설치비 포함 (총 설치비용 통계 정확도 개선)
        equipment_count: totalEquipment,
        calculation_date: new Date().toISOString(), // 실시간 계산 시각
        category: business.progress_status || 'N/A',
        has_calculation: true, // ✅ 항상 true (실시간 계산)
        additional_cost: business.additional_cost || 0,
        negotiation: business.negotiation ? parseFloat(business.negotiation.toString()) : 0,
        total_receivables: totalReceivables,
        task_statuses: taskStatusMap[business.business_name] || [],
      };
    }).filter(business => {
      // 매출 금액 필터 적용
      const minRevenue = revenueFilter.min ? parseFloat(revenueFilter.min) : 0;
      const maxRevenue = revenueFilter.max ? parseFloat(revenueFilter.max) : Number.MAX_SAFE_INTEGER;
      return business.total_revenue >= minRevenue && business.total_revenue <= maxRevenue;
    }).filter(business => {
      // 미수금 필터 적용
      if (!showReceivablesOnly) {
        return true;
      }
      return business.total_receivables > 0;
    }).filter(business => {
      // 미설치 필터 적용
      if (!showUninstalledOnly) {
        return true;
      }
      return !(business as any).installation_date || (business as any).installation_date === '';
    }).filter(business => {
      // 업무단계 필터 (미수금 필터 활성화 시에만 적용)
      if (!showReceivablesOnly) return true;
      if (selectedTaskTypes.length === 0) return true;
      // 선택된 라벨들에 해당하는 모든 status 코드 수집
      const matchingStatuses = allSteps
        .filter(s => selectedTaskTypes.includes(s.label))
        .map(s => s.status);
      const taskList = taskStatusMap[business.business_name] ?? [];
      return taskList.some(ts => matchingStatuses.includes(ts.status as any));
    }).filter(business => {
      // 위험도 필터 (미수금 필터 활성화 시에만 적용)
      if (!showReceivablesOnly) return true;
      if (selectedRiskLevels.length === 0) return true;
      const risk = riskMap[business.id] ?? null;
      return risk !== null && selectedRiskLevels.includes(risk);
    });
  }, [
    businesses,
    dataLoadingState, // 🔧 State Machine dependency 추가
    pricingData, // 🎯 안정화된 객체 사용
    searchTerm,
    selectedOffices,
    selectedRegions,
    selectedCategories,
    selectedProjectYears,
    selectedMonths,
    selectedSurveyMonths,
    selectedInvoiceYears,
    selectedInvoiceMonths,
    revenueFilter,
    showReceivablesOnly,
    showUninstalledOnly,
    taskStatusMap,
    selectedTaskTypes,
    selectedRiskLevels,
    riskMap,
  ]);

  // ✅ 실시간 계산 결과로 통계 계산 (filteredBusinesses에서 직접 계산)
  const stats = useMemo(() => {
    if (!filteredBusinesses.length) {
      return null;
    }

    // 💡 로그 제거: 통계 계산은 매우 가벼운 작업이므로 매번 계산해도 무방
    // 필터가 변경되었다는 것은 사용자가 의도적으로 데이터를 조회한 것이므로 정상 동작

    const totalRevenue = filteredBusinesses.reduce((sum, biz) => sum + biz.total_revenue, 0);
    const totalProfit = filteredBusinesses.reduce((sum, biz) => sum + biz.net_profit, 0);
    const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

    // 영업점별 수익 계산
    const officeStats = filteredBusinesses.reduce((acc, biz) => {
      const office = biz.sales_office || '기본';
      if (!acc[office]) {
        acc[office] = { revenue: 0, profit: 0 };
      }
      acc[office].revenue += biz.total_revenue;
      acc[office].profit += biz.net_profit;
      return acc;
    }, {} as Record<string, {revenue: number, profit: number}>);

    const topOffice = Object.entries(officeStats)
      .sort(([,a], [,b]) => b.profit - a.profit)[0]?.[0] || '';

    return {
      total_businesses: filteredBusinesses.length,
      total_revenue: totalRevenue,
      total_profit: totalProfit,
      average_margin: avgMargin + '%',
      top_performing_office: topOffice
    };
  }, [filteredBusinesses]);

  const salesOffices = [...new Set(businesses.map(b => b.sales_office).filter(Boolean))];
  const regions = [...new Set(businesses.map(b => b.address ? b.address.split(' ').slice(0, 2).join(' ') : '').filter(Boolean))];
  const projectYears = [...new Set(businesses
    .map(b => b.installation_date ? new Date(b.installation_date).getFullYear() : null)
    .filter(Boolean) as number[]
  )].sort((a, b) => b - a);

  // 세금계산서 발행 연도 목록 (5가지 계산서 날짜 필드에서 추출)
  const invoiceYears = [...new Set(businesses.flatMap(b => {
    const ba = b as any;
    return [ba.invoice_1st_date, ba.invoice_2nd_date, ba.invoice_advance_date, ba.invoice_balance_date, ba.invoice_additional_date]
      .filter(Boolean)
      .map((d: string) => new Date(d).getFullYear());
  }))].sort((a, b) => b - a);

  // 정렬 함수
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1); // 정렬시 첫 페이지로 이동
  };

  // 정렬된 데이터
  const sortedBusinesses = [...filteredBusinesses].sort((a, b) => {
    const aValue = a[sortField as keyof typeof a] || '';
    const bValue = b[sortField as keyof typeof b] || '';

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }

    const aStr = String(aValue).toLowerCase();
    const bStr = String(bValue).toLowerCase();
    return sortOrder === 'asc'
      ? aStr.localeCompare(bStr)
      : bStr.localeCompare(aStr);
  });

  // 페이지네이션
  const totalPages = Math.ceil(sortedBusinesses.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedBusinesses = sortedBusinesses.slice(startIndex, startIndex + itemsPerPage);

  return (
    <ProtectedPage
      requiredLevel={AuthLevel.ADMIN}
      fallbackMessage="매출 관리 시스템은 관리자 권한이 필요합니다."
    >
      <AdminLayout
        title="매출 관리"
        description="환경부 고시가 기준 매출 현황 및 분석"
        actions={
          <div className="flex gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                if (userPermission >= 3) {
                  router.push('/admin/revenue/pricing');
                } else {
                  alert(`원가 관리는 관리자 이상 권한이 필요합니다. 현재 권한: ${AUTH_LEVEL_DESCRIPTIONS[userPermission as keyof typeof AUTH_LEVEL_DESCRIPTIONS]}`);
                }
              }}
              disabled={userPermission < 3}
              className={`px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 border rounded-lg flex items-center gap-1 sm:gap-1.5 md:gap-2 transition-colors text-xs sm:text-sm ${
                userPermission >= 3
                  ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'
                  : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
              }`}
              title={userPermission < 3 ? `권한 부족: ${AUTH_LEVEL_DESCRIPTIONS[userPermission as keyof typeof AUTH_LEVEL_DESCRIPTIONS]} (필요: 관리자 이상)` : '원가 관리 페이지로 이동'}
            >
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">원가 관리</span>
              <span className="sm:hidden">원가</span>
            </button>
            <button
              onClick={exportData}
              className="px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-1 sm:gap-1.5 md:gap-2 transition-colors text-xs sm:text-sm"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">엑셀 내보내기</span>
              <span className="sm:hidden">엑셀</span>
            </button>
          </div>
        }
      >
        <div className="space-y-3 sm:space-y-4">

        {/* 통계 카드 - 주석 처리 (나중에 필요할 수 있음)
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <StatsCard
            title="총 사업장 수"
            value={`${businesses.length}개`}
            icon={Building2}
            color="blue"
            description={`필터 적용: ${filteredBusinesses.length}개`}
          />

          <StatsCard
            title="총 매출"
            value={formatCurrency(sortedBusinesses.reduce((sum, b) => sum + (b.total_revenue || 0), 0))}
            icon={BarChart3}
            color="green"
            description="전체 사업장 매출 합계"
          />

          <StatsCard
            title="총 순이익"
            value={formatCurrency(sortedBusinesses.reduce((sum, b) => sum + (b.net_profit || 0), 0))}
            icon={TrendingUp}
            color="purple"
            description={(() => {
              const totals = sortedBusinesses.reduce(
                (acc, b) => ({
                  revenue: acc.revenue + (b.total_revenue || 0),
                  profit: acc.profit + (b.net_profit || 0)
                }),
                { revenue: 0, profit: 0 }
              );
              return `전체 이익률: ${
                totals.revenue > 0
                  ? ((totals.profit / totals.revenue) * 100).toFixed(1) + '%'
                  : '0%'
              }`;
            })()}
          />

          <StatsCard
            title="총 영업비용"
            value={formatCurrency(sortedBusinesses.reduce((sum, b) => {
              const salesCommission = b.adjusted_sales_commission || b.sales_commission || 0;
              return sum + salesCommission;
            }, 0))}
            icon={Calculator}
            color="orange"
            description="전체 사업장 영업비용 합계"
          />

          <StatsCard
            title="총 설치비용"
            value={formatCurrency(sortedBusinesses.reduce((sum, b) => {
              const installationCosts = (b.installation_costs || 0) + (b.installation_extra_cost || 0);
              return sum + installationCosts;
            }, 0))}
            icon={Settings}
            color="blue"
            description="기본 설치비 + 추가 설치비"
          />

          <StatsCard
            title="최고 수익 영업점"
            value={(() => {
              const officeStats = sortedBusinesses.reduce((acc: Record<string, number>, b) => {
                const office = b.sales_office || '미배정';
                acc[office] = (acc[office] || 0) + (b.net_profit || 0);
                return acc;
              }, {});
              const topOffice = Object.entries(officeStats).sort(([,a], [,b]) => b - a)[0];
              return topOffice ? topOffice[0] : '데이터 없음';
            })()}
            icon={DollarSign}
            color="indigo"
            description="순이익 기준 최고 영업점"
          />
        </div>
        */}

        {/* 요약 통계 */}
        {dataLoadingState === 'loading-prices' || dataLoadingState === 'loading-businesses' ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-3 md:gap-4">
            {[...Array(7)].map((_, idx) => (
              <div key={idx} className="bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="p-1 sm:p-1.5 bg-gray-50 rounded flex-shrink-0 animate-pulse">
                    <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 bg-gray-300 rounded"></div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="h-3 sm:h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 sm:h-5 bg-gray-300 rounded animate-pulse w-3/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : dataLoadingState === 'error' ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-red-600 font-medium">⚠️ 데이터를 불러오는 중 오류가 발생했습니다</p>
            <p className="text-sm text-red-500 mt-1">페이지를 새로고침해주세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-3 md:gap-4">

          {/* Card #1: 총 매출금액 / 총 미수금액 */}
          <div className="group relative bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">

            {/* Tooltip - Below card, left-aligned */}
            <div className="absolute top-full left-0 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
              <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
                {showReceivablesOnly
                  ? '미수금 = Σ(선수금 + 계산서잔액 - 입금잔액)'
                  : '매출 = Σ(환경부 고시가 × 수량 + 추가공사비 - 협의사항)'
                }
                {/* Arrow pointing UP, positioned on left */}
                <div className="absolute bottom-full left-4 mb-px">
                  <div className="border-4 border-transparent border-b-gray-900"></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className={`p-1 sm:p-1.5 ${showReceivablesOnly ? 'bg-red-50' : 'bg-green-50'} rounded flex-shrink-0`}>
                <TrendingUp className={`w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 ${showReceivablesOnly ? 'text-red-600' : 'text-green-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">
                  {showReceivablesOnly ? '총 미수금액' : '총 매출금액'}
                </p>
                <p className={`text-[9px] sm:text-[10px] md:text-xs font-bold ${showReceivablesOnly ? 'text-red-600' : 'text-green-600'} break-words`}>
                  {formatCurrency((() => {
                    if (showReceivablesOnly) {
                      const totalReceivables = sortedBusinesses.reduce((sum, b) => {
                        const receivables = Number(b.total_receivables) || 0;
                        return sum + receivables;
                      }, 0);
                      return totalReceivables;
                    } else {
                      const totalRevenue = sortedBusinesses.reduce((sum, b) => {
                        const revenue = Number(b.total_revenue) || 0;
                        return sum + revenue;
                      }, 0);
                      return totalRevenue;
                    }
                  })())}
                </p>
              </div>
            </div>
          </div>

          {/* Card #2: 총 매입금액 - NEW */}
          <div className="group relative bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">

            {/* Tooltip - Below card, centered */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
              <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
                매입 = Σ(제조사별 원가 × 수량)
                {/* Arrow pointing UP, centered */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-px">
                  <div className="border-4 border-transparent border-b-gray-900"></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-teal-50 rounded flex-shrink-0">
                <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">총 매입금액</p>
                <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-teal-600 break-words">
                  {formatCurrency((() => {
                    const totalPurchase = sortedBusinesses.reduce((sum, b) => {
                      const cost = Number(b.total_cost) || 0;
                      return sum + cost;
                    }, 0);
                    return totalPurchase;
                  })())}
                </p>
              </div>
            </div>
          </div>

          {/* Card #3: 총 영업비용 */}
          <div className="group relative bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">

            {/* Tooltip */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
              <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
                영업비용 = Σ(기본 영업비용 또는 조정된 영업비용)
                {/* Arrow pointing UP, centered */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-px">
                  <div className="border-4 border-transparent border-b-gray-900"></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-orange-50 rounded flex-shrink-0">
                <Calculator className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">총 영업비용</p>
                <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-orange-600 break-words">
                  {formatCurrency(sortedBusinesses.reduce((sum, b) => {
                    const salesCommission = Number(b.adjusted_sales_commission || b.sales_commission || 0);
                    return sum + (isNaN(salesCommission) ? 0 : salesCommission);
                  }, 0))}
                </p>
              </div>
            </div>
          </div>

          {/* Card #4: 총 설치비용 */}
          <div className="group relative bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">

            {/* Tooltip */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
              <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
                설치비용 = Σ(기본설치비 + 추가설치비)
                {/* Arrow pointing UP, centered */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-px">
                  <div className="border-4 border-transparent border-b-gray-900"></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-blue-50 rounded flex-shrink-0">
                <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">총 설치비용</p>
                <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-blue-600 break-words">
                  {formatCurrency(
                    sortedBusinesses.reduce((sum, b) => {
                      const baseCost = Number(b.installation_costs) || 0;
                      const extraCost = Number(b.installation_extra_cost) || 0;
                      return sum + baseCost + extraCost;
                    }, 0)
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Card #5: 기타 비용 - NEW */}
          <div className="group relative bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">

            {/* Tooltip */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
              <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
                기타 비용 = Σ(실사비용 + AS 비용 + 커스텀 비용)
                {/* Arrow pointing UP, centered */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-px">
                  <div className="border-4 border-transparent border-b-gray-900"></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-amber-50 rounded flex-shrink-0">
                <PackagePlus className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">기타 비용</p>
                <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-amber-600 break-words">
                  {formatCurrency((() => {
                    const totalOtherCosts = sortedBusinesses.reduce((sum, b) => {
                      // 1. 실사비용 (항상 포함)
                      const surveyCosts = Number(b.survey_costs) || 0;

                      // 2. AS 비용 (있는 경우)
                      const asCost = Number((b as any).as_cost) || 0;

                      // 3. 커스텀 추가비용 (있는 경우)
                      let customCosts = 0;
                      if ((b as any).custom_additional_costs) {
                        try {
                          const costs = typeof (b as any).custom_additional_costs === 'string'
                            ? JSON.parse((b as any).custom_additional_costs)
                            : (b as any).custom_additional_costs;

                          if (Array.isArray(costs)) {
                            customCosts = costs.reduce((total: number, c: any) => total + (Number(c.amount) || 0), 0);
                          }
                        } catch (e) {
                          customCosts = 0;
                        }
                      }

                      return sum + surveyCosts + asCost + customCosts;
                    }, 0);
                    return totalOtherCosts;
                  })())}
                </p>
              </div>
            </div>
          </div>

          {/* Card #6: 총 이익금액 */}
          <div className="group relative bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">

            {/* Tooltip */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
              <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
                순이익 = 매출 - 매입 - 영업비용 - 설치비용 - 기타 비용
                {/* Arrow pointing UP, centered */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-px">
                  <div className="border-4 border-transparent border-b-gray-900"></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-purple-50 rounded flex-shrink-0">
                <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">총 이익금액</p>
                <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-purple-600 break-words">
                  {formatCurrency((() => {
                    const totalProfit = sortedBusinesses.reduce((sum, b) => {
                      const profit = Number(b.net_profit) || 0;
                      return sum + profit;
                    }, 0);
                    return totalProfit;
                  })())}
                </p>
              </div>
            </div>
          </div>

          {/* Card #7: 사업장 평균 이익률 */}
          <div className="group relative bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">

            {/* Tooltip - Below card, right-aligned */}
            <div className="absolute top-full right-0 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
              <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
                평균 이익률 = (Σ(순이익 ÷ 매출 × 100) ÷ 사업장 수)%
                {/* Arrow pointing UP, positioned on right */}
                <div className="absolute bottom-full right-4 mb-px">
                  <div className="border-4 border-transparent border-b-gray-900"></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-indigo-50 rounded flex-shrink-0">
                <BarChart3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">사업장 평균 이익률</p>
                <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-indigo-600">
                  {sortedBusinesses.length > 0 ?
                    (() => { const bizWithRevenue = sortedBusinesses.filter(b => b.total_revenue > 0); return bizWithRevenue.length > 0 ? (bizWithRevenue.reduce((sum, b) => sum + ((b.net_profit || 0) / b.total_revenue * 100), 0) / bizWithRevenue.length).toFixed(1) : '0'; })()
                    : '0'}%
                </p>
              </div>
            </div>
          </div>

          </div>
        )}

        {/* 필터 및 검색 */}
        <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
          <button
            onClick={() => isMobile && setIsFilterExpanded(!isFilterExpanded)}
            className={`w-full text-xs sm:text-sm md:text-base font-semibold text-gray-900 mb-2 sm:mb-3 md:mb-4 flex items-center justify-between gap-1.5 sm:gap-2 ${isMobile ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              필터 및 검색
            </div>
            {isMobile && (
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${isFilterExpanded ? 'rotate-180' : ''}`}
              />
            )}
          </button>
          <div className={`space-y-2 sm:space-y-3 ${isMobile && !isFilterExpanded ? 'hidden' : ''}`}>
            {/* 첫 번째 행: MultiSelectDropdown 필터들 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3 md:gap-4">
              {/* 영업점 필터 - 주석처리 (검색창에서 영업점명 검색 가능)
              <MultiSelectDropdown
                label="영업점"
                options={salesOffices}
                selectedValues={selectedOffices}
                onChange={(values) => { setSelectedOffices(values); setCurrentPage(1); }}
                placeholder="전체"
                inline
              />
              */}

              {/* 지역 필터 - 주석처리 (검색창에서 주소 검색 가능)
              <MultiSelectDropdown
                label="지역"
                options={regions.sort()}
                selectedValues={selectedRegions}
                onChange={(values) => { setSelectedRegions(values); setCurrentPage(1); }}
                placeholder="전체"
                inline
              />
              */}

              <MultiSelectDropdown
                label="진행구분"
                options={['자비', '보조금', '보조금 동시진행', '대리점', 'AS']}
                selectedValues={selectedCategories}
                onChange={(values) => { setSelectedCategories(values); setCurrentPage(1); }}
                placeholder="전체"
                inline
              />

              <MultiSelectDropdown
                label="설치연도"
                options={projectYears.map(year => String(year))}
                selectedValues={selectedProjectYears}
                onChange={(values) => { setSelectedProjectYears(values); setCurrentPage(1); }}
                placeholder="전체"
                inline
              />

              <MultiSelectDropdown
                label="설치월"
                options={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']}
                selectedValues={selectedMonths}
                onChange={(values) => { setSelectedMonths(values); setCurrentPage(1); }}
                placeholder="전체"
                inline
              />

              <TwoStageDropdown
                label="실사월"
                stage1Options={['견적', '착공', '준공']}
                stage2Options={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']}
                onChange={(values) => { setSelectedSurveyMonths(values); setCurrentPage(1); }}
                placeholder="전체"
                inline
              />

              <MultiSelectDropdown
                label="계산서연도"
                options={invoiceYears.map(year => String(year))}
                selectedValues={selectedInvoiceYears}
                onChange={(values) => { setSelectedInvoiceYears(values); setCurrentPage(1); }}
                placeholder="전체"
                inline
              />

              <MultiSelectDropdown
                label="계산서월"
                options={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']}
                selectedValues={selectedInvoiceMonths}
                onChange={(values) => { setSelectedInvoiceMonths(values); setCurrentPage(1); }}
                placeholder="전체"
                inline
              />
            </div>

            {/* 두 번째 행: 검색, 매출금액, 필터 (미수금 ON 시 업무관리 필터 추가) */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 items-center ${showReceivablesOnly ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
              <div className={`flex items-center gap-1.5 ${showReceivablesOnly ? 'md:col-span-1' : 'md:col-span-2'}`}>
                <label className="text-xs sm:text-sm font-medium whitespace-nowrap shrink-0">검색</label>
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="사업장명/영업점/주소"
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-7 pr-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-xs sm:text-sm font-medium whitespace-nowrap shrink-0">최소</label>
                <input
                  type="number"
                  placeholder="0"
                  value={revenueFilter.min}
                  onChange={(e) => { setRevenueFilter(prev => ({ ...prev, min: e.target.value })); setCurrentPage(1); }}
                  className="flex-1 px-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent w-20"
                  min="0"
                  step="100000"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-xs sm:text-sm font-medium whitespace-nowrap shrink-0">최대</label>
                <input
                  type="number"
                  placeholder="제한없음"
                  value={revenueFilter.max}
                  onChange={(e) => { setRevenueFilter(prev => ({ ...prev, max: e.target.value })); setCurrentPage(1); }}
                  className="flex-1 px-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent w-20"
                  min="0"
                  step="100000"
                />
              </div>

              {/* 업무단계 필터 (미수금 ON 시에만 표시) */}
              {showReceivablesOnly && (
                <MultiSelectDropdown
                  label="업무단계"
                  options={uniqueTaskStepLabels.map(s => s.label)}
                  selectedValues={selectedTaskTypes}
                  onChange={(vals) => { setSelectedTaskTypes(vals); setCurrentPage(1); }}
                  placeholder="전체 단계"
                  inline={true}
                />
              )}

              {/* 위험도 필터 (미수금 ON 시에만 표시) */}
              {showReceivablesOnly && (
                <MultiSelectDropdown
                  label="위험도"
                  options={['상', '중', '하']}
                  selectedValues={selectedRiskLevels}
                  onChange={(vals) => { setSelectedRiskLevels(vals); setCurrentPage(1); }}
                  placeholder="전체"
                  inline={true}
                />
              )}

              <div className="flex items-center justify-end gap-3">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="receivables-filter"
                    checked={showReceivablesOnly}
                    onChange={(e) => {
                      setShowReceivablesOnly(e.target.checked);
                      if (!e.target.checked) {
                        setSelectedTaskTypes([]);
                        setSelectedRiskLevels([]);
                      }
                      setCurrentPage(1);
                    }}
                    className="w-3.5 h-3.5 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500 focus:ring-2"
                  />
                  <label htmlFor="receivables-filter" className="text-xs sm:text-sm font-medium text-gray-700 cursor-pointer whitespace-nowrap">
                    미수금
                  </label>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="uninstalled-filter"
                    checked={showUninstalledOnly}
                    onChange={(e) => { setShowUninstalledOnly(e.target.checked); setCurrentPage(1); }}
                    className="w-3.5 h-3.5 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500 focus:ring-2"
                  />
                  <label htmlFor="uninstalled-filter" className="text-xs sm:text-sm font-medium text-gray-700 cursor-pointer whitespace-nowrap">
                    미설치
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 사업장별 매출 현황 테이블 */}
        <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200">
          <div className="p-2 sm:p-3 md:p-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3">
              <h3 className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2">
                <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                사업장별 매출 현황 ({sortedBusinesses.length}건)
              </h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4 w-full sm:w-auto">
                <div className="text-[10px] sm:text-xs md:text-sm text-gray-500">
                  사업장 평균 이익률: {sortedBusinesses.length > 0 ?
                    (() => { const bizWithRevenue = sortedBusinesses.filter(b => b.total_revenue > 0); return bizWithRevenue.length > 0 ? (bizWithRevenue.reduce((sum, b) => sum + ((b.net_profit || 0) / b.total_revenue * 100), 0) / bizWithRevenue.length).toFixed(1) : '0'; })()
                    : '0'}%
                </div>
                {/* 재계산 버튼 - 권한 레벨 4 (슈퍼관리자) 전용 */}
                {userPermission >= 4 && (
                  <>
                    <button
                      onClick={() => {
                        if (confirm('선택한 사업장의 매출 정보를 재계산하시겠습니까?\n\n재계산하면 데이터베이스에 저장된 기존 계산값이 삭제되고 최신 로직으로 다시 계산됩니다.')) {
                          const businessName = prompt('재계산할 사업장명을 입력하세요:');
                          if (businessName) {
                            const business = sortedBusinesses.find(b => b.business_name === businessName);
                            if (business) {
                              handleRecalculate(business.id, business.business_name);
                            } else {
                              alert('해당 사업장을 찾을 수 없습니다.');
                            }
                          }
                        }
                      }}
                      className="flex items-center gap-1 sm:gap-1.5 md:gap-2 px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      title="슈퍼관리자 전용: 개별 사업장 재계산"
                    >
                      <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">개별 재계산</span>
                      <span className="sm:hidden">개별</span>
                    </button>
                    <button
                      onClick={handleRecalculateAll}
                      className="flex items-center gap-1 sm:gap-1.5 md:gap-2 px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      title="슈퍼관리자 전용: 전체 사업장 재계산"
                    >
                      <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">전체 재계산</span>
                      <span className="sm:hidden">전체</span>
                    </button>
                    <button
                      onClick={calculateAllBusinesses}
                      disabled={isCalculating}
                      className={`
                        flex items-center gap-1 sm:gap-1.5 md:gap-2 px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 text-xs sm:text-sm rounded-lg transition-colors
                        ${isCalculating
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                        }
                      `}
                      title="슈퍼관리자 전용: 매출 계산이 없는 사업장만 일괄 계산"
                    >
                      <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">{isCalculating ? '계산 중...' : '미계산 일괄 계산'}</span>
                      <span className="sm:hidden">{isCalculating ? '계산중' : '미계산'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="p-2 sm:p-3 md:p-4">
            {loading ? (
              <div className="text-center py-6 sm:py-8">
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 animate-spin mx-auto mb-2" />
                <div className="text-gray-500 text-[10px] sm:text-xs md:text-sm">사업장 매출 데이터를 불러오는 중...</div>
              </div>
            ) : sortedBusinesses.length === 0 && calculations.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <div className="mb-4 sm:mb-6">
                  <Calculator className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">매출 계산 결과가 없습니다</h3>
                  <div className="text-gray-500 space-y-1 text-xs sm:text-sm">
                    <p>• 총 {businesses.length}개의 사업장이 등록되어 있습니다</p>
                    <p>• 아직 매출 계산이 수행되지 않았습니다</p>
                    <p>• 사업장을 선택하여 매출을 계산해보세요</p>
                  </div>
                </div>

                {businesses.length > 0 && userPermission >= 3 && (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 max-w-md mx-auto">
                      <h4 className="text-xs sm:text-sm font-medium text-blue-900 mb-2">매출 계산 시작하기</h4>
                      <div className="space-y-2">
                        <select
                          value={quickCalcBusiness}
                          onChange={(e) => setQuickCalcBusiness(e.target.value)}
                          className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-blue-300 rounded-md text-xs sm:text-sm"
                        >
                          <option value="">사업장을 선택하세요</option>
                          {businesses.map((business) => (
                            <option key={business.id} value={business.id}>
                              {business.business_name} ({business.sales_office})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => calculateRevenue(quickCalcBusiness)}
                          disabled={!quickCalcBusiness || isCalculating}
                          className="w-full px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-medium"
                        >
                          {isCalculating ? '계산 중...' : '매출 계산 실행'}
                        </button>
                      </div>
                    </div>

                    <div className="text-[10px] sm:text-xs text-gray-400">
                      💡 팁: 사업장별 매출 계산 후 결과가 이 화면에 표시됩니다
                    </div>

                  </div>
                )}

                {userPermission < 3 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 max-w-md mx-auto">
                    <p className="text-xs sm:text-sm text-yellow-800">
                      ⚠️ 매출 계산은 권한 레벨 3 이상이 필요합니다 (현재: 레벨 {userPermission})
                    </p>
                  </div>
                )}
              </div>
            ) : sortedBusinesses.length === 0 && calculations.length > 0 ? (
              <div className="text-center py-8 sm:py-12">
                <div className="mb-4 sm:mb-6">
                  <Building2 className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">필터 조건에 맞는 사업장이 없습니다</h3>
                  <div className="text-gray-500 space-y-1 text-xs sm:text-sm">
                    <p>• 총 {businesses.length}개의 사업장 중 {calculations.length}개 사업장에 매출 계산 완료</p>
                    <p>• 검색어나 필터 조건을 확인해보세요</p>
                    <p>• 모든 사업장을 보려면 필터를 초기화하세요</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedBusiness('');
                    setSelectedOffice('');
                    setSelectedRegion('');
                    setRevenueFilter({ min: '', max: '' });
                    setShowReceivablesOnly(false);
                    setSelectedInvoiceYears([]);
                    setSelectedInvoiceMonths([]);
                    setCurrentPage(1);
                  }}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm"
                >
                  필터 초기화
                </button>
              </div>
            ) : (
              <>
                {/* 모바일 카드뷰 */}
                <div className="md:hidden space-y-2 sm:space-y-3 md:space-y-4">
                  {paginatedBusinesses.map((business) => {
                    const profitMargin = business.total_revenue > 0
                      ? (((business.net_profit || 0) / business.total_revenue) * 100).toFixed(1)
                      : '0';

                    return (
                      <div
                        key={business.id}
                        className="bg-white border border-gray-200 rounded-md md:rounded-lg p-2 sm:p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between mb-1.5 sm:mb-2">
                          <button
                            onClick={() => {
                              setSelectedEquipmentBusiness(business);
                              setShowEquipmentModal(true);
                            }}
                            className="text-xs sm:text-sm md:text-base font-semibold text-blue-600 hover:text-blue-800 hover:underline text-left flex-1"
                          >
                            {business.business_name}
                          </button>
                          <span className={`ml-2 inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs md:text-sm font-medium flex-shrink-0 ${
                            business.category === '보조금' || business.category === '보조금 동시진행'
                              ? 'bg-purple-100 text-purple-800' :
                            business.category === '자비' ? 'bg-green-100 text-green-800' :
                            business.category === 'AS' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {business.category || 'N/A'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm">
                          <div>
                            <span className="text-gray-500">지역:</span>{' '}
                            <span className="font-medium">{business.address ? business.address.split(' ').slice(0, 2).join(' ') : '미등록'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">영업점:</span>{' '}
                            <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs md:text-sm font-medium bg-blue-100 text-blue-800">
                              {business.sales_office || '미배정'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">담당자:</span>{' '}
                            <span className="font-medium">{business.manager_name || '미등록'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">이익률:</span>{' '}
                            <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs md:text-sm font-medium ${
                              parseFloat(profitMargin) >= 10 ? 'bg-green-100 text-green-800' :
                              parseFloat(profitMargin) >= 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {profitMargin}%
                            </span>
                          </div>
                        </div>

                        <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-200 grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm">
                          <div>
                            <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5">매출금액</div>
                            <div className="font-mono font-semibold text-green-600 text-[10px] sm:text-xs md:text-sm">{formatCurrency(business.total_revenue)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5">매입금액</div>
                            <div className="font-mono font-semibold text-orange-600 text-[10px] sm:text-xs md:text-sm">{formatCurrency(business.total_cost)}</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5">이익금액</div>
                            <div className={`font-mono font-bold text-sm sm:text-base md:text-lg ${(business.net_profit ?? 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {formatCurrency(business.net_profit ?? 0)}
                            </div>
                          </div>
                          {selectedSurveyMonths.length > 0 && (
                            <div className="col-span-2 bg-blue-50 p-1.5 sm:p-2 rounded">
                              <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5">실사비용</div>
                              <div className="font-mono font-bold text-blue-600 text-[10px] sm:text-xs md:text-sm">
                                {formatCurrency(business.survey_costs || 0)}
                              </div>
                            </div>
                          )}
                          {showReceivablesOnly && business.total_receivables > 0 && (
                            <div className="col-span-2 bg-red-50 p-1.5 sm:p-2 rounded">
                              <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5">미수금</div>
                              <div className="font-mono font-bold text-red-600 text-[10px] sm:text-xs md:text-sm">
                                {formatCurrency(business.total_receivables)} ⚠️
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 데스크톱 테이블뷰 - 가상 스크롤링 적용 */}
                <VirtualizedTable
                  businesses={sortedBusinesses}
                  showReceivablesOnly={showReceivablesOnly}
                  selectedSurveyMonths={selectedSurveyMonths}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  handleSort={handleSort}
                  formatCurrency={formatCurrency}
                  setSelectedEquipmentBusiness={setSelectedEquipmentBusiness}
                  setShowEquipmentModal={setShowEquipmentModal}
                  handleRiskUpdate={handleRiskUpdate}
                  handlePaymentDateUpdate={handlePaymentDateUpdate}
                  riskMap={riskMap}
                  showPaymentSchedule={selectedCategories.includes('자비')}
                />
              </>
            )}
          </div>
        </div>
        </div>


        {/* 기기 상세 정보 모달 */}
        <BusinessRevenueModal
          business={selectedEquipmentBusiness}
          isOpen={showEquipmentModal}
          onClose={async (dataChanged = false) => {
            console.log('🔄 [MODAL-CLOSE] 모달 닫기 시작');
            setShowEquipmentModal(false);

            // ✅ 데이터가 실제로 변경된 경우에만 재조회
            if (dataChanged) {
              console.log('🔄 [MODAL-CLOSE] 데이터 변경 감지 → 재조회 시작...');
              await Promise.all([
                loadBusinesses(),
                loadCalculations()
              ]);
              console.log('✅ [MODAL-CLOSE] 데이터 재조회 완료');
            } else {
              console.log('✅ [MODAL-CLOSE] 데이터 변경 없음 → 재조회 생략');
            }
          }}
          userPermission={userPermission}
        />
      </AdminLayout>
    </ProtectedPage>
  );
}

// 가상 스크롤링 테이블 컴포넌트
function VirtualizedTable({
  businesses,
  showReceivablesOnly,
  selectedSurveyMonths,
  sortField,
  sortOrder,
  handleSort,
  formatCurrency,
  setSelectedEquipmentBusiness,
  setShowEquipmentModal,
  handleRiskUpdate,
  handlePaymentDateUpdate,
  riskMap,
  showPaymentSchedule,
}: {
  businesses: any[];
  showReceivablesOnly: boolean;
  selectedSurveyMonths: string[];
  sortField: string;
  sortOrder: 'asc' | 'desc';
  handleSort: (field: string) => void;
  formatCurrency: (value: number) => string;
  setSelectedEquipmentBusiness: (business: any) => void;
  setShowEquipmentModal: (show: boolean) => void;
  handleRiskUpdate: (businessId: string, risk: '상' | '중' | '하' | null) => void;
  handlePaymentDateUpdate: (businessId: string, date: string | null) => Promise<void>;
  riskMap: Record<string, string | null>;
  showPaymentSchedule: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: businesses.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  // 🔧 동적 컬럼 폭 계산 (미수금 / 실사비용 필터에 따라 조정)
  const showSurveyCostsColumn = selectedSurveyMonths.length > 0;

  const columnWidths = (() => {
    if (showPaymentSchedule && showReceivablesOnly && showSurveyCostsColumn) {
      // 자비+미수금+실사비용: 사업장명, 입금예정일, 업무단계, 위험도, 지역, 담당자, 매출, 매입, 이익, 이익률, 실사비용, 미수금 (12컬럼)
      // 입금예정일 9%→11% (+2%), 매출/매입/이익 9%→8% (각 -1%)
      return ['16%', '11%', '9%', '7%', '7%', '7%', '8%', '8%', '8%', '5%', '7%', '7%']; // 총합 100%
    } else if (showPaymentSchedule && showReceivablesOnly) {
      // 자비+미수금: 사업장명, 입금예정일, 업무단계, 위험도, 지역, 담당자, 매출, 매입, 이익, 이익률, 미수금 (11컬럼)
      // 사업장명 17%→16% (-1%), 입금예정일 8%→11% (+3%), 매출/매입/이익 10%→9% (각 -1%)
      return ['16%', '11%', '7%', '7%', '8%', '8%', '9%', '9%', '9%', '6%', '9%']; // 총합 99%
    } else if (showPaymentSchedule) {
      // 자비 필터: 사업장명, 입금예정일, 지역, 담당자, 카테고리, 영업점, 매출, 매입, 이익, 이익률 (10컬럼)
      // 사업장명 18%→17% (-1%), 입금예정일 10%→12% (+2%), 매출/매입/이익 11%→10% (각 -1%)
      return ['17%', '12%', '9%', '7%', '8%', '8%', '10%', '10%', '10%', '7%']; // 총합 98%
    } else if (showReceivablesOnly && showSurveyCostsColumn) {
      // 미수금 + 실사비용 + 업무단계 + 위험도 (13컬럼)
      // 사업장명, 업무단계, 위험도, 지역, 담당자, 카테고리, 영업점, 매출, 매입, 이익, 이익률, 실사비용, 미수금
      return ['13%', '8%', '7%', '6%', '6%', '7%', '7%', '8%', '8%', '8%', '5%', '7%', '10%']; // 총합 100%
    } else if (showReceivablesOnly) {
      // 미수금 + 업무단계 + 위험도 (12컬럼)
      // 사업장명, 업무단계, 위험도, 지역, 담당자, 카테고리, 영업점, 매출, 매입, 이익, 이익률, 미수금
      return ['14%', '9%', '7%', '6%', '6%', '8%', '8%', '9%', '9%', '9%', '5%', '10%']; // 총합 100%
    } else if (showSurveyCostsColumn) {
      // 실사비용만 표시 (기존 유지)
      return ['18%', '9%', '7%', '8%', '8%', '11%', '11%', '11%', '7%', '10%'];  // 총합 100%
    } else {
      // 기본 (둘 다 표시 안 함)
      return ['20%', '10%', '8%', '9%', '9%', '12%', '12%', '12%', '8%'];  // 총합 100%
    }
  })();

  return (
    <div className="hidden md:block">
      {/* 테이블 컨테이너 (스크롤 영역) */}
      <div
        ref={parentRef}
        className="border border-gray-300 bg-white overflow-y-auto overflow-x-hidden"
        style={{ height: '660px' }}  // 헤더 높이(60px) + 바디(600px)
      >
        {/* 헤더 (sticky로 고정) */}
        <div
          className="grid bg-gray-50 sticky top-0 z-10 border-b border-gray-300"
          style={{
            gridTemplateColumns: columnWidths.join(' '),
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          <div
            className="border-r border-gray-300 px-2 py-2 flex items-center justify-start text-left cursor-pointer hover:bg-gray-100 text-xs font-semibold"
            onClick={() => handleSort('business_name')}
          >
            사업장명 {sortField === 'business_name' && (sortOrder === 'asc' ? '↑' : '↓')}
          </div>
          {showPaymentSchedule && (
            <div
              className="border-r border-gray-300 px-2 py-2 flex items-center justify-center text-center cursor-pointer hover:bg-gray-100 bg-teal-50 text-teal-700 text-xs font-semibold"
              onClick={() => handleSort('payment_scheduled_date')}
            >
              입금예정일 {sortField === 'payment_scheduled_date' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
          )}
          {showReceivablesOnly && (
            <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-start text-left text-xs font-semibold bg-indigo-50 text-indigo-700">
              업무단계
            </div>
          )}
          {showReceivablesOnly && (
            <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-center text-center text-xs font-semibold bg-orange-50 text-orange-700">
              위험도
            </div>
          )}
          <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-start text-left text-xs font-semibold">지역</div>
          <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-start text-left text-xs font-semibold">담당자</div>
          {!(showPaymentSchedule && showReceivablesOnly) && (
            <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-center text-center text-xs font-semibold">카테고리</div>
          )}
          {!(showPaymentSchedule && showReceivablesOnly) && (
            <div
              className="border-r border-gray-300 px-2 py-2 flex items-center justify-start text-left cursor-pointer hover:bg-gray-100 text-xs font-semibold"
              onClick={() => handleSort('sales_office')}
            >
              영업점 {sortField === 'sales_office' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
          )}
          <div
            className="border-r border-gray-300 px-2 py-2 flex items-center justify-end text-right cursor-pointer hover:bg-gray-100 text-xs font-semibold"
            onClick={() => handleSort('total_revenue')}
          >
            매출금액 {sortField === 'total_revenue' && (sortOrder === 'asc' ? '↑' : '↓')}
          </div>
          <div
            className="border-r border-gray-300 px-2 py-2 flex items-center justify-end text-right cursor-pointer hover:bg-gray-100 text-xs font-semibold"
            onClick={() => handleSort('total_cost')}
          >
            매입금액 {sortField === 'total_cost' && (sortOrder === 'asc' ? '↑' : '↓')}
          </div>
          <div
            className="border-r border-gray-300 px-2 py-2 flex items-center justify-end text-right cursor-pointer hover:bg-gray-100 text-xs font-semibold"
            onClick={() => handleSort('net_profit')}
          >
            이익금액 {sortField === 'net_profit' && (sortOrder === 'asc' ? '↑' : '↓')}
          </div>
          <div className={`${showReceivablesOnly || showSurveyCostsColumn ? 'border-r' : ''} border-gray-300 px-2 py-2 flex items-center justify-end text-right text-xs font-semibold`}>이익률</div>
          {showSurveyCostsColumn && (
            <div
              className={`${showReceivablesOnly ? 'border-r' : ''} px-2 py-2 flex items-center justify-end text-right cursor-pointer hover:bg-gray-100 bg-blue-50 text-xs font-semibold`}
              onClick={() => handleSort('survey_costs')}
            >
              실사비용 {sortField === 'survey_costs' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
          )}
          {showReceivablesOnly && (
            <div
              className="px-2 py-2 flex items-center justify-end text-right cursor-pointer hover:bg-gray-100 bg-red-50 text-xs font-semibold"
              onClick={() => handleSort('total_receivables')}
            >
              미수금 {sortField === 'total_receivables' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
          )}
        </div>

        {/* 바디 (가상 스크롤) */}
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const business = businesses[virtualRow.index];
            const profitMargin = business.total_revenue > 0
              ? (((business.net_profit || 0) / business.total_revenue) * 100).toFixed(1)
              : '0';

            return (
              <div
                key={business.id}
                className="grid hover:bg-gray-50 border-b border-gray-300"
                style={{
                  gridTemplateColumns: columnWidths.join(' '),
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  boxSizing: 'border-box'
                }}
              >
                <div className="border-r border-gray-300 px-2 py-2 flex items-center text-xs">
                  <button
                    onClick={() => {
                      setSelectedEquipmentBusiness(business);
                      setShowEquipmentModal(true);
                    }}
                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left w-full truncate"
                  >
                    {business.business_name}
                  </button>
                </div>
                {/* 입금예정일 (자비 필터 ON 시) - 인라인 편집 */}
                {showPaymentSchedule && (
                  <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-center text-xs bg-teal-50/30">
                    <PaymentDateCell
                      businessId={business.id}
                      currentDate={business.payment_scheduled_date}
                      onUpdate={handlePaymentDateUpdate}
                    />
                  </div>
                )}
                {/* 업무단계 (미수금 ON 시) */}
                {showReceivablesOnly && (
                  <div className="border-r border-gray-300 px-1.5 py-1 flex items-center flex-wrap gap-0.5 bg-indigo-50/30">
                    {(business.task_statuses ?? []).length > 0 ? (
                      (business.task_statuses as Array<{ task_type: string; status: string }>).map((ts, i) => {
                        const step = allSteps.find(s => s.status === ts.status);
                        const label = step?.label ?? ts.status;
                        return (
                          <span
                            key={i}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800 whitespace-nowrap"
                          >
                            {label}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[10px] text-gray-400">-</span>
                    )}
                  </div>
                )}
                {/* 위험도 (미수금 ON 시) */}
                {showReceivablesOnly && (
                  <div className="border-r border-gray-300 px-1 py-1 flex items-center justify-center gap-0.5 bg-orange-50/30">
                    {(['상', '중', '하'] as const).map(level => {
                      const isActive = (riskMap[business.id] ?? null) === level;
                      const colorMap = {
                        상: isActive ? 'bg-red-100 text-red-700 ring-1 ring-red-400' : 'bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500',
                        중: isActive ? 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400' : 'bg-gray-50 text-gray-400 hover:bg-yellow-50 hover:text-yellow-500',
                        하: isActive ? 'bg-green-100 text-green-700 ring-1 ring-green-400' : 'bg-gray-50 text-gray-400 hover:bg-green-50 hover:text-green-500',
                      };
                      return (
                        <button
                          key={level}
                          onClick={() => handleRiskUpdate(business.id, isActive ? null : level)}
                          className={`px-1.5 py-0.5 text-[10px] rounded font-medium transition-all cursor-pointer ${colorMap[level]}`}
                        >
                          {level}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="border-r border-gray-300 px-2 py-2 flex items-center text-xs truncate">
                  {business.address ? business.address.split(' ').slice(0, 2).join(' ') : '미등록'}
                </div>
                <div className="border-r border-gray-300 px-2 py-2 flex items-center text-xs truncate">
                  {business.manager_name || '미등록'}
                </div>
                {!(showPaymentSchedule && showReceivablesOnly) && (
                  <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-center text-center text-xs">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      business.category === '보조금' || business.category === '보조금 동시진행'
                        ? 'bg-purple-100 text-purple-800' :
                      business.category === '자비' ? 'bg-green-100 text-green-800' :
                      business.category === 'AS' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {business.category || 'N/A'}
                    </span>
                  </div>
                )}
                {!(showPaymentSchedule && showReceivablesOnly) && (
                  <div className="border-r border-gray-300 px-2 py-2 flex items-center text-xs">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {business.sales_office || '미배정'}
                    </span>
                  </div>
                )}
                <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-end text-right font-mono text-xs">
                  {formatCurrency(business.total_revenue)}
                </div>
                <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-end text-right font-mono text-xs">
                  {formatCurrency(business.total_cost)}
                </div>
                <div className="border-r border-gray-300 px-2 py-2 flex items-center justify-end text-right font-mono font-bold text-xs">
                  <span className={(business.net_profit ?? 0) >= 0 ? 'text-blue-600' : 'text-red-600'}>
                    {formatCurrency(business.net_profit ?? 0)}
                  </span>
                </div>
                <div className={`${showReceivablesOnly || showSurveyCostsColumn ? 'border-r' : ''} border-gray-300 px-2 py-2 flex items-center justify-end text-right text-xs`}>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    parseFloat(profitMargin) >= 10 ? 'bg-green-100 text-green-800' :
                    parseFloat(profitMargin) >= 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {profitMargin}%
                  </span>
                </div>
                {showSurveyCostsColumn && (
                  <div className={`${showReceivablesOnly ? 'border-r' : ''} px-2 py-2 flex items-center justify-end text-right font-mono font-bold bg-blue-50 text-xs`}>
                    <span className="text-blue-600">
                      {formatCurrency(business.survey_costs || 0)}
                    </span>
                  </div>
                )}
                {showReceivablesOnly && (
                  <div className="px-2 py-2 flex items-center justify-end text-right font-mono font-bold bg-red-50 text-xs">
                    <span className={`${
                      business.total_receivables > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {formatCurrency(business.total_receivables)}
                      {business.total_receivables > 0 ? ' ⚠️' : ' ✅'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>  {/* 테이블 컨테이너 닫기 */}
    </div>
  );
}

// Suspense로 감싸서 useSearchParams() 사용 가능하게 함
function RevenuePage() {
  return (
    <Suspense fallback={
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mb-4"></div>
            <p className="text-gray-600">로딩 중...</p>
          </div>
        </div>
      </AdminLayout>
    }>
      <RevenueDashboard />
    </Suspense>
  );
}

// 새로운 AuthGuard 시스템 적용 완료
export default RevenuePage;