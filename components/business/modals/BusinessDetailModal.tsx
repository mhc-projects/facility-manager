'use client'

import {
  Building2,
  X,
  MapPin,
  Edit,
  User,
  Hash,
  Contact,
  Briefcase,
  Phone,
  FileText,
  Mail,
  Calendar,
  ClipboardList,
  MessageSquarePlus,
  Users,
  AlertTriangle,
  Clock,
  MessageSquare,
  Edit3,
  Trash2,
  Building,
  Factory,
  Database,
  Settings,
  Shield,
  Calculator
} from 'lucide-react'
import TaskProgressMiniBoard from '@/components/business/TaskProgressMiniBoard'
import { InvoiceDisplay } from '@/components/business/InvoiceDisplay'
import { formatDate } from '@/utils/formatters'
import MemoEditForm from '@/components/business/modals/MemoEditForm'
import React, { useRef, useEffect } from 'react'

// UnifiedBusinessInfo interface
interface UnifiedBusinessInfo {
  id: string
  created_at: string
  updated_at: string
  business_name: string
  local_government: string | null
  address: string | null
  manager_name: string | null
  manager_position: string | null
  manager_contact: string | null
  business_contact: string | null
  fax_number: string | null
  email: string | null
  representative_name: string | null
  business_registration_number: string | null
  row_number?: number | null
  department?: string | null
  progress_status?: string | null
  project_year?: number | null
  revenue_source?: string | null
  contract_document?: string | null
  order_request_date?: string | null
  receipt_date?: string | null
  wireless_document?: string | null
  installation_support?: string | null
  order_manager?: string | null
  contract_sent_date?: string | null
  order_date?: string | null
  shipment_date?: string | null
  inventory_check?: string | null
  installation_date?: string | null
  payment_scheduled_date?: string | null
  installation_team?: string | null
  business_type?: string | null
  business_category?: string | null
  pollutants?: string | null
  annual_emission_amount?: number | null
  first_report_date?: string | null
  operation_start_date?: string | null
  subsidy_approval_date?: string | null
  expansion_pack?: number | null
  other_equipment?: string | null
  additional_cost?: number | null
  installation_extra_cost?: number | null
  negotiation?: number | string | null
  multiple_stack_cost?: number | null
  representative_birth_date?: string | null
  invoice_1st_date?: string | null
  invoice_1st_amount?: number | null
  payment_1st_date?: string | null
  payment_1st_amount?: number | null
  invoice_2nd_date?: string | null
  invoice_2nd_amount?: number | null
  payment_2nd_date?: string | null
  payment_2nd_amount?: number | null
  invoice_additional_date?: string | null
  payment_additional_date?: string | null
  payment_additional_amount?: number | null
  invoice_advance_date?: string | null
  invoice_advance_amount?: number | null
  payment_advance_date?: string | null
  payment_advance_amount?: number | null
  invoice_balance_date?: string | null
  invoice_balance_amount?: number | null
  payment_balance_date?: string | null
  payment_balance_amount?: number | null
  estimate_survey_manager?: string | null
  estimate_survey_date?: string | null
  pre_construction_survey_manager?: string | null
  pre_construction_survey_date?: string | null
  completion_survey_manager?: string | null
  completion_survey_date?: string | null
  construction_report_submitted_at?: string | null
  greenlink_confirmation_submitted_at?: string | null
  attachment_completion_submitted_at?: string | null
  manufacturer?: '에코센스' | '크린어스' | '가이아씨앤에스' | '이브이에스' | null
  vpn?: 'wired' | 'wireless' | null
  greenlink_id?: string | null
  greenlink_pw?: string | null
  business_management_code?: number | null
  ph_meter?: number | null
  differential_pressure_meter?: number | null
  temperature_meter?: number | null
  discharge_current_meter?: number | null
  fan_current_meter?: number | null
  pump_current_meter?: number | null
  gateway?: number | null // @deprecated
  gateway_1_2?: number | null
  gateway_3_4?: number | null
  vpn_wired?: number | null
  vpn_wireless?: number | null
  explosion_proof_differential_pressure_meter_domestic?: number | null
  explosion_proof_temperature_meter_domestic?: number | null
  expansion_device?: number | null
  relay_8ch?: number | null
  relay_16ch?: number | null
  main_board_replacement?: number | null
  multiple_stack?: number | null
  sales_office?: string | null
  facility_summary?: {
    outlets?: Array<{
      outlet: number
      discharge_count: number
      prevention_count: number
      discharge_facilities: string[]
      prevention_facilities: string[]
    }>
    totals?: {
      total_outlets: number
      total_discharge: number
      total_prevention: number
    }
    last_updated?: string
  } | null
  additional_info?: Record<string, any>
  is_active: boolean
  is_deleted: boolean
  사업장명: string
  주소: string
  담당자명: string
  담당자연락처: string
  담당자직급: string
  contacts?: any[]
  대표자: string
  사업자등록번호: string
  업종: string
  사업장연락처: string
  상태: string
  현재단계?: string
  PH센서?: number
  차압계?: number
  온도계?: number
  배출전류계?: number
  송풍전류계?: number
  펌프전류계?: number
  게이트웨이?: number // @deprecated
  '게이트웨이(1,2)'?: number
  '게이트웨이(3,4)'?: number
  VPN유선?: number
  VPN무선?: number
  복수굴뚝?: number
  방폭차압계국산?: number
  방폭온도계국산?: number
  확장디바이스?: number
  중계기8채널?: number
  중계기16채널?: number
  메인보드교체?: number
  등록일: string
  수정일: string
  지자체?: string
  팩스번호?: string
  이메일?: string
  사업장관리코드?: number
  그린링크ID?: string
  그린링크PW?: string
  영업점?: string
  files?: any | null
  hasFiles: boolean
  fileCount: number
  진행구분?: string
  생성일?: string
}

interface Memo {
  id?: string
  title: string
  content: string
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  source_type?: string // 'manual' or 'task_sync'
  task_status?: string | null
  task_type?: string | null
}

interface Task {
  id: string
  title: string
  description: string
  status: string
  task_type: string
  assignee: string
  deadline: string | null
  created_at: string
  updated_at: string
}

