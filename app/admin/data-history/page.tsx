// app/admin/data-history/page.tsx - 데이터 이력 및 복구 관리 페이지
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import AdminLayout from '@/components/ui/AdminLayout'
import { useAuth } from '@/contexts/AuthContext'
import { isPathHiddenForAccount } from '@/lib/auth/special-accounts'
import StatsCard from '@/components/ui/StatsCard'
import DataTable, { commonActions } from '@/components/ui/DataTable'
import { ConfirmModal } from '@/components/ui/Modal'

// Code Splitting: 무거운 모달 컴포넌트를 동적 로딩
const ContractPreviewModal = dynamic(() => import('@/app/admin/document-automation/components/ContractPreviewModal'), {
  loading: () => <div className="text-center py-4">로딩 중...</div>,
  ssr: false
})
import {
  ArrowLeft,
  RefreshCw,
  Undo2,
  Eye,
  Users,
  FileText,
  Database,
  History,
  Filter,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Plus
} from 'lucide-react'

export default function DataHistoryPage() {
  const router = useRouter()
  const { user, permissions } = useAuth()

  useEffect(() => {
    if (user?.email && permissions?.isSpecialAccount && isPathHiddenForAccount(user.email, '/admin/data-history')) {
      router.replace('/admin/business')
    }
  }, [user, permissions])

  const [history, setHistory] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [selectedRecordId, setSelectedRecordId] = useState<string>('')
  const [limit, setLimit] = useState<number>(500)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any>(null)
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false)
  const [restoreReason, setRestoreReason] = useState('')
  const [isContractPreviewOpen, setIsContractPreviewOpen] = useState(false)
  const [selectedContractData, setSelectedContractData] = useState<any>(null)
  
  // Stats calculation
  const stats = useMemo(() => {
    const total = history.length
    const inserts = history.filter(h => h.operation === 'INSERT').length
    const updates = history.filter(h => h.operation === 'UPDATE').length
    const deletes = history.filter(h => h.operation === 'DELETE').length
    
    return {
      total,
      inserts,
      updates,
      deletes
    }
  }, [history])

  const tableOptions = [
    { value: 'business_info', label: '사업장 정보' },
    { value: 'air_permit_info', label: '대기필증 정보' },
    { value: 'discharge_outlets', label: '배출구 정보' },
    { value: 'discharge_facilities', label: '배출시설 정보' },
    { value: 'prevention_facilities', label: '방지시설 정보' },
    { value: 'contract_history', label: '계약서 생성 이력' },
    { value: 'estimate_history', label: '견적서 생성 이력' }
  ]

  // 이력 데이터 로드
  const loadHistory = async () => {
    try {
      setIsLoading(true)
      
      let url = `/api/data-history?limit=${limit}`
      
      if (selectedTables.length > 0) {
        url += `&tables=${selectedTables.join(',')}`
      }
      
      if (selectedRecordId) {
        url += `&recordId=${selectedRecordId}`
      }
      
      const response = await fetch(url)
      const result = await response.json()
      
      if (response.ok) {
        setHistory(result.data)
      } else {
        alert('데이터 이력을 불러오는데 실패했습니다: ' + result.error)
      }
    } catch (error) {
      console.error('Error loading history:', error)
      alert('데이터 이력을 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 페이지 로드 시 이력 데이터 로드
  useEffect(() => {
    loadHistory()
  }, [])

  // 필터 적용
  const handleFilter = () => {
    loadHistory()
  }

  // 필터 초기화
  const handleResetFilter = () => {
    setSelectedTables([])
    setSelectedRecordId('')
    setLimit(100)
  }

  // 상세 정보 모달 열기
  const openDetailModal = (historyItem: any) => {
    setSelectedHistoryItem(historyItem)
    setIsDetailModalOpen(true)
  }

  // 계약서 미리보기 열기
  const openContractPreview = (historyItem: any) => {
    // historyItem.new_data가 계약서 데이터임
    const contractData = historyItem.new_data
    if (contractData) {
      setSelectedContractData(contractData)
      setIsContractPreviewOpen(true)
    }
  }

  // 복구 모달 열기
  const openRestoreModal = (historyItem: any) => {
    setSelectedHistoryItem(historyItem)
    setRestoreReason('')
    setIsRestoreModalOpen(true)
  }

  // 데이터 복구 확인
  const confirmRestore = (historyItem: any) => {
    setSelectedHistoryItem(historyItem)
    setRestoreReason('')
    setIsRestoreModalOpen(true)
  }

  // 데이터 복구 실행
  const handleRestore = async () => {
    if (!selectedHistoryItem) return

    try {
      // 낙관적 업데이트: 복구 작업을 즉시 기록
      const restoreEntry = {
        id: `restore-${Date.now()}`,
        table_name: selectedHistoryItem.table_name,
        record_id: selectedHistoryItem.record_id,
        operation: 'RESTORE' as const,
        old_data: null,
        new_data: selectedHistoryItem.old_data,
        changed_at: new Date().toISOString(),
        metadata: {
          restored_from: selectedHistoryItem.id,
          restore_reason: restoreReason
        }
      }

      // 즉시 UI에 복구 이력 추가
      setHistory(prev => [restoreEntry, ...prev])
      setIsRestoreModalOpen(false)

      const response = await fetch('/api/data-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: selectedHistoryItem.id,
          reason: restoreReason
        })
      })

      const result = await response.json()

      if (response.ok) {
        // 실제 데이터로 교체
        setHistory(prev => prev.map(item => 
          item.id === restoreEntry.id ? result.historyEntry : item
        ))
      } else {
        // 실패 시 롤백
        setHistory(prev => prev.filter(item => item.id !== restoreEntry.id))
        alert(result.error || '데이터 복구에 실패했습니다')
      }
    } catch (error) {
      console.error('Error restoring data:', error)
      // 오류 시 롤백
      setHistory(prev => prev.filter(item => !item.id.toString().startsWith('restore-')))
      alert('데이터 복구 중 오류가 발생했습니다')
    }
  }

  // 테이블 선택 핸들러
  const handleTableSelect = (tableValue: string) => {
    setSelectedTables(prev => 
      prev.includes(tableValue)
        ? prev.filter(t => t !== tableValue)
        : [...prev, tableValue]
    )
  }

  // JSON 데이터를 읽기 쉽게 포맷
  const formatJsonData = (data: any) => {
    if (!data) return '없음'
    return JSON.stringify(data, null, 2)
  }

  // 변경사항만 추출하여 표시하는 함수
  const getChangedFields = (oldData: any, newData: any) => {
    if (!oldData || !newData) return []
    
    const changes: Array<{field: string, oldValue: any, newValue: any}> = []
    
    // 모든 필드 비교
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
    
    for (const key of allKeys) {
      const oldValue = oldData[key]
      const newValue = newData[key]
      
      // 값이 다른 경우 변경사항으로 기록
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field: key,
          oldValue: oldValue === null || oldValue === undefined ? '(없음)' : oldValue,
          newValue: newValue === null || newValue === undefined ? '(없음)' : newValue
        })
      }
    }
    
    return changes
  }

  // ESC 키 핸들러
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isDetailModalOpen) {
          setIsDetailModalOpen(false)
        }
        if (isRestoreModalOpen) {
          setIsRestoreModalOpen(false)
        }
      }
    }

    document.addEventListener('keydown', handleEscKey)
    return () => document.removeEventListener('keydown', handleEscKey)
  }, [isDetailModalOpen, isRestoreModalOpen])

  // History items with ID for DataTable
  const historyWithId = useMemo(() => 
    history.map(item => ({
      ...item,
      id: item.id || `history-${item.record_id}`
    }))
  , [history])

  // Table columns for history
  const historyColumns = [
    {
      key: 'table_display_name',
      title: '테이블',
      render: (item: any) => (
        <span className="font-medium text-sm">{item.table_display_name}</span>
      )
    },
    {
      key: 'operation',
      title: '작업',
      render: (item: any) => (
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
          item.operation === 'INSERT' ? 'bg-green-100 text-green-800' :
          item.operation === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
          'bg-red-100 text-red-800'
        }`}>
          {item.operation_display_name}
        </span>
      )
    },
    {
      key: 'formatted_created_at',
      title: '변경일시',
      render: (item: any) => (
        <span className="text-sm">{item.formatted_created_at}</span>
      )
    },
    {
      key: 'record_id',
      title: '레코드 ID',
      render: (item: any) => (
        <span className="font-mono text-xs text-gray-500">{item.record_id.slice(0, 8)}...</span>
      )
    }
  ]

  // Table actions for history
  const historyActions = [
    {
      ...commonActions.view((item: any) => openDetailModal(item)),
      show: () => true
    },
    {
      label: '계약서 보기',
      icon: FileText,
      onClick: (item: any) => openContractPreview(item),
      variant: 'primary' as const,
      show: (item: any) => item.table_name === 'contract_history' && (item.operation === 'INSERT' || item.operation === 'UPDATE')
    },
    {
      label: '복구',
      icon: RotateCcw,
      onClick: (item: any) => confirmRestore(item),
      variant: 'secondary' as const,
      show: (item: any) => item.operation === 'UPDATE' || item.operation === 'DELETE'
    }
  ]

  return (
    <AdminLayout
      title="데이터 변경 이력 관리"
      description="시스템 데이터 변경 이력 조회 및 복구"
      actions={
        <button
          onClick={handleFilter}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      }
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="전체 이력"
          value={stats.total}
          icon={History}
          color="blue"
          description="조회된 변경 이력 수"
        />
        
        <StatsCard
          title="데이터 생성"
          value={stats.inserts}
          icon={Plus}
          color="green"
          trend={{
            value: stats.total > 0 ? Math.round((stats.inserts / stats.total) * 100) : 0,
            direction: 'up',
            label: '전체 대비'
          }}
        />
        
        <StatsCard
          title="데이터 수정"
          value={stats.updates}
          icon={RefreshCw}
          color="yellow"
          trend={{
            value: stats.total > 0 ? Math.round((stats.updates / stats.total) * 100) : 0,
            direction: 'up',
            label: '전체 대비'
          }}
        />
        
        <StatsCard
          title="데이터 삭제"
          value={stats.deletes}
          icon={Trash2}
          color="red"
          trend={{
            value: stats.total > 0 ? Math.round((stats.deletes / stats.total) * 100) : 0,
            direction: 'up',
            label: '전체 대비'
          }}
        />
      </div>

      {/* Filter Panel */}
      <div className="bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Filter className="w-6 h-6 text-blue-600" />
          </div>
          필터 설정
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Table Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              테이블 선택
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-3 bg-gray-50">
              {tableOptions.map(option => (
                <label key={option.value} className="flex items-center hover:bg-white p-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedTables.includes(option.value)}
                    onChange={() => handleTableSelect(option.value)}
                    className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Record ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              특정 레코드 ID
            </label>
            <input
              type="text"
              lang="ko"
              inputMode="text"
              value={selectedRecordId}
              onChange={(e) => setSelectedRecordId(e.target.value)}
              placeholder="UUID 입력..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              조회 개수
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value={50}>50개</option>
              <option value={100}>100개</option>
              <option value={200}>200개</option>
              <option value={500}>500개</option>
            </select>
          </div>
        </div>

        <div className="flex gap-4 mt-6">
          <button
            onClick={handleFilter}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            조회
          </button>
          <button
            onClick={handleResetFilter}
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            초기화
          </button>
        </div>
      </div>

      {/* Data History Table */}
      <DataTable
        data={historyWithId}
        columns={historyColumns}
        actions={historyActions}
        loading={isLoading}
        emptyMessage="조회된 데이터 변경 이력이 없습니다."
        pageSize={10}
      />

      {/* 상세 정보 모달 */}
      {isDetailModalOpen && selectedHistoryItem && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800">데이터 변경 상세 정보</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <kbd className="px-2 py-1 text-xs bg-gray-100 border border-gray-200 rounded">ESC</kbd>
                <span>키로 닫기</span>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">테이블</label>
                  <div className="mt-1">{selectedHistoryItem.table_display_name}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">작업</label>
                  <div className="mt-1">{selectedHistoryItem.operation_display_name}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">변경일시</label>
                  <div className="mt-1">{selectedHistoryItem.formatted_created_at}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">레코드 ID</label>
                  <div className="mt-1 font-mono text-sm">{selectedHistoryItem.record_id}</div>
                </div>
              </div>

              <div className="space-y-4">
                {selectedHistoryItem.operation === 'UPDATE' && selectedHistoryItem.old_data && selectedHistoryItem.new_data ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-4">변경된 필드</label>
                    <div className="space-y-3">
                      {getChangedFields(selectedHistoryItem.old_data, selectedHistoryItem.new_data).map((change, index) => (
                        <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex items-center mb-2">
                            <span className="font-medium text-gray-900">{change.field}</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="text-xs font-medium text-red-700 mb-1">변경 전</div>
                              <div className="text-sm text-red-900 break-all">
                                {typeof change.oldValue === 'object' ? JSON.stringify(change.oldValue, null, 2) : String(change.oldValue)}
                              </div>
                            </div>
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <div className="text-xs font-medium text-green-700 mb-1">변경 후</div>
                              <div className="text-sm text-green-900 break-all">
                                {typeof change.newValue === 'object' ? JSON.stringify(change.newValue, null, 2) : String(change.newValue)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {getChangedFields(selectedHistoryItem.old_data, selectedHistoryItem.new_data).length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                          <p>변경된 필드가 없습니다.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedHistoryItem.old_data && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {selectedHistoryItem.operation === 'DELETE' ? '삭제된 데이터' : '변경 전 데이터'}
                        </label>
                        <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-auto max-h-48">
                          {formatJsonData(selectedHistoryItem.old_data)}
                        </pre>
                      </div>
                    )}
                    
                    {selectedHistoryItem.new_data && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {selectedHistoryItem.operation === 'INSERT' ? '추가된 데이터' : '변경 후 데이터'}
                        </label>
                        <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-auto max-h-48">
                          {formatJsonData(selectedHistoryItem.new_data)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-8">
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 복구 확인 모달 */}
      {isRestoreModalOpen && selectedHistoryItem && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">데이터 복구 확인</h2>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <p className="text-gray-700 mb-2">
                  다음 데이터를 복구하시겠습니까?
                </p>
                <div className="bg-gray-100 p-3 rounded text-sm">
                  <div><strong>테이블:</strong> {selectedHistoryItem.table_display_name}</div>
                  <div><strong>작업:</strong> {selectedHistoryItem.operation_display_name}</div>
                  <div><strong>변경일시:</strong> {selectedHistoryItem.formatted_created_at}</div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  복구 사유 (선택사항)
                </label>
                <textarea
                  value={restoreReason}
                  onChange={(e) => setRestoreReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="복구 사유를 입력하세요..."
                />
              </div>

              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setIsRestoreModalOpen(false)}
                  className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleRestore}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  복구 실행
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      <ConfirmModal
        isOpen={isRestoreModalOpen}
        onClose={() => {
          setIsRestoreModalOpen(false)
          setSelectedHistoryItem(null)
        }}
        onConfirm={handleRestore}
        title="데이터 복구 확인"
        message={selectedHistoryItem ?
          `${selectedHistoryItem.table_display_name}의 ${selectedHistoryItem.operation_display_name} 작업을 복구하시겠습니까?` :
          '데이터를 복구하시겠습니까?'
        }
        confirmText="복구 실행"
        cancelText="취소"
        variant="primary"
      />

      {/* Contract Preview Modal */}
      {isContractPreviewOpen && selectedContractData && (
        <ContractPreviewModal
          contract={selectedContractData}
          isOpen={isContractPreviewOpen}
          onClose={() => {
            setIsContractPreviewOpen(false)
            setSelectedContractData(null)
          }}
        />
      )}
    </AdminLayout>
  )
}