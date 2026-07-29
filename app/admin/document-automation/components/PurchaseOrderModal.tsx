// app/admin/document-automation/components/PurchaseOrderModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { X, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import type { PurchaseOrderData, PurchaseOrderDataEcosense, CreatePurchaseOrderRequest } from '@/types/document-automation'
import EcosensePurchaseOrderForm from '@/components/EcosensePurchaseOrderForm'
import DeliveryAddressManager from '@/components/DeliveryAddressManager'
import { generateEcosensePurchaseOrderPDF } from '@/lib/document-generators/pdf-generator-ecosense'

interface PurchaseOrderModalProps {
  isOpen: boolean
  onClose: () => void
  businessId: string
  businessName: string
  onDocumentCreated?: () => void
}

export default function PurchaseOrderModal({
  isOpen,
  onClose,
  businessId,
  businessName,
  onDocumentCreated
}: PurchaseOrderModalProps) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [data, setData] = useState<PurchaseOrderDataEcosense | null>(null)
  const [editedData, setEditedData] = useState<PurchaseOrderDataEcosense | null>(null)
  const [deliveryAddresses, setDeliveryAddresses] = useState<any[]>([])
  const [selectedDeliveryAddress, setSelectedDeliveryAddress] = useState<string>('')

  // 데이터 로드
  useEffect(() => {
    if (isOpen && businessId) {
      loadData()
      loadDeliveryAddresses()
    }
  }, [isOpen, businessId])

  const loadData = async () => {
    try {
      setLoading(true)

      const token = localStorage.getItem('auth_token')
      const response = await fetch(
        `/api/document-automation/purchase-order?business_id=${businessId}`,
        {
          credentials: 'include',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        }
      )

      if (!response.ok) {
        throw new Error('데이터 로드 실패')
      }

      const result = await response.json()
      const loadedData = result.data.data as PurchaseOrderDataEcosense

      // 기본 CT 타입 설정 (16L)
      const dischargeCt = loadedData.equipment?.discharge_ct || 0

      // CT 타입이 설정되지 않은 경우 기본값으로 16L에 배출 전류계 수량 할당
      if (!loadedData.ct_16l && !loadedData.ct_24l && !loadedData.ct_36l) {
        loadedData.ct_16l = dischargeCt
        loadedData.ct_24l = 0
        loadedData.ct_36l = 0
      }

      // 기본값 설정
      if (!loadedData.temperature_sensor_type) {
        loadedData.temperature_sensor_type = 'flange'
      }
      if (!loadedData.temperature_sensor_length) {
        loadedData.temperature_sensor_length = '10cm'
      }
      if (!loadedData.ph_indicator_location) {
        loadedData.ph_indicator_location = 'independent_box'
      }
      if (!loadedData.payment_terms) {
        loadedData.payment_terms = 'other_prepaid'
      }

      setData(loadedData)
      setEditedData(loadedData)
    } catch (error) {
      console.error('데이터 로드 오류:', error)
      alert('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadDeliveryAddresses = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/delivery-addresses?active_only=true', {
        credentials: 'include',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const result = await response.json()
        setDeliveryAddresses(result.data?.addresses || [])

        // 기본 주소 자동 선택
        const defaultAddress = result.data?.addresses?.find((addr: any) => addr.is_default)
        if (defaultAddress) {
          setSelectedDeliveryAddress(defaultAddress.id)
        }
      }
    } catch (error) {
      console.error('택배 주소 로드 오류:', error)
    }
  }

  const handleDeliveryAddressChange = (addressId: string) => {
    setSelectedDeliveryAddress(addressId)
    const selectedAddr = deliveryAddresses.find(addr => addr.id === addressId)

    if (selectedAddr && editedData) {
      setEditedData({
        ...editedData,
        delivery_address: selectedAddr.address,
        delivery_recipient: selectedAddr.recipient,
        delivery_contact: selectedAddr.phone,
        delivery_postal_code: selectedAddr.postal_code,
        delivery_full_address: `${selectedAddr.postal_code ? `[${selectedAddr.postal_code}] ` : ''}${selectedAddr.address}`,
        delivery_address_detail: selectedAddr.address_detail || ''
      })
    }
  }

  const handleGenerate = async (fileFormat: 'excel' | 'pdf') => {
    if (!editedData) return

    try {
      setGenerating(true)

      // 제조사별 파일 형식 결정
      const manufacturer = editedData.manufacturer

      // 제조사 정규화: 한글 → 영문 코드 변환
      const normalizeManufacturer = (value: string | null | undefined): string => {
        if (!value) return ''
        const normalized = value.trim().toLowerCase()

        // 한글 → 영문 매핑
        const mapping: Record<string, string> = {
          '에코센스': 'ecosense',
          'ecosense': 'ecosense',
          '크린어스': 'cleanearth',
          'cleanearth': 'cleanearth',
          '가이아씨앤에스': 'gaia_cns',
          'gaia_cns': 'gaia_cns',
          '이브이에스': 'evs',
          'evs': 'evs'
        }

        return mapping[normalized] || normalized
      }

      const normalizedManufacturer = normalizeManufacturer(manufacturer)
      const isEcosense = normalizedManufacturer === 'ecosense'

      console.log('[PURCHASE-ORDER-MODAL] 제조사 확인:', {
        originalManufacturer: manufacturer,
        normalizedManufacturer,
        businessName: editedData.business_name,
        isEcosense
      })

      // 에코센스는 Excel (서버 생성), 다른 제조사는 PDF (클라이언트 생성)
      if (isEcosense) {
        // 에코센스: 서버에서 Excel 생성
        const request: CreatePurchaseOrderRequest = {
          business_id: businessId,
          data: editedData,
          file_format: 'excel'
        }

        const token = localStorage.getItem('auth_token')
        const response = await fetch('/api/document-automation/purchase-order', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(request)
        })

        if (!response.ok) {
          throw new Error('발주서 생성 실패')
        }

        const result = await response.json()

        // Supabase Storage URL에서 파일 다운로드
        const fileResponse = await fetch(result.data.file_url)
        if (!fileResponse.ok) {
          throw new Error(`파일 다운로드 실패: ${fileResponse.status}`)
        }

        const blob = await fileResponse.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = result.data.document_name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        alert(`발주서가 생성되었습니다: ${result.data.document_name}`)

        // ✅ 실행 이력 탭 갱신
        onDocumentCreated?.()
      } else {
        // 다른 제조사: 클라이언트에서 PDF 직접 생성 (한글 지원)
        console.log(`[PURCHASE-ORDER-MODAL] ${manufacturer}: 클라이언트에서 PDF 생성 (한글 지원)`)

        const pdfBuffer = await generateEcosensePurchaseOrderPDF(editedData)

        const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        const fileName = `발주서_${editedData.business_name}_${new Date().toISOString().split('T')[0]}.pdf`
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        // 이력 저장을 위한 API 호출 (파일은 클라이언트에서 다운로드, 이력만 서버에 기록)
        try {
          const token = localStorage.getItem('auth_token')
          await fetch('/api/document-automation/history', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              business_id: businessId,
              document_type: 'purchase_order',
              document_name: fileName,
              document_data: editedData,
              file_format: 'pdf',
              file_size: pdfBuffer.length,
              file_path: null // 클라이언트 생성이므로 저장소 경로 없음
            })
          })
        } catch (historyError) {
          console.error('이력 저장 오류 (다운로드는 성공):', historyError)
        }

        alert(`발주서 PDF가 생성되었습니다.`)

        // ✅ 실행 이력 탭 갱신
        onDocumentCreated?.()
      }

      onClose()
    } catch (error) {
      console.error('발주서 생성 오류:', error)
      alert('발주서 생성 중 오류가 발생했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-[98vw] md:max-w-[95vw] lg:max-w-[85vw] xl:max-w-[80vw] h-[98vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0 mr-2">
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 truncate">발주서 생성</h2>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">{businessName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* 내용 - 2단 레이아웃 */}
        <div className="flex-1 overflow-hidden min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 sm:py-12">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-blue-600" />
            </div>
          ) : editedData ? (
            <div className="flex flex-col md:flex-row h-full gap-3 sm:gap-4 p-3 sm:p-4">
              {/* 왼쪽: 입력 폼 */}
              <div className="w-full md:w-80 md:flex-shrink-0 overflow-y-auto space-y-2 sm:space-y-3 min-h-[400px] md:min-h-0">

              {/* 택배 주소 선택 */}
              <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">택배 주소</h3>
                <DeliveryAddressManager
                  selectedId={selectedDeliveryAddress}
                  onSelect={(address) => {
                    setSelectedDeliveryAddress(address.id)
                    setEditedData({
                      ...editedData,
                      delivery_address: address.address,
                      delivery_full_address: address.address,
                      delivery_recipient: address.recipient,
                      delivery_contact: address.phone,
                      delivery_postal_code: address.postal_code
                    })
                  }}
                />
              </div>

              {/* 전류계 타입 설정 */}
              <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">전류계 구경(CT 사이즈)</h3>
                <p className="text-[10px] sm:text-xs text-gray-500 mb-2 sm:mb-3">
                  정격: 배출 100A {Math.max(0, (editedData.equipment?.discharge_ct || 0) - (editedData.equipment?.discharge_ct_400a || 0))}대 / 400A {editedData.equipment?.discharge_ct_400a || 0}대,
                  {' '}송풍 100A {Math.max(0, (editedData.equipment?.fan_ct || 0) - (editedData.equipment?.fan_ct_400a || 0))}대 / 400A {editedData.equipment?.fan_ct_400a || 0}대,
                  {' '}펌프 100A {Math.max(0, (editedData.equipment?.pump_ct || 0) - (editedData.equipment?.pump_ct_400a || 0))}대 / 400A {editedData.equipment?.pump_ct_400a || 0}대
                  {' '}— 사업장정보에서 수정
                </p>
                <div className="space-y-1.5 sm:space-y-2">
                  <div>
                    <label className="block text-[11px] sm:text-xs md:text-sm font-medium text-gray-700 mb-1">
                      16L 수량 (자동 계산)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editedData.ct_16l || 0}
                      readOnly
                      className="w-full px-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] sm:text-xs md:text-sm font-medium text-gray-700 mb-1">
                      24L 수량
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editedData.ct_24l || 0}
                      onChange={(e) => {
                        const dischargeCt = editedData.equipment?.discharge_ct || 0
                        const ct24l = Math.max(0, Number(e.target.value))
                        const ct36l = editedData.ct_36l || 0

                        // 24L + 36L이 배출 전류계 수량을 초과하지 않도록
                        if (ct24l + ct36l <= dischargeCt) {
                          const ct16l = dischargeCt - ct24l - ct36l
                          setEditedData({
                            ...editedData,
                            ct_16l: ct16l,
                            ct_24l: ct24l
                          })
                        }
                      }}
                      className="w-full px-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] sm:text-xs md:text-sm font-medium text-gray-700 mb-1">
                      36L 수량
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editedData.ct_36l || 0}
                      onChange={(e) => {
                        const dischargeCt = editedData.equipment?.discharge_ct || 0
                        const ct24l = editedData.ct_24l || 0
                        const ct36l = Math.max(0, Number(e.target.value))

                        // 24L + 36L이 배출 전류계 수량을 초과하지 않도록
                        if (ct24l + ct36l <= dischargeCt) {
                          const ct16l = dischargeCt - ct24l - ct36l
                          setEditedData({
                            ...editedData,
                            ct_16l: ct16l,
                            ct_36l: ct36l
                          })
                        }
                      }}
                      className="w-full px-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 sm:mt-2">
                  배출 전류계 수량: {editedData.equipment?.discharge_ct || 0}개
                  (16L: {editedData.ct_16l || 0}개,
                   24L: {editedData.ct_24l || 0}개,
                   36L: {editedData.ct_36l || 0}개)
                </p>
                <p className="text-[10px] sm:text-xs text-blue-600 mt-1">
                  * 송풍+펌프 전류계는 항상 16L로 표시됩니다.
                </p>
              </div>

              {/* 온도센서 타입 */}
              <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 md:p-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3 md:mb-4">온도센서 타입</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.temperature_sensor_type === 'flange'}
                      onChange={(e) => setEditedData({ ...editedData, temperature_sensor_type: 'flange' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">프렌지타입</span>
                  </label>
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.temperature_sensor_type === 'nipple'}
                      onChange={(e) => setEditedData({ ...editedData, temperature_sensor_type: 'nipple' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">니플(소켓)타입</span>
                  </label>
                </div>
                <p className="text-[10px] sm:text-xs text-blue-600 mt-1.5 sm:mt-2">* 기본값: 프렌지타입</p>
              </div>

              {/* 온도센서 길이 */}
              <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 md:p-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3 md:mb-4">온도센서 길이</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.temperature_sensor_length === '10cm'}
                      onChange={(e) => setEditedData({ ...editedData, temperature_sensor_length: '10cm' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">10CM</span>
                  </label>
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.temperature_sensor_length === '20cm'}
                      onChange={(e) => setEditedData({ ...editedData, temperature_sensor_length: '20cm' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">20CM</span>
                  </label>
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.temperature_sensor_length === '40cm'}
                      onChange={(e) => setEditedData({ ...editedData, temperature_sensor_length: '40cm' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">40CM</span>
                  </label>
                </div>
                <p className="text-[10px] sm:text-xs text-blue-600 mt-1.5 sm:mt-2">* 기본값: 10CM</p>
              </div>

              {/* PH 인디게이터 부착위치 */}
              <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 md:p-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3 md:mb-4">PH 인디게이터 부착위치</h3>
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.ph_indicator_location === 'panel'}
                      onChange={(e) => setEditedData({ ...editedData, ph_indicator_location: 'panel' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">방지시설판넬(타공)</span>
                  </label>
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.ph_indicator_location === 'independent_box'}
                      onChange={(e) => setEditedData({ ...editedData, ph_indicator_location: 'independent_box' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">독립형하이박스부착</span>
                  </label>
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.ph_indicator_location === 'none'}
                      onChange={(e) => setEditedData({ ...editedData, ph_indicator_location: 'none' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">해당없음</span>
                  </label>
                </div>
                <p className="text-[10px] sm:text-xs text-blue-600 mt-1.5 sm:mt-2">* 기본값: 독립형하이박스부착</p>
              </div>

              {/* 결제조건 */}
              <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 md:p-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3 md:mb-4">결제조건*세금계산서 발행 후 7일 이내</h3>
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.payment_terms === 'prepay_5_balance_5'}
                      onChange={(e) => setEditedData({ ...editedData, payment_terms: 'prepay_5_balance_5' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">선금5(발주기준) | 잔금5(납품완료기준)</span>
                  </label>
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.payment_terms === 'full_after_delivery'}
                      onChange={(e) => setEditedData({ ...editedData, payment_terms: 'full_after_delivery' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">납품 후 완납(납품완료기준)</span>
                  </label>
                  <label className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedData.payment_terms === 'other_prepaid'}
                      onChange={(e) => setEditedData({ ...editedData, payment_terms: 'other_prepaid' })}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0"
                    />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">기타사항(선입금)</span>
                  </label>
                </div>
                <p className="text-[10px] sm:text-xs text-blue-600 mt-1.5 sm:mt-2">* 기본값: 기타사항(선입금)</p>
              </div>
              </div>

              {/* 오른쪽: 발주서 미리보기 */}
              <div className="flex-1 overflow-y-auto min-h-[600px] md:min-h-0">
                <div className="text-center mb-2 sm:mb-3 md:mb-4">
                  <span className="inline-block bg-blue-100 text-blue-800 text-[11px] sm:text-xs md:text-sm font-semibold px-2 sm:px-2.5 md:px-3 py-0.5 rounded-full">
                    발주서 미리보기
                  </span>
                </div>
                <div className="text-sm">
                  <EcosensePurchaseOrderForm
                    data={editedData}
                    showPrintButton={false}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 sm:py-12 text-sm sm:text-base text-gray-500">
              데이터를 불러올 수 없습니다.
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 p-3 sm:p-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors order-2 sm:order-1"
            disabled={generating}
          >
            취소
          </button>
          <div className="order-1 sm:order-2">
            <button
              onClick={() => handleGenerate('excel')}
              disabled={generating || !editedData}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-1.5 sm:py-2 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm rounded-lg transition-colors disabled:bg-gray-400"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
              발주서 다운로드
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
