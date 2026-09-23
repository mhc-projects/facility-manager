// app/admin/document-automation/components/ContractManagement.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  FileText,
  Plus,
  Download,
  Eye,
  Search,
  Calendar,
  Building2,
  Loader2,
  Trash2,
  FileCheck,
  Settings
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { AUTH_LEVEL_DESCRIPTIONS } from '@/lib/auth/AuthLevels'

// Code Splitting: 모달 컴포넌트는 사용할 때만 로드
const ContractPreviewModal = dynamic(() => import('./ContractPreviewModal'), {
  loading: () => <div className="text-center py-4">로딩 중...</div>,
  ssr: false
})

const ContractTemplateEditor = dynamic(() => import('./ContractTemplateEditor'), {
  loading: () => <div className="text-center py-4">로딩 중...</div>,
  ssr: false
})

interface Business {
  id: string
  business_name: string
  address?: string
  representative?: string
  total_revenue?: number
}

interface Contract {
  id: string
  business_id: string
  business_name: string
  contract_type: 'subsidy' | 'self_pay'
  contract_number: string
  contract_date: string
  total_amount: number
  base_revenue?: number  // 기본 매출 (기기 합계)
  final_amount?: number  // 최종 매출 (기본 + 추가공사비 - 협의사항)
  business_address?: string
  business_representative?: string
  business_registration_number?: string
  business_phone?: string
  business_fax?: string
  supplier_company_name?: string
  supplier_representative?: string
  supplier_address?: string
  terms_and_conditions?: string
  pdf_file_url?: string
  payment_advance_ratio?: number
  payment_balance_ratio?: number
  additional_cost?: number
  negotiation_cost?: number
  equipment_counts?: {
    ph_meter: number
    differential_pressure_meter: number
    temperature_meter: number
    discharge_current_meter: number
    fan_current_meter: number
    pump_current_meter: number
    gateway: number
    vpn: number
  }
  created_at: string
}

interface ContractManagementProps {
  onDocumentCreated?: () => void
}