interface IntegratedItem {
  id: string
  type: 'memo' | 'task'
  title: string
  content?: string
  description?: string
  status?: string
  task_type?: string
  assignee?: string
  created_at: string
  updated_at: string
  data: Memo | Task
}

interface BusinessDetailModalProps {
  isOpen: boolean
  business: UnifiedBusinessInfo
  onClose: () => void
  onEdit: (business: UnifiedBusinessInfo) => void
  // Memo관련 props
  isAddingMemo: boolean
  setIsAddingMemo: (adding: boolean) => void
  businessMemos: Memo[]
  businessTasks: Task[]
  getIntegratedItems: () => IntegratedItem[]
  canDeleteAutoMemos: boolean
  startEditMemo: (memo: Memo) => void
  handleDeleteMemo: (memo: Memo) => void
  editingMemo: Memo | null
  setEditingMemo: (memo: Memo | null) => void
  memoForm: { title: string; content: string }
  setMemoForm: React.Dispatch<React.SetStateAction<{ title: string; content: string }>>
  handleAddMemo: () => void
  handleEditMemo: () => void
  // Task 관련 props
  getStatusColor: (status: string) => { bg: string; border: string; badge: string; text: string }
  getStatusDisplayName: (status: string) => string
  // Facility 관련 props
  facilityDeviceCounts: Record<string, number> | null
  facilityLoading: boolean
  facilityData: {
    summary: {
      discharge_count: number
      prevention_count: number
      total_facilities: number
    }
    discharge_facilities: Array<{ outlet_number: number }>
    prevention_facilities: Array<{ outlet_number: number }>
  } | null
  airPermitData: {
    business_type?: string
    category?: string
  } | null
  // Revenue 관련 props
  setSelectedRevenueBusiness: (business: UnifiedBusinessInfo) => void
  setShowRevenueModal: (show: boolean) => void
  mapCategoryToInvoiceType: (category: string) => string
  // 실시간 업데이트 핸들러
  onFacilityUpdate?: (businessName: string) => void
}

