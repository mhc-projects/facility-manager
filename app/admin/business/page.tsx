// app/admin/business/page.tsx - 사업장 관리 페이지
'use client'

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { BusinessInfo } from '@/lib/database-service'
import type { BusinessMemo, CreateBusinessMemoInput, UpdateBusinessMemoInput } from '@/types/database'
import { getBusinessTaskStatus, getBatchBusinessTaskStatuses, getTaskSummary } from '@/lib/business-task-utils'
import { supabase } from '@/lib/supabase'
// Lazy load heavy modals for better initial load performance
const BusinessRevenueModal = lazy(() => import('@/components/business/BusinessRevenueModal'))
const BusinessUploadModal = lazy(() => import('@/components/business/modals/BusinessUploadModal'))
const BusinessDetailModal = lazy(() => import('@/components/business/modals/BusinessDetailModal'))
import { useAuth } from '@/contexts/AuthContext'
import { TokenManager } from '@/lib/api-client'
import { getManufacturerName } from '@/constants/manufacturers'
import AutocompleteInput from '@/components/ui/AutocompleteInput'
import DateInput from '@/components/ui/DateInput'
import MultiSelectDropdown from '@/components/ui/MultiSelectDropdown'
import { formatMobilePhone, formatLandlinePhone } from '@/utils/phone-formatter'
import { useToast } from '@/contexts/ToastContext'
// ⚡ 커스텀 훅 임포트 (Phase 2.1 성능 최적화)
import { useBusinessData } from './hooks/useBusinessData'
import { useFacilityStats } from './hooks/useFacilityStats'
import { useRevenueData } from './hooks/useRevenueData'
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime'
import { useIsMobile } from '@/hooks/useIsMobile'
// 📱 모바일 카드 뷰 컴포넌트
import BusinessCardList from './components/BusinessCardList'
import InvoiceTabSection, { type InvoiceTabSectionHandle } from '@/components/business/invoices/InvoiceTabSection'

interface Contact {
  name: string;
  position: string;
  phone: string;
  role: string;
}

interface FacilitySummary {
  discharge_count: number;
  prevention_count: number;
  total_facilities: number;
}

interface BusinessFacilityData {
  business: {
    id: string;
    business_name: string;
  } | null;
  discharge_facilities: Array<{
    id: string;
    outlet_number: number;
    outlet_name: string;
    facility_number: number;
    facility_name: string;
    capacity: string;
    quantity: number;
    display_name: string;
  }>;
  prevention_facilities: Array<{
    id: string;
    outlet_number: number;
    outlet_name: string;
    facility_number: number;
    facility_name: string;
    capacity: string;
    quantity: number;
    display_name: string;
  }>;
  summary: FacilitySummary;
}

interface UnifiedBusinessInfo {
  // Base fields from BusinessInfo
  id: string;
  created_at: string;
  updated_at: string;
  business_name: string;
  local_government: string | null;
  address: string | null;
  manager_name: string | null;
  manager_position: string | null;
  manager_contact: string | null;
  business_contact: string | null;
  fax_number: string | null;
  email: string | null;
  representative_name: string | null;
  business_registration_number: string | null;
  
  // 프로젝트 관리 필드들
  row_number?: number | null;
  department?: string | null;
  progress_status?: string | null;
  project_year?: number | null;
  revenue_source?: string | null; // 매출처 (블루온이 계산서를 발행하는 사업체)
  contract_document?: string | null;
  order_request_date?: string | null;
  receipt_date?: string | null;
  wireless_document?: string | null;
  installation_support?: string | null;
  order_manager?: string | null;
  order_date?: string | null;
  shipment_date?: string | null;
  inventory_check?: string | null;
  installation_date?: string | null;
  payment_scheduled_date?: string | null;
  installation_team?: string | null;
  business_type?: string | null;
  business_category?: string | null;
  pollutants?: string | null;
  annual_emission_amount?: number | null;
  first_report_date?: string | null;
  operation_start_date?: string | null;
  subsidy_approval_date?: string | null;
  contract_sent_date?: string | null;
  expansion_pack?: number | null;
  other_equipment?: string | null;
  additional_cost?: number | null;
  installation_extra_cost?: number | null;  // 추가설치비 (설치팀 요청 추가 비용)
  survey_fee_adjustment?: number | null;    // 실사비 조정 (기본 100,000원 기준 조정금액)
  negotiation?: string | null;
  multiple_stack_cost?: number | null;
  representative_birth_date?: string | null;

  // 계산서 및 입금 정보 - 보조금 사업장 (3개)
  invoice_1st_date?: string | null;
  invoice_1st_amount?: number | null;
  payment_1st_date?: string | null;
  payment_1st_amount?: number | null;

  invoice_2nd_date?: string | null;
  invoice_2nd_amount?: number | null;
  payment_2nd_date?: string | null;
  payment_2nd_amount?: number | null;

  invoice_additional_date?: string | null;
  payment_additional_date?: string | null;
  payment_additional_amount?: number | null;

  // 계산서 및 입금 정보 - 자비 사업장 (2개)
  invoice_advance_date?: string | null;
  invoice_advance_amount?: number | null;
  payment_advance_date?: string | null;
  payment_advance_amount?: number | null;

  invoice_balance_date?: string | null;
  invoice_balance_amount?: number | null;
  payment_balance_date?: string | null;
  payment_balance_amount?: number | null;

  // 실사 관리 필드
  estimate_survey_manager?: string | null;
  estimate_survey_date?: string | null;
  estimate_survey_start_time?: string | null;  // ✅ 시간 필드 추가
  estimate_survey_end_time?: string | null;    // ✅ 시간 필드 추가
  pre_construction_survey_manager?: string | null;
  pre_construction_survey_date?: string | null;
  pre_construction_survey_start_time?: string | null;  // ✅ 시간 필드 추가
  pre_construction_survey_end_time?: string | null;    // ✅ 시간 필드 추가
  completion_survey_manager?: string | null;
  completion_survey_date?: string | null;
  completion_survey_start_time?: string | null;  // ✅ 시간 필드 추가
  completion_survey_end_time?: string | null;    // ✅ 시간 필드 추가

  // 제출일 관리 (착공신고서, 그린링크 전송확인서, 부착완료통보서)
  construction_report_submitted_at?: string | null;
  greenlink_confirmation_submitted_at?: string | null;
  attachment_completion_submitted_at?: string | null;

  // 시스템 필드들
  manufacturer?: 'ecosense' | 'cleanearth' | 'gaia_cns' | 'evs' | null;
  vpn?: 'wired' | 'wireless' | null;
  greenlink_id?: string | null;
  greenlink_pw?: string | null;
  business_management_code?: number | null;
  
  // 센서/장비 수량 필드들
  ph_meter?: number | null;
  differential_pressure_meter?: number | null;
  temperature_meter?: number | null;
  discharge_current_meter?: number | null;
  fan_current_meter?: number | null;
  pump_current_meter?: number | null;
  gateway?: number | null; // @deprecated - Use gateway_1_2 and gateway_3_4 instead
  gateway_1_2?: number | null;
  gateway_3_4?: number | null;
  vpn_wired?: number | null;
  vpn_wireless?: number | null;
  explosion_proof_differential_pressure_meter_domestic?: number | null;
  explosion_proof_temperature_meter_domestic?: number | null;
  expansion_device?: number | null;
  relay_8ch?: number | null;
  relay_16ch?: number | null;
  main_board_replacement?: number | null;
  multiple_stack?: number | null;
  
  // 영업점
  sales_office?: string | null;
  
  // 시설 요약 정보
  facility_summary?: {
    outlets?: Array<{
      outlet: number;
      discharge_count: number;
      prevention_count: number;
      discharge_facilities: string[];
      prevention_facilities: string[];
    }>;
    totals?: {
      total_outlets: number;
      total_discharge: number;
      total_prevention: number;
    };
    last_updated?: string;
  } | null;
  
  additional_info?: Record<string, any>;
  is_active: boolean;
  is_deleted: boolean;
  
  // Korean display fields
  사업장명: string;
  주소: string;
  담당자명: string;
  담당자연락처: string;
  담당자직급: string;
  contacts?: Contact[];
  대표자: string;
  사업자등록번호: string;
  업종: string;
  사업장연락처: string;
  상태: string;
  현재단계?: string;
  PH센서?: number;
  차압계?: number;
  온도계?: number;
  배출전류계?: number;
  송풍전류계?: number;
  펌프전류계?: number;
  게이트웨이?: number; // @deprecated
  '게이트웨이(1,2)'?: number;
  '게이트웨이(3,4)'?: number;
  VPN유선?: number;
  VPN무선?: number;
  복수굴뚝?: number;
  방폭차압계국산?: number;
  방폭온도계국산?: number;
  확장디바이스?: number;
  중계기8채널?: number;
  중계기16채널?: number;
  메인보드교체?: number;
  등록일: string;
  수정일: string;
  지자체?: string;
  팩스번호?: string;
  이메일?: string;
  사업장관리코드?: number;
  그린링크ID?: string;
  그린링크PW?: string;
  영업점?: string;
  files?: any | null;
  hasFiles: boolean;
  fileCount: number;
}
// XLSX library will be dynamically imported when needed (Excel upload/download)
import AdminLayout from '@/components/ui/AdminLayout'
import { withAuth, usePermission } from '@/contexts/AuthContext'
import StatsCard from '@/components/ui/StatsCard'
import DataTable, { commonActions } from '@/components/ui/DataTable'
const ConfirmModal = lazy(() => import('@/components/ui/Modal').then(m => ({ default: m.ConfirmModal })))
import TaskProgressMiniBoard from '@/components/business/TaskProgressMiniBoard'
import { InvoiceDisplay } from '@/components/business/InvoiceDisplay'
import { InvoiceFormInput } from '@/components/business/InvoiceFormInput'
import {
  Users,
  FileText,
  Database,
  History,
  RefreshCw,
  Download,
  Upload,
  X,
  Plus,
  Building2,
  UserCheck,
  Clock,
  Eye,
  Edit,
  Trash2,
  MapPin,
  Phone,
  Mail,
  User,
  Calendar,
  Building,
  Briefcase,
  Contact,
  Shield,
  Hash,
  Factory,
  Filter,
  Settings,
  ClipboardList,
  AlertTriangle,
  Search,
  MessageSquarePlus,
  Edit3,
  MessageSquare,
  Save,
  Calculator,
  FileCheck,
  DollarSign,
  Wallet,
  Receipt,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Check
} from 'lucide-react'

// 대한민국 지자체 목록
const KOREAN_LOCAL_GOVERNMENTS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원도', '충청북도', '충청남도', '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
  '서울시 종로구', '서울시 중구', '서울시 용산구', '서울시 성동구', '서울시 광진구', '서울시 동대문구',
  '서울시 중랑구', '서울시 성북구', '서울시 강북구', '서울시 도봉구', '서울시 노원구', '서울시 은평구',
  '서울시 서대문구', '서울시 마포구', '서울시 양천구', '서울시 강서구', '서울시 구로구', '서울시 금천구',
  '서울시 영등포구', '서울시 동작구', '서울시 관악구', '서울시 서초구', '서울시 강남구', '서울시 송파구',
  '서울시 강동구', '부산시 중구', '부산시 서구', '부산시 동구', '부산시 영도구', '부산시 부산진구',
  '부산시 동래구', '부산시 남구', '부산시 북구', '부산시 해운대구', '부산시 사하구', '부산시 금정구',
  '부산시 강서구', '부산시 연제구', '부산시 수영구', '부산시 사상구', '대구시 중구', '대구시 동구',
  '대구시 서구', '대구시 남구', '대구시 북구', '대구시 수성구', '대구시 달서구', '대구시 달성군',
  '인천시 중구', '인천시 동구', '인천시 미추홀구', '인천시 연수구', '인천시 남동구', '인천시 부평구',
  '인천시 계양구', '인천시 서구', '인천시 강화군', '인천시 옹진군'
].sort()

// 진행구분을 보조금/자비로 매핑하는 헬퍼 함수
const mapCategoryToInvoiceType = (category: string | null | undefined): '보조금' | '자비' => {
  const normalized = category?.trim() || '';

  // 보조금 처리
  if (normalized === '보조금' || normalized === '보조금 동시진행' || normalized === '보조금 추가승인') {
    return '보조금';
  }

  // 자비 처리: 자비, 대리점, AS, 외주설치
  if (normalized === '자비' || normalized === '대리점' || normalized === 'AS' || normalized === '외주설치') {
    return '자비';
  }

  // 기본값: 자비
  return '자비';
};

