'use client'

// app/admin/order-management/components/OrderDetailModal.tsx
// 발주 상세 정보 모달

import { useState, useEffect } from 'react'
import {
  X,
  Building2,
  MapPin,
  User,
  Phone,
  Package,
  Wifi,
  Key,
  Calendar,
  CheckCircle,
  Circle,
  Loader2,
  Clock,
  FileText
} from 'lucide-react'
import type { OrderDetailResponse, OrderStepKey } from '@/types/order-management'
import { MANUFACTURER_WORKFLOWS } from '@/types/order-management'
import OrderTimeline from './OrderTimeline'
import PurchaseOrderModal from '@/app/admin/document-automation/components/PurchaseOrderModal'
import BusinessQuickView from './BusinessQuickView'

interface OrderDetailModalProps {
  businessId: string
  onClose: (shouldRefresh?: boolean) => void
  showPurchaseOrderButton?: boolean  // 발주 필요 탭에서만 표시
}

export default function OrderDetailModal({
  businessId,
  onClose,
  showPurchaseOrderButton = false
}: OrderDetailModalProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [data, setData] = useState<OrderDetailResponse['data'] | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'timeline'>('info')
  const [showPurchaseOrderModal, setShowPurchaseOrderModal] = useState(false)
  const [showBusinessQuickView, setShowBusinessQuickView] = useState(false)

  // 단계별 날짜 상태
  const [stepDates, setStepDates] = useState<Record<string, string | null>>({
    layout_date: null,
    order_form_date: null,
    ip_request_date: null,
    greenlink_ip_setting_date: null,
    router_request_date: null
  })

  // 날짜 입력 상태 (연도, 월, 일 분리)
  const [dateInputs, setDateInputs] = useState<Record<string, { year: string; month: string; day: string }>>({
    layout_date: { year: '', month: '', day: '' },
    order_form_date: { year: '', month: '', day: '' },
    ip_request_date: { year: '', month: '', day: '' },
    greenlink_ip_setting_date: { year: '', month: '', day: '' },
    router_request_date: { year: '', month: '', day: '' }
  })

  // 데이터 로드
  useEffect(() => {
    loadOrderDetail()
  }, [businessId])

  const loadOrderDetail = async () => {
    try {
      setLoading(true)

      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null

      const response = await fetch(`/api/order-management/${businessId}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })

      if (!response.ok) {
        throw new Error('Failed to load order detail')
      }

      const result: OrderDetailResponse = await response.json()

      if (result.success && result.data) {
        setData(result.data)
        const dates = {
          layout_date: result.data.order.layout_date,
          order_form_date: result.data.order.order_form_date,
          ip_request_date: result.data.order.ip_request_date,
          greenlink_ip_setting_date:
            result.data.order.greenlink_ip_setting_date,
          router_request_date: result.data.order.router_request_date
        }
        setStepDates(dates)

        // 날짜를 연도, 월, 일로 분리하여 초기화
        const parseDate = (dateStr: string | null) => {
          if (!dateStr) return { year: '', month: '', day: '' }
          const [year, month, day] = dateStr.split('-')
          return { year, month, day }
        }

        setDateInputs({
          layout_date: parseDate(dates.layout_date),
          order_form_date: parseDate(dates.order_form_date),
          ip_request_date: parseDate(dates.ip_request_date),
          greenlink_ip_setting_date: parseDate(dates.greenlink_ip_setting_date),
          router_request_date: parseDate(dates.router_request_date)
        })
      }
    } catch (error) {
      console.error('발주 상세 정보 로드 오류:', error)
      alert('발주 상세 정보를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 날짜 변경 핸들러
  const handleDateChange = (field: string, value: string | null) => {
    setStepDates((prev) => ({
      ...prev,
      [field]: value
    }))
  }

  // 개별 날짜 필드 변경 핸들러
  const handleDateFieldChange = (stepField: string, dateField: 'year' | 'month' | 'day', value: string) => {
    // 숫자만 허용
    const numeric = value.replace(/\D/g, '')

    // 최대 길이 제한: year=4, month=2, day=2
    const maxLengths = { year: 4, month: 2, day: 2 }
    const truncated = numeric.slice(0, maxLengths[dateField])

    // 상태 업데이트
    setDateInputs(prev => {
      const updated = {
        ...prev[stepField],
        [dateField]: truncated
      }

      // 모든 필드가 입력되었으면 자동으로 날짜 조합 및 저장
      if (updated.year.length === 4 && updated.month && updated.day) {
        const assembled = `${updated.year}-${updated.month.padStart(2, '0')}-${updated.day.padStart(2, '0')}`

        // 유효한 날짜인지 검증
        const date = new Date(assembled)
        const isValid = date instanceof Date && !isNaN(date.getTime())

        if (isValid) {
          handleDateChange(stepField, assembled)
        }
      } else {
        // 불완전한 입력이면 null로 설정
        handleDateChange(stepField, null)
      }

      return {
        ...prev,
        [stepField]: updated
      }
    })
  }

  // 날짜 필드 blur 핸들러 (유효성 검증 - 마지막 필드에서만)
  const handleDateFieldBlur = (stepField: string, dateField: 'year' | 'month' | 'day') => {
    const input = dateInputs[stepField]

    // 빈 값이면 초기화
    if (!input.year && !input.month && !input.day) {
      handleDateChange(stepField, null)
      return
    }

    // 마지막 필드(일)를 벗어날 때만 최종 검증
    if (dateField === 'day') {
      // 모든 필드가 입력되었는지 확인
      if (input.year.length === 4 && input.month && input.day) {
        const assembled = `${input.year}-${input.month.padStart(2, '0')}-${input.day.padStart(2, '0')}`

        // 유효한 날짜인지 검증
        const date = new Date(assembled)
        const isValid = date instanceof Date && !isNaN(date.getTime())

        if (!isValid) {
          alert('올바른 날짜를 입력해주세요.')
          // 이전 값으로 복원
          if (stepDates[stepField]) {
            const [year, month, day] = stepDates[stepField]!.split('-')
            setDateInputs(prev => ({
              ...prev,
              [stepField]: { year, month, day }
            }))
          } else {
            setDateInputs(prev => ({
              ...prev,
              [stepField]: { year: '', month: '', day: '' }
            }))
          }
        }
      } else if (input.year || input.month || input.day) {
        // 일부만 입력된 경우 (마지막 필드에서만 경고)
        alert('연도, 월, 일을 모두 입력해주세요.')
        // 이전 값으로 복원
        if (stepDates[stepField]) {
          const [year, month, day] = stepDates[stepField]!.split('-')
          setDateInputs(prev => ({
            ...prev,
            [stepField]: { year, month, day }
          }))
        } else {
          setDateInputs(prev => ({
            ...prev,
            [stepField]: { year: '', month: '', day: '' }
          }))
        }
      }
    }
    // 연도나 월 필드에서는 검증하지 않고 자유롭게 이동 허용
  }

  // 오늘 날짜 입력
  const handleSetToday = (stepField: string) => {
    const today = new Date()
    const year = today.getFullYear().toString()
    const month = (today.getMonth() + 1).toString().padStart(2, '0')
    const day = today.getDate().toString().padStart(2, '0')

    // dateInputs 업데이트
    setDateInputs(prev => ({
      ...prev,
      [stepField]: { year, month, day }
    }))

    // 날짜 조합하여 stepDates 업데이트
    const assembled = `${year}-${month}-${day}`
    handleDateChange(stepField, assembled)
  }

  // 단계별 날짜 저장 (PUT) - handleSave와 handleComplete가 공통으로 사용
  const saveStepDates = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null

    console.log('🔍 [ORDER-SAVE] 저장 시도:', stepDates)

    const response = await fetch(`/api/order-management/${businessId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      credentials: 'include',
      body: JSON.stringify(stepDates)
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('❌ [ORDER-SAVE] 서버 응답 오류:', errorData)
      throw new Error(errorData.error || 'Failed to update order')
    }

    const result = await response.json()
    console.log('✅ [ORDER-SAVE] 저장 성공:', result)
    return result
  }

  // 저장
  const handleSave = async () => {
    try {
      setSaving(true)
      await saveStepDates()
      alert('저장되었습니다.')
      await loadOrderDetail() // 데이터 새로고침
    } catch (error) {
      console.error('💥 [ORDER-SAVE] 발주 정보 저장 오류:', error)
      alert(`저장 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    } finally {
      setSaving(false)
    }
  }

  // 발주 완료
  const handleComplete = async () => {
    if (!data) return

    // 미완료 단계 확인
    const workflow = MANUFACTURER_WORKFLOWS[data.workflow.manufacturer]
    const missingSteps = workflow.steps.filter(
      (step) => !stepDates[step.field]
    )

    if (missingSteps.length > 0) {
      alert(
        `다음 단계를 완료해주세요:\n${missingSteps.map((s) => `- ${s.label}`).join('\n')}`
      )
      return
    }

    if (!confirm('발주를 완료하시겠습니까?')) {
      return
    }

    try {
      setCompleting(true)

      // 완료 처리 전에 입력된 단계 날짜를 먼저 저장한다.
      // 저장이 실패하면 완료 처리로 넘어가지 않고 아래 catch에서 에러를 표시한다.
      await saveStepDates()

      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null

      const response = await fetch(
        `/api/order-management/${businessId}/complete`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include'
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to complete order')
      }

      const result = await response.json()
      alert(result.data?.message || '발주가 완료되었습니다.')
      onClose(true) // 목록 새로고침
    } catch (error) {
      console.error('발주 완료 처리 오류:', error)
      alert(
        error instanceof Error
          ? error.message
          : '발주 완료 처리 중 오류가 발생했습니다.'
      )
    } finally {
      setCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-8">
          <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto" />
          <p className="mt-4 text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const workflow = MANUFACTURER_WORKFLOWS[data.workflow.manufacturer]
  const isCompleted = data.order.status === 'completed'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {data.business.business_name}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {workflow.name} · {data.workflow.completed_steps}/
              {data.workflow.total_steps} 단계 완료
            </p>
          </div>
          <button
            onClick={() => onClose()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* 진행률 */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-4 mb-2">
            <span className="text-sm font-medium text-gray-700">진행률</span>
            <div className="flex-1 bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full transition-all"
                style={{ width: `${data.workflow.progress_percentage}%` }}
              />
            </div>
            <span className="text-lg font-bold text-green-600">
              {data.workflow.progress_percentage}%
            </span>
          </div>
        </div>

        {/* 탭 메뉴 */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'info'
                ? 'text-green-600 border-b-2 border-green-600 bg-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Building2 className="w-4 h-4" />
              사업장 정보 & 진행 단계
            </div>
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'timeline'
                ? 'text-green-600 border-b-2 border-green-600 bg-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              진행 이력
            </div>
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {activeTab === 'info' ? (
            <div>
              {/* 사업장 정보 */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-green-600" />
                사업장 정보
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    console.log('상세보기 버튼 클릭!')
                    setShowBusinessQuickView(true)
                  }}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
                  data-testid="business-detail-button"
                >
                  <FileText className="w-4 h-4" />
                  상세보기
                </button>

                {/* 대기필증 수정 버튼 */}
                <button
                  onClick={() => {
                    if (!data.business.air_permit_id) {
                      alert('이 사업장의 대기필증 정보가 없습니다.\n대기필증 관리 페이지에서 먼저 생성해주세요.')
                      return
                    }
                    const url = `/admin/air-permit-detail?permitId=${data.business.air_permit_id}&edit=true`
                    window.open(url, '_blank')
                  }}
                  disabled={!data.business.air_permit_id}
                  className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${
                    data.business.air_permit_id
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  title={data.business.air_permit_id ? '대기필증 수정' : '대기필증 정보 없음'}
                >
                  <FileText className="w-4 h-4" />
                  대기필증 수정
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gray-600">주소</div>
                  <div className="text-sm font-medium text-gray-900">
                    {data.business.address || '-'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gray-600">담당자</div>
                  <div className="text-sm font-medium text-gray-900">
                    {data.business.manager_name || '-'}{' '}
                    {data.business.manager_position || ''}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gray-600">연락처</div>
                  <div className="text-sm font-medium text-gray-900">
                    {data.business.manager_contact || '-'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gray-600">제조사</div>
                  <div className="text-sm font-medium text-gray-900">
                    {workflow.name}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Wifi className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gray-600">VPN</div>
                  <div className="text-sm font-medium text-gray-900">
                    {data.business.vpn === 'wired' ? '유선' : '무선'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gray-600">그린링크 계정</div>
                  <div className="text-sm font-medium text-gray-900">
                    {data.business.greenlink_id || '-'} /{' '}
                    {data.business.greenlink_pw || '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 발주 진행 단계 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-green-600" />
                발주 진행 단계
              </h3>
              {showPurchaseOrderButton && (
                <button
                  onClick={() => setShowPurchaseOrderModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <FileText className="w-4 h-4" />
                  발주서 생성하기
                </button>
              )}
            </div>
            <div className="space-y-4">
              {workflow.steps.map((step, index) => {
                const isStepCompleted = !!stepDates[step.field]

                return (
                  <div
                    key={step.key}
                    className={`border rounded-lg p-4 transition-all ${
                      isStepCompleted
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {isStepCompleted ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {index + 1}. {step.label}
                        </div>
                      </div>
                    </div>

                    <div className="ml-8">
                      <label className="block text-sm text-gray-600 mb-1">
                        완료일
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={dateInputs[step.field].year}
                            onChange={(e) => handleDateFieldChange(step.field, 'year', e.target.value)}
                            onBlur={() => handleDateFieldBlur(step.field, 'year')}
                            disabled={isCompleted}
                            placeholder="연도"
                            maxLength={4}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed w-20 text-center"
                          />
                          <span className="text-xs text-gray-500 mt-1 text-center">연도</span>
                        </div>
                        <span className="text-gray-400">-</span>
                        <div className="flex flex-col">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={dateInputs[step.field].month}
                            onChange={(e) => handleDateFieldChange(step.field, 'month', e.target.value)}
                            onBlur={() => handleDateFieldBlur(step.field, 'month')}
                            disabled={isCompleted}
                            placeholder="월"
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed w-16 text-center"
                          />
                          <span className="text-xs text-gray-500 mt-1 text-center">월</span>
                        </div>
                        <span className="text-gray-400">-</span>
                        <div className="flex flex-col">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={dateInputs[step.field].day}
                            onChange={(e) => handleDateFieldChange(step.field, 'day', e.target.value)}
                            onBlur={() => handleDateFieldBlur(step.field, 'day')}
                            disabled={isCompleted}
                            placeholder="일"
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed w-16 text-center"
                          />
                          <span className="text-xs text-gray-500 mt-1 text-center">일</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSetToday(step.field)}
                          disabled={isCompleted}
                          className="px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                          오늘
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
            </div>
          ) : (
            <OrderTimeline businessId={businessId} />
          )}
        </div>

        {/* 발주서 생성 모달 */}
        {showPurchaseOrderModal && data && (
          <PurchaseOrderModal
            isOpen={showPurchaseOrderModal}
            onClose={() => setShowPurchaseOrderModal(false)}
            businessId={businessId}
            businessName={data.business.business_name}
          />
        )}

        {/* 푸터 */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => onClose()}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            닫기
          </button>

          <div className="flex gap-3">
            {!isCompleted && (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  저장
                </button>

                <button
                  onClick={handleComplete}
                  disabled={completing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {completing && <Loader2 className="w-4 h-4 animate-spin" />}
                  발주 완료
                </button>
              </>
            )}

            {isCompleted && (
              <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg font-medium">
                발주 완료됨
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Business Quick View Modal */}
      {showBusinessQuickView && data && (
        <BusinessQuickView
          isOpen={showBusinessQuickView}
          business={data.business}
          manufacturer={workflow.name}
          onClose={() => setShowBusinessQuickView(false)}
        />
      )}

      {/* Purchase Order Modal */}
      {showPurchaseOrderModal && data && (
        <PurchaseOrderModal
          businessId={businessId}
          businessName={data.business.business_name}
          onClose={() => setShowPurchaseOrderModal(false)}
        />
      )}
    </div>
  )
}