export default function BusinessDetailModal({
  isOpen,
  business,
  onClose,
  onEdit,
  isAddingMemo,
  setIsAddingMemo,
  businessMemos,
  businessTasks,
  getIntegratedItems,
  canDeleteAutoMemos,
  startEditMemo,
  handleDeleteMemo,
  editingMemo,
  setEditingMemo,
  memoForm,
  setMemoForm,
  handleAddMemo,
  handleEditMemo,
  getStatusColor,
  getStatusDisplayName,
  facilityDeviceCounts,
  facilityLoading,
  facilityData,
  airPermitData,
  setSelectedRevenueBusiness,
  setShowRevenueModal,
  mapCategoryToInvoiceType,
  onFacilityUpdate,
}: BusinessDetailModalProps) {
  // Ref for auto-scrolling to memo add form
  const memoFormRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to memo form when isAddingMemo becomes true
  useEffect(() => {
    if (isAddingMemo && !editingMemo && memoFormRef.current) {
      // Small delay to ensure the form is rendered
      setTimeout(() => {
        memoFormRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }, 100)
    }
  }, [isAddingMemo, editingMemo])

  if (!isOpen || !business) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-lg sm:rounded-xl md:rounded-2xl shadow-2xl max-w-sm sm:max-w-2xl md:max-w-4xl lg:max-w-7xl w-full max-h-[95vh] overflow-hidden">
        {/* Header with gradient background */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-3 sm:px-4 md:px-5 lg:px-6 py-3 sm:py-3 md:py-4 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-white bg-opacity-10 backdrop-blur-sm"></div>
          <div className="relative">
            {/* Mobile Layout */}
            <div className="flex flex-col sm:hidden gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-white bg-opacity-20 rounded-lg backdrop-blur-sm">
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold truncate">{business?.사업장명 || business?.business_name || '사업장명 없음'}</h2>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex items-center p-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all duration-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-blue-100 flex items-center text-xs truncate flex-1 mr-2">
                  <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                  {business?.주소 || business?.local_government || '주소 미등록'}
                </p>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    business?.is_active || business?.상태 === '활성'
                      ? 'bg-green-500 bg-opacity-20 text-green-100 border border-green-300 border-opacity-30'
                      : 'bg-gray-500 bg-opacity-20 text-gray-200 border border-gray-300 border-opacity-30'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full mr-1 ${
                      business?.is_active || business?.상태 === '활성' ? 'bg-green-300' : 'bg-gray-300'
                    }`}></div>
                    {business?.is_active || business?.상태 === '활성' ? '활성' : '비활성'}
                  </div>
                  <button
                    onClick={() => {
                      // Don't call onClose() - let onEdit handle modal state
                      onEdit(business)
                    }}
                    className="flex items-center px-2 py-1 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all duration-200 text-xs font-medium border border-white border-opacity-30"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    수정
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden sm:flex items-center justify-between">
              <div className="flex items-center space-x-3 md:space-x-4 min-w-0 flex-1 mr-4">
                <div className="p-2 md:p-3 bg-white bg-opacity-20 rounded-lg backdrop-blur-sm flex-shrink-0">
                  <Building2 className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base md:text-lg lg:text-xl font-bold truncate">{business?.사업장명 || business?.business_name || '사업장명 없음'}</h2>
                  <p className="text-blue-100 flex items-center mt-1 text-sm md:text-sm truncate">
                    <MapPin className="w-3 h-3 md:w-4 md:h-4 mr-1 flex-shrink-0" />
                    {business?.주소 || business?.local_government || '주소 미등록'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 md:space-x-3 flex-shrink-0">
                <div className="text-right">
                  <div className={`inline-flex items-center px-2 md:px-3 py-1 rounded-full text-xs md:text-xs font-medium ${
                    business?.is_active || business?.상태 === '활성'
                      ? 'bg-green-500 bg-opacity-20 text-green-100 border border-green-300 border-opacity-30'
                      : 'bg-gray-500 bg-opacity-20 text-gray-200 border border-gray-300 border-opacity-30'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      business?.is_active || business?.상태 === '활성' ? 'bg-green-300' : 'bg-gray-300'
                    }`}></div>
                    {business?.is_active || business?.상태 === '활성' ? '활성' : '비활성'}
                  </div>
                </div>
                <div className="flex items-center space-x-1 md:space-x-2">
                  <button
                    onClick={() => {
                      // Don't call onClose() - let onEdit handle modal state
                      onEdit(business)
                    }}
                    className="flex items-center px-2 md:px-3 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all duration-200 text-xs md:text-xs font-medium border border-white border-opacity-30 hover:border-opacity-50"
                  >
                    <Edit className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-1.5" />
                    <span className="hidden md:inline">정보수정</span>
                    <span className="md:hidden">수정</span>
                  </button>
                  <button
                    onClick={onClose}
                    className="flex items-center px-2 md:px-3 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all duration-200 text-xs md:text-xs font-medium border border-white border-opacity-30 hover:border-opacity-50"
                  >
                    <X className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-1.5" />
                    <span className="hidden md:inline">닫기</span>
                    <span className="md:hidden">닫기</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content area with balanced layout */}
        <div className="overflow-y-auto max-h-[calc(95vh-120px)]">
          <div className="p-3 sm:p-4 md:p-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
              {/* Left Column - Basic Info */}
              <div className="space-y-3 sm:space-y-4 md:space-y-6">
                {/* Basic Information Card */}
                <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-slate-200">
                  <div className="flex items-center mb-2 sm:mb-3 md:mb-4">
                    <div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg mr-2 sm:mr-3">
                      <Building className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">기본 정보</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <Factory className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-blue-500 flex-shrink-0" />
                        사업장명
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">{business.사업장명}</div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-green-500 flex-shrink-0" />
                        지자체
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">{business.지자체 || '-'}</div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm md:col-span-2">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-red-500 flex-shrink-0" />
                        주소
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">{business.주소 || '-'}</div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <User className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-purple-500 flex-shrink-0" />
                        대표자명
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">{business.대표자 || '-'}</div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <Hash className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-orange-500 flex-shrink-0" />
                        <span className="hidden sm:inline">사업자등록번호</span>
                        <span className="sm:hidden">사업자번호</span>
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">{business.사업자등록번호 || '-'}</div>
                    </div>
                  </div>
                </div>

                {/* Contact Information Card */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-green-200">
                  <div className="flex items-center mb-2 sm:mb-3 md:mb-4">
                    <div className="p-1.5 sm:p-2 bg-green-600 rounded-lg mr-2 sm:mr-3">
                      <Contact className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">담당자 정보</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <User className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-green-500 flex-shrink-0" />
                        담당자명
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">
                        {business.담당자명 || '-'}
                      </div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <Briefcase className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-blue-500 flex-shrink-0" />
                        직급
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">
                        {business.담당자직급 || '-'}
                      </div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <Phone className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-green-500 flex-shrink-0" />
                        <span className="hidden sm:inline">담당자 연락처</span>
                        <span className="sm:hidden">담당자전화</span>
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">
                        {business.담당자연락처 || '-'}
                      </div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <Phone className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-blue-500 flex-shrink-0" />
                        <span className="hidden sm:inline">사업장 연락처</span>
                        <span className="sm:hidden">사업장전화</span>
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">{business.사업장연락처 || '-'}</div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-gray-500 flex-shrink-0" />
                        팩스번호
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">{business.fax_number || '-'}</div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                        <Mail className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-red-500 flex-shrink-0" />
                        이메일
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-all">{business.email || '-'}</div>
                    </div>

                    {business.representative_birth_date && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="flex items-center text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
                          <Calendar className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-purple-500 flex-shrink-0" />
                          <span className="hidden sm:inline">대표자생년월일</span>
                          <span className="sm:hidden">대표자생일</span>
                        </div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">{business.representative_birth_date}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Work Progress & Communication Area */}
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-orange-200">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="flex items-center">
                      <div className="p-1.5 sm:p-2 bg-orange-600 rounded-lg mr-2 sm:mr-3">
                        <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </div>
                      <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">업무 진행 현황</h3>
                    </div>
                    <button
                      onClick={() => {
                        setEditingMemo(null)
                        setMemoForm({ title: '', content: '' })
                        setIsAddingMemo(true)
                      }}
                      className="flex items-center px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-[10px] md:text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
                    >
                      <MessageSquarePlus className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                      <span className="hidden sm:inline">메모 추가</span><span className="sm:hidden">메모</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Task Progress Mini Board */}
                    <TaskProgressMiniBoard
                      businessName={business.사업장명}
                      onStatusChange={(taskId, newStatus) => {
                        console.log('업무 상태 변경:', { taskId, newStatus, business: business.사업장명 });
                      }}
                    />

                    {/* Team Communication */}
                    <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm">
                      <div className="flex items-center text-xs sm:text-sm md:text-base text-gray-600 mb-2">
                        <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-blue-500" />
                        팀 공유 사항
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-gray-50 rounded-lg">
                          • 설치 담당자: {business.installation_team || '미배정'}
                        </div>
                        <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-blue-50 rounded-lg">
                          • 주문 담당자: {business.order_manager || '미배정'}
                        </div>
                        {business.estimate_survey_manager && (
                          <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-purple-50 rounded-lg">
                            • 견적실사 담당자: {business.estimate_survey_manager}
                          </div>
                        )}
                        {business.pre_construction_survey_manager && (
                          <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-orange-50 rounded-lg">
                            • 착공실사 담당자: {business.pre_construction_survey_manager}
                          </div>
                        )}
                        {business.completion_survey_manager && (
                          <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-teal-50 rounded-lg">
                            • 준공실사 담당자: {business.completion_survey_manager}
                          </div>
                        )}
                        {business.installation_date && (
                          <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-green-50 rounded-lg">
                            • 설치 예정일: {formatDate(business.installation_date)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Important Notes */}
                    <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm">
                      <div className="flex items-center text-xs sm:text-sm md:text-base text-gray-600 mb-2">
                        <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-amber-500" />
                        확인 필요 사항
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        {!business.manager_contact && (
                          <div className="text-xs sm:text-sm text-red-600 p-2 bg-red-50 rounded-lg flex items-center">
                            <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                            담당자 연락처 확인 필요
                          </div>
                        )}
                        {!business.installation_support && (
                          <div className="text-xs sm:text-sm text-yellow-600 p-2 bg-yellow-50 rounded-lg flex items-center">
                            <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                            설치 지원 여부 확인 필요
                          </div>
                        )}
                        {business.additional_cost && business.additional_cost > 0 && (
                          <div className="text-xs sm:text-sm text-blue-600 p-2 bg-blue-50 rounded-lg flex items-center">
                            <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                            추가 비용 협의: {Number(business.additional_cost).toLocaleString()}원
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 메모 및 업무 통합 섹션 (최신순 정렬) */}
                    {(businessMemos.length > 0 || businessTasks.length > 0) && (
                      <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm">
                        <div className="flex items-center text-xs sm:text-sm md:text-base text-gray-600 mb-2 sm:mb-3">
                          <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-indigo-500" />
                          메모 및 업무 ({getIntegratedItems().length}개)
                        </div>

                        {/* 메모 추가 폼 - 최상단 배치 */}
                        {isAddingMemo && !editingMemo && (
                          <div ref={memoFormRef} className="mb-3 sm:mb-4">
                            <div className="flex items-center text-xs sm:text-sm text-indigo-600 mb-2">
                              <MessageSquarePlus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                              새 메모 추가
                            </div>
                            <MemoEditForm
                              mode="create"
                              memoForm={memoForm}
                              setMemoForm={setMemoForm}
                              onSave={handleAddMemo}
                              onCancel={() => {
                                setIsAddingMemo(false)
                                setMemoForm({ title: '', content: '' })
                              }}
                            />
                          </div>
                        )}

                        {/* 스크롤 가능한 컨테이너 추가 - 최대 높이 제한으로 내용이 많아져도 스크롤 가능 */}
                        <div className="space-y-2 sm:space-y-3 max-h-[640px] sm:max-h-[768px] md:max-h-[800px] overflow-y-auto pr-1 sm:pr-2" style={{scrollbarWidth: 'thin'}}>
                          {getIntegratedItems().map((item, index) => {
                            if (item.type === 'memo') {
                              const memo = item.data as Memo
                              const isAutoMemo = item.title?.startsWith('[자동]')
                              const isTaskMemo = memo.source_type === 'task_sync'
                              const isEditingThisMemo = editingMemo?.id === memo.id

                              return (
                                <React.Fragment key={`memo-${item.id}-${index}`}>
                                  <div className={`${isAutoMemo ? 'bg-gray-50 border-gray-300' : isTaskMemo ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-indigo-400'} rounded-lg p-2 sm:p-3 border-l-4`}>
                                    <div className="flex items-start justify-between mb-1 sm:mb-2">
                                      <div className="flex-1">
                                        <div className="flex items-center space-x-1 sm:space-x-2 mb-1">
                                          <MessageSquare className={`w-3 h-3 sm:w-4 sm:h-4 ${isAutoMemo ? 'text-gray-400' : isTaskMemo ? 'text-blue-500' : 'text-indigo-500'}`} />
                                          <h4 className={`${isAutoMemo ? 'font-normal text-gray-600 text-xs sm:text-sm' : 'font-medium text-gray-900 text-xs sm:text-sm md:text-base'}`}>{item.title}</h4>
                                          <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] md:text-xs font-medium rounded-full ${isAutoMemo ? 'bg-gray-100 text-gray-600' : isTaskMemo ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-indigo-100 text-indigo-700'}`}>
                                            {isAutoMemo ? '자동' : isTaskMemo ? '업무' : '메모'}
                                          </span>
                                        </div>
                                        <p className={`text-xs sm:text-sm ${isAutoMemo ? 'text-gray-500' : 'text-gray-700'} leading-relaxed break-words`}>{item.content}</p>
                                      </div>
                                      {((!isAutoMemo && !isTaskMemo) || ((isAutoMemo || isTaskMemo) && canDeleteAutoMemos)) && (
                                        <div className="flex items-center space-x-0.5 sm:space-x-1 ml-1 sm:ml-2">
                                          {!isAutoMemo && !isTaskMemo && (
                                            <button
                                              onClick={() => startEditMemo(memo)}
                                              disabled={!memo.id}
                                              className={`p-1 sm:p-1.5 rounded transition-colors ${
                                                memo.id
                                                  ? 'text-gray-400 hover:text-indigo-600'
                                                  : 'text-gray-300 cursor-not-allowed'
                                              }`}
                                              title={memo.id ? "메모 수정" : "메모 ID가 없어 수정할 수 없습니다"}
                                            >
                                              <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                            </button>
                                          )}
                                          <button
                                            onClick={() => handleDeleteMemo(memo)}
                                            disabled={!memo.id}
                                            className={`p-1 sm:p-1.5 rounded transition-colors ${
                                              memo.id
                                                ? 'text-gray-400 hover:text-red-600'
                                                : 'text-gray-300 cursor-not-allowed'
                                            }`}
                                            title={memo.id ?
                                              (isAutoMemo ? "자동 메모 삭제 (슈퍼 관리자 전용)" : isTaskMemo ? "업무 메모 삭제 (슈퍼 관리자 전용)" : "메모 삭제") :
                                              "메모 ID가 없어 삭제할 수 없습니다"
                                            }
                                          >
                                            <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[10px] sm:text-xs text-gray-500 gap-1 sm:gap-0">
                                      <span>작성: {new Date(memo.created_at).toLocaleDateString('ko-KR', {
                                        year: 'numeric', month: 'short', day: 'numeric'
                                      })} ({memo.created_by})</span>
                                      {memo.updated_at !== memo.created_at && (
                                        <span>수정: {new Date(memo.updated_at).toLocaleDateString('ko-KR', {
                                          year: 'numeric', month: 'short', day: 'numeric'
                                        })} ({memo.updated_by})</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Inline edit form - appears directly below the memo being edited */}
                                  {isEditingThisMemo && (
                                    <MemoEditForm
                                      mode="edit"
                                      memoForm={memoForm}
                                      setMemoForm={setMemoForm}
                                      onSave={handleEditMemo}
                                      onCancel={() => {
                                        setEditingMemo(null)
                                        setIsAddingMemo(false)  // ✅ 추가 폼도 닫기
                                        setMemoForm({ title: '', content: '' })
                                      }}
                                    />
                                  )}
                                </React.Fragment>
                              )
                            } else {
                              // 업무 카드
                              const task = item.data as Task
                              const statusColors = getStatusColor(item.status || '')

                              return (
                                <div key={`task-${item.id}-${index}`} className={`${statusColors.bg} rounded-lg p-2 sm:p-3 md:p-4 border-l-4 ${statusColors.border} hover:shadow-md transition-shadow`}>
                                  <div className="flex items-start justify-between mb-2 sm:mb-3">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-1 sm:space-x-2 mb-1 sm:mb-2 flex-wrap">
                                        <ClipboardList className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0" />
                                        <h4 className="font-semibold text-gray-900 text-xs sm:text-sm md:text-base">
                                          {getStatusDisplayName(item.status || '')}
                                        </h4>
                                        <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] md:text-xs font-medium rounded-full ${
                                          item.task_type === 'subsidy' ? 'bg-green-100 text-green-700 border border-green-200' :
                                          item.task_type === 'dealer' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                          item.task_type === 'outsourcing' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                          item.task_type === 'as' ? 'bg-red-100 text-red-700 border border-red-200' :
                                          item.task_type === 'self' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                          'bg-gray-100 text-gray-700 border border-gray-200'
                                        }`}>
                                          {item.task_type === 'subsidy' ? '보조금' :
                                           item.task_type === 'dealer' ? '대리점' :
                                           item.task_type === 'outsourcing' ? '외주설치' :
                                           item.task_type === 'as' ? 'AS' :
                                           item.task_type === 'self' ? '자비' :
                                           '기타'}
                                        </span>
                                        <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] md:text-xs font-medium rounded-full ${statusColors.badge} ${statusColors.text}`}>
                                          {getStatusDisplayName(item.status || '')}
                                        </span>
                                      </div>
                                      <p className="text-xs sm:text-sm text-gray-700 mb-2 sm:mb-3 leading-relaxed break-words">{item.description}</p>
                                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs">
                                        <span className="flex items-center space-x-1">
                                          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></span>
                                          <span className="text-gray-600">
                                            {item.task_type === 'subsidy' ? '지원사업' : '자체사업'}
                                          </span>
                                        </span>
                                        <span className="flex items-center space-x-1">
                                          <User className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-500" />
                                          <span className="text-gray-600">{item.assignee}</span>
                                        </span>
                                        <span className="flex items-center space-x-1">
                                          <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-500" />
                                          <span className="text-gray-600">
                                            {task.deadline ? new Date(task.deadline).toLocaleDateString('ko-KR', {
                                              month: 'short', day: 'numeric'
                                            }) : '미정'}
                                          </span>
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[10px] sm:text-xs text-gray-500 pt-2 border-t border-gray-200 gap-1 sm:gap-0">
                                    <span className="flex items-center space-x-1">
                                      <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                      <span>생성: {new Date(item.created_at).toLocaleDateString('ko-KR', {
                                        year: 'numeric', month: 'short', day: 'numeric'
                                      })}</span>
                                    </span>
                                    {task.updated_at !== task.created_at && (
                                      <span className="flex items-center space-x-1">
                                        <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                        <span>수정: {new Date(task.updated_at).toLocaleDateString('ko-KR', {
                                          year: 'numeric', month: 'short', day: 'numeric'
                                        })}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            }
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>

              {/* Right Column - System Info & Status */}
              <div className="space-y-3 sm:space-y-4 md:space-y-6">
                {/* System Information Card */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-purple-200">
                  <div className="flex items-center mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 bg-purple-600 rounded-lg mr-2 sm:mr-3">
                      <Database className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">시스템 정보</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">제조사</div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">
                        {(business.manufacturer === '에코센스' || business.manufacturer === 'ecosense') ? '🏭 에코센스' :
                         (business.manufacturer === '크린어스' || business.manufacturer === 'cleanearth') ? '🌍 크린어스' :
                         (business.manufacturer === '가이아씨앤에스' || business.manufacturer === 'gaia_cns') ? '🌿 가이아씨앤에스' :
                         (business.manufacturer === '이브이에스' || business.manufacturer === 'evs') ? '⚡ 이브이에스' :
                         business.manufacturer || '-'}
                      </div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="text-xs sm:text-sm text-gray-600 mb-2">VPN 연결</div>
                      <div className="space-y-1.5">
                        {(() => {
                          const hasWired = (business.VPN유선 || business.vpn_wired || 0) > 0;
                          const hasWireless = (business.VPN무선 || business.vpn_wireless || 0) > 0;

                          if (!hasWired && !hasWireless) {
                            return <div className="text-xs sm:text-sm font-medium text-gray-400">-</div>;
                          }

                          return (
                            <>
                              {hasWired && (
                                <div className="flex items-center">
                                  <div className="w-4 h-4 bg-blue-500 rounded flex items-center justify-center mr-2">
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                  <span className="text-xs sm:text-sm font-medium text-gray-900">🔗 유선</span>
                                </div>
                              )}
                              {hasWireless && (
                                <div className="flex items-center">
                                  <div className="w-4 h-4 bg-blue-500 rounded flex items-center justify-center mr-2">
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                  <span className="text-xs sm:text-sm font-medium text-gray-900">📶 무선</span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">그린링크 ID</div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{business.greenlink_id || '-'}</div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">그린링크 PW</div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 flex items-center">
                        {business.greenlink_pw ? (
                          <>
                            <Shield className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-green-500" />
                            설정됨
                          </>
                        ) : '-'}
                      </div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">사업장관리코드</div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{business.business_management_code || '-'}</div>
                    </div>

                    <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">영업점</div>
                      <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{business.sales_office || '-'}</div>
                    </div>
                  </div>
                </div>

                {/* Equipment and Network Card */}
                <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-teal-200">
                  <div className="flex items-center mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 bg-teal-600 rounded-lg mr-2 sm:mr-3">
                      <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">측정기기 및 네트워크</h3>
                  </div>

                  {/* Equipment Quantities with Facility Management Comparison */}
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-3 sm:p-4 border border-purple-200 mb-3 sm:mb-4">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className="text-xs sm:text-sm md:text-base font-semibold text-purple-700">측정기기 수량</div>
                      <button
                        onClick={() => {
                          const businessName = encodeURIComponent(business.business_name || business.사업장명 || '');
                          if (businessName) {
                            window.open(`/business/${businessName}`, '_blank');
                          } else {
                            alert('사업장명 정보가 없어 시설관리 시스템으로 연결할 수 없습니다.');
                          }
                        }}
                        className="text-[9px] sm:text-[10px] md:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                      >
                        <span className="hidden sm:inline">시설관리 연동</span><span className="sm:hidden">연동</span>
                      </button>
                    </div>
                    <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                      {(() => {
                        const devices = [
                          { key: 'PH센서', value: business.PH센서, facilityKey: 'ph' },
                          { key: '차압계', value: business.차압계, facilityKey: 'pressure' },
                          { key: '온도계', value: business.온도계, facilityKey: 'temperature' },
                          { key: '배출전류계', value: business.배출전류계, facilityKey: 'discharge' },
                          { key: '송풍전류계', value: business.송풍전류계, facilityKey: 'fan' },
                          { key: '펌프전류계', value: business.펌프전류계, facilityKey: 'pump' },
                          // ✅ Gateway split fields only (deprecated gateway field removed)
                          { key: '게이트웨이(1,2)', value: business.gateway_1_2, facilityKey: 'gateway_1_2' },
                          { key: '게이트웨이(3,4)', value: business.gateway_3_4, facilityKey: 'gateway_3_4' },
                          { key: '방폭차압계(국산)', value: business.방폭차압계국산, facilityKey: 'explosionProofPressure' },
                          { key: '방폭온도계(국산)', value: business.방폭온도계국산, facilityKey: 'explosionProofTemp' },
                          { key: '확장디바이스', value: business.확장디바이스, facilityKey: 'expansionDevice' },
                          { key: '중계기(8채널)', value: business.중계기8채널, facilityKey: 'relay8ch' },
                          { key: '중계기(16채널)', value: business.중계기16채널, facilityKey: 'relay16ch' },
                          { key: '메인보드교체', value: business.메인보드교체, facilityKey: 'mainBoard' },
                          { key: 'VPN(유선)', value: business.VPN유선, facilityKey: 'vpnWired' },
                          { key: 'VPN(무선)', value: business.VPN무선, facilityKey: 'vpnWireless' },
                          { key: '복수굴뚝', value: business.복수굴뚝, facilityKey: 'multipleStack' }
                        ];

                        return devices
                          .filter(device => device.value && device.value > 0)
                          .map((device, index) => (
                            <div key={`${device.facilityKey}-${device.key}-${index}`} className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 shadow-sm">
                              <div className="text-[10px] sm:text-xs text-gray-600 mb-1 break-words">{device.key}</div>
                              <div className="flex items-center justify-between">
                                <div className="text-sm sm:text-base md:text-lg font-bold text-gray-900">{device.value}</div>
                                {facilityDeviceCounts?.[device.facilityKey as keyof typeof facilityDeviceCounts] !== undefined && (
                                  <div className={`text-[10px] sm:text-xs ${
                                    facilityDeviceCounts[device.facilityKey as keyof typeof facilityDeviceCounts] === device.value
                                      ? 'text-green-600'
                                      : 'text-orange-600'
                                  }`}>
                                    시설관리: {facilityDeviceCounts[device.facilityKey as keyof typeof facilityDeviceCounts] || 0}
                                  </div>
                                )}
                              </div>
                            </div>
                          ));
                      })()}
                    </div>
                  </div>

                  {/* Facility Information based on Air Permits */}
                  {facilityLoading ? (
                    <div className="bg-white rounded-lg p-4 sm:p-5 md:p-6 text-center text-gray-500">
                      <Settings className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-gray-300 mx-auto mb-2" />
                      <div className="text-xs sm:text-sm">시설 정보를 불러오는 중...</div>
                    </div>
                  ) : facilityData && (facilityData.summary.total_facilities > 0 || facilityData.discharge_facilities.length > 0 || facilityData.prevention_facilities.length > 0) ? (
                    <>
                      {/* Facility Summary Card */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 sm:p-4 border border-blue-200 mb-3 sm:mb-4">
                        <div className="text-xs sm:text-sm md:text-base font-semibold text-blue-700 mb-2 sm:mb-3">시설 정보 (실사 기준)</div>
                        <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 text-center mb-4">
                          <div>
                            <div className="text-[10px] sm:text-xs md:text-sm text-blue-600 mb-1">배출시설</div>
                            <div className="text-sm sm:text-lg md:text-xl font-bold text-blue-800">{facilityData.summary.discharge_count}</div>
                          </div>
                          <div>
                            <div className="text-[10px] sm:text-xs md:text-sm text-blue-600 mb-1">방지시설</div>
                            <div className="text-sm sm:text-lg md:text-xl font-bold text-blue-800">{facilityData.summary.prevention_count}</div>
                          </div>
                          <div>
                            <div className="text-[10px] sm:text-xs md:text-sm text-blue-600 mb-1">배출구</div>
                            <div className="text-sm sm:text-lg md:text-xl font-bold text-blue-900">
                              {facilityData.discharge_facilities.concat(facilityData.prevention_facilities)
                                .reduce((outlets, facility) => {
                                  const outletKey = facility.outlet_number;
                                  return outlets.includes(outletKey) ? outlets : [...outlets, outletKey];
                                }, [] as number[]).length}
                            </div>
                          </div>
                        </div>

                        {/* Detailed Facility List by Outlet */}
                        <div className="space-y-3">
                          {(() => {
                            // Group facilities by outlet
                            const outletGroups: { [key: number]: { discharge: any[], prevention: any[] } } = {};

                            facilityData.discharge_facilities.forEach(f => {
                              if (!outletGroups[f.outlet_number]) {
                                outletGroups[f.outlet_number] = { discharge: [], prevention: [] };
                              }
                              outletGroups[f.outlet_number].discharge.push(f);
                            });

                            facilityData.prevention_facilities.forEach(f => {
                              if (!outletGroups[f.outlet_number]) {
                                outletGroups[f.outlet_number] = { discharge: [], prevention: [] };
                              }
                              outletGroups[f.outlet_number].prevention.push(f);
                            });

                            return Object.entries(outletGroups).map(([outletNum, facilities]) => (
                              <div key={outletNum} className="bg-white rounded-lg p-3 border border-blue-200">
                                <div className="text-xs sm:text-sm font-semibold text-blue-600 mb-2">배출구 {outletNum}번</div>

                                {/* 배출시설 */}
                                {facilities.discharge.length > 0 && (
                                  <div className="mb-3">
                                    <div className="text-xs text-orange-600 font-medium mb-1.5">배출시설 ({facilities.discharge.length}개)</div>
                                    <div className="space-y-1.5">
                                      {facilities.discharge.map((f, idx) => (
                                        <div key={idx} className="bg-orange-50 rounded p-2 text-xs">
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="font-medium text-orange-800">{f.facility_name}</div>
                                            {f.facility_number && (
                                              <div className="text-[10px] bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded font-semibold">
                                                #{f.facility_number}
                                              </div>
                                            )}
                                          </div>
                                          <div className="text-gray-600">용량: {f.capacity || '-'}</div>
                                          {f.discharge_ct && Number(f.discharge_ct) > 0 && (
                                            <div className="text-gray-600 mt-1">
                                              <span className="font-medium text-orange-700">측정기기:</span>
                                              <div className="ml-2 mt-0.5">
                                                • 배출CT: {f.discharge_ct}개
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* 방지시설 */}
                                {facilities.prevention.length > 0 && (
                                  <div>
                                    <div className="text-xs text-cyan-600 font-medium mb-1.5">방지시설 ({facilities.prevention.length}개)</div>
                                    <div className="space-y-1.5">
                                      {facilities.prevention.map((f, idx) => (
                                        <div key={idx} className="bg-cyan-50 rounded p-2 text-xs">
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="font-medium text-cyan-800">{f.facility_name}</div>
                                            {f.facility_number && (
                                              <div className="text-[10px] bg-cyan-200 text-cyan-800 px-1.5 py-0.5 rounded font-semibold">
                                                #{f.facility_number}
                                              </div>
                                            )}
                                          </div>
                                          <div className="text-gray-600">용량: {f.capacity || '-'}</div>
                                          {(() => {
                                            const hasMeasurementDevices =
                                              (f.ph_meter && Number(f.ph_meter) > 0) ||
                                              (f.differential_pressure_meter && Number(f.differential_pressure_meter) > 0) ||
                                              (f.temperature_meter && Number(f.temperature_meter) > 0) ||
                                              (f.pump_ct && Number(f.pump_ct) > 0) ||
                                              (f.fan_ct && Number(f.fan_ct) > 0);

                                            return hasMeasurementDevices && (
                                              <div className="text-gray-600 mt-1">
                                                <span className="font-medium text-cyan-700">측정기기:</span>
                                                <div className="ml-2 mt-0.5 space-y-0.5">
                                                  {f.ph_meter && Number(f.ph_meter) > 0 && <div>• PH센서: {f.ph_meter}개</div>}
                                                  {f.differential_pressure_meter && Number(f.differential_pressure_meter) > 0 && <div>• 차압계: {f.differential_pressure_meter}개</div>}
                                                  {f.temperature_meter && Number(f.temperature_meter) > 0 && <div>• 온도계: {f.temperature_meter}개</div>}
                                                  {f.pump_ct && Number(f.pump_ct) > 0 && <div>• 펌프CT: {f.pump_ct}개</div>}
                                                  {f.fan_ct && Number(f.fan_ct) > 0 && <div>• 송풍CT: {f.fan_ct}개</div>}
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-white rounded-lg p-4 sm:p-5 md:p-6 text-center text-gray-500">
                      <Settings className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-gray-300 mx-auto mb-2" />
                      <div className="text-xs sm:text-sm">등록된 대기필증 정보가 없습니다</div>
                      <div className="text-[10px] sm:text-xs text-gray-400 mt-1">시설 정보를 확인하려면 먼저 대기필증을 등록하세요</div>
                    </div>
                  )}
                </div>

                {/* Project Information Card */}
                <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-orange-200">
                  <div className="flex items-center mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 bg-orange-600 rounded-lg mr-2 sm:mr-3">
                      <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">프로젝트 정보</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                    {business.project_year && (
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="text-sm text-gray-600 mb-1">사업 진행연도</div>
                        <div className="text-base font-medium text-gray-900">
                          <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-slate-100 text-slate-800 border border-slate-200">
                            {business.project_year}년
                          </span>
                        </div>
                      </div>
                    )}

                    {business.progress_status && (
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="text-sm text-gray-600 mb-1">진행구분</div>
                        <div className="text-base font-medium">
                          <span className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                            business.progress_status === '자비'
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : business.progress_status === '보조금'
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : business.progress_status === '보조금 동시진행'
                              ? 'bg-purple-100 text-purple-800 border-purple-200'
                              : business.progress_status === '대리점'
                              ? 'bg-cyan-100 text-cyan-800 border-cyan-200'
                              : business.progress_status === '외주설치'
                              ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                              : business.progress_status === 'AS'
                              ? 'bg-orange-100 text-orange-800 border-orange-200'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                            {business.progress_status}
                          </span>
                        </div>
                      </div>
                    )}

                    {business.order_manager && (
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="text-sm text-gray-600 mb-1">발주담당</div>
                        <div className="text-base font-medium text-gray-900">{business.order_manager}</div>
                      </div>
                    )}

                    {business.installation_team && (
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="text-sm text-gray-600 mb-1">설치팀</div>
                        <div className="text-base font-medium text-gray-900">{business.installation_team}</div>
                      </div>
                    )}

                    {business.상태 && (
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="text-sm text-gray-600 mb-1">상태</div>
                        <div className="text-base font-medium text-gray-900">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            business.상태 === '활성'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {business.상태}
                          </span>
                        </div>
                      </div>
                    )}

                    {business.department && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">담당부서</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{business.department}</div>
                      </div>
                    )}

                    {business.revenue_source && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">매출처</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{business.revenue_source}</div>
                      </div>
                    )}

                    {business.receipt_date && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">접수일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{business.receipt_date}</div>
                      </div>
                    )}

                    {(airPermitData?.business_type || business.업종) && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1 flex items-center gap-1 sm:gap-2">
                          업종
                          {airPermitData?.business_type && (
                            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-blue-100 text-blue-800 text-[9px] sm:text-[10px] md:text-xs rounded-full">
                              대기필증 연동
                            </span>
                          )}
                        </div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900 break-words">
                          {airPermitData?.business_type || business.업종}
                        </div>
                        {airPermitData?.business_type && business.업종 &&
                         airPermitData.business_type !== business.업종 && (
                          <div className="text-[10px] sm:text-xs text-amber-600 mt-1">
                            사업장 정보와 다름: {business.업종}
                          </div>
                        )}
                      </div>
                    )}

                    {(airPermitData?.category || business.business_category) && (
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="text-sm text-gray-600 mb-1 flex items-center gap-2">
                          종별
                          {airPermitData?.category && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              대기필증 연동
                            </span>
                          )}
                        </div>
                        <div className="text-base font-medium text-gray-900">
                          {airPermitData?.category || business.business_category}
                        </div>
                        {airPermitData?.category && business.business_category &&
                         airPermitData.category !== business.business_category && (
                          <div className="text-xs text-amber-600 mt-1">
                            사업장 정보와 다름: {business.business_category}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Schedule Information Card */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-blue-200">
                  <div className="flex items-center mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg mr-2 sm:mr-3">
                      <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">일정 정보</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                    {business.subsidy_approval_date && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">보조금 승인일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{formatDate(business.subsidy_approval_date)}</div>
                      </div>
                    )}

                    {business.contract_sent_date && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">계약서 발송일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{formatDate(business.contract_sent_date)}</div>
                      </div>
                    )}

                    {business.order_date && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">발주일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{formatDate(business.order_date)}</div>
                      </div>
                    )}

                    {business.shipment_date && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">출고일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{formatDate(business.shipment_date)}</div>
                      </div>
                    )}

                    {business.installation_date && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">설치일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{formatDate(business.installation_date)}</div>
                      </div>
                    )}

                    {business.payment_scheduled_date && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">입금예정일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{formatDate(business.payment_scheduled_date)}</div>
                      </div>
                    )}

                    {business.construction_report_submitted_at && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">착공신고서 제출일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{formatDate(business.construction_report_submitted_at)}</div>
                      </div>
                    )}

                    {business.greenlink_confirmation_submitted_at && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">그린링크 전송확인서 제출일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{formatDate(business.greenlink_confirmation_submitted_at)}</div>
                      </div>
                    )}

                    {business.attachment_completion_submitted_at && (
                      <div className="bg-white rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4 shadow-sm">
                        <div className="text-xs sm:text-sm text-gray-600 mb-1">부착완료통보서 제출일</div>
                        <div className="text-xs sm:text-sm md:text-sm font-medium text-gray-900">{formatDate(business.attachment_completion_submitted_at)}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Information Card - Revenue Management Link */}
                <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-yellow-200">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="flex items-center">
                      <div className="p-1.5 sm:p-2 bg-yellow-600 rounded-lg mr-2 sm:mr-3">
                        <Database className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </div>
                      <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">비용 및 매출 정보</h3>
                    </div>
                  </div>

                  <div className="text-center py-6">
                    <p className="text-sm text-gray-600 mb-4">
                      이 사업장의 상세한 비용 및 매출 정보를<br />
                      확인할 수 있습니다.
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          console.log('🔢 [REVENUE-MODAL] API를 통한 매출 계산 시작:', business.id)

                          const token = localStorage.getItem('auth_token')
                          const response = await fetch('/api/revenue/calculate', {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${token}`,
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              business_id: business.id,
                              calculation_date: new Date().toISOString().split('T')[0],
                              save_result: false
                            })
                          })

                          const data = await response.json()

                          if (data.success) {
                            const calculatedData = data.data.calculation
                            console.log('✅ [REVENUE-MODAL] API 계산 완료:', calculatedData)

                            const enrichedBusiness = {
                              ...business,
                              ...calculatedData
                            }

                            console.log('📊 [REVENUE-MODAL] 병합된 사업장 데이터:', enrichedBusiness)
                            setSelectedRevenueBusiness(enrichedBusiness)
                            setShowRevenueModal(true)
                          } else {
                            console.error('❌ [REVENUE-MODAL] API 계산 실패:', data.message)
                            alert('매출 계산에 실패했습니다: ' + data.message)
                          }
                        } catch (error) {
                          console.error('❌ [REVENUE-MODAL] API 호출 오류:', error)
                          alert('매출 계산 중 오류가 발생했습니다.')
                        }
                      }}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors shadow-md hover:shadow-lg font-medium"
                    >
                      <Calculator className="w-5 h-5" />
                      매출 상세보기
                    </button>
                  </div>
                </div>

                {/* Invoice Management Section */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 border border-purple-200">
                  <div className="flex items-center mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 bg-purple-600 rounded-lg mr-2 sm:mr-3">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-sm md:text-base font-semibold text-slate-800">계산서 및 입금 현황</h3>
                  </div>
                  {(() => {
                    // progress_status(진행구분)을 우선 사용. business_category는 대기필증 종별이므로 사용하지 않음
                    const category = (business as any).progress_status || business.진행구분;
                    const mappedCategory = mapCategoryToInvoiceType(category);

                    return (
                      <InvoiceDisplay
                        key={`invoice-${business.id}-${business.수정일 || business.생성일}`}
                        businessId={business.id}
                        businessCategory={mappedCategory}
                        additionalCost={business.additional_cost}
                      />
                    );
                  })()}
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