function BusinessManagementPage() {
  // 권한 확인 훅
  const { canDeleteAutoMemos } = usePermission()
  const { user } = useAuth()
  const userPermission = user?.permission_level || 0
  const toast = useToast()

  // URL 파라미터 처리
  const searchParams = useSearchParams()
  const router = useRouter()

  // ⚡ 커스텀 훅 사용 (Phase 2.1 성능 최적화)
  const { allBusinesses, isLoading, error: businessDataError, refetch: refetchBusinesses, deleteBusiness } = useBusinessData()
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBusiness, setEditingBusiness] = useState<UnifiedBusinessInfo | null>(null)
  const [formData, setFormData] = useState<Partial<UnifiedBusinessInfo>>({})
  const invoiceTabRef = useRef<InvoiceTabSectionHandle>(null)
  const [localGovSuggestions, setLocalGovSuggestions] = useState<string[]>([])
  const [showLocalGovSuggestions, setShowLocalGovSuggestions] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState<UnifiedBusinessInfo | null>(null)
  const [facilityData, setFacilityData] = useState<BusinessFacilityData | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  const [duplicateCheck, setDuplicateCheck] = useState<{
    isDuplicate: boolean
    exactMatch: UnifiedBusinessInfo | null
    similarMatches: UnifiedBusinessInfo[]
    message: string
  } | null>(null)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [businessToDelete, setBusinessToDelete] = useState<UnifiedBusinessInfo | null>(null)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isRestoringPhotos, setIsRestoringPhotos] = useState(false)

  // 🔒 안전한 연속 삭제를 위한 상태 관리
  const [pendingDeletions, setPendingDeletions] = useState<Set<string>>(new Set())

  // ⚡ 시설 통계 관리 훅 (Phase 2.1 성능 최적화)
  const {
    facilityStats,
    facilityLoading,
    calculateFacilityStats,
    loadBusinessFacilityStats,
    loadBusinessFacilities,
    setFacilityStats
  } = useFacilityStats()
  const [facilityDeviceCounts, setFacilityDeviceCounts] = useState<{
    ph?: number, 
    pressure?: number, 
    temperature?: number, 
    discharge?: number, 
    fan?: number, 
    pump?: number, 
    gateway?: number,
    explosionProofPressure?: number,
    explosionProofTemp?: number,
    expansionDevice?: number,
    relay8ch?: number,
    relay16ch?: number,
    mainBoard?: number,
    vpnWired?: number,
    vpnWireless?: number,
    multipleStack?: number
  } | null>(null)

  // 매출 정보 state
  const [revenueData, setRevenueData] = useState<{
    total_revenue?: number;
    total_cost?: number;
    gross_profit?: number;
    net_profit?: number;
    profit_margin_percentage?: number;
    sales_commission?: number;
    commission_rate?: number; // 실제 적용된 수수료 비율
    survey_costs?: number; // 실사비용
  } | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(false)

  // ⚡ 매출 및 원가 데이터 관리 훅 (Phase 2.1 성능 최적화)
  const {
    salesOfficeCommissions,
    commissionsLoading,
    salesOfficeList,
    salesOfficeLoading,
    surveyCosts,
    surveyCostsLoading,
    manufacturerCosts,
    manufacturerCostsLoading
  } = useRevenueData()

  // 🗄️ 비즈니스 데이터 캐시 시스템
  const businessCacheRef = useRef<Map<string, {
    data: UnifiedBusinessInfo;
    timestamp: number;
    ttl: number; // Time To Live in milliseconds
  }>>(new Map())

  // 캐시 TTL 설정 (5분)
  const CACHE_TTL = 5 * 60 * 1000;

  // Revenue 모달 state
  const [showRevenueModal, setShowRevenueModal] = useState(false)
  const [selectedRevenueBusiness, setSelectedRevenueBusiness] = useState<UnifiedBusinessInfo | null>(null)

  // 복귀 경로 상태 (Revenue → Business, Tasks → Business 네비게이션 추적)
  const [returnPath, setReturnPath] = useState<string | null>(null)
  const [returnTaskId, setReturnTaskId] = useState<string | null>(null)

  // ⚡ 주의: 초기 데이터 병렬 로딩은 커스텀 훅으로 이동됨 (useRevenueData, useBusinessData)

  // 🔄 시설 데이터 실시간 업데이트 핸들러
  const handleFacilityUpdate = useCallback(async (businessName: string) => {
    try {
      console.log('🔄 [handleFacilityUpdate] 시설 데이터 업데이트 시작:', businessName);

      // API에서 최신 시설 데이터 가져오기
      // 🔥 배포 환경에서 Router Cache 무효화
      const timestamp = Date.now()
      const response = await fetch(`/api/facilities-supabase/${encodeURIComponent(businessName)}?_t=${timestamp}`);
      if (!response.ok) {
        throw new Error('Failed to fetch facility data');
      }

      const facilityApiData = await response.json();

      // facilityData 상태 업데이트
      const transformedData: BusinessFacilityData = {
        business: {
          id: facilityApiData.businessInfo?.businessName || businessName,
          business_name: businessName
        },
        discharge_facilities: (facilityApiData.facilities?.discharge || []).map((facility: any) => ({
          id: `discharge-${facility.outlet}-${facility.number}`,
          outlet_number: facility.outlet || 1,
          outlet_name: `배출구 ${facility.outlet || 1}`,
          facility_number: facility.number || 1,
          facility_name: facility.name || '배출시설',
          capacity: facility.capacity || '',
          quantity: facility.quantity || 1,
          display_name: facility.displayName || `배출구${facility.outlet}-배출시설${facility.number}`,
          // 측정기기 필드
          discharge_ct: facility.discharge_ct,
          exemption_reason: facility.exemption_reason,
          remarks: facility.remarks
        })),
        prevention_facilities: (facilityApiData.facilities?.prevention || []).map((facility: any) => ({
          id: `prevention-${facility.outlet}-${facility.number}`,
          outlet_number: facility.outlet || 1,
          outlet_name: `배출구 ${facility.outlet || 1}`,
          facility_number: facility.number || 1,
          facility_name: facility.name || '방지시설',
          capacity: facility.capacity || '',
          quantity: facility.quantity || 1,
          display_name: facility.displayName || `배출구${facility.outlet}-방지시설${facility.number}`,
          // 측정기기 필드
          ph_meter: facility.ph_meter,
          differential_pressure_meter: facility.differential_pressure_meter,
          temperature_meter: facility.temperature_meter,
          pump_ct: facility.pump_ct,
          fan_ct: facility.fan_ct,
          remarks: facility.remarks
        })),
        summary: {
          discharge_count: facilityApiData.dischargeCount || 0,
          prevention_count: facilityApiData.preventionCount || 0,
          total_facilities: (facilityApiData.dischargeCount || 0) + (facilityApiData.preventionCount || 0)
        }
      };

      setFacilityData(transformedData);
      console.log('✅ [handleFacilityUpdate] facilityData 업데이트 완료');

    } catch (error) {
      console.error('❌ [handleFacilityUpdate] 시설 데이터 업데이트 실패:', error);
    }
  }, []);
  // ⚡ 시설 통계 관련 함수들(calculateFacilityStats, loadBusinessFacilityStats, loadBusinessFacilities)은 useFacilityStats 훅으로 이동됨

  // 사업장 상세 시설 정보 조회 (추가 로직 포함)
  const loadBusinessFacilitiesWithDetails = useCallback(async (businessName: string) => {
    // 기본 시설 정보는 훅에서 로드
    await loadBusinessFacilities(businessName)

    // 추가 상세 정보 변환 로직
    try {
      const encodedBusinessName = encodeURIComponent(businessName)
      // 🔥 배포 환경에서 Router Cache 무효화
      const timestamp = Date.now()
      const response = await fetch(`/api/facilities-supabase/${encodedBusinessName}?_t=${timestamp}`)

      if (response.ok) {
        const result = await response.json()

        if (result.success && result.data && result.data.facilities) {
          // facilities-supabase API 데이터를 BusinessFacilityData 형식으로 변환
          const facilityApiData = result.data

          // ✅ 시설 데이터가 비어있는 경우에도 빈 배열로 변환
          const transformedData: BusinessFacilityData = {
            business: {
              id: facilityApiData.businessInfo?.businessName || businessName,
              business_name: businessName
            },
            discharge_facilities: (facilityApiData.facilities?.discharge || []).map((facility: any) => ({
              id: `discharge-${facility.outlet}-${facility.number}`,
              outlet_number: facility.outlet || 1,
              outlet_name: `배출구 ${facility.outlet || 1}`,
              facility_number: facility.number || 1,
              facility_name: facility.name || '배출시설',
              capacity: facility.capacity || '',
              quantity: facility.quantity || 1,
              display_name: facility.displayName || `배출구${facility.outlet}-배출시설${facility.number}`,
              // 측정기기 필드 추가
              discharge_ct: facility.discharge_ct,
              exemption_reason: facility.exemption_reason,
              remarks: facility.remarks
            })),
            prevention_facilities: (facilityApiData.facilities?.prevention || []).map((facility: any) => ({
              id: `prevention-${facility.outlet}-${facility.number}`,
              outlet_number: facility.outlet || 1,
              outlet_name: `배출구 ${facility.outlet || 1}`,
              facility_number: facility.number || 1,
              facility_name: facility.name || '방지시설',
              capacity: facility.capacity || '',
              quantity: facility.quantity || 1,
              display_name: facility.displayName || `배출구${facility.outlet}-방지시설${facility.number}`,
              // 측정기기 필드 추가
              ph_meter: facility.ph_meter,
              differential_pressure_meter: facility.differential_pressure_meter,
              temperature_meter: facility.temperature_meter,
              pump_ct: facility.pump_ct,
              fan_ct: facility.fan_ct,
              remarks: facility.remarks
            })),
            summary: {
              discharge_count: facilityApiData.dischargeCount || 0,
              prevention_count: facilityApiData.preventionCount || 0,
              total_facilities: (facilityApiData.dischargeCount || 0) + (facilityApiData.preventionCount || 0)
            }
          }

          setFacilityData(transformedData)
        } else {
          setFacilityData(null)
        }
      } else {
        setFacilityData(null)
      }
    } catch (error) {
      console.error('❌ 사업장 시설 정보 로드 실패:', error)
      setFacilityData(null)
    }
    // Note: facilityLoading is managed by the useFacilityStats hook
  }, [loadBusinessFacilities])

  // 환경부 고시가 (매출 단가)
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
  }

  // 제조사별 원가 (매입 단가) - 에코센스 기준
  const MANUFACTURER_COSTS: Record<string, number> = {
    'ph_meter': 250000,
    'differential_pressure_meter': 100000,
    'temperature_meter': 125000,
    'discharge_current_meter': 80000,
    'fan_current_meter': 80000,
    'pump_current_meter': 80000,
    'gateway': 1000000, // @deprecated
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
  }

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
  }

  const EQUIPMENT_FIELDS = [
    'ph_meter', 'differential_pressure_meter', 'temperature_meter',
    'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
    'gateway', 'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
    'explosion_proof_differential_pressure_meter_domestic',
    'explosion_proof_temperature_meter_domestic', 'expansion_device',
    'relay_8ch', 'relay_16ch', 'main_board_replacement', 'multiple_stack'
  ]

  // 사업장별 매출/매입/이익 자동 계산 함수 (매출관리 페이지와 동일)
  const calculateBusinessRevenue = useCallback((business: UnifiedBusinessInfo, commissions?: { [key: string]: number }) => {
    const commissionsToUse = commissions || salesOfficeCommissions
    let totalRevenue = 0
    let totalCost = 0
    let totalInstallation = 0

    // 각 기기별 매출/매입 계산
    console.log('🔍 [원가 계산] 제조사별 원가 상태:', manufacturerCosts)
    console.log('🔍 [원가 계산] 하드코딩 상수:', MANUFACTURER_COSTS)

    EQUIPMENT_FIELDS.forEach(field => {
      const quantity = (business as any)[field] || 0
      if (quantity > 0) {
        const unitRevenue = OFFICIAL_PRICES[field] || 0
        // 제조사별 원가: state에서 가져오고, 없으면 하드코딩 상수 사용
        const unitCost = manufacturerCosts[field] || MANUFACTURER_COSTS[field] || 0
        const unitInstallation = INSTALLATION_COSTS[field] || 0

        console.log(`🔍 [원가 계산] ${field}: 수량=${quantity}, 매출=${unitRevenue}, 원가=${unitCost}, 설치비=${unitInstallation}`)

        totalRevenue += unitRevenue * quantity
        totalCost += unitCost * quantity
        totalInstallation += unitInstallation * quantity
      }
    })

    // 추가공사비 및 협의사항 반영 (문자열을 숫자로 변환)
    const additionalCost = business.additional_cost
      ? (typeof business.additional_cost === 'string'
          ? parseInt(business.additional_cost.replace(/,/g, '')) || 0
          : business.additional_cost || 0)
      : 0
    const negotiation = business.negotiation
      ? (typeof business.negotiation === 'string'
          ? parseFloat(business.negotiation.replace(/,/g, '')) || 0
          : business.negotiation || 0)
      : 0

    // 최종 매출 = 기본 매출 + 추가공사비 - 협의사항
    const adjustedRevenue = totalRevenue + additionalCost - negotiation

    // 영업비용 - 영업점별 수수료 비율 적용
    const salesOffice = business.sales_office || business.영업점 || ''
    let commissionRate = 0
    let salesCommission = 0

    if (salesOffice && salesOffice.trim() !== '') {
      // 영업점 정보가 있는 경우
      console.log('📊 [수수료 계산] 사업장:', business.사업장명 || business.business_name)
      console.log('📊 [수수료 계산] 영업점:', salesOffice)
      console.log('📊 [수수료 계산] 로드된 수수료 정보:', commissionsToUse)

      if (commissionsToUse[salesOffice] !== undefined) {
        // 원가관리에 설정된 수수료율 사용
        commissionRate = commissionsToUse[salesOffice]
        console.log('📊 [수수료 계산] 설정된 수수료율 사용:', commissionRate + '%')
      } else {
        // 원가관리에 설정이 없으면 기본 10%
        commissionRate = 10.0
        console.log('📊 [수수료 계산] 기본 10% 적용 (원가관리 설정 없음)')
      }
      salesCommission = adjustedRevenue * (commissionRate / 100)
    } else {
      // 영업점 정보가 없으면 수수료 없음 (0%)
      commissionRate = 0
      salesCommission = 0
      console.log('📊 [수수료 계산] 영업점 미설정 - 수수료 0%')
    }

    // 실사비용 (state에서 가져오기)
    const totalSurveyCosts = surveyCosts.total

    // 총 이익 = 매출 - 매입 - 설치비 - 영업비용 - 실사비용
    const grossProfit = adjustedRevenue - totalCost
    const netProfit = grossProfit - salesCommission - totalSurveyCosts - totalInstallation

    // 이익률 계산
    const profitMarginPercentage = adjustedRevenue > 0
      ? ((netProfit / adjustedRevenue) * 100)
      : 0

    return {
      total_revenue: adjustedRevenue,
      total_cost: totalCost,
      gross_profit: grossProfit,
      net_profit: netProfit,
      profit_margin_percentage: profitMarginPercentage,
      sales_commission: salesCommission,
      commission_rate: commissionRate,
      survey_costs: totalSurveyCosts // 실사비용 추가
    }
  }, [salesOfficeCommissions, surveyCosts, manufacturerCosts])

  // 매출 정보 로드 함수 - 클라이언트 측 직접 계산으로 변경
  const loadRevenueData = useCallback(async (business: UnifiedBusinessInfo) => {
    setRevenueLoading(true)
    console.log('📊 매출 정보 계산 시작:', business.사업장명)

    try {
      // 수수료 정보 로드 (항상 최신 정보 사용)
      let currentCommissions = salesOfficeCommissions

      console.log('🔍 현재 수수료 정보 상태:', currentCommissions)

      // ❌ DEPRECATED: Direct Supabase PostgREST calls removed
      // Revenue Calculate API (/api/revenue/calculate) handles all calculations
      // if (Object.keys(currentCommissions).length === 0) {
      //   console.log('⚠️ 수수료 정보 미로드 - 지금 로드 시작')
      //   ...
      // }

      // 현재 수수료 정보를 사용해서 계산
      const salesOffice = business.sales_office || business.영업점 || ''
      console.log('💰 계산에 사용할 영업점:', salesOffice)
      console.log('💰 사용할 수수료 맵:', currentCommissions)

      const calculatedRevenue = calculateBusinessRevenue(business, currentCommissions)
      console.log('📊 계산된 매출 정보:', calculatedRevenue)
      setRevenueData(calculatedRevenue)
    } catch (error) {
      console.error('📊 매출 정보 계산 실패:', error)
      setRevenueData(null)
    } finally {
      setRevenueLoading(false)
    }
  }, [calculateBusinessRevenue, salesOfficeCommissions])

  // 대기필증 관련 상태
  const [airPermitData, setAirPermitData] = useState<{
    business_type: string
    category: string
    permits: Array<{
      id: string
      business_type: string
      additional_info?: {
        category?: string
      }
    }>
  } | null>(null)
  const [airPermitLoading, setAirPermitLoading] = useState(false)
  
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadMode, setUploadMode] = useState<'overwrite' | 'merge' | 'skip' | 'replaceAll'>('overwrite')
  const [uploadResults, setUploadResults] = useState<{
    total: number
    success: number
    failed: number
    errors: string[]
    created?: number
    updated?: number
    skipped?: number
    snapshotId?: string
    airPermitRestored?: number
    airPermitNotRestored?: string[]
  } | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  // 메모 관련 상태
  const [businessMemos, setBusinessMemos] = useState<BusinessMemo[]>([])

  // businessMemos state 변경 추적
  useEffect(() => {
    console.log('🔧 [FRONTEND] businessMemos state 변경됨:', businessMemos.length, '개', businessMemos)
  }, [businessMemos])
  const [isAddingMemo, setIsAddingMemo] = useState(false)
  const [editingMemo, setEditingMemo] = useState<BusinessMemo | null>(null)
  const [memoForm, setMemoForm] = useState({ title: '', content: '' })
  const [isLoadingMemos, setIsLoadingMemos] = useState(false)

  // 업무 관련 상태
  const [businessTasks, setBusinessTasks] = useState<any[]>([])

  // 사업장별 업무 상태 정보
  const [businessTaskStatuses, setBusinessTaskStatuses] = useState<{
    [businessName: string]: {
      statusText: string
      colorClass: string
      lastUpdated: string
      taskCount: number
      hasActiveTasks: boolean
    }
  }>({})
  const [isLoadingTasks, setIsLoadingTasks] = useState(false)

  // 📊 전체 업무 통계 (통계카드용)
  const [totalBusinessesWithTasks, setTotalBusinessesWithTasks] = useState(0)
  const [allTasksForFilter, setAllTasksForFilter] = useState<any[]>([])

  // 🔄 검색 로딩 상태 (검색시 현재 단계 로딩용)
  const [isSearchLoading, setIsSearchLoading] = useState(false)

  // 필터 상태 (다중 선택 지원)
  const [filterOffices, setFilterOffices] = useState<string[]>([])
  const [filterRegions, setFilterRegions] = useState<string[]>([])
  const [filterCategories, setFilterCategories] = useState<string[]>([])
  const [filterProjectYears, setFilterProjectYears] = useState<string[]>([])
  const [filterCurrentSteps, setFilterCurrentSteps] = useState<string[]>([])

  // 🔍 필터 상태 변경 감시 (디버깅용)
  useEffect(() => {
    console.log('🎛️ 필터 상태 변경:', {
      영업점: filterOffices,
      지역: filterRegions,
      진행구분: filterCategories,
      사업진행연도: filterProjectYears,
      현재단계: filterCurrentSteps
    })
  }, [filterOffices, filterRegions, filterCategories, filterProjectYears, filterCurrentSteps])

  // 모바일 필터 접기/펼치기 상태
  const isMobile = useIsMobile()
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false)

  // 상세 필터 상태 (제출일 + 설치완료)
  // null: 비활성, true: 있는 것만, false: 없는 것만
  const [submissionDateFilters, setSubmissionDateFilters] = useState<{
    order_date: boolean | null;
    construction_report: boolean | null;
    greenlink_confirmation: boolean | null;
    attachment_completion: boolean | null;
    installation_complete: boolean | null;
  }>({
    order_date: null,
    construction_report: null,
    greenlink_confirmation: null,
    attachment_completion: null,
    installation_complete: null
  })
  const [isSubmissionFilterExpanded, setIsSubmissionFilterExpanded] = useState<boolean>(false)

  // 제출일 필터 토글 함수 (null → true → false → null 순환)
  // null: 비활성, true: 있는 것만, false: 없는 것만
  const toggleSubmissionFilter = (filterKey: keyof typeof submissionDateFilters) => {
    setSubmissionDateFilters(prev => {
      const current = prev[filterKey]
      const next = current === null ? true : current === true ? false : null
      return { ...prev, [filterKey]: next }
    })
  }

  // 상세 필터 초기화 함수
  const clearSubmissionFilters = () => {
    setSubmissionDateFilters({
      order_date: null,
      construction_report: null,
      greenlink_confirmation: null,
      attachment_completion: null,
      installation_complete: null
    })
  }

  // 제출일 필터가 활성화되어 있는지 확인 (null이 아닌 값이 하나라도 있으면 활성)
  const hasActiveSubmissionFilter = Object.values(submissionDateFilters).some(v => v !== null)

  // 📱 무한 스크롤 상태 (모바일 전용)
  const [displayedBusinesses, setDisplayedBusinesses] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(20) // 초기 20개 표시
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const LOAD_MORE_COUNT = 20 // 한 번에 로드할 개수

  // 업무 상태 매핑 유틸리티 함수들
  const getStatusDisplayName = (status: string): string => {
    const statusMap: { [key: string]: string } = {
      // 확인필요 단계
      'self_needs_check': '확인필요',
      'subsidy_needs_check': '확인필요',
      'as_needs_check': '확인필요',
      'dealer_needs_check': '확인필요',
      'outsourcing_needs_check': '확인필요',
      'etc_needs_check': '확인필요',
      // 자비 공통 단계
      'self_customer_contact': '고객 상담',
      'self_site_inspection': '현장 실사',
      'self_quotation': '견적서 작성',
      'self_contract': '계약 체결',
      // 자비 전용 단계
      'self_deposit_confirm': '계약금 확인',
      'self_product_order': '제품 발주',
      'self_product_shipment': '제품 출고',
      'self_installation_schedule': '설치예정',
      'self_installation': '설치완료',
      'self_balance_payment': '잔금 입금',
      'self_document_complete': '서류 발송 완료',
      // 보조금 공통 단계
      'subsidy_customer_contact': '고객 상담',
      'subsidy_site_inspection': '현장 실사',
      'subsidy_quotation': '견적서 작성',
      'subsidy_contract': '계약 체결',
      // 보조금 전용 단계
      'subsidy_document_preparation': '신청서 작성 필요',
      'subsidy_application_submit': '신청서 제출',
      'subsidy_approval_pending': '보조금 승인대기',
      'subsidy_approved': '보조금 승인',
      'subsidy_rejected': '보조금 탈락',
      'subsidy_document_supplement': '신청서 보완',
      'subsidy_pre_construction_inspection': '착공 전 실사',
      'subsidy_pre_construction_supplement_1st': '착공 보완 1차',
      'subsidy_pre_construction_supplement_2nd': '착공 보완 2차',
      'subsidy_construction_report_submit': '착공신고서 제출',
      'subsidy_product_order': '제품 발주',
      'subsidy_product_shipment': '제품 출고',
      'subsidy_installation_schedule': '설치예정',
      'subsidy_installation': '설치완료',
      'subsidy_pre_completion_document_submit': '준공도서 작성 필요',
      'subsidy_completion_inspection': '준공 실사',
      'subsidy_completion_supplement_1st': '준공 보완 1차',
      'subsidy_completion_supplement_2nd': '준공 보완 2차',
      'subsidy_completion_supplement_3rd': '준공 보완 3차',
      'subsidy_final_document_submit': '보조금지급신청서 제출',
      'subsidy_payment': '보조금 입금',
      // AS 단계
      'as_customer_contact': 'AS 고객 상담',
      'as_site_inspection': 'AS 현장 확인',
      'as_quotation': 'AS 견적 작성',
      'as_contract': 'AS 계약 체결',
      'as_part_order': 'AS 부품 발주',
      'as_completed': 'AS 완료',
      // 대리점 단계
      'dealer_order_received': '발주 수신',
      'dealer_invoice_issued': '계산서 발행',
      'dealer_payment_confirmed': '입금 확인',
      'dealer_product_ordered': '제품 발주',
      // 외주설치 단계
      'outsourcing_order': '외주 발주',
      'outsourcing_schedule': '일정 조율',
      'outsourcing_in_progress': '설치 진행 중',
      'outsourcing_completed': '설치 완료',
      // 기타 단계
      'etc_status': '기타',
      // 레거시 호환성 (구버전 status - 유지)
      'customer_contact': '고객 상담',
      'site_inspection': '현장 실사',
      'quotation': '견적서 작성',
      'contract': '계약 체결',
      'deposit_confirm': '계약금 확인',
      'product_order': '제품 발주',
      'product_shipment': '제품 출고',
      'installation_schedule': '설치예정',
      'installation': '설치완료',
      'balance_payment': '잔금 입금',
      'document_complete': '서류 발송 완료',
      'document_preparation': '신청서 작성 필요',
      'application_submit': '신청서 제출',
      'approval_pending': '보조금 승인대기',
      'approved': '보조금 승인',
      'rejected': '보조금 탈락',
      'document_supplement': '신청서 보완',
      'pre_construction_inspection': '착공 전 실사',
      'pre_construction_supplement_1st': '착공 보완 1차',
      'pre_construction_supplement_2nd': '착공 보완 2차',
      'construction_report_submit': '착공신고서 제출',
      'pre_completion_document_submit': '준공도서 작성 필요',
      'completion_inspection': '준공 실사',
      'completion_supplement_1st': '준공 보완 1차',
      'completion_supplement_2nd': '준공 보완 2차',
      'completion_supplement_3rd': '준공 보완 3차',
      'final_document_submit': '보조금지급신청서 제출',
      'pending': '대기',
      'in_progress': '진행중',
      'completed': '완료',
      'cancelled': '취소',
      'on_hold': '보류'
    }
    return statusMap[status] || status
  }

  const getStatusColor = (status: string) => {
    // 확인필요 단계
    if (status.includes('needs_check')) {
      return { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-700', badge: 'bg-red-100' }
    }

    // 공통 단계 (prefix 포함)
    if (status.includes('customer_contact')) {
      return { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', badge: 'bg-blue-100' }
    }
    if (status.includes('site_inspection')) {
      return { bg: 'bg-cyan-50', border: 'border-cyan-400', text: 'text-cyan-700', badge: 'bg-cyan-100' }
    }
    if (status.includes('quotation')) {
      return { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700', badge: 'bg-amber-100' }
    }
    if (status.includes('contract')) {
      return { bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-700', badge: 'bg-purple-100' }
    }
    if (status.includes('installation') && !status.includes('schedule')) {
      return { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-700', badge: 'bg-orange-100' }
    }
    if (status.includes('completed') || status.includes('payment')) {
      return { bg: 'bg-green-50', border: 'border-green-400', text: 'text-green-700', badge: 'bg-green-100' }
    }

    // 기타 공통 상태
    switch (status) {
      case 'pending': return { bg: 'bg-gray-50', border: 'border-gray-400', text: 'text-gray-700', badge: 'bg-gray-100' }
      case 'in_progress': return { bg: 'bg-indigo-50', border: 'border-indigo-400', text: 'text-indigo-700', badge: 'bg-indigo-100' }
      case 'on_hold': return { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700', badge: 'bg-yellow-100' }
      case 'cancelled': return { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-700', badge: 'bg-red-100' }
      default: return { bg: 'bg-gray-50', border: 'border-gray-400', text: 'text-gray-700', badge: 'bg-gray-100' }
    }
  }

  // 메모와 업무를 통합해서 최신순으로 정렬하는 함수 (useCallback으로 최적화)
  const getIntegratedItems = useCallback(() => {
    console.log('🔧 [FRONTEND] getIntegratedItems 호출됨 - businessMemos:', businessMemos.length, '개, businessTasks:', businessTasks.length, '개')
    const items: Array<{
      type: 'memo' | 'task',
      id: string,
      title: string,
      content?: string,
      description?: string,
      created_at: string,
      status?: string,
      task_type?: string,
      assignee?: string,
      data: any
    }> = []

    // 메모 추가 (type: 'memo') - task_sync 메모는 제외 (실제 업무가 이미 표시되므로)
    businessMemos.forEach(memo => {
      // task_sync 메모는 건너뛰기 (중복 방지)
      if (memo.source_type === 'task_sync') {
        console.log('🔧 [FRONTEND] task_sync 메모 제외:', memo.title)
        return
      }

      items.push({
        type: 'memo',
        id: memo.id,
        title: memo.title,
        content: memo.content,
        created_at: memo.created_at,
        data: memo
      })
    })

    // 업무 추가 (type: 'task') - DB에 실제 등록된 업무만 표시
    console.log('🔍 [DEBUG] businessTasks 배열:', businessTasks)
    console.log('🔍 [DEBUG] businessTasks IDs:', businessTasks.map(t => ({ id: t.id, title: t.title })))
    console.log('🔍 [DEBUG] businessTasks unique IDs:', [...new Set(businessTasks.map(t => t.id))])

    // ✅ 중복 방지: 이미 추가된 task ID를 추적
    const addedTaskIds = new Set<string>()

    businessTasks.forEach(task => {
      // 이미 추가된 task ID는 건너뛰기 (중복 방지)
      if (addedTaskIds.has(task.id)) {
        console.warn('⚠️ [FRONTEND] 중복 업무 제외됨:', task.id, task.title)
        return
      }

      addedTaskIds.add(task.id)
      items.push({
        type: 'task',
        id: task.id,
        title: task.title,
        description: task.description,
        created_at: task.created_at,
        status: task.status,
        task_type: task.task_type,
        assignee: task.assignee,
        data: task
      })
    })

    console.log('🔧 [FRONTEND] 통합 아이템 수 - 메모:', items.filter(i => i.type === 'memo').length, '개, 업무:', items.filter(i => i.type === 'task').length, '개')
    console.log('🔍 [DEBUG] 최종 items 배열:', items.map(i => ({ type: i.type, id: i.id, title: i.title })))

    // 업무를 먼저, 그 다음 메모를 최신순으로 정렬
    return items.sort((a, b) => {
      // 타입이 다르면 업무(task)를 먼저
      if (a.type !== b.type) {
        if (a.type === 'task') return -1;
        if (b.type === 'task') return 1;
      }
      // 같은 타입 내에서는 최신순으로 정렬
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
  }, [businessMemos, businessTasks])

  // 엑셀 템플릿 다운로드 함수 (API 엔드포인트 사용)
  const downloadExcelTemplate = async () => {
    try {
      const response = await fetch('/api/download-excel-template');
      
      if (!response.ok) {
        throw new Error(`템플릿 다운로드 실패: ${response.status}`);
      }
      
      // 파일 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `사업장정보_업로드템플릿_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('✅ 엑셀 템플릿 다운로드 완료');
    } catch (error) {
      console.error('❌ 템플릿 다운로드 실패:', error);
      alert('템플릿 다운로드 중 오류가 발생했습니다.');
    }
  }
  
  // ⚡ 메모 관리 함수들 (useCallback 최적화)
  const loadBusinessMemos = useCallback(async (businessId: string) => {
    console.log('🔧 [FRONTEND] loadBusinessMemos 시작 - businessId:', businessId)
    setIsLoadingMemos(true)
    try {
      const url = `/api/business-memos?businessId=${businessId}`
      console.log('🔧 [FRONTEND] 메모 로드 요청 URL:', url)

      const response = await fetch(url)
      const result = await response.json()

      console.log('🔧 [FRONTEND] ===== API 응답 상세 디버깅 =====')
      console.log('🔧 [FRONTEND] 전체 응답:', JSON.stringify(result, null, 2))
      console.log('🔧 [FRONTEND] result.success:', result.success)
      console.log('🔧 [FRONTEND] result.data 타입:', typeof result.data)
      console.log('🔧 [FRONTEND] result.data는 배열?:', Array.isArray(result.data))
      console.log('🔧 [FRONTEND] result.data:', result.data)
      console.log('🔧 [FRONTEND] result.data.data:', result.data?.data)

      if (result.success) {
        // API 응답 구조 확인 후 올바른 데이터 추출
        let memos = []

        if (Array.isArray(result.data)) {
          console.log('🔧 [FRONTEND] Case 1: result.data가 배열')
          memos = result.data
        } else if (result.data?.data && Array.isArray(result.data.data)) {
          console.log('🔧 [FRONTEND] Case 2: result.data.data가 배열 (중첩 구조)')
          memos = result.data.data
        } else {
          console.warn('⚠️ [FRONTEND] 예상치 못한 응답 구조:', result)
          memos = []
        }

        console.log('🔧 [FRONTEND] 최종 추출된 메모:', memos.length, '개')
        console.log('🔧 [FRONTEND] 메모 상세:', memos.map((m: any) => ({ id: m.id, title: m.title, source_type: m.source_type })))
        setBusinessMemos(memos)
        console.log('🔧 [FRONTEND] setBusinessMemos 호출 완료')
      } else {
        console.error('❌ 메모 로드 실패:', result.error)
        setBusinessMemos([])
      }
    } catch (error) {
      console.error('❌ 메모 로드 오류:', error)
      setBusinessMemos([])
    } finally {
      setIsLoadingMemos(false)
    }
  }, [])

  // 📡 실시간 메모 업데이트 (Supabase Realtime)
  useSupabaseRealtime({
    tableName: 'business_memos',
    eventTypes: ['INSERT', 'UPDATE', 'DELETE'],
    autoConnect: true,
    onNotification: useCallback((payload) => {
      console.log('📡 [REALTIME-MEMO] 이벤트 수신:', {
        eventType: payload.eventType,
        table: payload.table,
        newBusinessId: payload.new?.business_id,
        oldBusinessId: payload.old?.business_id,
        selectedBusinessId: selectedBusiness?.id,
        timestamp: new Date().toISOString()
      })

      // 현재 사업장이 선택되지 않은 경우 무시
      if (!selectedBusiness?.id) {
        console.log('📡 [REALTIME-MEMO] 선택된 사업장 없음 - 이벤트 무시')
        return
      }

      // 이벤트와 관련된 business_id 추출
      const eventBusinessId = payload.new?.business_id || payload.old?.business_id

      if (!eventBusinessId) {
        console.warn('📡 [REALTIME-MEMO] business_id 없음 - 이벤트 무시')
        return
      }

      // 현재 선택된 사업장의 메모인 경우에만 처리
      if (eventBusinessId === selectedBusiness.id) {
        console.log(`✅ [REALTIME-MEMO] ${payload.eventType} 이벤트 처리`)

        // ✅ 개별 상태 업데이트로 변경 (레이스 컨디션 방지)
        if (payload.eventType === 'INSERT') {
          setBusinessMemos(prev => {
            // 중복 체크 (낙관적 업데이트로 이미 추가됐을 수 있음)
            const exists = prev.some(m => m.id === payload.new.id)
            if (exists) {
              console.log('📡 [REALTIME-MEMO] INSERT: 메모 이미 존재 - 서버 데이터로 업데이트')
              return prev.map(m => m.id === payload.new.id ? payload.new : m)
            }
            console.log('📡 [REALTIME-MEMO] INSERT: 새 메모 추가')
            return [payload.new, ...prev]
          })
        } else if (payload.eventType === 'UPDATE') {
          // is_deleted가 true로 변경된 경우 삭제 처리 (소프트 삭제)
          if (payload.new.is_deleted === true) {
            console.log('📡 [REALTIME-MEMO] UPDATE: 소프트 삭제 감지 - UI에서 제거')
            setBusinessMemos(prev =>
              prev.filter(m => m.id !== payload.new.id)
            )
          } else {
            console.log('📡 [REALTIME-MEMO] UPDATE: 메모 업데이트')
            setBusinessMemos(prev =>
              prev.map(m => m.id === payload.new.id ? payload.new : m)
            )
          }
        } else if (payload.eventType === 'DELETE') {
          console.log('📡 [REALTIME-MEMO] DELETE: 메모 삭제')
          setBusinessMemos(prev =>
            prev.filter(m => m.id !== payload.old.id)
          )
        }
      } else {
        console.log('📡 [REALTIME-MEMO] 다른 사업장의 메모 - 이벤트 무시')
      }
    }, [selectedBusiness]),
    onConnect: () => {
      console.log('✅ [REALTIME-MEMO] Supabase Realtime 연결 성공')
    },
    onDisconnect: () => {
      console.warn('⚠️ [REALTIME-MEMO] Supabase Realtime 연결 끊김')
    },
    onError: (error) => {
      console.error('❌ [REALTIME-MEMO] Supabase Realtime 오류:', error)
    }
  })

  // ⚡ 업무 조회 함수 (useCallback 최적화)
  const loadBusinessTasks = useCallback(async (businessName: string) => {
    setIsLoadingTasks(true)
    try {
      // 토큰을 포함한 인증 헤더 추가 - TokenManager 사용
      const { TokenManager } = await import('@/lib/api-client');
      const token = TokenManager.getToken();

      // 디버깅 로그 추가
      console.log('🔍 [FACILITY-TASKS-CLIENT] 토큰 상태:', {
        hasWindow: typeof window !== 'undefined',
        tokenExists: !!token,
        tokenLength: token?.length || 0,
        tokenPreview: token ? `${token.substring(0, 20)}...` : 'null',
        businessName
      });

      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('✅ [FACILITY-TASKS-CLIENT] Authorization 헤더 추가됨');
      } else {
        console.warn('⚠️ [FACILITY-TASKS-CLIENT] 토큰이 없어서 Authorization 헤더 없이 요청');
      }

      // 🔥 배포 환경에서 Router Cache 무효화
      const timestamp = Date.now()
      const response = await fetch(`/api/facility-tasks?businessName=${encodeURIComponent(businessName)}&_t=${timestamp}`, {
        headers
      });
      const result = await response.json()

      console.log('🔍 [DEBUG] API 응답:', result)
      console.log('🔍 [DEBUG] API tasks 배열:', result.data?.tasks)
      console.log('🔍 [DEBUG] API tasks IDs:', result.data?.tasks?.map(t => ({ id: t.id, title: t.title })))

      if (result.success) {
        const tasks = result.data?.tasks || []
        console.log('🔍 [DEBUG] setBusinessTasks 호출 전 tasks:', tasks)
        console.log('🔍 [DEBUG] tasks unique IDs:', [...new Set(tasks.map(t => t.id))])
        setBusinessTasks(tasks)
      } else {
        console.error('❌ 업무 로드 실패:', result.error)
        setBusinessTasks([])
      }
    } catch (error) {
      console.error('❌ 업무 로드 오류:', error)
      setBusinessTasks([])
    } finally {
      setIsLoadingTasks(false)
    }
  }, [])

  const handleAddMemo = async () => {
    if (!selectedBusiness || !memoForm.title?.trim() || !memoForm.content?.trim()) {
      alert('제목과 내용을 모두 입력해주세요.')
      return
    }

    try {
      const memoData: CreateBusinessMemoInput = {
        business_id: selectedBusiness.id,
        title: memoForm.title.trim(),
        content: memoForm.content.trim(),
        created_by: user?.name || user?.email || '알 수 없음'
      }

      console.log('🔧 [FRONTEND] 메모 전송 데이터:', {
        businessName: selectedBusiness.business_name,
        memoData,
        formData: memoForm
      })

      const response = await fetch('/api/business-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memoData)
      })

      const result = await response.json()

      console.log('🔧 [FRONTEND] API 응답:', result)

      if (result.success && result.data) {
        // API 응답 구조: {success: true, data: {data: {...실제메모...}, message: ...}}
        const newMemo = result.data.data || result.data
        console.log('🔧 [FRONTEND] 새 메모 추가 성공:', newMemo)
        console.log('🔧 [FRONTEND] 현재 businessMemos 개수:', businessMemos.length)

        // 즉시 UI에 새 메모 추가 (낙관적 업데이트)
        setBusinessMemos(prev => {
          console.log('🔧 [FRONTEND] setBusinessMemos 콜백 실행 - 이전 개수:', prev.length)
          const newMemos = [newMemo, ...prev]
          console.log('🔧 [FRONTEND] setBusinessMemos 콜백 - 새 개수:', newMemos.length)
          console.log('🔧 [FRONTEND] 추가된 메모:', newMemo)
          return newMemos
        })

        console.log('🔧 [FRONTEND] UI 상태 업데이트 완료 - 새 메모 추가됨')

        // 메모 폼 초기화
        setMemoForm({ title: '', content: '' })
        setIsAddingMemo(false)
      } else {
        console.error('🔧 [FRONTEND] 메모 추가 실패:', result.error)
        alert(`메모 추가 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('❌ 메모 추가 오류:', error)
      alert('메모 추가 중 오류가 발생했습니다.')
    }
  }

  const handleEditMemo = async () => {
    if (!editingMemo || !memoForm.title?.trim() || !memoForm.content?.trim()) {
      alert('제목과 내용을 모두 입력해주세요.')
      return
    }

    try {
      const updateData: UpdateBusinessMemoInput = {
        title: memoForm.title.trim(),
        content: memoForm.content.trim(),
        updated_by: user?.name || user?.email || '알 수 없음'
      }

      const response = await fetch(`/api/business-memos?id=${editingMemo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      const result = await response.json()

      if (result.success && result.data) {
        // API 응답 구조: {success: true, data: {data: {...실제메모...}, message: ...}}
        const updatedMemo = result.data.data || result.data
        console.log('🔧 [FRONTEND] 메모 수정 성공:', updatedMemo)

        // 즉시 UI에서 메모 업데이트 (낙관적 업데이트)
        setBusinessMemos(prev =>
          prev.map(memo => memo.id === editingMemo.id ? updatedMemo : memo)
        )

        console.log('🔧 [FRONTEND] UI 상태 업데이트 완료 - 메모 수정됨')

        // 메모 폼 초기화 및 입력창 닫기
        setMemoForm({ title: '', content: '' })
        setEditingMemo(null)
        setIsAddingMemo(false)
      } else {
        alert(`메모 수정 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('❌ 메모 수정 오류:', error)
      alert('메모 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDeleteMemo = async (memo: BusinessMemo) => {
    if (!memo.id) {
      toast.error('메모 삭제 불가', '메모 ID가 없어 삭제할 수 없습니다.')
      return
    }

    if (!confirm('정말로 이 메모를 삭제하시겠습니까?')) {
      return
    }

    // 삭제 중 상태 표시를 위한 임시 메모 업데이트
    setBusinessMemos(prev =>
      prev.map(m => m.id === memo.id ? { ...m, _deleting: true } : m)
    )

    try {
      console.log('🗑️ [MEMO-DELETE] 삭제 요청 시작:', {
        memoId: memo.id,
        businessId: selectedBusiness?.id
      })

      const response = await fetch(`/api/business-memos?id=${memo.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('🗑️ [MEMO-DELETE] API 응답:', result)

      if (result.success) {
        console.log('✅ [MEMO-DELETE] 삭제 성공 - UI에서 즉시 제거 (낙관적 업데이트)')

        // 낙관적 업데이트: 즉시 UI에서 제거 (INSERT와 동일한 패턴)
        setBusinessMemos(prev => prev.filter(m => m.id !== memo.id))

        // 삭제 성공 토스트 메시지 표시
        toast.success('메모 삭제 완료', '메모가 성공적으로 삭제되었습니다.')
        // Realtime DELETE 이벤트는 다른 디바이스 동기화용 (중복 제거는 filter로 자동 처리)
      } else {
        throw new Error(result.error || '삭제 실패')
      }
    } catch (error) {
      console.error('❌ [MEMO-DELETE] 삭제 오류:', error)

      // 에러 발생 시 삭제 중 상태 복원
      setBusinessMemos(prev =>
        prev.map(m => m.id === memo.id ? { ...m, _deleting: undefined } : m)
      )

      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      toast.error('메모 삭제 실패', errorMessage)
    }
  }

  const startEditMemo = (memo: BusinessMemo) => {
    if (!memo.id) {
      alert('메모 ID가 없어 수정할 수 없습니다.')
      return
    }
    setEditingMemo(memo)
    setMemoForm({ title: memo.title, content: memo.content })
    setIsAddingMemo(true) // 같은 폼을 재사용
  }

  const cancelMemoEdit = () => {
    setIsAddingMemo(false)
    setEditingMemo(null)
    setMemoForm({ title: '', content: '' })
  }
  
  // Stats calculation
  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const thisYearBusinesses = allBusinesses.filter(b => b.project_year === currentYear).length

    // 보조금: "보조금"만 포함
    const subsidyBusinesses = allBusinesses.filter(b => {
      const status = (b.progress_status || '').trim()
      return status === '보조금'
    }).length

    // 자비: "자비" + "보조금 동시진행" 포함
    const selfFundedBusinesses = allBusinesses.filter(b => {
      const status = (b.progress_status || '').trim()
      return status === '자비' || status === '보조금 동시진행'
    }).length

    return {
      thisYear: thisYearBusinesses,
      subsidy: subsidyBusinesses,
      selfFunded: selfFundedBusinesses,
      withTasks: totalBusinessesWithTasks // ✅ 전체 업무 통계 사용
    }
  }, [allBusinesses, totalBusinessesWithTasks])


  // ⚡ 기본 데이터 로딩 함수 - useBusinessData 훅의 refetch 사용 (Phase 2.1 성능 최적화)
  // 하위 호환성을 위해 기존 함수명 유지
  const loadAllBusinesses = refetchBusinesses

  // 🔍 검색 시 동적 상태 조회 (새로 추가된 기능)
  useEffect(() => {
    const handleSearchResults = async () => {
      if (searchQuery.trim() && filteredBusinesses.length > 0) {
        console.log('🔍 [SEARCH-STATUS] 검색 결과에 대한 상태 조회 시작:', filteredBusinesses.length, '개 사업장')

        // 현재 상태가 없는 사업장들만 필터링
        const businessesNeedingStatus = filteredBusinesses.filter(business => {
          const businessName = business.사업장명 || business.business_name || ''
          return businessName && !businessTaskStatuses[businessName]
        }).slice(0, 30) // 최대 30개까지만 조회

        if (businessesNeedingStatus.length > 0) {
          console.log('⚡ [SEARCH-STATUS] 상태 조회가 필요한 사업장:', businessesNeedingStatus.length, '개')

          setIsSearchLoading(true) // 검색 로딩 시작

          try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
            const businessNames = businessesNeedingStatus
              .map(business => business.사업장명 || business.business_name || '')
              .filter(name => name)

            // 개별 조회로 안전하게 처리 (배치 API 문제를 피하기 위해)
            for (const businessName of businessNames.slice(0, 10)) { // 처음 10개만
              try {
                console.log('📋 [SEARCH-STATUS] 개별 조회:', businessName)
                const status = await getBusinessTaskStatus(businessName, token)

                // 즉시 업데이트하여 사용자가 바로 볼 수 있도록
                setBusinessTaskStatuses(prev => ({
                  ...prev,
                  [businessName]: status
                }))

                // 100ms 딜레이로 서버 부하 방지
                await new Promise(resolve => setTimeout(resolve, 100))
              } catch (error) {
                console.warn(`검색 상태 조회 실패 (${businessName}):`, error)
                setBusinessTaskStatuses(prev => ({
                  ...prev,
                  [businessName]: {
                    statusText: '조회 실패',
                    colorClass: 'bg-gray-100 text-gray-600',
                    lastUpdated: '',
                    taskCount: 0,
                    hasActiveTasks: false
                  }
                }))
              }
            }

            console.log('✅ [SEARCH-STATUS] 검색 상태 조회 완료')

          } catch (error) {
            console.error('검색 상태 조회 오류:', error)
          } finally {
            setIsSearchLoading(false) // 검색 로딩 완료
          }
        } else {
          console.log('ℹ️ [SEARCH-STATUS] 모든 검색 결과의 상태가 이미 로드됨')
        }
      }
    }

    // 검색어가 있을 때만 실행하고, 300ms 디바운스 적용
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearchResults()
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery]) // 검색어 변경 시에만 실행

  // 콤마 기반 다중 검색 키워드 파싱
  const searchTerms = useMemo(() => {
    if (!searchQuery.trim()) return []
    return searchQuery
      .split(',')
      .map(term => term.trim())
      .filter(term => term.length > 0)
  }, [searchQuery])

  // 전체 업무 데이터를 기반으로 사업장별 현재 단계 계산 (업무관리에서 사용하는 로직과 동일)
  const calculateBusinessCurrentSteps = useMemo(() => {
    const statusMap: Record<string, string> = {}

    // task-status-utils.ts의 한글 매핑 사용
    const statusLabels: Record<string, string> = {
      customer_contact: '고객 상담',
      site_inspection: '현장 실사',
      quotation: '견적서 작성',
      contract: '계약 체결',
      deposit_confirm: '계약금 확인',
      product_order: '제품 발주',
      product_shipment: '제품 출고',
      installation_schedule: '설치 협의',
      installation: '제품 설치',
      balance_payment: '잔금 입금',
      document_complete: '서류 발송 완료',
      application_submit: '신청서 제출',
      document_supplement: '서류 보완',
      pre_construction_inspection: '착공 전 실사',
      pre_construction_supplement: '착공 보완',
      pre_construction_supplement_1st: '착공 보완 1차',
      pre_construction_supplement_2nd: '착공 보완 2차',
      pre_construction_supplement_3rd: '착공 보완 3차',
      completion_inspection: '준공 실사',
      completion_supplement: '준공 보완',
      completion_supplement_1st: '완공 보완 1차',
      completion_supplement_2nd: '완공 보완 2차',
      completion_supplement_3rd: '완공 보완 3차',
      final_document_submit: '서류 제출',
      subsidy_payment: '보조금 입금',
      etc_status: '기타',

      // 보조금 관련 추가 상태
      subsidy_site_inspection: '보조금 현장 실사',
      subsidy_rejected: '보조금 반려',
      subsidy_product_order: '보조금 제품 발주',
      subsidy_pre_completion_document_submit: '보조금 사전 서류 제출',
      subsidy_needs_check: '보조금 확인 필요',
      subsidy_installation_schedule: '보조금 설치 협의',
      subsidy_final_document_submit: '보조금 최종 서류 제출',
      subsidy_document_preparation: '보조금 서류 준비',
      subsidy_completion_supplement_2nd: '보조금 준공 보완 2차',
      subsidy_completion_supplement_1st: '보조금 준공 보완 1차',
      subsidy_approval_pending: '보조금 승인 대기',

      // 자비 관련 추가 상태
      self_quotation: '자비 견적서 작성',
      self_needs_check: '자비 확인 필요',
      self_installation_schedule: '자비 설치 협의',
      self_document_complete: '자비 서류 발송 완료',

      // 외주 관련 추가 상태
      outsourcing_needs_check: '외주 확인 필요',

      // 대리점 관련 추가 상태
      dealer_product_ordered: '대리점 제품 발주',
      dealer_needs_check: '대리점 확인 필요'
    }

    // 사업장별로 업무 그룹화
    const businessTasksMap: Record<string, any[]> = {}
    allTasksForFilter.forEach(task => {
      const businessName = task.business_name
      if (!businessTasksMap[businessName]) {
        businessTasksMap[businessName] = []
      }
      businessTasksMap[businessName].push(task)
    })

    // 각 사업장의 현재 단계 계산
    Object.entries(businessTasksMap).forEach(([businessName, tasks]) => {
      const activeTasks = tasks.filter(task => !task.completed_at)

      if (activeTasks.length === 0) {
        const completedTasks = tasks.filter(task => task.completed_at)
        statusMap[businessName] = completedTasks.length > 0 ? '업무 완료' : '업무 미등록'
      } else {
        // 우선순위별 정렬
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        const sortedTasks = activeTasks.sort((a, b) => {
          const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
          if (priorityDiff !== 0) return priorityDiff
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })

        const topTask = sortedTasks[0]
        const statusLabel = statusLabels[topTask.status] || topTask.status
        statusMap[businessName] = activeTasks.length === 1 ? statusLabel : `${statusLabel} 외 ${activeTasks.length - 1}건`
      }
    })

    console.log(`📊 [CURRENT-STEP-CALC] ${Object.keys(statusMap).length}개 사업장의 현재 단계 계산 완료`)
    return statusMap
  }, [allTasksForFilter])

  // 검색 필터링 (useMemo 사용으로 자동 필터링)
  const filteredBusinesses = useMemo(() => {
    console.log('🔍 useMemo 필터링 실행:', searchTerms, 'allBusinesses 수:', allBusinesses.length)

    let filtered = allBusinesses

    // 드롭다운 필터 적용 (다중 선택)
    if (filterOffices.length > 0) {
      console.log('🏢 영업점 필터 적용:', filterOffices)
      filtered = filtered.filter(b => {
        const office = b.영업점 || b.sales_office || ''
        return filterOffices.includes(office)
      })
      console.log('🏢 영업점 필터 후:', filtered.length, '개')
    }
    if (filterRegions.length > 0) {
      console.log('🗺️ 지역 필터 적용:', filterRegions)
      filtered = filtered.filter(b => {
        const address = b.주소 || b.address || ''
        return filterRegions.some(region => address.includes(region))
      })
      console.log('🗺️ 지역 필터 후:', filtered.length, '개')
    }
    if (filterCategories.length > 0) {
      console.log('📂 진행구분 필터 적용:', filterCategories)
      const before = filtered.length
      filtered = filtered.filter(b => {
        const value = (b as any).진행상태 || b.progress_status || ''
        const trimmedValue = String(value).trim()
        const matches = filterCategories.includes(trimmedValue)
        if (!matches && before < 5) {
          console.log('  ❌ 불일치:', { 진행상태: (b as any).진행상태, progress_status: b.progress_status, trimmedValue, filterCategories })
        }
        return matches
      })
      console.log('📂 진행구분 필터 후:', filtered.length, '개')
    }
    if (filterProjectYears.length > 0) {
      console.log('📅 사업진행연도 필터 적용:', filterProjectYears)
      const before = filtered.length
      filtered = filtered.filter(b => {
        const year = (b as any).사업진행연도 || b.project_year
        const yearWithSuffix = `${year}년`
        const matches = filterProjectYears.includes(yearWithSuffix)
        if (!matches && before < 5) {
          console.log('  ❌ 불일치:', { 사업진행연도: (b as any).사업진행연도, project_year: b.project_year, year, yearWithSuffix, filterProjectYears })
        }
        return matches
      })
      console.log('📅 사업진행연도 필터 후:', filtered.length, '개')
    }
    if (filterCurrentSteps.length > 0) {
      console.log('📊 현재단계 필터 적용:', filterCurrentSteps)
      filtered = filtered.filter(b => {
        const businessName = b.사업장명 || b.business_name || ''
        const currentStep = calculateBusinessCurrentSteps[businessName]
        return currentStep && filterCurrentSteps.includes(currentStep.trim())
      })
      console.log('📊 현재단계 필터 후:', filtered.length, '개')
    }

    // 상세 필터 적용 (제출일 + 설치완료)
    if (hasActiveSubmissionFilter) {
      filtered = filtered.filter(b => {
        // 하나라도 활성화된 필터가 있으면, 해당 필터 조건을 만족해야 함
        let matchesFilter = true

        if (submissionDateFilters.order_date === true) {
          matchesFilter = matchesFilter && !!b.order_date
        } else if (submissionDateFilters.order_date === false) {
          matchesFilter = matchesFilter && !b.order_date
        }
        if (submissionDateFilters.construction_report === true) {
          matchesFilter = matchesFilter && !!b.construction_report_submitted_at
        } else if (submissionDateFilters.construction_report === false) {
          matchesFilter = matchesFilter && !b.construction_report_submitted_at
        }
        if (submissionDateFilters.greenlink_confirmation === true) {
          matchesFilter = matchesFilter && !!b.greenlink_confirmation_submitted_at
        } else if (submissionDateFilters.greenlink_confirmation === false) {
          matchesFilter = matchesFilter && !b.greenlink_confirmation_submitted_at
        }
        if (submissionDateFilters.attachment_completion === true) {
          matchesFilter = matchesFilter && !!b.attachment_completion_submitted_at
        } else if (submissionDateFilters.attachment_completion === false) {
          matchesFilter = matchesFilter && !b.attachment_completion_submitted_at
        }
        if (submissionDateFilters.installation_complete === true) {
          matchesFilter = matchesFilter && !!b.installation_date
        } else if (submissionDateFilters.installation_complete === false) {
          matchesFilter = matchesFilter && !b.installation_date
        }

        return matchesFilter
      })
    }

    // 검색어가 없으면 필터링된 결과를 정렬해서 반환
    if (searchTerms.length === 0) {
      console.log('📋 검색어 없음 - 필터링된 목록 표시 (최근 수정순):', filtered.length)
      return [...filtered].sort((a, b) => {
        const dateA = new Date(a.수정일 || a.updated_at || a.생성일 || a.created_at || 0)
        const dateB = new Date(b.수정일 || b.updated_at || b.생성일 || b.created_at || 0)
        return dateB.getTime() - dateA.getTime() // 내림차순 (최신이 위로)
      })
    }

    // 검색어 필터링
    filtered = filtered.filter(business => {
      // 모든 검색 가능한 필드들을 하나의 문자열로 결합
      const searchableText = [
        // 기본 정보
        business.사업장명 || business.business_name || '',
        business.주소 || business.address || business.local_government || '',
        business.담당자명 || business.manager_name || '',
        business.담당자연락처 || business.manager_contact || business.business_contact || '',
        business.업종 || business.business_type || '',
        (business as any).사업장분류 || business.business_category || '',

        // 프로젝트 관리 정보
        (business as any).진행상태 || business.progress_status || '',
        (business as any).발주담당자 || business.order_manager || '',
        (business as any).설치팀 || business.installation_team || '',
        (business as any).계약서류 || business.contract_document || '',
        (business as any).부무선서류 || business.wireless_document || '',
        (business as any).설치지원 || business.installation_support || '',

        // 시설 정보
        (business as any).오염물질 || business.pollutants || '',
        (business as any).기타장비 || business.other_equipment || '',
        (business as any).협의사항 || business.negotiation || '',

        // 시스템 정보
        (business as any).제조사 || business.manufacturer || '',
        (business as any).vpn방식 || business.vpn || '',
        (business as any).그린링크아이디 || business.greenlink_id || '',

        // 대표자 정보
        (business as any).대표자명 || business.representative_name || '',
        business.사업자등록번호 || business.business_registration_number || '',
        business.팩스번호 || business.fax_number || '',
        business.이메일 || business.email || ''
      ].join(' ').toLowerCase()

      // 모든 검색어가 포함되어야 함 (AND 조건)
      return searchTerms.every(term =>
        searchableText.includes(term.toLowerCase())
      )
    })

    console.log('🎯 필터링 결과:', filtered.length, '개 사업장 (검색어:', searchTerms.length, '개)')
    return filtered
  }, [searchTerms, allBusinesses, filterOffices, filterRegions, filterCategories, filterProjectYears, filterCurrentSteps, calculateBusinessCurrentSteps, submissionDateFilters, hasActiveSubmissionFilter])

  // 필터 옵션 추출
  const filterOptions = useMemo(() => {
    const offices = [...new Set(allBusinesses.map(b => b.영업점 || b.sales_office).filter(Boolean))] as string[]
    const regions = [...new Set(
      allBusinesses.map(b => {
        const address = b.주소 || b.address || ''
        if (!address) return ''
        const parts = address.split(' ')
        return parts.slice(0, 2).join(' ')
      }).filter(Boolean)
    )] as string[]
    const categories = [...new Set(
      allBusinesses.map(b => {
        const value = (b as any).진행상태 || b.progress_status
        return value ? String(value).trim() : null
      }).filter(Boolean)
    )] as string[]
    const years = [...new Set(
      allBusinesses.map(b => (b as any).사업진행연도 || b.project_year).filter(Boolean)
    )] as number[]
    // calculateBusinessCurrentSteps에서 현재 단계 추출 (업무가 등록된 사업장만)
    const currentSteps = [...new Set(
      Object.values(calculateBusinessCurrentSteps)
        .map(status => status.trim())
        .filter(Boolean)
    )] as string[]

    console.log('🎛️ 필터 옵션 생성:', {
      offices: offices.length,
      regions: regions.length,
      categories,
      years,
      currentSteps: currentSteps.length
    })

    return {
      offices: offices.sort(),
      regions: regions.sort(),
      categories,
      years: years.sort((a, b) => b - a), // 최신 연도부터
      currentSteps: currentSteps.sort()
    }
  }, [allBusinesses, calculateBusinessCurrentSteps])

  // 검색어 하이라이팅 함수
  const highlightSearchTerm = useCallback((text: string, searchTerm: string) => {
    if (!searchTerm || !text) return text

    // 정규표현식 특수 문자 escape 처리
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi')
    const parts = text.split(regex)

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">
          {part}
        </mark>
      ) : part
    )
  }, [])


  // 대기필증 데이터 로딩 함수
  const loadAirPermitData = useCallback(async (businessId: string) => {
    try {
      setAirPermitLoading(true)
      // 🔥 배포 환경에서 Router Cache 무효화
      const timestamp = Date.now()
      const response = await fetch(`/api/air-permit?businessId=${businessId}&_t=${timestamp}`)
      
      if (!response.ok) {
        // 404는 정상적인 경우 (대기필증이 없는 사업장)
        if (response.status === 404) {
          setAirPermitData(null)
          return
        }
        throw new Error('대기필증 데이터 로딩 실패')
      }

      const result = await response.json()
      if (result.data && result.data.length > 0) {
        // 첫 번째 대기필증의 업종과 종별 정보를 사용
        const firstPermit = result.data[0]
        setAirPermitData({
          business_type: firstPermit.business_type || '',
          category: firstPermit.additional_info?.category || '',
          permits: result.data
        })
      } else {
        setAirPermitData(null)
      }
    } catch (error) {
      console.error('대기필증 데이터 로딩 오류:', error)
      setAirPermitData(null)
    } finally {
      setAirPermitLoading(false)
    }
  }, [])

  // 대기필증 데이터 업데이트 함수 (양방향 동기화)
  const syncAirPermitData = useCallback(async (businessId: string, updatedBusinessType: string, updatedCategory: string) => {
    if (!airPermitData || airPermitData.permits.length === 0) return

    try {
      // 각 대기필증을 업데이트
      for (const permit of airPermitData.permits) {
        const updateData = {
          id: permit.id,
          business_type: updatedBusinessType,
          additional_info: {
            ...permit.additional_info,
            category: updatedCategory
          }
        }

        // 🔥 배포 환경에서 Router Cache 무효화
        const timestamp = Date.now()
        const response = await fetch(`/api/air-permit?_t=${timestamp}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        })

        if (!response.ok) {
          console.error(`대기필증 ${permit.id} 업데이트 실패`)
        }
      }

      // 로컬 상태 업데이트
      setAirPermitData(prev => prev ? {
        ...prev,
        business_type: updatedBusinessType,
        category: updatedCategory
      } : null)
      
    } catch (error) {
      console.error('대기필증 동기화 오류:', error)
    }
  }, [airPermitData])

  // 🚀 페이지별 지연 로딩: 현재 페이지 사업장들의 현재 단계만 로딩
  const loadCurrentPageTaskStatuses = useCallback(async (pageBusinesses: UnifiedBusinessInfo[]) => {
    if (pageBusinesses.length === 0) return

    console.log(`🎯 [PAGE-LOADING] 페이지별 현재 단계 로딩: ${pageBusinesses.length}개 사업장`)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

      const businessNames = pageBusinesses
        .map(business => business.사업장명 || business.business_name || '')
        .filter(name => name)

      // 이미 캐시된 사업장들 제외
      const uncachedBusinesses = businessNames.filter(name =>
        !businessTaskStatuses[name] || businessTaskStatuses[name].statusText === '로딩 중...'
      )

      if (uncachedBusinesses.length === 0) {
        console.log('✅ [PAGE-LOADING] 모든 사업장이 이미 캐시됨')
        return
      }

      console.log(`📊 [PAGE-LOADING] 캐시되지 않은 ${uncachedBusinesses.length}개 사업장 로딩`)

      // 로딩 상태 표시
      setBusinessTaskStatuses(prev => {
        const newState = { ...prev }
        uncachedBusinesses.forEach(businessName => {
          newState[businessName] = {
            statusText: '로딩 중...',
            colorClass: 'bg-gray-100 text-gray-500 animate-pulse',
            lastUpdated: '',
            taskCount: 0,
            hasActiveTasks: false
          }
        })
        return newState
      })

      const batchResults = await getBatchBusinessTaskStatuses(uncachedBusinesses, token)

      // 결과 업데이트 (기존 캐시 유지)
      setBusinessTaskStatuses(prev => {
        const newState = { ...prev }
        uncachedBusinesses.forEach(businessName => {
          if (batchResults[businessName]) {
            newState[businessName] = batchResults[businessName]
          } else {
            newState[businessName] = {
              statusText: '업무 미등록',
              colorClass: 'bg-gray-100 text-gray-600',
              lastUpdated: '',
              taskCount: 0,
              hasActiveTasks: false
            }
          }
        })
        return newState
      })

      console.log(`✅ [PAGE-LOADING] 완료: ${uncachedBusinesses.length}개 사업장`)

    } catch (error) {
      console.error('❌ [PAGE-LOADING] 페이지별 업무 상태 로딩 오류:', error)

      // 오류 발생시 오류 상태로 설정
      setBusinessTaskStatuses(prev => {
        const newState = { ...prev }
        pageBusinesses.forEach(business => {
          const businessName = business.사업장명 || business.business_name || ''
          if (businessName) {
            newState[businessName] = {
              statusText: '조회 실패',
              colorClass: 'bg-gray-100 text-gray-600',
              lastUpdated: '',
              taskCount: 0,
              hasActiveTasks: false
            }
          }
        })
        return newState
      })
    }
  }, []) // 의존성 배열 제거 - setBusinessTaskStatuses는 함수형 업데이트(prev =>)를 사용하므로 안전

  // 📊 전체 업무 통계 로딩 (통계카드용 + 현재 단계 필터용)
  const loadTaskStatistics = useCallback(async () => {
    try {
      console.log('📊 [TASK-STATS] 전체 업무 통계 로딩 시작')

      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch('/api/facility-tasks', {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        console.warn('⚠️ [TASK-STATS] API 응답 오류:', response.status)
        return
      }

      const result = await response.json()

      if (result.success && result.data?.tasks) {
        const activeTasks = result.data.tasks.filter((task: any) => task.is_active && !task.is_deleted)

        // 활성 상태이고 삭제되지 않은 업무의 고유 사업장명 추출
        const uniqueBusinessNames = new Set(
          activeTasks
            .map((task: any) => task.business_name)
            .filter((name: string) => name) // 빈 값 제외
        )

        setTotalBusinessesWithTasks(uniqueBusinessNames.size)
        setAllTasksForFilter(activeTasks) // 필터용 전체 업무 데이터 저장
        console.log(`✅ [TASK-STATS] 업무 진행 사업장: ${uniqueBusinessNames.size}개, 총 업무: ${activeTasks.length}개`)
      }
    } catch (error) {
      console.error('❌ [TASK-STATS] 업무 통계 로딩 실패:', error)
    }
  }, [])

  // 초기 데이터 로딩 - 의존성 제거하여 무한루프 방지
  useEffect(() => {
    loadAllBusinesses()
    loadTaskStatistics() // 전체 업무 통계도 함께 로딩
  }, [])

  // 🎯 초기 로딩: 첫 페이지(8개)만 현재 단계 로딩
  useEffect(() => {
    if (allBusinesses.length > 0) {
      console.log(`🚀 [INITIAL-LOAD] 첫 페이지 로딩 시작: 총 ${allBusinesses.length}개 중 8개`)
      const firstPage = allBusinesses.slice(0, 8)
      loadCurrentPageTaskStatuses(firstPage)
    }
  }, [allBusinesses.length]) // loadCurrentPageTaskStatuses 의존성 제거로 무한 루프 방지

  // 🎯 페이지 변경 핸들러: 새 페이지 사업장들의 현재 단계 로딩
  const handlePageChange = useCallback((page: number, pageData: UnifiedBusinessInfo[]) => {
    console.log(`📄 [PAGE-CHANGE] ${page}페이지로 이동, ${pageData.length}개 사업장`)
    loadCurrentPageTaskStatuses(pageData)
  }, []) // 의존성 제거로 무한 루프 방지

  // 🔍 검색시 핸들러: 검색 결과의 현재 단계 로딩
  const handleSearchChange = useCallback((searchResults: UnifiedBusinessInfo[]) => {
    if (searchResults.length > 0) {
      console.log(`🔍 [SEARCH] 검색 결과 ${searchResults.length}개 사업장의 현재 단계 로딩`)
      loadCurrentPageTaskStatuses(searchResults.slice(0, 8)) // 첫 페이지만 로딩
    }
  }, []) // 의존성 제거로 무한 루프 방지

  // 🔍 검색 쿼리 변경 감지: 검색 결과의 첫 페이지 현재 단계 로딩
  useEffect(() => {
    if (searchQuery && filteredBusinesses.length > 0) {
      console.log(`🔍 [SEARCH-TRIGGER] 검색어 변경: "${searchQuery}", 결과 ${filteredBusinesses.length}개`)
      const firstPageOfResults = filteredBusinesses.slice(0, 8)
      loadCurrentPageTaskStatuses(firstPageOfResults)
    }
  }, [searchQuery, filteredBusinesses.length]) // loadCurrentPageTaskStatuses 의존성 제거로 무한 루프 방지

  // ✅ 페이지별 지연 로딩 구현 완료 - 백그라운드 로딩 제거됨

  // selectedBusiness 동기화를 위한 별도 useEffect (완전 최적화)
  useEffect(() => {
    if (selectedBusiness && allBusinesses.length > 0) {
      const updatedSelected = allBusinesses.find(b => b.id === selectedBusiness.id)
      if (updatedSelected && updatedSelected.수정일 !== selectedBusiness.수정일) {
        console.log('🔄 selectedBusiness 동기화:', updatedSelected.사업장명, '담당자:', updatedSelected.담당자명)
        setSelectedBusiness(updatedSelected)
      }
    }
  }, [allBusinesses.length, selectedBusiness?.id]) // length 변화만 감지

  // URL 파라미터 처리 - 알림에서 사업장으로 직접 이동
  useEffect(() => {
    const businessParam = searchParams?.get('business')
    const focusParam = searchParams?.get('focus')

    if (businessParam && allBusinesses.length > 0 && !selectedBusiness) {
      console.log('🔍 [URL-PARAMS] 사업장 검색:', businessParam, 'focus:', focusParam)

      // URL에서 받은 사업장명으로 검색 (URL 디코딩)
      const targetBusinessName = decodeURIComponent(businessParam)
      const foundBusiness = allBusinesses.find(b =>
        b.사업장명 === targetBusinessName || b.business_name === targetBusinessName
      )

      if (foundBusiness) {
        console.log('✅ [URL-PARAMS] 사업장 발견, 상세 모달 열기:', foundBusiness.사업장명)

        // 사업장 선택 및 상세 모달 열기
        setSelectedBusiness(foundBusiness)
        setIsDetailModalOpen(true)

        // focus=tasks인 경우 업무 탭으로 자동 이동 (추가 구현 필요시)
        if (focusParam === 'tasks') {
          console.log('🎯 [URL-PARAMS] 업무 탭에 포커스')
          // TODO: 업무 탭 활성화 로직 추가 (탭 상태 관리가 있는 경우)
        }
      } else {
        console.warn('⚠️ [URL-PARAMS] 사업장을 찾을 수 없음:', targetBusinessName)

        // 사업장을 찾을 수 없으면 검색어로 설정
        setSearchQuery(targetBusinessName)
      }
    }
  }, [allBusinesses.length, searchParams, selectedBusiness])

  // ⚡ URL 파라미터로 자동 모달 열기 (최적화: useLayoutEffect로 즉시 실행)
  useLayoutEffect(() => {
    const openModalId = searchParams?.get('openModal')
    const returnTo = searchParams?.get('returnTo')
    const taskId = searchParams?.get('taskId')

    // 조건 체크
    if (!openModalId || allBusinesses.length === 0) {
      return
    }

    // 해당 business 찾기 (openModal 파라미터가 businessId)
    const targetBusiness = allBusinesses.find(b => b.id === openModalId)

    if (targetBusiness) {
      // ⚡ 상태 업데이트를 한 번에 배치 처리
      setSelectedBusiness(targetBusiness)
      setIsDetailModalOpen(true)

      // returnTo 파라미터 처리 (tasks, revenue 등)
      if (returnTo) {
        setReturnPath(returnTo)
        if (taskId) {
          setReturnTaskId(taskId)
        }
      }

      // URL 정리 (비동기로 처리하여 렌더링 블로킹 방지)
      requestAnimationFrame(() => {
        router.replace('/admin/business', { scroll: false })
      })
    } else {
      router.replace('/admin/business', { scroll: false })
    }
  }, [searchParams, allBusinesses, router])

  // 사업장 선택 시 메모와 업무 로드
  useEffect(() => {
    if (selectedBusiness) {
      loadBusinessMemos(selectedBusiness.id)
      loadBusinessTasks(selectedBusiness.사업장명)
    }
  }, [selectedBusiness?.id])

  // 이벤트 기반 실시간 업데이트 - 리소스 효율적 방식
  useEffect(() => {
    if (!selectedBusiness) return

    // 업무 업데이트 이벤트 리스너
    const handleTaskUpdate = (event: CustomEvent) => {
      const { businessName } = event.detail
      console.log('📡 [EVENT] 업무 업데이트 이벤트 수신:', businessName)

      // 현재 선택된 사업장과 일치하는 경우만 업데이트
      if (businessName === selectedBusiness.사업장명) {
        console.log('🔄 [EVENT] 업무 데이터 새로고침 시작')
        loadBusinessTasks(businessName)
      }
    }

    // 메모 업데이트 이벤트 리스너
    const handleMemoUpdate = (event: CustomEvent) => {
      const { businessId } = event.detail
      console.log('📡 [EVENT] 메모 업데이트 이벤트 수신:', businessId)

      // 현재 선택된 사업장과 일치하는 경우만 업데이트
      if (businessId === selectedBusiness.id) {
        console.log('🔄 [EVENT] 메모 데이터 새로고침 시작')
        loadBusinessMemos(businessId)
      }
    }

    // 이벤트 리스너 등록
    window.addEventListener('task-updated', handleTaskUpdate as EventListener)
    window.addEventListener('memo-updated', handleMemoUpdate as EventListener)

    console.log('📡 [EVENT] 이벤트 리스너 등록 완료 - 사업장:', selectedBusiness.사업장명)

    // 클린업
    return () => {
      window.removeEventListener('task-updated', handleTaskUpdate as EventListener)
      window.removeEventListener('memo-updated', handleMemoUpdate as EventListener)
      console.log('📡 [EVENT] 이벤트 리스너 해제')
    }
  }, [selectedBusiness?.id, selectedBusiness?.사업장명, loadBusinessMemos, loadBusinessTasks])

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isDetailModalOpen) {
          setIsDetailModalOpen(false)
        }
        if (isModalOpen) {
          setIsModalOpen(false)
          setShowLocalGovSuggestions(false)
        }
      }
    }

    document.addEventListener('keydown', handleEscKey)
    return () => {
      document.removeEventListener('keydown', handleEscKey)
    }
  }, [isDetailModalOpen, isModalOpen])

  // 🔙 복귀 경로 핸들러 (Revenue → Business 네비게이션)
  const handleReturnToSource = useCallback(() => {
    if ((returnPath === 'revenue' || returnPath === '/admin/revenue') && selectedBusiness) {
      console.log('🔙 [Return] Revenue 페이지로 복귀:', selectedBusiness.사업장명 || selectedBusiness.business_name);

      // Revenue 페이지로 이동하면서 해당 사업장의 Revenue 모달 자동 열기
      router.push(`/admin/revenue?businessId=${selectedBusiness.id}&openRevenueModal=true`);
    } else {
      // 일반 모달 닫기
      console.log('❌ [Close] 모달 닫기 (복귀 경로 없음)');
      setIsModalOpen(false);
      setEditingBusiness(null);
      setReturnPath(null);
      setShowLocalGovSuggestions(false);
    }
  }, [returnPath, selectedBusiness, router]);

  // 🗄️ 캐시 관리 함수들

  /**
   * 캐시에서 비즈니스 데이터 조회
   * @param businessId 사업장 ID
   * @returns 캐시된 데이터 또는 null (만료/없음)
   */
  const getCachedBusiness = useCallback((businessId: string): UnifiedBusinessInfo | null => {
    const cached = businessCacheRef.current.get(businessId);

    if (!cached) {
      console.log(`📦 [CACHE-MISS] 캐시 없음: ${businessId}`);
      return null;
    }

    const now = Date.now();
    const age = now - cached.timestamp;

    // TTL 체크
    if (age > cached.ttl) {
      console.log(`⏰ [CACHE-EXPIRED] 캐시 만료 (${Math.round(age / 1000)}초 경과): ${businessId}`);
      businessCacheRef.current.delete(businessId);
      return null;
    }

    console.log(`✅ [CACHE-HIT] 캐시 사용 (유효시간: ${Math.round((cached.ttl - age) / 1000)}초 남음): ${businessId}`);
    return cached.data;
  }, []);

  /**
   * 캐시에 비즈니스 데이터 저장
   * @param businessId 사업장 ID
   * @param data 사업장 데이터
   * @param ttl Time To Live (기본: CACHE_TTL)
   */
  const setCachedBusiness = useCallback((businessId: string, data: UnifiedBusinessInfo, ttl: number = CACHE_TTL) => {
    businessCacheRef.current.set(businessId, {
      data,
      timestamp: Date.now(),
      ttl
    });
    console.log(`💾 [CACHE-SET] 캐시 저장 (TTL: ${Math.round(ttl / 1000)}초): ${businessId} - ${data.사업장명}`);
  }, [CACHE_TTL]);

  /**
   * 특정 비즈니스 캐시 무효화
   * @param businessId 사업장 ID (없으면 전체 캐시 무효화)
   */
  const invalidateBusinessCache = useCallback((businessId?: string) => {
    if (businessId) {
      const deleted = businessCacheRef.current.delete(businessId);
      if (deleted) {
        console.log(`🗑️ [CACHE-INVALIDATE] 캐시 무효화: ${businessId}`);
      } else {
        console.log(`ℹ️ [CACHE-INVALIDATE] 캐시 없음 (무효화 불필요): ${businessId}`);
      }
      // sessionStorage의 매출 계산 캐시도 함께 무효화
      sessionStorage.removeItem(`revenue_calc_${businessId}`);
      console.log(`🗑️ [CACHE-INVALIDATE] sessionStorage 매출 계산 캐시 무효화: revenue_calc_${businessId}`);
    } else {
      const size = businessCacheRef.current.size;
      businessCacheRef.current.clear();
      console.log(`🧹 [CACHE-INVALIDATE-ALL] 전체 캐시 무효화 (${size}개 항목 삭제)`);
      // sessionStorage의 모든 매출 계산 캐시 무효화
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith('revenue_calc_')) keysToRemove.push(key);
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
      if (keysToRemove.length > 0) {
        console.log(`🧹 [CACHE-INVALIDATE-ALL] sessionStorage 매출 계산 캐시 전체 무효화 (${keysToRemove.length}개)`);
      }
    }
  }, []);

  // 원자적 상태 업데이트 함수 - 모든 관련 상태를 한 번에 동기화
  const updateBusinessState = (updatedBusiness: UnifiedBusinessInfo, businessId: string) => {
    console.log('🔄 [updateBusinessState] 원자적 상태 업데이트 시작:', {
      businessId,
      businessName: updatedBusiness.사업장명
    });

    // 1. allBusinesses 업데이트
    // ⚠️ Note: allBusinesses is now from useBusinessData hook (read-only)
    // Instead of updating state directly, we reload the data
    // TODO: Consider optimistic updates if performance becomes an issue
    console.log('⚠️ [updateBusinessState] allBusinesses is from hook - will refetch on next load');

    // 2. selectedBusiness 업데이트 (현재 선택된 사업장인 경우)
    if (selectedBusiness && selectedBusiness.id === businessId) {
      setSelectedBusiness(updatedBusiness);
      console.log('✅ [updateBusinessState] selectedBusiness 업데이트 완료');
    } else {
      console.log('ℹ️ [updateBusinessState] selectedBusiness 업데이트 건너뜀 (선택된 사업장 아님)');
    }

    console.log('🎯 [updateBusinessState] 원자적 상태 업데이트 완료');
  };

  // 통합 새로고침 함수 - 모든 데이터 동기화를 위한 단일 소스
  const refreshBusinessData = async (businessId: string, businessName: string, forceRefresh: boolean = false): Promise<UnifiedBusinessInfo | null> => {
    try {
      // 1. 캐시 확인 (forceRefresh가 false인 경우)
      if (!forceRefresh) {
        const cachedData = getCachedBusiness(businessId);
        if (cachedData) {
          console.log(`🚀 [refreshBusinessData] 캐시 데이터 반환: ${businessName}`);
          return cachedData;
        }
      } else {
        console.log(`🔄 [refreshBusinessData] 강제 새로고침 - 캐시 무시: ${businessName}`);
      }

      // 2. API에서 최신 데이터 가져오기
      const timestamp = Date.now()
      const response = await fetch(`/api/business-info-direct?id=${businessId}&t=${timestamp}`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Charset': 'utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      
      if (!response.ok) {
        throw new Error(`API 응답 오류: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('🔄 새로고침된 데이터:', {
        사업장명: data.data?.[0]?.business_name,
        담당자명: data.data?.[0]?.manager_name,
        담당자직급: data.data?.[0]?.manager_position,
        설치일: data.data?.[0]?.installation_date,
        그린링크제출일: data.data?.[0]?.greenlink_confirmation_submitted_at,
        계산서1차발행일: data.data?.[0]?.invoice_1st_date,
        계산서1차금액: data.data?.[0]?.invoice_1st_amount,
        견적실사담당자: data.data?.[0]?.estimate_survey_manager,
        fullData: data.data?.[0]
      })
      
      if (data.success && data.data?.length > 0) {
        const business = data.data[0]
        // 직접 API 응답을 한국어 필드명으로 변환
        const refreshedBusiness = {
          // Base BusinessInfo fields
          id: business.id,
          created_at: business.created_at,
          updated_at: business.updated_at,
          business_name: business.business_name || '정보없음',
          local_government: business.local_government,
          address: business.address,
          manager_name: business.manager_name,
          manager_position: business.manager_position,
          manager_contact: business.manager_contact,
          business_contact: business.business_contact,
          fax_number: business.fax_number,
          email: business.email,
          representative_name: business.representative_name,
          business_registration_number: business.business_registration_number,
          
          // 프로젝트 관리 필드들
          row_number: business.row_number,
          department: business.department,
          progress_status: business.progress_status,
          project_year: business.project_year,
          revenue_source: business.revenue_source,
          contract_document: business.contract_document,
          order_request_date: business.order_request_date,
          receipt_date: business.receipt_date,
          wireless_document: business.wireless_document,
          installation_support: business.installation_support,
          order_manager: business.order_manager,
          contract_sent_date: business.contract_sent_date,
          order_date: business.order_date,
          shipment_date: business.shipment_date,
          inventory_check: business.inventory_check,
          installation_date: business.installation_date,
          payment_scheduled_date: business.payment_scheduled_date || null,
          installation_team: business.installation_team,
          business_type: business.business_type,
          business_category: business.business_category,
          pollutants: business.pollutants,
          annual_emission_amount: business.annual_emission_amount,
          first_report_date: business.first_report_date,
          operation_start_date: business.operation_start_date,
          subsidy_approval_date: business.subsidy_approval_date,
          expansion_pack: business.expansion_pack,
          other_equipment: business.other_equipment,
          additional_cost: business.additional_cost,
          survey_fee_adjustment: business.survey_fee_adjustment,
          negotiation: business.negotiation,
          multiple_stack_cost: business.multiple_stack_cost,
          representative_birth_date: business.representative_birth_date,
          
          // 시스템 필드들
          manufacturer: business.manufacturer,
          vpn: business.vpn,
          greenlink_id: business.greenlink_id,
          greenlink_pw: business.greenlink_pw,
          business_management_code: business.business_management_code,
          
          // 센서/장비 수량 필드들
          ph_meter: business.ph_meter,
          differential_pressure_meter: business.differential_pressure_meter,
          temperature_meter: business.temperature_meter,
          discharge_current_meter: business.discharge_current_meter,
          fan_current_meter: business.fan_current_meter,
          pump_current_meter: business.pump_current_meter,
          gateway: business.gateway,
          gateway_1_2: business.gateway_1_2 || 0,
          gateway_3_4: business.gateway_3_4 || 0,
          vpn_wired: business.vpn_wired === true ? 1 : (business.vpn_wired === false ? 0 : (business.vpn_wired || 0)),
          vpn_wireless: business.vpn_wireless === true ? 1 : (business.vpn_wireless === false ? 0 : (business.vpn_wireless || 0)),
          explosion_proof_differential_pressure_meter_domestic: business.explosion_proof_differential_pressure_meter_domestic,
          explosion_proof_temperature_meter_domestic: business.explosion_proof_temperature_meter_domestic,
          expansion_device: business.expansion_device,
          relay_8ch: business.relay_8ch,
          relay_16ch: business.relay_16ch,
          main_board_replacement: business.main_board_replacement,
          multiple_stack: business.multiple_stack === true ? 1 : (business.multiple_stack === false ? 0 : (business.multiple_stack || 0)),
          
          // 영업점
          sales_office: business.sales_office,
          
          // 시설 요약 정보
          facility_summary: business.facility_summary,
          
          additional_info: business.additional_info,
          is_active: business.is_active,
          is_deleted: business.is_deleted,
          
          // UI 표시용 한국어 필드들
          사업장명: business.business_name || '정보없음',
          주소: business.address || '',
          담당자명: business.manager_name || '',
          담당자연락처: business.manager_contact || '',
          담당자직급: business.manager_position || '',
          contacts: business.additional_info?.contacts || [],
          대표자: business.representative_name || '',
          사업자등록번호: business.business_registration_number || '',
          업종: business.business_type || '',
          사업장연락처: business.business_contact || '',
          상태: business.is_active ? '활성' : '비활성',
          등록일: business.created_at,
          수정일: business.updated_at,
          지자체: business.local_government || '',
          팩스번호: business.fax_number || '',
          이메일: business.email || '',
          // 시스템 정보 필드
          사업장관리코드: business.business_management_code || null,
          그린링크ID: business.greenlink_id || '',
          그린링크PW: business.greenlink_pw || '',
          영업점: business.sales_office || '',
          // 프로젝트 관리 한국어 필드
          진행상태: business.progress_status || null,
          사업진행연도: business.project_year || null,
          설치팀: business.installation_team || null,
          // 현재 단계 필드
          현재단계: '준비 중',
          // 한국어 센서/장비 필드명 매핑
          PH센서: business.ph_meter || 0,
          차압계: business.differential_pressure_meter || 0,
          온도계: business.temperature_meter || 0,
          배출전류계: business.discharge_current_meter || 0,
          송풍전류계: business.fan_current_meter || 0,
          펌프전류계: business.pump_current_meter || 0,
          게이트웨이: business.gateway || 0, // @deprecated
          '게이트웨이(1,2)': business.gateway_1_2 || 0,
          '게이트웨이(3,4)': business.gateway_3_4 || 0,
          VPN유선: business.vpn_wired === true ? 1 : (business.vpn_wired === false ? 0 : (business.vpn_wired || 0)),
          VPN무선: business.vpn_wireless === true ? 1 : (business.vpn_wireless === false ? 0 : (business.vpn_wireless || 0)),
          복수굴뚝: business.multiple_stack === true ? 1 : (business.multiple_stack === false ? 0 : (business.multiple_stack || 0)),
          
          // 추가 측정기기 한국어 필드명 매핑
          방폭차압계국산: business.explosion_proof_differential_pressure_meter_domestic || 0,
          방폭온도계국산: business.explosion_proof_temperature_meter_domestic || 0,
          확장디바이스: business.expansion_device || 0,
          중계기8채널: business.relay_8ch || 0,
          중계기16채널: business.relay_16ch || 0,
          메인보드교체: business.main_board_replacement || 0,

          // 실사 관리 필드
          estimate_survey_manager: business.estimate_survey_manager || null,
          estimate_survey_date: business.estimate_survey_date || null,
          pre_construction_survey_manager: business.pre_construction_survey_manager || null,
          pre_construction_survey_date: business.pre_construction_survey_date || null,
          completion_survey_manager: business.completion_survey_manager || null,
          completion_survey_date: business.completion_survey_date || null,

          // 제출일 관리 필드
          construction_report_submitted_at: business.construction_report_submitted_at || null,
          greenlink_confirmation_submitted_at: business.greenlink_confirmation_submitted_at || null,
          attachment_completion_submitted_at: business.attachment_completion_submitted_at || null,

          // 계산서 및 입금 관리 필드 (보조금 사업장)
          invoice_1st_date: business.invoice_1st_date || null,
          invoice_1st_amount: business.invoice_1st_amount || null,
          payment_1st_date: business.payment_1st_date || null,
          payment_1st_amount: business.payment_1st_amount || null,
          invoice_2nd_date: business.invoice_2nd_date || null,
          invoice_2nd_amount: business.invoice_2nd_amount || null,
          payment_2nd_date: business.payment_2nd_date || null,
          payment_2nd_amount: business.payment_2nd_amount || null,
          invoice_additional_date: business.invoice_additional_date || null,
          payment_additional_date: business.payment_additional_date || null,
          payment_additional_amount: business.payment_additional_amount || null,

          // 계산서 및 입금 관리 필드 (자비 사업장)
          invoice_advance_date: business.invoice_advance_date || null,
          invoice_advance_amount: business.invoice_advance_amount || null,
          payment_advance_date: business.payment_advance_date || null,
          payment_advance_amount: business.payment_advance_amount || null,
          invoice_balance_date: business.invoice_balance_date || null,
          invoice_balance_amount: business.invoice_balance_amount || null,
          payment_balance_date: business.payment_balance_date || null,
          payment_balance_amount: business.payment_balance_amount || null,

          // UI specific fields
          hasFiles: false,
          fileCount: 0,
          files: null
        }

        // 3. 캐시에 저장
        setCachedBusiness(businessId, refreshedBusiness);

        return refreshedBusiness
      }
      return null
    } catch (error) {
      console.error('데이터 새로고침 오류:', error)
      return null
    }
  }

  // Modal functions
  const openDetailModal = async (business: UnifiedBusinessInfo) => {
    try {
      console.log('📋 모달 열기 시작:', business.사업장명)
      
      // 기본 데이터로 먼저 모달 열기
      setSelectedBusiness(business)
      setIsDetailModalOpen(true)
      
      // 대기필증 데이터 로딩
      if (business.id) {
        loadAirPermitData(business.id)
      }

      // ✅ 시설 정보 로딩 (대기필증 기준)
      if (business.사업장명) {
        await loadBusinessFacilitiesWithDetails(business.사업장명)
      }


      // 백그라운드에서 최신 데이터 조회
      if (business.id && business.사업장명) {
        const refreshedBusiness = await refreshBusinessData(business.id, business.사업장명)
        if (refreshedBusiness) {
          console.log('🔄 모달용 최신 데이터 조회 완료:', {
            사업장명: refreshedBusiness.사업장명,
            보조금승인일: refreshedBusiness.subsidy_approval_date,
            계약서발송일: refreshedBusiness.contract_sent_date,
            계산서1차발행일: refreshedBusiness.invoice_1st_date,
            계산서1차금액: refreshedBusiness.invoice_1st_amount,
            견적실사담당자: refreshedBusiness.estimate_survey_manager,
            진행구분: refreshedBusiness.progress_status,
            business_category: refreshedBusiness.business_category
          })
          setSelectedBusiness(refreshedBusiness)
        } else {
          console.warn('⚠️ refreshBusinessData 반환값 null - API 실패 또는 데이터 없음')
        }
      }

      // 메모 데이터 로드
      if (business.id) {
        await loadBusinessMemos(business.id)
      }
      
      // 시설 통계 로드
      if (business.id) {
        await loadBusinessFacilityStats(business.id)
      }
      
      // 시설 정보 로드 (사업장명 사용)
      const businessName = business.사업장명 || business.business_name
      if (businessName) {
        await loadBusinessFacilities(businessName)
      }

      // 매출 정보 계산 (클라이언트 측 직접 계산)
      loadRevenueData(business)
    } catch (error) {
      console.error('❌ 모달 열기 오류:', error)
      // 기본 데이터라도 표시
      setSelectedBusiness(business)
      setIsDetailModalOpen(true)
      
      // 대기필증 데이터 로딩
      if (business.id) {
        loadAirPermitData(business.id)
      }

      // ✅ 시설 정보 로딩 (대기필증 기준)
      if (business.사업장명) {
        await loadBusinessFacilitiesWithDetails(business.사업장명)
      }


      // 메모 로드 시도
      if (business.id) {
        await loadBusinessMemos(business.id)
      }
    }
  }

  const openAddModal = () => {
    setEditingBusiness(null)
    setFormData({
      business_name: '',
      local_government: '',
      address: '',
      representative_name: '',
      business_registration_number: '',
      manager_name: '',
      manager_position: '',
      manager_contact: '',
      business_contact: '',
      fax_number: '',
      email: '',
      manufacturer: 'ecosense' as 'ecosense' | 'cleanearth' | 'gaia_cns' | 'evs',
      vpn: null,
      greenlink_id: '',
      greenlink_pw: '',
      business_management_code: null,
      sales_office: '',
      ph_meter: null,
      differential_pressure_meter: null,
      temperature_meter: null,
      discharge_current_meter: null,
      fan_current_meter: null,
      pump_current_meter: null,
      gateway: null,
      gateway_1_2: null,
      gateway_3_4: null,
      vpn_wired: null,
      vpn_wireless: null,
      explosion_proof_differential_pressure_meter_domestic: null,
      explosion_proof_temperature_meter_domestic: null,
      expansion_device: null,
      relay_8ch: null,
      relay_16ch: null,
      main_board_replacement: null,
      multiple_stack: null,
      additional_cost: null,
      survey_fee_adjustment: null,
      multiple_stack_cost: null,
      expansion_pack: null,
      other_equipment: '',
      negotiation: '',
      is_active: true,
      // 실사 관리
      estimate_survey_manager: '',
      estimate_survey_date: '',
      pre_construction_survey_manager: '',
      pre_construction_survey_date: '',
      completion_survey_manager: '',
      completion_survey_date: ''
    })
    setIsModalOpen(true)
  }

  const openEditModal = async (business: UnifiedBusinessInfo) => {
    setEditingBusiness(business)

    // API에서 최신 데이터 가져오기
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      // 🔥 배포 환경에서 Router Cache 무효화
      const timestamp = Date.now()
      const response = await fetch(`/api/business-info-direct?id=${business.id}&_t=${timestamp}`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch business data');
      }

      const result = await response.json();
      const freshData = result.data?.[0] || business;

      console.log('🔄 [openEditModal] API에서 가져온 최신 데이터:', {
        id: freshData.id,
        business_name: freshData.business_name,
        invoice_1st_date: freshData.invoice_1st_date,
        invoice_1st_amount: freshData.invoice_1st_amount,
        payment_1st_date: freshData.payment_1st_date,
        payment_1st_amount: freshData.payment_1st_amount,
        invoice_2nd_date: freshData.invoice_2nd_date,
        payment_2nd_date: freshData.payment_2nd_date,
        payment_2nd_amount: freshData.payment_2nd_amount
      });

      setFormData({
        id: freshData.id,
        business_name: freshData.business_name,
        local_government: freshData.local_government,
        address: freshData.address,
        manager_name: freshData.manager_name,
        manager_position: freshData.manager_position,
        manager_contact: freshData.manager_contact,
        representative_name: freshData.representative_name,
        business_registration_number: freshData.business_registration_number,
        business_type: airPermitData?.business_type || freshData.business_type,
        business_category: airPermitData?.category || freshData.business_category,
        business_contact: freshData.business_contact,
        fax_number: freshData.fax_number,
        email: freshData.email,
        business_management_code: freshData.business_management_code ? Number(freshData.business_management_code) : null,
        greenlink_id: freshData.greenlink_id,
        greenlink_pw: freshData.greenlink_pw,
        sales_office: freshData.sales_office,
        ph_meter: freshData.ph_meter,
        differential_pressure_meter: freshData.differential_pressure_meter,
        temperature_meter: freshData.temperature_meter,
        discharge_current_meter: freshData.discharge_current_meter,
        fan_current_meter: freshData.fan_current_meter,
        pump_current_meter: freshData.pump_current_meter,
        gateway: freshData.gateway,
        gateway_1_2: freshData.gateway_1_2,
        gateway_3_4: freshData.gateway_3_4,

        // VPN 및 네트워크 관련 필드들
        vpn_wired: freshData.vpn_wired,
        vpn_wireless: freshData.vpn_wireless,
        multiple_stack: freshData.multiple_stack,

        // 추가 측정기기 필드들
        explosion_proof_differential_pressure_meter_domestic: freshData.explosion_proof_differential_pressure_meter_domestic,
        explosion_proof_temperature_meter_domestic: freshData.explosion_proof_temperature_meter_domestic,
        expansion_device: freshData.expansion_device,
        relay_8ch: freshData.relay_8ch,
        relay_16ch: freshData.relay_16ch,
        main_board_replacement: freshData.main_board_replacement,

        // 비용 정보 필드들
        additional_cost: freshData.additional_cost,
        installation_extra_cost: freshData.installation_extra_cost,  // 추가설치비 (설치팀 요청 추가 비용)
        survey_fee_adjustment: freshData.survey_fee_adjustment,       // 실사비 조정
        multiple_stack_cost: freshData.multiple_stack_cost,
        expansion_pack: freshData.expansion_pack,
        other_equipment: freshData.other_equipment,
        negotiation: freshData.negotiation,

        contacts: freshData.contacts || [],
        manufacturer: freshData.manufacturer || '',
        vpn: freshData.vpn || '',
        is_active: freshData.is_active,
        progress_status: freshData.progress_status || '',
        project_year: freshData.project_year || null,
        revenue_source: freshData.revenue_source || '',
        installation_team: freshData.installation_team || '',
        order_manager: freshData.order_manager || '',
        receipt_date: freshData.receipt_date || '',

        // 일정 관리
        subsidy_approval_date: freshData.subsidy_approval_date || '',
        contract_sent_date: freshData.contract_sent_date || '',
        order_request_date: freshData.order_request_date || '',
        order_date: freshData.order_date || '',
        shipment_date: freshData.shipment_date || '',
        installation_date: freshData.installation_date || '',
        payment_scheduled_date: freshData.payment_scheduled_date || '',

        // 실사 관리
        estimate_survey_manager: freshData.estimate_survey_manager || '',
        estimate_survey_date: freshData.estimate_survey_date || '',
        pre_construction_survey_manager: freshData.pre_construction_survey_manager || '',
        pre_construction_survey_date: freshData.pre_construction_survey_date || '',
        completion_survey_manager: freshData.completion_survey_manager || '',
        completion_survey_date: freshData.completion_survey_date || '',

        // 계산서 및 입금 관리 (보조금 사업장)
        invoice_1st_date: freshData.invoice_1st_date || '',
        invoice_1st_amount: freshData.invoice_1st_amount || null,
        payment_1st_date: freshData.payment_1st_date || '',
        payment_1st_amount: freshData.payment_1st_amount || null,
        invoice_2nd_date: freshData.invoice_2nd_date || '',
        invoice_2nd_amount: freshData.invoice_2nd_amount || null,
        payment_2nd_date: freshData.payment_2nd_date || '',
        payment_2nd_amount: freshData.payment_2nd_amount || null,
        invoice_additional_date: freshData.invoice_additional_date || '',
        payment_additional_date: freshData.payment_additional_date || '',
        payment_additional_amount: freshData.payment_additional_amount || null,

        // 계산서 및 입금 관리 (자비 사업장)
        invoice_advance_date: freshData.invoice_advance_date || '',
        invoice_advance_amount: freshData.invoice_advance_amount || null,
        payment_advance_date: freshData.payment_advance_date || '',
        payment_advance_amount: freshData.payment_advance_amount || null,
        invoice_balance_date: freshData.invoice_balance_date || '',
        invoice_balance_amount: freshData.invoice_balance_amount || null,
        payment_balance_date: freshData.payment_balance_date || '',
        payment_balance_amount: freshData.payment_balance_amount || null,

        // 제출일 관리 (착공신고서, 그린링크 전송확인서, 부착완료통보서)
        construction_report_submitted_at: freshData.construction_report_submitted_at || '',
        greenlink_confirmation_submitted_at: freshData.greenlink_confirmation_submitted_at || '',
        attachment_completion_submitted_at: freshData.attachment_completion_submitted_at || ''
      })

      // Close detail modal BEFORE opening edit modal
      // IMPORTANT: Keep returnPath intact so edit modal can return to origin after save
      setIsDetailModalOpen(false)

      // Use setTimeout to ensure state updates complete before opening edit modal
      setTimeout(() => {
        setIsModalOpen(true)
      }, 0)

      // 대기필증 데이터 로딩
      if (freshData.id) {
        loadAirPermitData(freshData.id)
      }

      // 메모 로드 시도
      if (freshData.id) {
        await loadBusinessMemos(freshData.id)
      }
    } catch (error) {
      console.error('❌ [openEditModal] API 데이터 로딩 실패:', error);
      alert('사업장 데이터를 불러오는데 실패했습니다. 페이지를 새로고침해주세요.');
    }
  }

  const confirmDelete = (business: UnifiedBusinessInfo) => {
    setBusinessToDelete(business)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!businessToDelete) return

    const businessId = businessToDelete.id
    const businessName = businessToDelete.business_name

    // 이미 삭제 진행 중이면 무시
    if (pendingDeletions.has(businessId)) {
      console.log('⚠️ [DELETE] 이미 삭제 진행 중:', businessId)
      toast.warning('삭제 진행 중', '이미 삭제가 진행 중입니다.')
      return
    }

    try {
      // 1️⃣ 삭제 진행 중 상태 추가
      setPendingDeletions(prev => new Set(prev).add(businessId))

      // 모달 닫기 및 선택 초기화
      setDeleteConfirmOpen(false)
      setBusinessToDelete(null)

      // 선택된 사업장이 삭제된 경우 상세 모달도 닫기
      if (selectedBusiness?.id === businessId) {
        setSelectedBusiness(null)
        setIsDetailModalOpen(false)
      }

      // 캐시 무효화
      invalidateBusinessCache(businessId)

      // 2️⃣ useBusinessData 훅의 deleteBusiness 함수 사용
      const result = await deleteBusiness(businessId, businessName)

      if (result.success) {
        // 3️⃣ 성공
        toast.success('사업장 삭제 완료', `${businessName}이(가) 성공적으로 삭제되었습니다.`)
      } else {
        // 4️⃣ 실패 (훅에서 자동 롤백됨)
        toast.error('삭제 실패', `${businessName} 삭제에 실패했습니다: ${result.error}`)
      }

    } finally {
      // 5️⃣ 진행 중 상태 제거
      setPendingDeletions(prev => {
        const next = new Set(prev)
        next.delete(businessId)
        return next
      })
      console.log('🔚 [DELETE-END] 삭제 프로세스 종료:', businessId)
    }
  }

  // 전체교체 후 orphaned 사진 복원
  const handleRestorePhotos = async () => {
    if (!confirm('전체교체 이후 연결이 끊어진 사진들을 복원합니다. 계속하시겠습니까?')) return;
    setIsRestoringPhotos(true);
    try {
      const csrfResponse = await fetch('/api/csrf-token');
      const csrfToken = csrfResponse.headers.get('X-CSRF-Token');
      const token = TokenManager.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1단계: dry_run으로 미매칭 목록 콘솔 출력 (진단용)
      const dryRes = await fetch('/api/admin/restore-photos', {
        method: 'POST', headers, body: JSON.stringify({ dry_run: true }),
      });
      const dryData = await dryRes.json();
      if (dryData.success && dryData.data.unmatched > 0) {
        console.group('⚠️ [RESTORE-PHOTOS] 미매칭 목록 (사업장을 찾지 못한 파일들)');
        console.log('세그먼트별 건수:', dryData.data.unmatchedBySegment);
        console.table(dryData.data.unmatchedAll);
        console.groupEnd();
      }

      // 2단계: 실제 복원 실행
      const res = await fetch('/api/admin/restore-photos', {
        method: 'POST', headers, body: JSON.stringify({ dry_run: false }),
      });
      const data = await res.json();
      if (data.success) {
        const unmatchedMsg = data.data.unmatched > 0
          ? `\n⚠️ 매칭 실패: ${data.data.unmatched}건 (브라우저 콘솔 F12에서 확인)`
          : '';
        alert(`✅ 사진 복원 완료: ${data.data.restored}건${unmatchedMsg}`);
      } else {
        alert(`❌ 복원 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      alert('복원 중 오류가 발생했습니다.');
      console.error('[RESTORE-PHOTOS]', err);
    } finally {
      setIsRestoringPhotos(false);
    }
  };

  // 엑셀 파일 업로드 처리 (배치 업데이트/생성)
  const handleFileUpload = async (file: File) => {
    try {
      setIsUploading(true)
      setUploadProgress(0)

      // 동적 import: XLSX 라이브러리 로딩 (성능 최적화)
      const XLSX = await import('xlsx')

      // 파일 읽기 진행률 10%
      setUploadProgress(10)
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]

      // 데이터 파싱 진행률 20%
      setUploadProgress(20)
      const rawJsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null }) as any[]

      if (rawJsonData.length === 0) {
        alert('파일에 데이터가 없습니다.')
        return
      }

      // 헤더 키의 앞뒤 공백 제거 (예: ' 1차계산서금액 ' → '1차계산서금액')
      const jsonData = rawJsonData.map((row: any) => {
        const trimmed: any = {}
        for (const key of Object.keys(row)) {
          trimmed[key.trim()] = row[key]
        }
        return trimmed
      })

      console.log('📊 엑셀 데이터 샘플:', jsonData.slice(0, 2))

      // 엑셀 날짜 변환 함수 (Excel serial date → YYYY-MM-DD)
      // 주의: 모든 경로에서 로컬 날짜 기준으로 YYYY-MM-DD 문자열만 반환 (UTC 변환 없음)
      const parseExcelDate = (value: any): string | null => {
        if (!value || value === '-' || value === '') return null

        // 이미 YYYY-MM-DD 형식인 경우
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value
        }

        // ISO 8601 형식에서 날짜 부분만 추출 (YYYY-MM-DDTHH:mm:ss.sssZ → YYYY-MM-DD)
        // new Date()로 변환하지 않고 직접 슬라이싱 → 시간대 오류 없음
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
          return value.substring(0, 10)
        }

        // 엑셀 시리얼 날짜 (숫자)인 경우 - UTC 기준으로 계산하면 시간대 오류 없음
        if (typeof value === 'number') {
          // Excel epoch: 1899-12-30 기준 serial → UTC 날짜
          const MS_PER_DAY = 86400000
          const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30) // 1899-12-30 UTC
          const utcMs = EXCEL_EPOCH_MS + value * MS_PER_DAY
          const date = new Date(utcMs)
          const year = date.getUTCFullYear()
          const month = String(date.getUTCMonth() + 1).padStart(2, '0')
          const day = String(date.getUTCDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }

        // YY.MM.DD / YYYY.MM.DD / YYYY/MM/DD 등 다양한 구분자 형식
        if (typeof value === 'string') {
          const normalized = value.replace(/[./]/g, '-').trim()
          if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            return normalized
          }
          // 두 자리 연도 처리 (YY-MM-DD → 20YY-MM-DD)
          if (/^\d{2}-\d{2}-\d{2}$/.test(normalized)) {
            return `20${normalized}`
          }
        }

        return null
      }

      // 엑셀 금액 파싱 함수 (콤마 포함 문자열, 숫자 모두 처리)
      const parseExcelAmount = (value: any): number | null => {
        if (value === null || value === undefined || value === '' || value === '-') return null
        if (typeof value === 'number') return Math.round(value)
        if (typeof value === 'string') {
          // 콤마 제거 후 파싱 ("1,500,000" → 1500000)
          const cleaned = value.replace(/,/g, '').trim()
          if (cleaned === '' || cleaned === '-') return null
          const parsed = parseInt(cleaned, 10)
          return isNaN(parsed) ? null : parsed
        }
        return null
      }

      // 제조사 값 정규화 함수
      const normalizeManufacturer = (value: any): string | null => {
        if (!value) return null

        const normalized = String(value).trim().toLowerCase()

        const mapping: Record<string, string> = {
          'ecosense': '에코센스',
          '에코센스': '에코센스',
          'cleanearth': '크린어스',
          '크린어스': '크린어스',
          '클린어스': '크린어스',
          'gaia_cns': '가이아씨앤에스',
          'gaia': '가이아씨앤에스',
          '가이아씨앤에스': '가이아씨앤에스',
          '가이아': '가이아씨앤에스',
          'evs': '이브이에스',
          '이브이에스': '이브이에스'
        }

        // 정확한 매칭
        if (mapping[normalized]) {
          return mapping[normalized]
        }

        // 부분 매칭 (예: "2.크린어스" -> "크린어스")
        if (normalized.includes('크린어스') || normalized.includes('cleanearth')) {
          return '크린어스'
        }
        if (normalized.includes('에코센스') || normalized.includes('ecosense')) {
          return '에코센스'
        }
        if (normalized.includes('가이아') || normalized.includes('gaia')) {
          return '가이아씨앤에스'
        }
        if (normalized.includes('이브이에스') || normalized.includes('evs')) {
          return '이브이에스'
        }

        // 인식할 수 없는 값은 null 반환
        console.warn('⚠️ 인식할 수 없는 제조사 값:', value)
        return null
      }

      /**
       * VPN 타입 정규화 함수
       * vpn_wired, vpn_wireless 값을 기반으로 vpn 타입 자동 결정
       */
      const normalizeVpnType = (vpnWired: number, vpnWireless: number, explicitVpnType?: string): 'wired' | 'wireless' | null => {
        // 명시적으로 VPN타입이 지정된 경우 우선 사용
        if (explicitVpnType) {
          if (explicitVpnType === '무선' || explicitVpnType === 'wireless') return 'wireless'
          if (explicitVpnType === '유선' || explicitVpnType === 'wired') return 'wired'
        }

        const wired = vpnWired || 0
        const wireless = vpnWireless || 0

        // 둘 다 0이면 null
        if (wired === 0 && wireless === 0) return null

        // VPN(유선)만 있는 경우
        if (wired > 0 && wireless === 0) return 'wired'

        // VPN(무선)만 있는 경우
        if (wireless > 0 && wired === 0) return 'wireless'

        // 둘 다 있는 경우 - 더 많은 쪽 (같으면 유선 우선)
        if (wired >= wireless) return 'wired'
        return 'wireless'
      }

      // 엑셀 헤더를 API 필드명으로 매핑
      const mappedBusinesses = jsonData.map((row: any) => {
        const vpnWired = parseInt(row['VPN(유선)'] || '0') || 0
        const vpnWireless = parseInt(row['VPN(무선)'] || '0') || 0
        const explicitVpnType = row['VPN타입']

        return {
        business_name: row['사업장명'] || '',
        address: row['주소'] || '',
        manager_name: row['사업장담당자'] || '',
        manager_position: row['담당자직급'] || '',
        manager_contact: row['연락처'] || '',
        representative_name: row['대표자명'] || '',
        representative_birth_date: parseExcelDate(row['대표자생년월일']),
        business_registration_number: row['사업자등록번호'] || '',
        business_type: row['업종'] || '',
        category: row['종별'] || '',
        business_contact: row['사업장연락처'] || '',
        fax_number: row['팩스번호'] || '',
        email: row['이메일'] || '',
        local_government: row['지자체'] || '',

        // 센서/미터 정보
        ph_meter: parseInt(row['PH센서'] || '0') || 0,
        differential_pressure_meter: parseInt(row['차압계'] || '0') || 0,
        temperature_meter: parseInt(row['온도계'] || '0') || 0,
        discharge_current_meter: parseInt(row['배출전류계'] || '0') || 0,
        fan_current_meter: parseInt(row['송풍전류계'] || '0') || 0,
        pump_current_meter: parseInt(row['펌프전류계'] || '0') || 0,

        // 네트워크 장비
        gateway: parseInt(row['게이트웨이'] || '0') || 0, // @deprecated
        gateway_1_2: parseInt(row['게이트웨이(1,2)'] || '0') || 0,
        gateway_3_4: parseInt(row['게이트웨이(3,4)'] || '0') || 0,
        vpn_wired: vpnWired,
        vpn_wireless: vpnWireless,
        vpn: normalizeVpnType(vpnWired, vpnWireless, explicitVpnType),
        multiple_stack: parseInt(row['복수굴뚝(설치비)'] || '0') || 0,

        // 추가 측정기기
        explosion_proof_differential_pressure_meter_domestic: parseInt(row['방폭차압계국산'] || '0') || 0,
        explosion_proof_temperature_meter_domestic: parseInt(row['방폭온도계국산'] || '0') || 0,
        expansion_device: parseInt(row['확장디바이스'] || '0') || 0,
        relay_8ch: parseInt(row['중계기8채널'] || '0') || 0,
        relay_16ch: parseInt(row['중계기16채널'] || '0') || 0,
        main_board_replacement: parseInt(row['메인보드교체'] || '0') || 0,

        // 기타 정보
        manufacturer: normalizeManufacturer(row['제조사']),
        sales_office: row['영업점'] || '',
        department: row['담당부서'] || '',
        progress_status: row['진행구분'] || '',
        business_category: row['사업장분류'] || '',
        project_year: row['사업 진행연도'] ? parseInt(row['사업 진행연도']) : null,
        greenlink_id: row['그린링크ID'] || '',
        greenlink_pw: row['그린링크PW'] || '',
        business_management_code: row['사업장관리코드'] ? parseInt(row['사업장관리코드']) : null,

        // 일정 관리
        installation_team: row['설치팀'] || '',
        order_manager: row['발주담당'] || '',
        receipt_date: parseExcelDate(row['접수일']),
        order_request_date: parseExcelDate(row['발주요청일']),
        order_date: parseExcelDate(row['발주일']),
        shipment_date: parseExcelDate(row['출고일']),
        installation_date: parseExcelDate(row['설치일']),

        // 실사 관리
        estimate_survey_manager: row['견적실사담당자'] || '',
        estimate_survey_date: parseExcelDate(row['견적실사일']),
        pre_construction_survey_manager: row['착공전실사담당자'] || '',
        pre_construction_survey_date: parseExcelDate(row['착공전실사일']),
        completion_survey_manager: row['준공실사담당자'] || '',
        completion_survey_date: parseExcelDate(row['준공실사일']),

        // 계산서 및 입금 관리 (보조금 사업장)
        invoice_1st_date: parseExcelDate(row['1차계산서일']),
        invoice_1st_amount: parseExcelAmount(row['1차계산서금액']),
        payment_1st_date: parseExcelDate(row['1차입금일']),
        payment_1st_amount: parseExcelAmount(row['1차입금액']),
        invoice_2nd_date: parseExcelDate(row['2차계산서일']),
        invoice_2nd_amount: parseExcelAmount(row['2차계산서금액']),
        payment_2nd_date: parseExcelDate(row['2차입금일']),
        payment_2nd_amount: parseExcelAmount(row['2차입금액']),
        invoice_additional_date: parseExcelDate(row['추가계산서일']),
        payment_additional_date: parseExcelDate(row['추가입금일']),
        payment_additional_amount: parseExcelAmount(row['추가입금액']),

        // 계산서 및 입금 관리 (자비 사업장)
        invoice_advance_date: parseExcelDate(row['선금계산서일']),
        invoice_advance_amount: parseExcelAmount(row['선금계산서금액']),
        payment_advance_date: parseExcelDate(row['선금입금일']),
        payment_advance_amount: parseExcelAmount(row['선금입금액']),
        invoice_balance_date: parseExcelDate(row['잔금계산서일']),
        invoice_balance_amount: parseExcelAmount(row['잔금계산서금액']),
        payment_balance_date: parseExcelDate(row['잔금입금일']),
        payment_balance_amount: parseExcelAmount(row['잔금입금액']),

        // 비용 정보
        additional_cost: parseExcelAmount(row['추가공사비']),
        installation_extra_cost: parseExcelAmount(row['추가설치비']),
        survey_fee_adjustment: parseExcelAmount(row['실사비조정']),
        multiple_stack_cost: parseExcelAmount(row['복수굴뚝비용']),
        expansion_pack: row['확장팩'] || '',
        negotiation: row['네고'] || '',
        other_equipment: row['기타'] || '',

        // 제출일 관리 (착공신고서, 그린링크 전송확인서, 부착완료통보서)
        construction_report_submitted_at: parseExcelDate(row['착공신고서제출일']),
        greenlink_confirmation_submitted_at: parseExcelDate(row['그린링크전송확인서제출일']),
        attachment_completion_submitted_at: parseExcelDate(row['부착완료통보서제출일'])
        }
      });
      
      console.log('🔄 헤더 기반 매핑 완료:', mappedBusinesses.slice(0, 2));
      
      // 진행률 추적을 위한 이벤트 스트림 설정
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev < 90) {
            return Math.min(prev + 2, 90) // 90%까지만 자동 증가
          }
          return prev
        })
      }, 500)
      
      try {
        // 배치 업로드 API 호출
        // 🔥 배포 환경에서 Router Cache 무효화
        const timestamp = Date.now()
        const response = await fetch(`/api/business-info-direct?_t=${timestamp}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isBatchUpload: true,
            uploadMode: uploadMode,
            businesses: mappedBusinesses
          })
        })
        
        clearInterval(progressInterval)
        setUploadProgress(95) // API 완료시 95%
        
        const result = await response.json()

        // 사진 등록된 사업장 존재로 전체교체 차단된 경우 (409)
        if (response.status === 409 && result.photo_businesses) {
          clearInterval(progressInterval)
          setIsUploading(false)
          setUploadProgress(0)
          const bizList = (result.photo_businesses as any[])
            .map((b: any) => `• ${b.business_name} (${b.photo_count}장)`)
            .join('\n')
          const confirmed = confirm(
            `⚠️ 아래 사업장에 사진이 등록되어 있습니다. 전체교체 시 사진 연결이 끊어질 수 있습니다.\n\n${bizList}\n\n그래도 전체교체를 진행하시겠습니까?`
          )
          if (!confirmed) return
          // force_replace=true 로 재요청
          const forceTimestamp = Date.now()
          const forceResponse = await fetch(`/api/business-info-direct?_t=${forceTimestamp}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              isBatchUpload: true,
              uploadMode: uploadMode,
              force_replace: true,
              businesses: mappedBusinesses
            })
          })
          const forceResult = await forceResponse.json()
          if (!forceResponse.ok || !forceResult.success) {
            throw new Error(forceResult.error || '전체교체 실패')
          }
          Object.assign(result, forceResult)
          // success 분기로 이어서 처리
        }

        if (result.success) {
          setUploadProgress(100) // 완료시 100%
          
          setUploadResults({
            total: result.data.results?.total ?? result.data.created ?? 0,
            success: (result.data.results?.created ?? result.data.created ?? 0) + (result.data.results?.updated ?? 0),
            failed: result.data.results?.errors ?? 0,
            errors: (result.data.results?.errorDetails || []).map((e: any) =>
              typeof e === 'string' ? e : `${e.business_name}: ${e.error}`
            ),
            created: result.data.results?.created ?? result.data.created ?? 0,
            updated: result.data.results?.updated ?? 0,
            skipped: result.data.results?.skipped ?? 0,
            snapshotId: result.data.snapshotId,
            airPermitRestored: result.data.airPermitRestored,
            airPermitNotRestored: result.data.airPermitNotRestored,
          })
          
          console.log('✅ 배치 업로드 완료:', result.data.results)
          
          // 데이터 새로고침
          await loadAllBusinesses()
        } else {
          throw new Error(result.error || '배치 업로드 실패')
        }
      } catch (apiError) {
        clearInterval(progressInterval)
        throw apiError
      }
      
    } catch (error: any) {
      console.error('파일 업로드 오류:', error)
      alert(`파일 처리 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setIsUploading(false)
      setUploadProgress(100)
    }
  }

  // 폼 제출 처리 - 실시간 업데이트 최적화
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 편집 모드에서는 원래 사업장명을 보장
    const finalFormData = { ...formData }
    if (editingBusiness && !finalFormData.business_name?.trim()) {
      finalFormData.business_name = editingBusiness.사업장명
    }
    
    if (!finalFormData.business_name?.trim()) {
      alert('사업장명을 입력해주세요.')
      return
    }

    // 제출 버튼 비활성화를 위한 상태 추가
    const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement
    if (submitButton) {
      submitButton.disabled = true
      submitButton.textContent = editingBusiness ? '수정 중...' : '추가 중...'
    }

    try {
      const method = editingBusiness ? 'PUT' : 'POST'
      
      // 담당자 정보는 개별 필드로 직접 사용
      let processedFormData = { ...finalFormData };

      // 날짜 필드에서 시간 정보 제거 (YYYY-MM-DDTHH:mm:ss.sssZ → YYYY-MM-DD)
      const dateFields = [
        'subsidy_approval_date', 'contract_sent_date',
        'receipt_date', 'order_request_date', 'order_date', 'shipment_date', 'installation_date',
        'construction_report_submitted_at', 'greenlink_confirmation_submitted_at',
        'attachment_completion_submitted_at',
        'estimate_survey_date', 'pre_construction_survey_date', 'completion_survey_date',
        'invoice_1st_date', 'payment_1st_date', 'invoice_2nd_date', 'payment_2nd_date',
        'invoice_additional_date', 'payment_additional_date',
        'invoice_advance_date', 'payment_advance_date', 'invoice_balance_date', 'payment_balance_date',
        'representative_birth_date', 'payment_scheduled_date'
      ];

      dateFields.forEach(field => {
        const value = (processedFormData as any)[field];
        if (value && typeof value === 'string' && value.includes('T')) {
          // ISO 8601 datetime 형식에서 날짜 부분만 추출
          (processedFormData as any)[field] = value.split('T')[0];
        }
      });

      const body = editingBusiness
        ? { id: editingBusiness.id, updateData: processedFormData }
        : processedFormData

      console.log('📤 [FRONTEND] 전송할 데이터:', JSON.stringify(body, null, 2));

      // 0. 계산서 탭의 활성 폼 저장 (편집 모드에서만)
      if (editingBusiness && invoiceTabRef.current) {
        try {
          await invoiceTabRef.current.saveActiveTab();
        } catch (invoiceErr) {
          console.error('계산서 저장 중 오류:', invoiceErr);
          // 계산서 저장 실패해도 사업장 정보 저장은 계속 진행
        }
      }

      // 1. 즉시 모달 닫기 (사용자 경험 개선)
      setIsModalOpen(false)
      setShowLocalGovSuggestions(false)

      // 2. Optimistic Update - 편집의 경우 즉시 로컬 상태 업데이트
      if (editingBusiness) {
        // 🔍 [SYNC-CHECK] Optimistic Update 전 상태 로깅
        console.log('🔍 [SYNC-CHECK-BEFORE] Optimistic Update 전 상태:', {
          editingBusinessId: editingBusiness.id,
          editingBusinessName: editingBusiness.사업장명,
          selectedBusinessId: selectedBusiness?.id,
          isDetailModalOpen,
          변경사항: {
            invoice_1st_amount: processedFormData.invoice_1st_amount,
            payment_1st_amount: processedFormData.payment_1st_amount,
            invoice_2nd_amount: processedFormData.invoice_2nd_amount,
            payment_2nd_amount: processedFormData.payment_2nd_amount,
            invoice_advance_amount: processedFormData.invoice_advance_amount,
            payment_advance_amount: processedFormData.payment_advance_amount,
            invoice_balance_amount: processedFormData.invoice_balance_amount,
            payment_balance_amount: processedFormData.payment_balance_amount
          }
        });

        // 개선된 Optimistic Update: 영문/한글 키 모두 업데이트
        const optimisticUpdate = {
          ...editingBusiness,
          ...Object.keys(processedFormData).reduce((acc, key) => {
            const value = (processedFormData as any)[key];

            // 영문 키는 그대로 저장
            acc[key] = value;

            // 한글 키 매핑 (UI 표시용)
            const koreanKeyMap: {[key: string]: string} = {
              'business_name': '사업장명',
              'local_government': '지자체',
              'address': '주소',
              'representative_name': '대표자',
              'business_registration_number': '사업자등록번호',
              'business_type': '업종',
              'business_contact': '사업장연락처',
              'manager_name': '담당자명',
              'manager_contact': '담당자연락처',
              'manager_position': '담당자직급',
              'fax_number': '팩스번호',
              'email': '이메일',
              'greenlink_id': '그린링크ID',
              'greenlink_pw': '그린링크PW',
              'business_management_code': '사업장관리코드',
              'sales_office': '영업점',
              'progress_status': '진행상태',
              'project_year': '사업진행연도',
              'installation_team': '설치팀',
              'ph_meter': 'PH센서',
              'differential_pressure_meter': '차압계',
              'temperature_meter': '온도계',
              'discharge_current_meter': '배출전류계',
              'fan_current_meter': '송풍전류계',
              'pump_current_meter': '펌프전류계',
              'gateway': '게이트웨이', // @deprecated
              'gateway_1_2': '게이트웨이(1,2)',
              'gateway_3_4': '게이트웨이(3,4)',
              'vpn_wired': 'VPN유선',
              'vpn_wireless': 'VPN무선'
            };

            // 한글 키가 있으면 함께 저장
            if (koreanKeyMap[key]) {
              acc[koreanKeyMap[key]] = value;
            }

            return acc;
          }, {} as any),
          updated_at: new Date().toISOString(),
          수정일: new Date().toISOString()
        };

        // Optimistic Update: selectedBusiness 즉시 업데이트 + 상세 모달 열기
        setSelectedBusiness(optimisticUpdate);
        setIsDetailModalOpen(true);
        updateBusinessState(optimisticUpdate, editingBusiness.id);

        // ✅ [SYNC-CHECK] Optimistic Update 완료 로깅
        console.log('✅ [SYNC-CHECK-AFTER] Optimistic Update 완료:', {
          updatedBusinessId: optimisticUpdate.id,
          updatedBusinessName: optimisticUpdate.사업장명,
          적용된_계산서_입금_데이터: {
            invoice_1st_amount: optimisticUpdate.invoice_1st_amount,
            payment_1st_amount: optimisticUpdate.payment_1st_amount,
            invoice_2nd_amount: optimisticUpdate.invoice_2nd_amount,
            payment_2nd_amount: optimisticUpdate.payment_2nd_amount,
            invoice_advance_amount: optimisticUpdate.invoice_advance_amount,
            payment_advance_amount: optimisticUpdate.payment_advance_amount,
            invoice_balance_amount: optimisticUpdate.invoice_balance_amount,
            payment_balance_amount: optimisticUpdate.payment_balance_amount
          }
        });
      }

      // 🔥 배포 환경에서 Router Cache 무효화
      const timestamp = Date.now()
      const response = await fetch(`/api/business-info-direct?_t=${timestamp}`, {
        method,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/json',
          'Accept-Charset': 'utf-8'
        },
        body: JSON.stringify(body)
      })

      const result = await response.json()
      console.log('🔄 API 응답 데이터:', result)

      if (response.ok) {
        // 성공 메시지 표시
        alert(editingBusiness ? '사업장 정보가 수정되었습니다.' : '새 사업장이 추가되었습니다.')

        // 2-1. 사업장 수정 시 자동으로 매출 재계산 (비동기 실행)
        if (editingBusiness && result.success && result.data) {
          const businessId = result.data.id;
          console.log('🔄 [AUTO-RECALCULATE] 사업장 수정됨, 매출 자동 재계산 시작:', businessId);

          // 백그라운드에서 재계산 실행 (사용자 대기 없음)
          const { TokenManager } = await import('@/lib/api-client');
          const token = TokenManager.getToken();

          fetch('/api/revenue/calculate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              business_id: businessId,
              calculation_date: new Date().toISOString().split('T')[0],
              save_result: true
            })
          }).then(calcResponse => calcResponse.json())
            .then(calcData => {
              if (calcData.success) {
                console.log('✅ [AUTO-RECALCULATE] 매출 재계산 완료:', calcData.data.calculation.total_revenue);
              } else {
                console.warn('⚠️ [AUTO-RECALCULATE] 매출 재계산 실패:', calcData.message);
              }
            })
            .catch(err => {
              console.error('❌ [AUTO-RECALCULATE] 매출 재계산 오류:', err);
            });
        }

        // 3. API 응답으로 정확한 데이터 동기화
        if (result.success && result.data) {
          console.log('✅ API 응답에서 받은 업데이트된 데이터:', result.data)

          // 🔍 [SYNC-CHECK] 서버 응답 데이터 검증
          console.log('🔍 [SYNC-CHECK-SERVER] 서버 응답 데이터 상세:', {
            businessId: result.data.id,
            businessName: result.data.business_name,
            서버에서_받은_계산서_입금_데이터: {
              invoice_1st_date: result.data.invoice_1st_date,
              invoice_1st_amount: result.data.invoice_1st_amount,
              payment_1st_date: result.data.payment_1st_date,
              payment_1st_amount: result.data.payment_1st_amount,
              invoice_2nd_date: result.data.invoice_2nd_date,
              invoice_2nd_amount: result.data.invoice_2nd_amount,
              payment_2nd_date: result.data.payment_2nd_date,
              payment_2nd_amount: result.data.payment_2nd_amount,
              invoice_advance_date: result.data.invoice_advance_date,
              invoice_advance_amount: result.data.invoice_advance_amount,
              payment_advance_date: result.data.payment_advance_date,
              payment_advance_amount: result.data.payment_advance_amount,
              invoice_balance_date: result.data.invoice_balance_date,
              invoice_balance_amount: result.data.invoice_balance_amount,
              payment_balance_date: result.data.payment_balance_date,
              payment_balance_amount: result.data.payment_balance_amount
            }
          });

          if (editingBusiness) {
            // 편집의 경우: 서버에서 받은 정확한 데이터로 교체
            const serverData = result.data
            const updatedBusiness = {
              id: serverData.id,
              // 기본 정보 (한글/영어 병행)
              사업장명: serverData.business_name || '',
              business_name: serverData.business_name || '',
              지자체: serverData.local_government || '',
              local_government: serverData.local_government || '',
              주소: serverData.address || '',
              address: serverData.address || '',
              대표자명: serverData.representative_name || '',
              대표자: serverData.representative_name || '',
              representative_name: serverData.representative_name || '',
              사업자등록번호: serverData.business_registration_number || '',
              business_registration_number: serverData.business_registration_number || '',
              업종: serverData.business_type || '',
              business_type: serverData.business_type || '',
              사업장전화번호: serverData.business_contact || '',
              사업장연락처: serverData.business_contact || '',
              business_contact: serverData.business_contact || '',
              담당자명: serverData.manager_name || '',
              manager_name: serverData.manager_name || '',
              담당자연락처: serverData.manager_contact || '',
              manager_contact: serverData.manager_contact || '',
              담당자직급: serverData.manager_position || '',
              manager_position: serverData.manager_position || '',
              팩스번호: serverData.fax_number || '',
              fax_number: serverData.fax_number || '',
              이메일: serverData.email || '',
              email: serverData.email || '',
              생성일: serverData.created_at,
              등록일: serverData.created_at,
              created_at: serverData.created_at,
              수정일: serverData.updated_at,
              updated_at: serverData.updated_at,
              상태: serverData.is_active ? '활성' : '비활성',
              is_active: serverData.is_active ?? true,
              is_deleted: serverData.is_deleted ?? false,
              // 프로젝트 관리 필드
              progress_status: serverData.progress_status || null,
              진행상태: serverData.progress_status || null,
              project_year: serverData.project_year || null,
              사업진행연도: serverData.project_year || null,
              revenue_source: serverData.revenue_source || null,
              매출처: serverData.revenue_source || null,
              installation_team: serverData.installation_team || null,
              설치팀: serverData.installation_team || null,
              order_manager: serverData.order_manager || null,
              receipt_date: serverData.receipt_date || null,
              // 시스템 필드 (한글/영어 병행)
              manufacturer: serverData.manufacturer || null,
              vpn: serverData.vpn || null,
              greenlink_id: serverData.greenlink_id || null,
              그린링크ID: serverData.greenlink_id || null,
              greenlink_pw: serverData.greenlink_pw || null,
              그린링크PW: serverData.greenlink_pw || null,
              business_management_code: serverData.business_management_code || null,
              사업장관리코드: serverData.business_management_code || null,
              sales_office: serverData.sales_office || null,
              영업점: serverData.sales_office || null,
              // 측정기기 수량 필드 (한글/영어 병행)
              ph_meter: serverData.ph_meter || null,
              PH센서: serverData.ph_meter || null,
              differential_pressure_meter: serverData.differential_pressure_meter || null,
              차압계: serverData.differential_pressure_meter || null,
              temperature_meter: serverData.temperature_meter || null,
              온도계: serverData.temperature_meter || null,
              discharge_current_meter: serverData.discharge_current_meter || null,
              배출전류계: serverData.discharge_current_meter || null,
              fan_current_meter: serverData.fan_current_meter || null,
              송풍전류계: serverData.fan_current_meter || null,
              pump_current_meter: serverData.pump_current_meter || null,
              펌프전류계: serverData.pump_current_meter || null,
              gateway: serverData.gateway || null, // @deprecated
              게이트웨이: serverData.gateway || null, // @deprecated
              gateway_1_2: serverData.gateway_1_2 || null,
              '게이트웨이(1,2)': serverData.gateway_1_2 || null,
              gateway_3_4: serverData.gateway_3_4 || null,
              '게이트웨이(3,4)': serverData.gateway_3_4 || null,
              vpn_wired: serverData.vpn_wired || null,
              VPN유선: serverData.vpn_wired || null,
              vpn_wireless: serverData.vpn_wireless || null,
              VPN무선: serverData.vpn_wireless || null,
              explosion_proof_differential_pressure_meter_domestic: serverData.explosion_proof_differential_pressure_meter_domestic || null,
              방폭차압계국산: serverData.explosion_proof_differential_pressure_meter_domestic || null,
              explosion_proof_temperature_meter_domestic: serverData.explosion_proof_temperature_meter_domestic || null,
              방폭온도계국산: serverData.explosion_proof_temperature_meter_domestic || null,
              expansion_device: serverData.expansion_device || null,
              확장디바이스: serverData.expansion_device || null,
              relay_8ch: serverData.relay_8ch || null,
              중계기8채널: serverData.relay_8ch || null,
              relay_16ch: serverData.relay_16ch || null,
              중계기16채널: serverData.relay_16ch || null,
              main_board_replacement: serverData.main_board_replacement || null,
              메인보드교체: serverData.main_board_replacement || null,
              multiple_stack: serverData.multiple_stack || null,
              복수굴뚝: serverData.multiple_stack || null,
              // 계산서 및 입금 관리 필드 (보조금 사업장)
              invoice_1st_date: serverData.invoice_1st_date || null,
              invoice_1st_amount: serverData.invoice_1st_amount || null,
              payment_1st_date: serverData.payment_1st_date || null,
              payment_1st_amount: serverData.payment_1st_amount || null,
              invoice_2nd_date: serverData.invoice_2nd_date || null,
              invoice_2nd_amount: serverData.invoice_2nd_amount || null,
              payment_2nd_date: serverData.payment_2nd_date || null,
              payment_2nd_amount: serverData.payment_2nd_amount || null,
              invoice_additional_date: serverData.invoice_additional_date || null,
              payment_additional_date: serverData.payment_additional_date || null,
              payment_additional_amount: serverData.payment_additional_amount || null,
              // 계산서 및 입금 관리 필드 (자비 사업장)
              invoice_advance_date: serverData.invoice_advance_date || null,
              invoice_advance_amount: serverData.invoice_advance_amount || null,
              payment_advance_date: serverData.payment_advance_date || null,
              payment_advance_amount: serverData.payment_advance_amount || null,
              invoice_balance_date: serverData.invoice_balance_date || null,
              invoice_balance_amount: serverData.invoice_balance_amount || null,
              payment_balance_date: serverData.payment_balance_date || null,
              payment_balance_amount: serverData.payment_balance_amount || null,
              // 실사 관리 필드
              estimate_survey_manager: serverData.estimate_survey_manager || null,
              estimate_survey_date: serverData.estimate_survey_date || null,
              pre_construction_survey_manager: serverData.pre_construction_survey_manager || null,
              pre_construction_survey_date: serverData.pre_construction_survey_date || null,
              completion_survey_manager: serverData.completion_survey_manager || null,
              completion_survey_date: serverData.completion_survey_date || null,
              // 비용 정보
              additional_cost: serverData.additional_cost || null,
              survey_fee_adjustment: serverData.survey_fee_adjustment || null,
              multiple_stack_cost: serverData.multiple_stack_cost || null,
              expansion_pack: serverData.expansion_pack || null,
              other_equipment: serverData.other_equipment || null,
              negotiation: serverData.negotiation || null,
              // 기타 프로젝트 필드
              department: serverData.department || null,
              contract_document: serverData.contract_document || null,
              order_request_date: serverData.order_request_date || null,
              receipt_date: serverData.receipt_date || null,
              wireless_document: serverData.wireless_document || null,
              installation_support: serverData.installation_support || null,
              order_date: serverData.order_date || null,
              shipment_date: serverData.shipment_date || null,
              inventory_check: serverData.inventory_check || null,
              installation_date: serverData.installation_date || null,
              payment_scheduled_date: serverData.payment_scheduled_date || null,
              business_category: serverData.business_category || null,
              pollutants: serverData.pollutants || null,
              annual_emission_amount: serverData.annual_emission_amount || null,
              first_report_date: serverData.first_report_date || null,
              operation_start_date: serverData.operation_start_date || null,
              subsidy_approval_date: serverData.subsidy_approval_date || null,
              representative_birth_date: serverData.representative_birth_date || null,
              // 기존 통계 데이터 유지
              fileStats: (editingBusiness as any).fileStats
            }

            // 원자적 상태 업데이트 함수 사용 (서버 데이터 동기화)
            updateBusinessState(updatedBusiness as unknown as UnifiedBusinessInfo, editingBusiness.id);

            // 🗑️ 캐시 무효화 (서버에서 최신 데이터를 받았으므로)
            invalidateBusinessCache(editingBusiness.id);

            // ✅ [REALTIME-UPDATE] 테이블 즉시 반영 (영업점 및 모든 필드 실시간 동기화)
            await refetchBusinesses();
            console.log('✅ [REALTIME-UPDATE] allBusinesses 새로고침 완료 - 테이블 즉시 업데이트');

            // ✅ [SYNC-CHECK] 최종 동기화 완료 로깅
            console.log('✅ [SYNC-CHECK-FINAL] 서버 데이터로 최종 동기화 완료:', {
              businessId: updatedBusiness.id,
              businessName: updatedBusiness.사업장명,
              최종_상태: {
                allBusinesses에_반영됨: '✓',
                selectedBusiness에_반영됨: selectedBusiness?.id === editingBusiness.id ? '✓' : '✗',
                계산서_입금_최종값: {
                  invoice_1st_amount: updatedBusiness.invoice_1st_amount,
                  payment_1st_amount: updatedBusiness.payment_1st_amount,
                  invoice_2nd_amount: updatedBusiness.invoice_2nd_amount,
                  payment_2nd_amount: updatedBusiness.payment_2nd_amount,
                  invoice_advance_amount: updatedBusiness.invoice_advance_amount,
                  payment_advance_amount: updatedBusiness.payment_advance_amount,
                  invoice_balance_amount: updatedBusiness.invoice_balance_amount,
                  payment_balance_amount: updatedBusiness.payment_balance_amount
                }
              }
            });

            // 🔄 [AUTO-REFRESH] 서버 데이터로 selectedBusiness 항상 업데이트 후 상세 모달 열기
            setSelectedBusiness(updatedBusiness as unknown as UnifiedBusinessInfo);
            setIsDetailModalOpen(true);
          } else {
            // 새 사업장 추가의 경우: 전체 목록 새로고침
            await loadAllBusinesses()
          }
        } else {
          // API 응답에 데이터가 없는 경우 전체 새로고침
          await loadAllBusinesses()
        }
        
        // 대기필증 데이터 동기화 (편집인 경우에만)
        if (editingBusiness && finalFormData.business_type && finalFormData.business_category) {
          console.log('🔄 대기필증 데이터 동기화 시작:', {
            businessId: editingBusiness.id,
            businessType: finalFormData.business_type,
            category: finalFormData.business_category
          })
          
          await syncAirPermitData(
            editingBusiness.id,
            finalFormData.business_type,
            finalFormData.business_category
          )
          
          console.log('✅ 대기필증 데이터 동기화 완료')
        }
        
        // 상태 초기화
        setEditingBusiness(null)
        setFormData({})
        
      } else {
        // 에러 발생 시 optimistic update 롤백
        if (editingBusiness) {
          console.log('❌ API 오류로 인한 상태 롤백')
          await loadAllBusinesses()
        }
        const errorMessage = typeof result.error === 'string'
          ? result.error
          : result.message || JSON.stringify(result.error) || '저장에 실패했습니다.';
        console.error('❌ [FRONTEND] API 에러 응답:', result);
        alert(errorMessage);
      }
    } catch (error) {
      console.error('❌ [FRONTEND] 저장 오류:', error)
      // 에러 발생 시 상태 롤백
      if (editingBusiness) {
        await loadAllBusinesses()
      }
      const errorMessage = error instanceof Error ? error.message : '사업장 저장에 실패했습니다.';
      alert(errorMessage);
    } finally {
      // 제출 버튼 상태 복원
      if (submitButton) {
        submitButton.disabled = false
        submitButton.textContent = editingBusiness ? '수정하기' : '추가하기'
      }
    }
  }

  // Table configuration - 시설관리 시스템에 맞게 수정
  const columns = [
    {
      key: '사업장명' as string,
      title: '사업장명',
      width: '200px',
      render: (item: any) => (
        <button
          onClick={() => openDetailModal(item)}
          className="text-left text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {searchQuery ? highlightSearchTerm(item.사업장명 || '', searchQuery) : item.사업장명}
        </button>
      )
    },
    {
      key: '담당자명' as string,
      title: '담당자',
      width: '100px',
      render: (item: any) => (
        searchQuery ? highlightSearchTerm(item.담당자명 || '-', searchQuery) : (item.담당자명 || '-')
      )
    },
    {
      key: '담당자연락처' as string,
      title: '연락처',
      width: '110px',
      render: (item: any) => (
        searchQuery ? highlightSearchTerm(item.담당자연락처 || '-', searchQuery) : (item.담당자연락처 || '-')
      )
    },
    {
      key: 'sales_office' as string,
      title: '영업점',
      width: '90px',
      render: (item: any) => {
        const office = item.sales_office || item.영업점 || '-'

        return (
          <div className="text-center">
            {office === '-' ? (
              <span className="text-gray-400 text-xs">-</span>
            ) : (
              <span className="px-2 py-1 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                {searchQuery ? highlightSearchTerm(office, searchQuery) : office}
              </span>
            )}
          </div>
        )
      }
    },
    {
      key: 'manufacturer' as string,
      title: '제조사',
      width: '100px',
      render: (item: any) => {
        const manufacturer = item.manufacturer || '-'

        // 공백 제거 및 정규화 (띄어쓰기, 앞뒤 공백 제거)
        const normalizedManufacturer = typeof manufacturer === 'string' ? manufacturer.trim() : manufacturer

        // 제조사별 스타일 정의
        const getManufacturerStyle = (name: string) => {
          switch(name) {
            case '에코센스':
              return 'bg-emerald-50 text-emerald-700 border-emerald-200'
            case '크린어스':
              return 'bg-sky-50 text-sky-700 border-sky-200'
            case '가이아씨앤에스':
              return 'bg-violet-50 text-violet-700 border-violet-200'
            case '이브이에스':
              return 'bg-amber-50 text-amber-700 border-amber-200'
            default:
              return 'bg-gray-50 text-gray-500 border-gray-200'
          }
        }

        return (
          <div className="text-center">
            <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getManufacturerStyle(normalizedManufacturer)}`}>
              {searchQuery ? highlightSearchTerm(normalizedManufacturer, searchQuery) : normalizedManufacturer}
            </span>
          </div>
        )
      }
    },
    {
      key: '주소' as string,
      title: '주소',
      width: '210px',
      render: (item: any) => (
        <div className="truncate" title={item.주소 || item.local_government || '-'}>
          {searchQuery ? highlightSearchTerm(item.주소 || item.local_government || '-', searchQuery) : (item.주소 || item.local_government || '-')}
        </div>
      )
    },
    {
      key: 'project_year' as string,
      title: '사업 진행연도',
      width: '90px',
      render: (item: any) => {
        const projectYear = item.project_year || (item as any).사업진행연도

        return projectYear ? (
          <div className="text-center">
            <span className="px-2 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
              {projectYear}년
            </span>
          </div>
        ) : (
          <div className="text-center text-gray-400 text-xs">-</div>
        )
      }
    },
    {
      key: 'progress_status' as string,
      title: '진행구분',
      width: '100px',
      render: (item: any) => {
        const progressStatus = item.progress_status || (item as any).진행상태 || '-'

        // 공백 제거 및 정규화 (띄어쓰기, 앞뒤 공백 제거)
        const normalizedStatus = typeof progressStatus === 'string' ? progressStatus.trim() : progressStatus

        // 진행구분별 스타일 정의
        const getProgressStatusStyle = (status: string) => {
          switch(status) {
            case '자비':
              return 'bg-blue-100 text-blue-800 border-blue-200'
            case '보조금':
              return 'bg-green-100 text-green-800 border-green-200'
            case '보조금 동시진행':
              return 'bg-purple-100 text-purple-800 border-purple-200'
            case '보조금 추가승인':
              return 'bg-emerald-100 text-emerald-800 border-emerald-200'
            case '대리점':
              return 'bg-cyan-100 text-cyan-800 border-cyan-200'
            case '외주설치':
              return 'bg-indigo-100 text-indigo-800 border-indigo-200'
            case 'AS':
              return 'bg-orange-100 text-orange-800 border-orange-200'
            case '진행불가':
              return 'bg-red-100 text-red-800 border-red-200'
            case '확인필요':
              return 'bg-yellow-100 text-yellow-800 border-yellow-200'
            default:
              return 'bg-gray-100 text-gray-600 border-gray-200'
          }
        }

        return (
          <div className="text-center">
            <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getProgressStatusStyle(normalizedStatus)}`}>
              {normalizedStatus}
            </span>
          </div>
        )
      }
    },
    {
      key: 'installation_status' as string,
      title: '설치완료',
      width: '80px',
      render: (item: any) => {
        // 설치일이 있으면 완료
        const hasInstallation = !!item.installation_date

        // 진행구분이 '대리점'이고 발주일이 있으면 완료 (대리점은 발주로 모든 과정 종료)
        const isDealerComplete = item.progress_status === '대리점' && !!item.order_date

        return (
          <div className="flex justify-center items-center">
            {(hasInstallation || isDealerComplete) ? (
              <div className="flex items-center gap-1">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-600 font-medium">완료</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400">-</span>
            )}
          </div>
        )
      }
    },
    {
      key: '현재단계',
      title: '현재 단계',
      width: '120px',
      render: (item: any) => {
        const businessName = item.사업장명 || item.business_name || ''
        const taskStatus = businessTaskStatuses[businessName]

        // 로딩 중일 때
        if (isLoadingTasks && !taskStatus) {
          return (
            <div className="text-center">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                조회 중...
              </span>
              <div className="text-xs text-gray-500 mt-1">
                잠시만요
              </div>
            </div>
          )
        }

        // 업무 상태 정보가 있을 때
        if (taskStatus) {
          return (
            <div className="text-center">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${taskStatus.colorClass}`}>
                {taskStatus.statusText}
              </span>
              <div className="text-xs text-gray-500 mt-1">
                {getTaskSummary(taskStatus.taskCount, taskStatus.hasActiveTasks, taskStatus.lastUpdated)}
              </div>
            </div>
          )
        }

        // 기본값 (오류 상황)
        return (
          <div className="text-center">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              업무 미등록
            </span>
            <div className="text-xs text-gray-500 mt-1">
              등록 필요
            </div>
          </div>
        )
      }
    }
  ]

  const businessesWithId = useMemo(() =>
    filteredBusinesses.map(business => ({
      ...business,
      id: business.id
    })), [filteredBusinesses])

  // 📱 무한 스크롤: 초기 로드 및 검색/필터 변경 시 초기화
  useEffect(() => {
    if (businessesWithId.length > 0) {
      // 초기 20개만 표시
      setDisplayedBusinesses(businessesWithId.slice(0, 20))
      setCurrentIndex(20)
      setIsLoadingMore(false)
      console.log('📱 무한 스크롤 초기화:', {
        전체개수: businessesWithId.length,
        초기표시: 20,
        다음인덱스: 20
      })
    } else {
      setDisplayedBusinesses([])
      setCurrentIndex(0)
    }
  }, [businessesWithId])

  // 📱 무한 스크롤: Intersection Observer로 자동 로딩
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0]
        // 화면에 보이고, 더 로드할 데이터가 있고, 현재 로딩 중이 아닐 때
        if (target.isIntersecting && currentIndex < businessesWithId.length && !isLoadingMore) {
          console.log('📱 무한 스크롤 트리거:', {
            현재인덱스: currentIndex,
            전체개수: businessesWithId.length,
            남은개수: businessesWithId.length - currentIndex
          })

          setIsLoadingMore(true)

          // 다음 배치 로드 (약간의 딜레이로 자연스러운 로딩 효과)
          setTimeout(() => {
            const nextBatch = businessesWithId.slice(currentIndex, currentIndex + LOAD_MORE_COUNT)
            setDisplayedBusinesses(prev => [...prev, ...nextBatch])
            setCurrentIndex(prev => prev + LOAD_MORE_COUNT)
            setIsLoadingMore(false)

            console.log('📱 무한 스크롤 로드 완료:', {
              로드된개수: nextBatch.length,
              총표시개수: currentIndex + nextBatch.length,
              다음인덱스: currentIndex + LOAD_MORE_COUNT
            })
          }, 300) // 300ms 딜레이로 자연스러운 로딩
        }
      },
      {
        threshold: 0.1, // 10%만 보여도 트리거
        rootMargin: '100px' // 100px 전에 미리 로드 시작
      }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [currentIndex, businessesWithId, isLoadingMore])

  const actions = [
    {
      label: (item: UnifiedBusinessInfo) =>
        pendingDeletions.has(item.id) ? '삭제 중...' : '삭제',
      icon: Trash2,
      onClick: (item: UnifiedBusinessInfo) => {
        // 삭제 진행 중이면 클릭 무시
        if (pendingDeletions.has(item.id)) {
          return
        }
        confirmDelete(item)
      },
      variant: 'danger' as const,
      show: () => true,
      compact: true,  // 작은 버튼 스타일
      disabled: (item: UnifiedBusinessInfo) => pendingDeletions.has(item.id)
    }
  ]

  return (
    <AdminLayout
      title="사업장 관리"
      description="사업장 정보 등록 및 관리 시스템"
      actions={
        <>
          {/* 전체교체 후 사진 복원 버튼 (권한 4 이상, 데스크탑) */}
          {userPermission >= 4 && (
            <button
              onClick={handleRestorePhotos}
              disabled={isRestoringPhotos}
              className="hidden md:flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 md:px-4 md:py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium text-sm lg:text-sm disabled:opacity-50"
            >
              {isRestoringPhotos ? '복원 중...' : '사진 복원'}
            </button>
          )}

          {/* 데스크탑에서는 모든 버튼 표시 */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="hidden md:flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 md:px-4 md:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm lg:text-sm"
          >
            <Upload className="w-3 h-3 sm:w-4 sm:h-4" />
            엑셀 업로드
          </button>

          {/* 모바일과 데스크탑 모두에서 표시 - 핵심 액션 */}
          <button
            onClick={openAddModal}
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 md:px-4 md:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm lg:text-sm"
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="sm:hidden">추가</span>
            <span className="hidden sm:inline">새 사업장 추가</span>
          </button>
        </>
      }
    >
      <div className="space-y-2 sm:space-y-3 md:space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 sm:gap-1.5">
          <StatsCard
            title="올해 진행 사업장"
            value={stats.thisYear.toString()}
            icon={Calendar}
            color="blue"
            description={`${new Date().getFullYear()}년 진행 사업장`}
          />
          <StatsCard
            title="보조금 진행 사업장"
            value={stats.subsidy.toString()}
            icon={DollarSign}
            color="green"
            description="보조금 사업 진행 중"
          />
          <StatsCard
            title="자비 진행 사업장"
            value={stats.selfFunded.toString()}
            icon={Wallet}
            color="orange"
            description="자비 사업 진행 중"
          />
          <StatsCard
            title="업무 진행 사업장"
            value={stats.withTasks.toString()}
            icon={ClipboardList}
            color="purple"
            description="업무 단계가 등록된 사업장"
          />
        </div>

        {/* Business List Panel - Single Column Layout */}
        <div className="bg-white rounded-md md:rounded-xl shadow-sm border border-gray-200 max-w-full overflow-hidden">
          <div className="p-2 md:p-4 border-b border-gray-200">
            {/* 헤더 + 검색창 통합 행 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-2">
              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                <Building2 className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                <h2 className="text-sm md:text-sm lg:text-base font-semibold text-gray-900">사업장 목록</h2>
              </div>

              {/* 실시간 검색창 */}
              <div className="relative flex-1 w-full sm:w-auto">
                <div className="absolute inset-y-0 left-0 pl-2 md:pl-3 flex items-center pointer-events-none">
                  <Search className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="콤마로 구분하여 다중 검색: 청주, 보조금, 에코센스 (사업장명, 주소, 담당자, 제조사, 진행상태 등)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-7 md:pl-9 pr-7 md:pr-8 py-1.5 md:py-1.5 text-sm border border-gray-300 rounded-md md:rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-2 flex items-center"
                  >
                    <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>

              {/* 통계 + 로딩 상태 */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs sm:text-sm font-normal bg-blue-100 text-blue-800 px-2 py-1 rounded-full whitespace-nowrap">
                  {(searchQuery || filterOffices.length > 0 || filterRegions.length > 0 || filterCategories.length > 0 || filterProjectYears.length > 0 || filterCurrentSteps.length > 0) ? (
                    `필터링 ${filteredBusinesses.length}개 (전체 ${allBusinesses.length}개)`
                  ) : (
                    `전체 ${allBusinesses.length}개`
                  )}
                </span>

                {/* 검색 로딩 상태 표시 */}
                {isSearchLoading && (
                  <div className="flex items-center gap-1 text-sm text-blue-600">
                    <div className="animate-spin rounded-full h-3 w-3 border border-blue-600 border-t-transparent"></div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 md:space-y-2">

              {/* 검색 태그 표시 */}
              {searchTerms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 md:gap-2 mt-2">
                  <span className="text-sm text-gray-600 font-medium">활성 필터:</span>
                  {searchTerms.map((term, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 md:px-3 py-0.5 md:py-1 rounded-full text-sm font-medium text-blue-700 bg-blue-100 border border-blue-200"
                    >
                      {term}
                      <button
                        onClick={() => {
                          const newTerms = searchTerms.filter((_, i) => i !== index)
                          setSearchQuery(newTerms.join(', '))
                        }}
                        className="ml-2 text-blue-500 hover:text-blue-700"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <span className="text-sm text-gray-500">
                    총 {filteredBusinesses.length}개 사업장
                  </span>
                </div>
              )}

              {/* 필터 드롭다운 - 헤더와 입력창 통합 행 */}
              <div className="mt-2 md:mt-2 pt-2 md:pt-2 border-t border-gray-200">
                {/* 필터 헤더: 라벨 + 토글 버튼 + 초기화 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-gray-700">필터</span>
                    {/* 모바일에서만 토글 버튼 표시 */}
                    {isMobile && (
                      <button
                        onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                        className="ml-1 text-gray-500 hover:text-gray-700 transition-colors"
                        aria-label={isFilterExpanded ? '필터 접기' : '필터 펼치기'}
                      >
                        {isFilterExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* 초기화 버튼 */}
                  {(filterOffices.length > 0 || filterRegions.length > 0 || filterCategories.length > 0 || filterProjectYears.length > 0 || filterCurrentSteps.length > 0) && (
                    <button
                      onClick={() => {
                        setFilterOffices([])
                        setFilterRegions([])
                        setFilterCategories([])
                        setFilterProjectYears([])
                        setFilterCurrentSteps([])
                      }}
                      className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      초기화
                    </button>
                  )}
                </div>

                {/* 필터 입력창들 - 접기/펼치기 애니메이션 */}
                <div
                  className={`
                    grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2
                    transition-all duration-300 ease-in-out
                    ${(!isMobile || isFilterExpanded) ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}
                  `}
                >
                  <MultiSelectDropdown
                    label="영업점"
                    options={filterOptions.offices}
                    selectedValues={filterOffices}
                    onChange={setFilterOffices}
                    placeholder="전체"
                    inline
                  />

                  <MultiSelectDropdown
                    label="지역"
                    options={filterOptions.regions}
                    selectedValues={filterRegions}
                    onChange={setFilterRegions}
                    placeholder="전체"
                    inline
                  />

                  <MultiSelectDropdown
                    label="진행구분"
                    options={filterOptions.categories}
                    selectedValues={filterCategories}
                    onChange={setFilterCategories}
                    placeholder="전체"
                    inline
                  />

                  <MultiSelectDropdown
                    label="사업 진행 연도"
                    options={filterOptions.years.map(year => `${year}년`)}
                    selectedValues={filterProjectYears}
                    onChange={setFilterProjectYears}
                    placeholder="전체"
                    inline
                  />

                  <MultiSelectDropdown
                    label="현재 단계"
                    options={filterOptions.currentSteps}
                    selectedValues={filterCurrentSteps}
                    onChange={setFilterCurrentSteps}
                    placeholder="전체"
                    inline
                  />
                </div>

                {/* 상세 필터 (제출일 + 설치완료) */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-blue-600" />
                      <h4 className="text-sm md:text-sm font-semibold text-gray-800">상세 필터</h4>
                      <button
                        onClick={() => setIsSubmissionFilterExpanded(!isSubmissionFilterExpanded)}
                        className="ml-1 text-gray-500 hover:text-gray-700 transition-colors"
                        aria-label={isSubmissionFilterExpanded ? '필터 접기' : '필터 펼치기'}
                      >
                        {isSubmissionFilterExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {hasActiveSubmissionFilter && (
                      <button
                        onClick={clearSubmissionFilters}
                        className="text-xs md:text-sm text-gray-600 hover:text-red-600 font-medium transition-colors"
                      >
                        초기화 ✕
                      </button>
                    )}
                  </div>

                  {/* 상세 필터 버튼들 (접기/펼치기 애니메이션) */}
                  <div className={`space-y-2 transition-all duration-300 overflow-hidden ${
                    isSubmissionFilterExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {/* 발주일 */}
                    <button
                      onClick={() => toggleSubmissionFilter('order_date')}
                      className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        submissionDateFilters.order_date === true
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : submissionDateFilters.order_date === false
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 hover:border-blue-300 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {submissionDateFilters.order_date === true && <span className="text-blue-500 font-bold text-xs">✓</span>}
                        {submissionDateFilters.order_date === false && <span className="text-orange-500 font-bold text-xs">✕</span>}
                        {submissionDateFilters.order_date === null && <div className="w-3 h-3 rounded-full bg-gray-300" />}
                        발주일
                      </div>
                    </button>

                    {/* 착공신고서 */}
                    <button
                      onClick={() => toggleSubmissionFilter('construction_report')}
                      className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        submissionDateFilters.construction_report === true
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : submissionDateFilters.construction_report === false
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 hover:border-blue-300 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {submissionDateFilters.construction_report === true && <span className="text-blue-500 font-bold text-xs">✓</span>}
                        {submissionDateFilters.construction_report === false && <span className="text-orange-500 font-bold text-xs">✕</span>}
                        {submissionDateFilters.construction_report === null && <div className="w-3 h-3 rounded-full bg-gray-300" />}
                        착공신고서
                      </div>
                    </button>

                    {/* 그린링크 */}
                    <button
                      onClick={() => toggleSubmissionFilter('greenlink_confirmation')}
                      className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        submissionDateFilters.greenlink_confirmation === true
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : submissionDateFilters.greenlink_confirmation === false
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 hover:border-blue-300 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {submissionDateFilters.greenlink_confirmation === true && <span className="text-blue-500 font-bold text-xs">✓</span>}
                        {submissionDateFilters.greenlink_confirmation === false && <span className="text-orange-500 font-bold text-xs">✕</span>}
                        {submissionDateFilters.greenlink_confirmation === null && <div className="w-3 h-3 rounded-full bg-gray-300" />}
                        그린링크
                      </div>
                    </button>

                    {/* 부착완료 */}
                    <button
                      onClick={() => toggleSubmissionFilter('attachment_completion')}
                      className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        submissionDateFilters.attachment_completion === true
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : submissionDateFilters.attachment_completion === false
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 hover:border-blue-300 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {submissionDateFilters.attachment_completion === true && <span className="text-blue-500 font-bold text-xs">✓</span>}
                        {submissionDateFilters.attachment_completion === false && <span className="text-orange-500 font-bold text-xs">✕</span>}
                        {submissionDateFilters.attachment_completion === null && <div className="w-3 h-3 rounded-full bg-gray-300" />}
                        부착완료
                      </div>
                    </button>

                    {/* 설치완료 */}
                    <button
                      onClick={() => toggleSubmissionFilter('installation_complete')}
                      className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        submissionDateFilters.installation_complete === true
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : submissionDateFilters.installation_complete === false
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 hover:border-green-300 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {submissionDateFilters.installation_complete === true && <span className="text-green-500 font-bold text-xs">✓</span>}
                        {submissionDateFilters.installation_complete === false && <span className="text-orange-500 font-bold text-xs">✕</span>}
                        {submissionDateFilters.installation_complete === null && <div className="w-3 h-3 rounded-full bg-gray-300" />}
                        설치완료
                      </div>
                    </button>
                    </div>
                    {/* 범례 */}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-gray-300 inline-block" /> 비활성</span>
                      <span className="flex items-center gap-1 text-blue-500">✓ 있음</span>
                      <span className="flex items-center gap-1 text-orange-500">✕ 없음</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Data Table - Desktop Only */}
          <div className="hidden md:block p-2 md:p-6 overflow-x-auto">
            <div className="min-w-[1090px]">
              <DataTable
                key={`datatable-${filteredBusinesses.length}`}
                data={businessesWithId}
                columns={columns}
                actions={actions}
                loading={isLoading}
                emptyMessage="등록된 사업장이 없습니다."
                searchable={false}
                pageSize={8}
                onPageChange={handlePageChange}
              />
            </div>
          </div>

          {/* Card List - Mobile Only */}
          <div className="md:hidden p-2">
            <BusinessCardList
              businesses={displayedBusinesses}
              onBusinessClick={openDetailModal}
              onBusinessDelete={confirmDelete}
              taskStatuses={businessTaskStatuses}
              isLoading={isLoading}
              searchQuery={searchQuery}
              highlightSearchTerm={highlightSearchTerm}
            />

            {/* 무한 스크롤: 로딩 인디케이터 */}
            {!isLoading && displayedBusinesses.length > 0 && currentIndex < businessesWithId.length && (
              <div
                ref={loadMoreRef}
                className="flex items-center justify-center py-4 mt-4"
              >
                {isLoadingMore ? (
                  <div className="flex items-center gap-2 text-blue-600">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-medium">로딩 중...</span>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">
                    스크롤하여 더보기
                  </div>
                )}
              </div>
            )}

            {/* 무한 스크롤: 모두 로드됨 메시지 */}
            {!isLoading && displayedBusinesses.length > 0 && currentIndex >= businessesWithId.length && (
              <div className="flex flex-col items-center justify-center py-6 mt-4 border-t border-gray-200">
                <div className="text-sm text-gray-500 font-medium mb-1">
                  모든 사업장을 표시했습니다
                </div>
                <div className="text-xs text-gray-400">
                  총 {businessesWithId.length}개의 사업장
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* Business Detail Modal - Enhanced Design (Lazy Loaded) */}
      {isDetailModalOpen && selectedBusiness && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="text-white">로딩 중...</div></div>}>
          <BusinessDetailModal
            isOpen={isDetailModalOpen}
            business={selectedBusiness}
            onClose={() => {
              // ✨ 복귀 로직: 다른 페이지에서 왔을 경우 돌아가기
              if (returnPath === 'tasks' && returnTaskId) {
                router.push(`/admin/tasks?openModal=${returnTaskId}`)
                setReturnPath(null)
                setReturnTaskId(null)
              } else if (returnPath === '/admin/revenue' || returnPath === 'revenue') {
                // Revenue 페이지로 복귀
                router.push('/admin/revenue')
                setReturnPath(null)
              } else {
                // 기본 동작: 모달만 닫기
                setIsDetailModalOpen(false)
              }
            }}
            onEdit={openEditModal}
            isAddingMemo={isAddingMemo}
            setIsAddingMemo={setIsAddingMemo}
            businessMemos={businessMemos}
            businessTasks={businessTasks}
            getIntegratedItems={getIntegratedItems}
            canDeleteAutoMemos={canDeleteAutoMemos}
            startEditMemo={startEditMemo}
            handleDeleteMemo={handleDeleteMemo}
            editingMemo={editingMemo}
            setEditingMemo={setEditingMemo}
            memoForm={memoForm}
            setMemoForm={setMemoForm}
            handleAddMemo={handleAddMemo}
            handleEditMemo={handleEditMemo}
            getStatusColor={getStatusColor}
            getStatusDisplayName={getStatusDisplayName}
            facilityDeviceCounts={facilityDeviceCounts}
            facilityLoading={facilityLoading}
            facilityData={facilityData}
            airPermitData={airPermitData}
            setSelectedRevenueBusiness={setSelectedRevenueBusiness}
            setShowRevenueModal={setShowRevenueModal}
            mapCategoryToInvoiceType={mapCategoryToInvoiceType}
            onFacilityUpdate={handleFacilityUpdate}
          />
        </Suspense>
      )}

      {/* Add/Edit Business Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50"
        >
          <div className="bg-white rounded-lg sm:rounded-xl md:rounded-2xl shadow-2xl max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-7xl w-full max-h-[90vh] sm:max-h-[90vh] overflow-hidden">
            <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-white bg-opacity-20 rounded-lg sm:rounded-xl flex items-center justify-center mr-2 sm:mr-3 md:mr-4">
                    <Edit className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-white" />
                  </div>
                  <h2 className="text-sm sm:text-base md:text-base lg:text-lg xl:text-lg font-bold">
                    {editingBusiness ? '사업장 정보 수정' : '새 사업장 추가'}
                  </h2>
                </div>
                {/* Action Buttons */}
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <button
                    type="submit"
                    form="business-form"
                    className="flex items-center px-2 sm:px-3 py-1 sm:py-2 bg-white bg-opacity-20 text-white rounded-md sm:rounded-lg hover:bg-opacity-30 transition-all duration-200 text-sm font-medium border border-white border-opacity-30 hover:border-opacity-50"
                  >
                    <Save className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    <span className="hidden sm:inline">{editingBusiness ? '수정완료' : '추가완료'}</span>
                    <span className="sm:hidden">{editingBusiness ? '수정' : '추가'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleReturnToSource}
                    className="flex items-center px-2 sm:px-3 py-1 sm:py-2 bg-white bg-opacity-20 text-white rounded-md sm:rounded-lg hover:bg-opacity-30 transition-all duration-200 text-sm font-medium border border-white border-opacity-30 hover:border-opacity-50"
                    title={(returnPath === 'revenue' || returnPath === '/admin/revenue') ? '매출 관리로 돌아가기' : '취소'}

                  >
                    <X className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    <span className="hidden sm:inline">{(returnPath === 'revenue' || returnPath === '/admin/revenue') ? '돌아가기' : '취소'}</span>
                    <span className="sm:hidden">✕</span>
                  </button>
                </div>
              </div>
            </div>
            
            <form id="business-form" onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-5 lg:p-6 max-h-[70vh] sm:max-h-[75vh] md:max-h-[80vh] overflow-y-auto">
              <div className="space-y-4 sm:space-y-5 md:space-y-6">
                {/* 기본 정보 */}
                <div>
                  <div className="flex items-center mb-2 sm:mb-3 md:mb-4">
                    <div className="w-6 h-6 sm:w-6 sm:h-6 md:w-7 md:h-7 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center mr-2 sm:mr-2 md:mr-2.5">
                      <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">기본 정보</h3>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">사업장명 *</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.business_name || ''}
                        onChange={(e) => setFormData({...formData, business_name: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">지자체</label>
                      <div className="relative">
                        <input
                          type="text"
                          lang="ko"
                          inputMode="text"
                          value={formData.local_government || ''}
                          onChange={(e) => {
                            const value = e.target.value
                            setFormData({...formData, local_government: value})
                            
                            if (value.length > 0) {
                              const suggestions = KOREAN_LOCAL_GOVERNMENTS.filter(gov => 
                                gov.toLowerCase().includes(value.toLowerCase())
                              ).slice(0, 5)
                              setLocalGovSuggestions(suggestions)
                              setShowLocalGovSuggestions(true)
                            } else {
                              setShowLocalGovSuggestions(false)
                            }
                          }}
                          className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="예: 서울특별시, 부산광역시..."
                        />
                        
                        {showLocalGovSuggestions && localGovSuggestions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                            {localGovSuggestions.map((gov, index) => (
                              <button
                                key={index}
                                type="button"
                                onClick={() => {
                                  setFormData({...formData, local_government: gov})
                                  setShowLocalGovSuggestions(false)
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
                              >
                                {gov}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.address || ''}
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">대표자명</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.representative_name || ''}
                        onChange={(e) => setFormData({...formData, representative_name: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">사업자등록번호</label>
                      <input
                        type="text"
                        value={formData.business_registration_number || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '')
                          let formatted = value
                          if (value.length >= 3 && value.length <= 5) {
                            formatted = `${value.slice(0, 3)}-${value.slice(3)}`
                          } else if (value.length > 5) {
                            formatted = `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5, 10)}`
                          }
                          setFormData({...formData, business_registration_number: formatted})
                        }}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="000-00-00000"
                        maxLength={12}
                      />
                    </div>
                    </div>
                  </div>
                </div>

                {/* 담당자 정보 */}
                <div>
                  <div className="flex items-center mb-3 sm:mb-4 md:mb-6">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center mr-2 sm:mr-2.5 md:mr-3">
                      <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">담당자 정보</h3>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">담당자명</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.manager_name || ''}
                        onChange={(e) => setFormData({...formData, manager_name: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="김태훈"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">직급</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.manager_position || ''}
                        onChange={(e) => setFormData({...formData, manager_position: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="팀장"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">담당자 연락처</label>
                      <input
                        type="tel"
                        value={formData.manager_contact || ''}
                        onChange={(e) => {
                          const formatted = formatMobilePhone(e.target.value)
                          setFormData({...formData, manager_contact: formatted})
                        }}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="010-1234-5678"
                        maxLength={13}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">사업장 연락처</label>
                      <input
                        type="tel"
                        value={formData.business_contact || ''}
                        onChange={(e) => {
                          const formatted = formatLandlinePhone(e.target.value)
                          setFormData({...formData, business_contact: formatted})
                        }}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="02-000-0000"
                        maxLength={13}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">팩스번호</label>
                      <input
                        type="tel"
                        value={formData.fax_number || ''}
                        onChange={(e) => {
                          const formatted = formatLandlinePhone(e.target.value)
                          setFormData({...formData, fax_number: formatted})
                        }}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="02-000-0000"
                        maxLength={13}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="example@company.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">대표자생년월일</label>
                      <DateInput
                        value={formData.representative_birth_date || ''}
                        onChange={(value) => setFormData({...formData, representative_birth_date: value})}
                        className="w-full"
                      />
                    </div>
                    </div>
                  </div>
                </div>

                {/* 사업장 정보 */}
                <div>
                  <div className="flex items-center mb-3 sm:mb-4 md:mb-6">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center mr-2 sm:mr-2.5 md:mr-3">
                      <Briefcase className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">사업장 정보</h3>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-3 md:p-4">
                    {/* 대기필증 연동 정보 안내 */}
                    {airPermitLoading ? (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                        <div className="text-sm text-blue-700">대기필증 정보 로딩 중...</div>
                      </div>
                    </div>
                  ) : airPermitData && airPermitData.permits.length > 0 ? (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-sm text-blue-800 font-medium mb-1">✓ 대기필증 정보 연동됨</div>
                      <div className="text-xs text-blue-600">
                        업종과 종별이 대기필증 정보({airPermitData.permits.length}개)와 동기화됩니다.
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="text-sm text-gray-700 font-medium mb-1">대기필증 미등록</div>
                      <div className="text-xs text-gray-600">
                        대기필증이 등록되면 업종과 종별 정보가 자동으로 연동됩니다.
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        업종
                        {airPermitData?.business_type && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            대기필증 연동
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.business_type || airPermitData?.business_type || ''}
                        onChange={(e) => setFormData({...formData, business_type: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="예: 제조업, 서비스업..."
                      />
                      {airPermitData?.business_type && airPermitData.business_type !== (formData.business_type || '') && (
                        <div className="text-xs text-blue-600 mt-1">
                          대기필증 정보: {airPermitData.business_type}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        종별
                        {airPermitData?.category && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            대기필증 연동
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.business_category || airPermitData?.category || ''}
                        onChange={(e) => setFormData({...formData, business_category: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="사업 종별"
                      />
                      {airPermitData?.category && airPermitData.category !== (formData.business_category || '') && (
                        <div className="text-xs text-blue-600 mt-1">
                          대기필증 정보: {airPermitData.category}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">담당부서</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.department || ''}
                        onChange={(e) => setFormData({...formData, department: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="담당부서명"
                      />
                    </div>

                    </div>
                  </div>
                </div>

                {/* 프로젝트 관리 */}
                <div>
                  <div className="flex items-center mb-2 sm:mb-3 md:mb-4">
                    <div className="w-6 h-6 sm:w-6 sm:h-6 md:w-7 md:h-7 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mr-2 sm:mr-2.5 md:mr-3">
                      <ClipboardList className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">프로젝트 관리</h3>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">진행구분</label>
                      <select
                        value={formData.progress_status || ''}
                        onChange={(e) => setFormData({...formData, progress_status: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">선택하세요</option>
                        <option value="자비">자비</option>
                        <option value="보조금">보조금</option>
                        <option value="보조금 동시진행">보조금 동시진행</option>
                        <option value="보조금 추가승인">보조금 추가승인</option>
                        <option value="대리점">대리점</option>
                        <option value="외주설치">외주설치</option>
                        <option value="AS">AS</option>
                        <option value="진행불가">진행불가</option>
                        <option value="확인필요">확인필요</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">사업 진행연도</label>
                      <input
                        type="number"
                        min="2020"
                        max="2050"
                        value={formData.project_year || ''}
                        onChange={(e) => setFormData({...formData, project_year: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="예: 2024"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">설치팀</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.installation_team || ''}
                        onChange={(e) => setFormData({...formData, installation_team: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="설치 담당팀"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">발주담당</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.order_manager || ''}
                        onChange={(e) => setFormData({...formData, order_manager: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="발주 담당자명"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">매출처</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.revenue_source || ''}
                        onChange={(e) => setFormData({...formData, revenue_source: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="계산서 발행 대상"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">접수일</label>
                      <DateInput
                        value={formData.receipt_date || ''}
                        onChange={(value) => setFormData({...formData, receipt_date: value || null})}
                      />
                    </div>
                    </div>
                  </div>
                </div>

                {/* 일정 관리 */}
                <div>
                  <div className="flex items-center mb-2 sm:mb-3 md:mb-4">
                    <div className="w-6 h-6 sm:w-6 sm:h-6 md:w-7 md:h-7 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mr-2 sm:mr-2.5 md:mr-3">
                      <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">일정 관리</h3>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">보조금 승인일</label>
                      <DateInput
                        value={formData.subsidy_approval_date || ''}
                        onChange={(value) => setFormData({...formData, subsidy_approval_date: value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">계약서 발송일</label>
                      <DateInput
                        value={formData.contract_sent_date || ''}
                        onChange={(value) => setFormData({...formData, contract_sent_date: value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">발주일</label>
                      <DateInput
                        value={formData.order_date || ''}
                        onChange={(value) => setFormData({...formData, order_date: value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">출고일</label>
                      <DateInput
                        value={formData.shipment_date || ''}
                        onChange={(value) => setFormData({...formData, shipment_date: value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">설치일</label>
                      <DateInput
                        value={formData.installation_date || ''}
                        onChange={(value) => setFormData({...formData, installation_date: value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">입금예정일</label>
                      <DateInput
                        value={formData.payment_scheduled_date || ''}
                        onChange={(value) => setFormData({...formData, payment_scheduled_date: value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">착공신고서 제출일</label>
                      <DateInput
                        value={formData.construction_report_submitted_at || ''}
                        onChange={(value) => setFormData({...formData, construction_report_submitted_at: value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">그린링크 전송확인서 제출일</label>
                      <DateInput
                        value={formData.greenlink_confirmation_submitted_at || ''}
                        onChange={(value) => setFormData({...formData, greenlink_confirmation_submitted_at: value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">부착완료통보서 제출일</label>
                      <DateInput
                        value={formData.attachment_completion_submitted_at || ''}
                        onChange={(value) => setFormData({...formData, attachment_completion_submitted_at: value})}
                      />
                    </div>

                    </div>
                  </div>
                </div>

                {/* 실사 관리 */}
                <div>
                  <div className="flex items-center mb-2 sm:mb-3 md:mb-4">
                    <div className="w-6 h-6 sm:w-6 sm:h-6 md:w-7 md:h-7 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center mr-2 sm:mr-2.5 md:mr-3">
                      <FileCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">실사 관리</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                    {/* 견적실사 */}
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-3">
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-2">견적실사</h4>
                      <div className="space-y-2 sm:space-y-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
                          <input
                            type="text"
                            value={formData.estimate_survey_manager || ''}
                            onChange={(e) => setFormData({...formData, estimate_survey_manager: e.target.value})}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-[10px] sm:text-xs"
                            placeholder="담당자명"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">실사일</label>
                          <DateInput
                            value={formData.estimate_survey_date || ''}
                            onChange={(value) => setFormData({...formData, estimate_survey_date: value})}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">시작 시간</label>
                            <input
                              type="time"
                              value={formData.estimate_survey_start_time || ''}
                              onChange={(e) => setFormData({...formData, estimate_survey_start_time: e.target.value})}
                              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-[10px] sm:text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">종료 시간</label>
                            <input
                              type="time"
                              value={formData.estimate_survey_end_time || ''}
                              onChange={(e) => setFormData({...formData, estimate_survey_end_time: e.target.value})}
                              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-[10px] sm:text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 착공전실사 */}
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-3">
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-2">착공전실사</h4>
                      <div className="space-y-2 sm:space-y-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
                          <input
                            type="text"
                            value={formData.pre_construction_survey_manager || ''}
                            onChange={(e) => setFormData({...formData, pre_construction_survey_manager: e.target.value})}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-[10px] sm:text-xs"
                            placeholder="담당자명"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">실사일</label>
                          <DateInput
                            value={formData.pre_construction_survey_date || ''}
                            onChange={(value) => setFormData({...formData, pre_construction_survey_date: value})}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">시작 시간</label>
                            <input
                              type="time"
                              value={formData.pre_construction_survey_start_time || ''}
                              onChange={(e) => setFormData({...formData, pre_construction_survey_start_time: e.target.value})}
                              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-[10px] sm:text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">종료 시간</label>
                            <input
                              type="time"
                              value={formData.pre_construction_survey_end_time || ''}
                              onChange={(e) => setFormData({...formData, pre_construction_survey_end_time: e.target.value})}
                              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-[10px] sm:text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 준공실사 */}
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-3">
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-2">준공실사</h4>
                      <div className="space-y-2 sm:space-y-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
                          <input
                            type="text"
                            value={formData.completion_survey_manager || ''}
                            onChange={(e) => setFormData({...formData, completion_survey_manager: e.target.value})}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-[10px] sm:text-xs"
                            placeholder="담당자명"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">실사일</label>
                          <DateInput
                            value={formData.completion_survey_date || ''}
                            onChange={(value) => setFormData({...formData, completion_survey_date: value})}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">시작 시간</label>
                            <input
                              type="time"
                              value={formData.completion_survey_start_time || ''}
                              onChange={(e) => setFormData({...formData, completion_survey_start_time: e.target.value})}
                              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-[10px] sm:text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">종료 시간</label>
                            <input
                              type="time"
                              value={formData.completion_survey_end_time || ''}
                              onChange={(e) => setFormData({...formData, completion_survey_end_time: e.target.value})}
                              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 text-[10px] sm:text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 시스템 정보 */}
                <div>
                  <div className="flex items-center mb-2 sm:mb-3 md:mb-4">
                    <div className="w-6 h-6 sm:w-6 sm:h-6 md:w-7 md:h-7 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mr-2 sm:mr-2.5 md:mr-3">
                      <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">시스템 정보</h3>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">제조사</label>
                      <select
                        value={formData.manufacturer || ''}
                        onChange={(e) => setFormData({...formData, manufacturer: (e.target.value || null) as '에코센스' | '크린어스' | '가이아씨앤에스' | '이브이에스' | null})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">선택하세요</option>
                        <option value="에코센스">에코센스</option>
                        <option value="크린어스">크린어스</option>
                        <option value="가이아씨앤에스">가이아씨앤에스</option>
                        <option value="이브이에스">이브이에스</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">VPN 연결</label>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white flex items-center gap-4">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(formData.vpn_wired || 0) > 0}
                            onChange={(e) => {
                              const newValue = e.target.checked ? 1 : 0;
                              setFormData({...formData, vpn_wired: newValue});
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">🔗 유선</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(formData.vpn_wireless || 0) > 0}
                            onChange={(e) => {
                              const newValue = e.target.checked ? 1 : 0;
                              setFormData({...formData, vpn_wireless: newValue});
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">📶 무선</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">그린링크 ID</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.greenlink_id || ''}
                        onChange={(e) => setFormData({...formData, greenlink_id: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">그린링크 PW</label>
                      <input
                        type="text"
                        lang="ko"
                        inputMode="text"
                        value={formData.greenlink_pw || ''}
                        onChange={(e) => setFormData({...formData, greenlink_pw: e.target.value})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">사업장관리코드</label>
                      <input
                        type="number"
                        value={formData.business_management_code || ''}
                        onChange={(e) => setFormData({...formData, business_management_code: parseInt(e.target.value) || 0})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">영업점</label>
                      <AutocompleteInput
                        value={formData.sales_office || ''}
                        onChange={(value) => setFormData({...formData, sales_office: value})}
                        options={salesOfficeList}
                        placeholder="영업점 선택 또는 입력"
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={salesOfficeLoading}
                      />
                    </div>
                    </div>
                  </div>
                </div>

                {/* 장비 수량 */}
                <div>
                  <div className="flex items-center mb-2 sm:mb-3">
                    <div className="p-1.5 sm:p-2 bg-purple-600 rounded-lg mr-2 sm:mr-3">
                      <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm lg:text-sm font-semibold text-gray-800">측정기기</h3>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-3 md:p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">PH센서</label>
                      <input
                        type="number"
                        value={formData.ph_meter ?? ''}
                        onChange={(e) => setFormData({...formData, ph_meter: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">차압계</label>
                      <input
                        type="number"
                        value={formData.differential_pressure_meter ?? ''}
                        onChange={(e) => setFormData({...formData, differential_pressure_meter: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">온도계</label>
                      <input
                        type="number"
                        value={formData.temperature_meter ?? ''}
                        onChange={(e) => setFormData({...formData, temperature_meter: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">배출전류계</label>
                      <input
                        type="number"
                        value={formData.discharge_current_meter ?? ''}
                        onChange={(e) => setFormData({...formData, discharge_current_meter: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">송풍전류계</label>
                      <input
                        type="number"
                        value={formData.fan_current_meter ?? ''}
                        onChange={(e) => setFormData({...formData, fan_current_meter: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">펌프전류계</label>
                      <input
                        type="number"
                        value={formData.pump_current_meter ?? ''}
                        onChange={(e) => setFormData({...formData, pump_current_meter: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">게이트웨이(1,2)</label>
                      <input
                        type="number"
                        value={formData.gateway_1_2 ?? ''}
                        onChange={(e) => setFormData({...formData, gateway_1_2: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">게이트웨이(3,4)</label>
                      <input
                        type="number"
                        value={formData.gateway_3_4 ?? ''}
                        onChange={(e) => setFormData({...formData, gateway_3_4: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">VPN(유선)</label>
                      <input
                        type="number"
                        value={formData.vpn_wired ?? ''}
                        onChange={(e) => setFormData({...formData, vpn_wired: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">VPN(무선)</label>
                      <input
                        type="number"
                        value={formData.vpn_wireless ?? ''}
                        onChange={(e) => setFormData({...formData, vpn_wireless: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">방폭차압계(국산)</label>
                      <input
                        type="number"
                        value={formData.explosion_proof_differential_pressure_meter_domestic ?? ''}
                        onChange={(e) => setFormData({...formData, explosion_proof_differential_pressure_meter_domestic: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">방폭온도계(국산)</label>
                      <input
                        type="number"
                        value={formData.explosion_proof_temperature_meter_domestic ?? ''}
                        onChange={(e) => setFormData({...formData, explosion_proof_temperature_meter_domestic: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">확장디바이스</label>
                      <input
                        type="number"
                        value={formData.expansion_device ?? ''}
                        onChange={(e) => setFormData({...formData, expansion_device: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">중계기(8채널)</label>
                      <input
                        type="number"
                        value={formData.relay_8ch ?? ''}
                        onChange={(e) => setFormData({...formData, relay_8ch: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">중계기(16채널)</label>
                      <input
                        type="number"
                        value={formData.relay_16ch ?? ''}
                        onChange={(e) => setFormData({...formData, relay_16ch: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">메인보드교체</label>
                      <input
                        type="number"
                        value={formData.main_board_replacement ?? ''}
                        onChange={(e) => setFormData({...formData, main_board_replacement: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">복수굴뚝</label>
                      <input
                        type="number"
                        value={formData.multiple_stack ?? ''}
                        onChange={(e) => setFormData({...formData, multiple_stack: e.target.value ? parseInt(e.target.value) : null})}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    </div>
                  </div>
                </div>

                {/* 비용 정보 */}
                <div>
                  <div className="flex items-center mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 bg-yellow-600 rounded-lg mr-2 sm:mr-3">
                      <Database className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm lg:text-sm font-semibold text-gray-800">비용 정보</h3>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-4 md:p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">추가공사비 (원)</label>
                      <input
                        type="text"
                        value={formData.additional_cost ? parseInt(formData.additional_cost).toLocaleString() : ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/,/g, '');
                          setFormData({...formData, additional_cost: value ? parseInt(value) : null});
                        }}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        placeholder="매출에 추가될 금액 (예: 500,000)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        추가설치비 (원)
                        <span className="ml-1 text-[9px] sm:text-[10px] text-gray-500">(설치팀 요청 추가 비용)</span>
                      </label>
                      <input
                        type="text"
                        value={formData.installation_extra_cost ? formData.installation_extra_cost.toLocaleString() : ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/,/g, '');
                          setFormData({...formData, installation_extra_cost: value ? parseInt(value) : null});
                        }}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        placeholder="순이익에서 차감될 금액 (예: 300,000)"
                      />
                      <p className="mt-0.5 sm:mt-1 text-[8px] sm:text-[9px] md:text-[10px] text-orange-600">
                        💡 기본 공사비로 충당 불가능한 추가 설치 비용
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">협의사항 (할인 금액, 원)</label>
                      <input
                        type="text"
                        value={formData.negotiation ? parseInt(formData.negotiation).toLocaleString() : ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/,/g, '');
                          setFormData({...formData, negotiation: value});
                        }}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        placeholder="매출에서 차감될 금액 (예: 100,000)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        실사비 조정 (원)
                        <span className="ml-1 text-[9px] sm:text-[10px] text-gray-500">(기본 100,000원 기준 ±조정)</span>
                      </label>
                      <input
                        type="text"
                        value={formData.survey_fee_adjustment !== null && formData.survey_fee_adjustment !== undefined
                          ? formData.survey_fee_adjustment.toLocaleString()
                          : ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/,/g, '').trim();
                          // 빈 값이면 null
                          if (value === '' || value === '-') {
                            setFormData({...formData, survey_fee_adjustment: null});
                            return;
                          }
                          // 숫자와 음수 기호만 허용 (정규식으로 검증)
                          if (!/^-?\d+$/.test(value)) {
                            return; // 유효하지 않은 입력은 무시
                          }
                          const numValue = parseInt(value, 10);
                          setFormData({...formData, survey_fee_adjustment: isNaN(numValue) ? null : numValue});
                        }}
                        className="w-full px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        placeholder="실사비 조정 금액 (예: -50,000 또는 50,000)"
                      />
                      <p className="mt-0.5 sm:mt-1 text-[8px] sm:text-[9px] md:text-[10px] text-purple-600">
                        💡 양수(+)는 실사비 증가, 음수(-)는 실사비 감소
                      </p>
                    </div>
                    </div>
                  </div>
                </div>

                {/* 계산서 및 입금 정보 - InvoiceTabSection */}
                {editingBusiness && formData.progress_status && (() => {
                  return (
                    <div>
                      <div className="flex items-center mb-3 sm:mb-4">
                        <div className="p-1.5 sm:p-2 bg-purple-600 rounded-lg mr-2 sm:mr-3">
                          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        </div>
                        <h3 className="text-sm lg:text-sm font-semibold text-gray-800">
                          계산서 및 입금 정보 ({formData.progress_status})
                        </h3>
                      </div>
                      <InvoiceTabSection
                        ref={invoiceTabRef}
                        businessId={editingBusiness.id}
                        progressStatus={formData.progress_status}
                        userPermission={userPermission}
                      />
                    </div>
                  );
                })()}

                {/* 상태 설정 */}
                <div>
                  <div className="flex items-center mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 bg-green-600 rounded-lg mr-2 sm:mr-3">
                      <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm lg:text-sm font-semibold text-gray-800">상태 설정</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">활성 상태</label>
                      <select
                        value={formData.is_active ? 'true' : 'false'}
                        onChange={(e) => setFormData({...formData, is_active: e.target.value === 'true'})}
                        className="w-full px-2 sm:px-2.5 py-1.5 sm:py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="true">활성</option>
                        <option value="false">비활성</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}


      {/* Delete Confirmation Modal - Lazy loaded */}
      {deleteConfirmOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50" />}>
          <ConfirmModal
            isOpen={deleteConfirmOpen}
            onClose={() => {
              setDeleteConfirmOpen(false)
              setBusinessToDelete(null)
            }}
            onConfirm={handleDelete}
            title="사업장 삭제 확인"
            message={`'${businessToDelete?.business_name}' 사업장을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
            confirmText="삭제"
            cancelText="취소"
            variant="danger"
          />
        </Suspense>
      )}

      {/* Excel Upload Modal - Lazy loaded */}
      {isUploadModalOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50" />}>
          <BusinessUploadModal
            isOpen={isUploadModalOpen}
            onClose={() => setIsUploadModalOpen(false)}
            uploadFile={uploadFile}
            setUploadFile={setUploadFile}
            uploadResults={uploadResults}
            setUploadResults={setUploadResults}
            uploadProgress={uploadProgress}
            setUploadProgress={setUploadProgress}
            isUploading={isUploading}
            uploadMode={uploadMode}
            setUploadMode={setUploadMode}
            handleFileUpload={handleFileUpload}
            downloadExcelTemplate={downloadExcelTemplate}
          />
        </Suspense>
      )}

      {/* Revenue Detail Modal - Lazy loaded */}
      {showRevenueModal && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50" />}>
          <BusinessRevenueModal
            business={selectedRevenueBusiness}
            isOpen={showRevenueModal}
            onClose={() => {
              setShowRevenueModal(false)
              setSelectedRevenueBusiness(null)
            }}
            userPermission={userPermission}
          />
        </Suspense>
      )}
    </AdminLayout>
  )
}

export default withAuth(BusinessManagementPage, undefined, 1)