export default function ContractManagement({ onDocumentCreated }: ContractManagementProps) {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null)
  const [selectedContractType, setSelectedContractType] = useState<'subsidy' | 'self_pay'>('subsidy')
  const [generatingContract, setGeneratingContract] = useState(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false)
  const [editingTemplateType, setEditingTemplateType] = useState<'subsidy' | 'self_pay'>('subsidy')
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [filteredBusinesses, setFilteredBusinesses] = useState<Business[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [paymentAdvanceRatio, setPaymentAdvanceRatio] = useState(50)
  const [paymentBalanceRatio, setPaymentBalanceRatio] = useState(50)
  const autocompleteRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { user } = useAuth()
  const userPermissionLevel = user?.permission_level || 0

  // 권한 체크
  const canView = userPermissionLevel >= 1
  const canCreate = userPermissionLevel >= 1
  const canEdit = userPermissionLevel >= 1
  const canDelete = userPermissionLevel >= 4
  const canEditTemplate = userPermissionLevel >= 4

  useEffect(() => {
    if (canView) {
      // API 병렬 처리로 성능 개선
      Promise.all([
        loadBusinesses(),
        loadContracts()
      ]).catch(error => {
        console.error('데이터 로드 오류:', error)
      })
    }
  }, [canView])

  useEffect(() => {
    if (selectedBusiness && canView) {
      loadContracts(selectedBusiness.id)
    } else if (canView) {
      loadContracts()
    }
  }, [selectedBusiness, canView])

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredBusinesses([])
      setShowDropdown(false)
      setHighlightedIndex(-1)
    } else {
      const filtered = businesses.filter(b =>
        b.business_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredBusinesses(filtered)
      setShowDropdown(filtered.length > 0)
      setHighlightedIndex(-1)
    }
  }, [searchTerm, businesses])

  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // 하이라이트된 항목이 보이도록 스크롤
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        })
      }
    }
  }, [highlightedIndex])

  const loadBusinesses = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/business-info-direct', {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      const data = await response.json()
      if (data.success) {
        setBusinesses(data.data || [])
      }
    } catch (error) {
      console.error('사업장 로드 오류:', error)
    }
  }

  const loadContracts = async (businessId?: string) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      // document_history에서 계약서 조회 (실행 이력과 동일한 데이터 소스)
      const url = businessId
        ? `/api/document-automation/history?business_id=${businessId}&document_type=contract`
        : '/api/document-automation/history?document_type=contract'

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const result = await response.json()

      if (result.success && result.data) {
        // document_history 형식을 Contract 형식으로 변환
        const contracts = result.data.documents.map((doc: any) => {
          const contractData = typeof doc.document_data === 'string'
            ? JSON.parse(doc.document_data)
            : doc.document_data

          return {
            id: doc.id,
            business_id: doc.business_id,
            business_name: doc.business_name || contractData.business_name,
            contract_type: contractData.contract_type,
            contract_number: contractData.contract_number,
            contract_date: contractData.contract_date,
            total_amount: contractData.total_amount,
            base_revenue: contractData.base_revenue,
            final_amount: contractData.final_amount,
            business_address: contractData.business_address,
            business_representative: contractData.business_representative,
            business_registration_number: contractData.business_registration_number,
            business_phone: contractData.business_phone,
            business_fax: contractData.business_fax,
            supplier_company_name: contractData.supplier_company_name,
            supplier_representative: contractData.supplier_representative,
            supplier_address: contractData.supplier_address,
            payment_advance_ratio: contractData.payment_advance_ratio,
            payment_balance_ratio: contractData.payment_balance_ratio,
            additional_cost: contractData.additional_cost,
            negotiation_cost: contractData.negotiation_cost,
            equipment_counts: contractData.equipment_counts,
            created_at: doc.created_at,
            pdf_file_url: doc.file_path
          }
        })

        setContracts(contracts)
      }
    } catch (error) {
      console.error('계약서 로드 오류:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateContract = async () => {
    if (!selectedBusiness || !canCreate) {
      alert('사업장을 선택해주세요.')
      return
    }

    if (!confirm(`${selectedBusiness.business_name}의 ${selectedContractType === 'subsidy' ? '보조금' : '자비'} 계약서를 생성하시겠습니까?`)) {
      return
    }

    setGeneratingContract(true)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/document-automation/contract', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          business_id: selectedBusiness.id,
          contract_type: selectedContractType,
          payment_advance_ratio: paymentAdvanceRatio,
          payment_balance_ratio: paymentBalanceRatio
        })
      })

      const data = await response.json()
      if (data.success) {
        alert('계약서가 생성되었습니다.')

        // 계약서 목록 전체를 다시 로드하여 document_history에서 최신 데이터 가져오기
        loadContracts(selectedBusiness ? selectedBusiness.id : undefined)

        // ✅ 실행 이력 탭 갱신
        onDocumentCreated?.()

        // 생성된 계약서로 자동 PDF 저장 (백그라운드)
        const createdContract = data.data.contract
        savePDFAfterCreation(createdContract, data.data.document_history_id)
          .then(() => {
            console.log('PDF 자동 저장 완료')
            // PDF 저장 후 다시 로드하여 file_path 업데이트
            loadContracts(selectedBusiness ? selectedBusiness.id : undefined)
            // ✅ PDF 저장 후에도 실행 이력 탭 갱신
            onDocumentCreated?.()
          })
          .catch(err => {
            console.error('PDF 자동 저장 실패:', err)
          })
      } else {
        alert(data.message || '계약서 생성에 실패했습니다.')
      }
    } catch (error) {
      console.error('계약서 생성 오류:', error)
      alert('계약서 생성 중 오류가 발생했습니다.')
    } finally {
      setGeneratingContract(false)
    }
  }

  const savePDFAfterCreation = async (contract: any, documentHistoryId: string | null) => {
    if (!documentHistoryId) throw new Error('실행 이력 ID가 없어 PDF를 저장할 수 없습니다.')
    try {
      // 임시로 DOM에 렌더링하기 위한 div 생성
      const tempDiv = document.createElement('div')
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-9999px'
      tempDiv.style.top = '0'
      document.body.appendChild(tempDiv)

      // React 컴포넌트를 DOM에 렌더링
      const { default: SubsidyContractTemplate } = await import('./SubsidyContractTemplate')
      const { default: SelfPayContractTemplate } = await import('./SelfPayContractTemplate')
      const { generateContractPDF, uploadContractPDF } = await import('@/utils/contractPdfGenerator')
      const { createRoot } = await import('react-dom/client')

      const contractData = {
        contract_number: contract.contract_number,
        contract_date: contract.contract_date,
        contract_type: contract.contract_type,
        business_name: contract.business_name,
        business_address: contract.business_address || '',
        business_representative: contract.business_representative || '',
        business_registration_number: contract.business_registration_number || '',
        business_phone: contract.business_phone || '',
        business_fax: contract.business_fax || '',
        total_amount: contract.total_amount,
        base_revenue: contract.base_revenue,
        final_amount: contract.final_amount,
        supplier_company_name: contract.supplier_company_name || '주식회사 블루온',
        supplier_representative: contract.supplier_representative || '김경수',
        supplier_address: contract.supplier_address || '경상북도 고령군 대가야읍 낫질로 285',
        payment_advance_ratio: contract.payment_advance_ratio || 50,
        payment_balance_ratio: contract.payment_balance_ratio || 50,
        additional_cost: contract.additional_cost || 0,
        negotiation_cost: contract.negotiation_cost || 0,
        equipment_counts: contract.equipment_counts || {
          ph_meter: 0,
          differential_pressure_meter: 0,
          temperature_meter: 0,
          discharge_current_meter: 0,
          fan_current_meter: 0,
          pump_current_meter: 0,
          gateway: 0,
          vpn: 0
        }
      }

      const root = createRoot(tempDiv)

      // 템플릿 렌더링 완료 대기
      await new Promise<void>((resolve) => {
        if (contract.contract_type === 'subsidy') {
          root.render(<SubsidyContractTemplate data={contractData} />)
        } else {
          root.render(<SelfPayContractTemplate data={contractData} />)
        }
        setTimeout(resolve, 1000) // 렌더링 완료 대기
      })

      // PDF 생성
      const blob = await generateContractPDF(
        tempDiv.firstChild as HTMLElement,
        `${contract.contract_type}_${contract.contract_number}.pdf`
      )

      // Supabase Storage에 업로드 (서버가 contract_history/document_history 경로까지 기록)
      console.log('PDF 크기(bytes):', blob.size)
      const pdfUrl = await uploadContractPDF(blob, contract.id, documentHistoryId)

      // 정리
      root.unmount()
      document.body.removeChild(tempDiv)

      console.log('PDF 자동 저장 완료:', pdfUrl)
    } catch (error) {
      console.error('PDF 자동 저장 오류:', error)
      throw error
    }
  }

  const handleDeleteContract = async (contractId: string) => {
    if (!canDelete) {
      alert('삭제 권한이 없습니다. (시스템 권한 필요)')
      return
    }

    if (!confirm('정말 이 계약서를 삭제하시겠습니까?')) {
      return
    }

    try {
      const token = localStorage.getItem('auth_token')
      // document_history ID로 삭제 (자동으로 contract_history도 함께 삭제됨)
      const response = await fetch(`/api/document-automation/history/${contractId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const data = await response.json()
      if (data.success) {
        alert('계약서가 삭제되었습니다.')
        // 삭제된 항목을 즉시 UI에서 제거
        setContracts(prev => prev.filter(c => c.id !== contractId))
      } else {
        alert(data.error || '삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('계약서 삭제 오류:', error)
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  const handlePreview = (contract: Contract) => {
    setSelectedContract(contract)
    setIsPreviewModalOpen(true)
  }

  const handleSelectBusiness = (business: Business) => {
    setSelectedBusiness(business)
    setSearchTerm(business.business_name)
    setShowDropdown(false)
    setHighlightedIndex(-1)
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
    setSelectedBusiness(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredBusinesses.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < filteredBusinesses.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredBusinesses.length) {
          handleSelectBusiness(filteredBusinesses[highlightedIndex])
        }
        break
      case 'Escape':
        setShowDropdown(false)
        setHighlightedIndex(-1)
        break
    }
  }

  if (!canView) {
    return (
      <div className="text-center py-12">
        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">접근 권한이 없습니다</h3>
        <p className="text-sm text-gray-500 mt-2">계약서 관리는 일반 이상 권한이 필요합니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">계약서 관리</h2>
          <p className="text-sm text-gray-600 mt-1">
            현재 권한: {AUTH_LEVEL_DESCRIPTIONS[userPermissionLevel as keyof typeof AUTH_LEVEL_DESCRIPTIONS]}
            {canCreate && ' (생성/수정 가능)'}
            {canDelete && ' (삭제 가능)'}
          </p>
        </div>
      </div>

      {/* 계약서 생성 섹션 */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            계약서 생성
          </h3>

          {/* 템플릿 편집 버튼 (권한 4 이상만 표시) */}
          {canEditTemplate && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingTemplateType('subsidy')
                  setIsTemplateEditorOpen(true)
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                보조금 템플릿 편집
              </button>
              <button
                onClick={() => {
                  setEditingTemplateType('self_pay')
                  setIsTemplateEditorOpen(true)
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                자비 템플릿 편집
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 사업장 검색 및 선택 (통합) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              사업장 검색 및 선택
            </label>
            <div className="relative" ref={autocompleteRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (searchTerm.trim() !== '' && filteredBusinesses.length > 0) {
                    setShowDropdown(true)
                  }
                }}
                placeholder="사업장명을 입력하세요..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
              {selectedBusiness && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
                  <Building2 className="w-4 h-4 text-green-600" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBusiness(null)
                      setSearchTerm('')
                      setShowDropdown(false)
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 자동완성 드롭다운 */}
              {showDropdown && (
                <div ref={dropdownRef} className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredBusinesses.length > 0 ? (
                    filteredBusinesses.map((business, index) => (
                      <button
                        key={business.id}
                        type="button"
                        onClick={() => handleSelectBusiness(business)}
                        className={`w-full px-4 py-2 text-left flex items-center gap-2 border-b border-gray-100 last:border-b-0 transition-colors ${
                          index === highlightedIndex
                            ? 'bg-blue-100 text-blue-900'
                            : 'hover:bg-blue-50'
                        }`}
                      >
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <div>
                          <div className="font-medium text-gray-900">{business.business_name}</div>
                          {business.address && (
                            <div className="text-xs text-gray-500">{business.address}</div>
                          )}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-sm text-gray-500">
                      검색 결과가 없습니다.
                    </div>
                  )}
                </div>
              )}
            </div>
            {selectedBusiness && (
              <div className="mt-2 text-sm text-green-600 flex items-center gap-1">
                <Building2 className="w-4 h-4" />
                선택됨: {selectedBusiness.business_name}
              </div>
            )}
          </div>

          {/* 계약서 유형 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              계약서 유형
            </label>
            <select
              value={selectedContractType}
              onChange={(e) => setSelectedContractType(e.target.value as 'subsidy' | 'self_pay')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="subsidy">보조금 계약서</option>
              <option value="self_pay">자비 계약서</option>
            </select>
          </div>
        </div>

        {/* 자비 계약서일 때만 대금 결제 비율 선택 표시 */}
        {selectedContractType === 'self_pay' && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              대금 결제 비율 (선금/잔금)
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">선금 (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={paymentAdvanceRatio}
                  onChange={(e) => {
                    const value = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                    setPaymentAdvanceRatio(value)
                    setPaymentBalanceRatio(100 - value)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">잔금 (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={paymentBalanceRatio}
                  onChange={(e) => {
                    const value = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                    setPaymentBalanceRatio(value)
                    setPaymentAdvanceRatio(100 - value)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              * 선금과 잔금의 합계는 100%입니다. (현재: {paymentAdvanceRatio + paymentBalanceRatio}%)
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleGenerateContract}
            disabled={!selectedBusiness || generatingContract || !canCreate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generatingContract ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                계약서 생성
              </>
            )}
          </button>
        </div>
      </div>

      {/* 계약서 이력 */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          계약서 이력
        </h3>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
            <p className="text-sm text-gray-500 mt-2">로딩 중...</p>
          </div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-sm text-gray-500">생성된 계약서가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contracts.map((contract) => (
              <div
                key={contract.id}
                onClick={() => handlePreview(contract)}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span className="text-xs font-medium text-blue-600">
                      {contract.contract_type === 'subsidy' ? '보조금' : '자비'}
                    </span>
                  </div>
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteContract(contract.id)
                      }}
                      className="px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 flex items-center justify-center"
                      title="삭제 (권한 4 이상)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <h4 className="font-semibold text-gray-900 mb-2">
                  {contract.business_name}
                </h4>

                <div className="space-y-1 text-sm text-gray-600">
                  <p>계약번호: {contract.contract_number}</p>
                  <p>계약일자: {contract.contract_date}</p>
                  <p>계약금액: {contract.total_amount.toLocaleString()}원</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 미리보기 모달 */}
      {isPreviewModalOpen && selectedContract && (
        <ContractPreviewModal
          contract={selectedContract}
          isOpen={isPreviewModalOpen}
          onClose={() => {
            setIsPreviewModalOpen(false)
            setSelectedContract(null)
          }}
        />
      )}

      {/* 템플릿 편집 모달 */}
      <ContractTemplateEditor
        isOpen={isTemplateEditorOpen}
        onClose={() => setIsTemplateEditorOpen(false)}
        contractType={editingTemplateType}
        onSave={() => {
          // 템플릿 저장 후 필요시 계약서 목록 갱신
          console.log('템플릿이 저장되었습니다.')
        }}
      />
    </div>
  )
}
