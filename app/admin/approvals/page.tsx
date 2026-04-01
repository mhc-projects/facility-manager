'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import ApprovalStatusBadge, { DOC_TYPE_LABEL } from '@/components/approvals/ApprovalStatusBadge'
import { TokenManager } from '@/lib/api-client'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Plus, FileText, ChevronRight, CheckCircle, Clock, Search, X } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface ApprovalDoc {
  id: string
  document_number: string
  document_type: string
  title: string
  status: string
  current_step: number
  department: string | null
  requester_name: string
  team_leader_name: string | null
  executive_name: string | null
  ceo_name: string | null
  created_at: string
  submitted_at: string | null
  completed_at: string | null
  // 결재완료 탭 전용
  is_processed?: boolean
  processed_at?: string | null
  processed_by_name?: string | null
  process_note?: string | null
}

type TabType = 'my' | 'pending' | 'all' | 'completed'

const TAB_LABELS: Record<TabType, string> = {
  my: '내 문서',
  pending: '결재 대기',
  all: '전체',
  completed: '결재완료',
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const STEP_LABEL = ['', '팀장 결재중', '중역 결재중', '대표이사 결재중', '완료']

const STATUS_BORDER: Record<string, string> = {
  draft:     'border-l-gray-300',
  pending:   'border-l-yellow-400',
  approved:  'border-l-green-400',
  rejected:  'border-l-red-400',
  returned:  'border-l-amber-400',
  cancelled: 'border-l-gray-300',
}

// 처리확인 모달 컴포넌트
function ProcessModal({
  doc,
  onConfirm,
  onClose,
  processing,
}: {
  doc: ApprovalDoc
  onConfirm: (note: string) => void
  onClose: () => void
  processing: boolean
}) {
  const [note, setNote] = useState('')

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onClose} />

      {/* 모바일: Bottom Sheet */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom,16px)]">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">처리확인</h3>
          </div>
          <p className="text-sm text-gray-500 mb-1">{doc.document_number}</p>
          <p className="text-sm font-medium text-gray-700 mb-4 truncate">{doc.title}</p>
          <textarea
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[100px]"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="처리 메모 (선택사항)"
            autoFocus
          />
          <div className="flex gap-3 mt-4">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
            >
              취소
            </button>
            <button
              onClick={() => onConfirm(note)}
              disabled={processing}
              className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-50"
            >
              {processing ? '처리 중...' : '처리확인'}
            </button>
          </div>
        </div>
      </div>

      {/* 데스크탑: Center Modal */}
      <div className="hidden md:flex fixed inset-0 items-center justify-center z-40">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">처리확인</h3>
          </div>
          <p className="text-sm text-gray-500 mb-1">{doc.document_number}</p>
          <p className="text-sm font-medium text-gray-800 mb-4">{doc.title}</p>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              처리 메모 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="처리 메모를 입력해 주세요..."
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={() => onConfirm(note)}
              disabled={processing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {processing ? '처리 중...' : '처리확인'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function ApprovalsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const [tab, setTab] = useState<TabType>(() => {
    const t = searchParams?.get('tab')
    return (t === 'pending' || t === 'my' || t === 'all' || t === 'completed') ? t as TabType : 'my'
  })
  const [docs, setDocs] = useState<ApprovalDoc[]>([])
  const [total, setTotal] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // 내 문서 서브탭
  const [mySubTab, setMySubTab] = useState<'active' | 'approved'>('active')

  // 일반 탭 필터
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // 결재완료 탭 필터
  const [searchQuery, setSearchQuery] = useState('')
  const [completedTypeFilter, setCompletedTypeFilter] = useState('')
  const [processedFilter, setProcessedFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')

  // 처리확인 모달
  const [processTarget, setProcessTarget] = useState<ApprovalDoc | null>(null)
  const [processing, setProcessing] = useState(false)

  // 총무팀 여부
  const [isManagementSupport, setIsManagementSupport] = useState(false)
  const isSuperAdmin = (user?.role ?? 0) >= 4
  const showCompletedTab = isSuperAdmin || isManagementSupport

  const channelRef = useRef<RealtimeChannel | null>(null)
  const tabRef = useRef<TabType>(tab)

  // 총무팀 여부 확인 (최초 1회)
  useEffect(() => {
    if (isSuperAdmin) return
    const token = TokenManager.getToken()
    if (!token) return
    fetch('/api/employees/me/department-info', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => { if (d.success) setIsManagementSupport(d.data.is_management_support) })
      .catch(() => {})
  }, [isSuperAdmin])

  const fetchDocs = useCallback(async () => {
    const token = TokenManager.getToken()
    if (!token) return

    setLoading(true)
    try {
      const params = new URLSearchParams()

      if (tab === 'completed') {
        params.set('completed_tab', 'true')
        if (searchQuery) params.set('search', searchQuery)
        if (completedTypeFilter) params.set('type', completedTypeFilter)
        if (processedFilter) params.set('processed', processedFilter)
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo) params.set('date_to', dateTo)
        if (departmentFilter) params.set('department', departmentFilter)
      } else {
        if (tab === 'my') {
          params.set('mine', 'true')
          if (mySubTab === 'approved') {
            params.set('status', 'approved')
          } else {
            params.set('status', 'draft,pending,returned,rejected')
          }
        }
        if (tab === 'pending') params.set('pending_mine', 'true')
        if (typeFilter) params.set('type', typeFilter)
        if (tab !== 'my' && statusFilter) params.set('status', statusFilter)
      }
      params.set('limit', '100')

      const res = await fetch(`/api/approvals?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setDocs(data.data || [])
        setTotal(data.total || 0)
      } else {
        setDocs([])
        setTotal(0)
      }
    } finally {
      setLoading(false)
    }
  }, [tab, mySubTab, typeFilter, statusFilter, searchQuery, completedTypeFilter, processedFilter, dateFrom, dateTo, departmentFilter])

  const fetchPendingCount = useCallback(async () => {
    const token = TokenManager.getToken()
    if (!token) return
    try {
      const res = await fetch('/api/approvals/pending-count', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.success) setPendingCount(data.count || 0)
    } catch {}
  }, [])

  useEffect(() => { tabRef.current = tab }, [tab])

  useEffect(() => {
    const t = searchParams?.get('tab')
    if (t === 'pending' || t === 'my' || t === 'all' || t === 'completed') setTab(t as TabType)
  }, [searchParams])

  // _t 파라미터 변경 감지: 상세 페이지에서 수정/결재 후 복귀 시 강제 refetch
  const refreshToken = searchParams?.get('_t')
  useEffect(() => {
    if (refreshToken) {
      fetchDocs()
      fetchPendingCount()
    }
  }, [refreshToken]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchDocs() }, [fetchDocs])
  useEffect(() => { fetchPendingCount() }, [fetchPendingCount])

  // 상세 페이지에서 결재/반려 후 목록으로 복귀 시 즉시 갱신
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDocs()
        fetchPendingCount()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchDocs, fetchPendingCount])

  useEffect(() => {
    const interval = setInterval(() => { fetchPendingCount() }, 30000)
    return () => clearInterval(interval)
  }, [fetchPendingCount])

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`approval-notify:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'approval_documents' },
        () => { fetchPendingCount(); if (tabRef.current === 'pending' || tabRef.current === 'my') fetchDocs() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'approval_documents' },
        () => {
          fetchPendingCount()
          if (tabRef.current === 'pending' || tabRef.current === 'my' || tabRef.current === 'all') fetchDocs()
          if (tabRef.current === 'completed') fetchDocs()
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'approval_steps' },
        () => { fetchPendingCount(); if (tabRef.current === 'pending' || tabRef.current === 'my') fetchDocs() })
      .on('broadcast', { event: 'new_notification' }, (payload) => {
        const cat = payload.payload?.category
        if (['report_submitted', 'report_approved', 'report_rejected', 'doc_deleted'].includes(cat)) {
          fetchPendingCount()
          fetchDocs()
        }
      })
      .subscribe()

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [user?.id, fetchPendingCount, fetchDocs])

  const handleProcess = async (note: string) => {
    if (!processTarget) return
    const token = TokenManager.getToken()
    if (!token) return

    setProcessing(true)
    try {
      const res = await fetch(`/api/approvals/${processTarget.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ process_note: note }),
      })
      const data = await res.json()
      if (data.success) {
        setDocs(prev => prev.map(d =>
          d.id === processTarget.id
            ? { ...d, is_processed: true, processed_at: data.data.processed_at, processed_by_name: data.data.processed_by_name, process_note: data.data.process_note }
            : d
        ))
        setProcessTarget(null)
      } else {
        alert(data.error || '처리확인 실패')
      }
    } finally {
      setProcessing(false)
    }
  }

  const resetCompletedFilters = () => {
    setSearchQuery('')
    setCompletedTypeFilter('')
    setProcessedFilter('')
    setDateFrom('')
    setDateTo('')
    setDepartmentFilter('')
  }

  const hasActiveFilters = searchQuery || completedTypeFilter || processedFilter || dateFrom || dateTo || departmentFilter

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <FileText className="w-12 h-12 mb-3 opacity-30" />
      <p className="text-sm">
        {tab === 'pending' ? '결재 대기 중인 문서가 없습니다' :
         tab === 'completed' ? '결재완료 문서가 없습니다' : '문서가 없습니다'}
      </p>
      {tab === 'my' && (
        <button
          onClick={() => router.push('/admin/approvals/new')}
          className="mt-4 text-blue-600 text-sm hover:underline"
        >
          첫 번째 문서 작성하기
        </button>
      )}
    </div>
  )

  // 결재완료 탭 전용 컨텐츠
  const CompletedTabContent = () => {
    const unprocessedCount = docs.filter(d => !d.is_processed).length
    const processedCount = docs.filter(d => d.is_processed).length

    return (
      <>
        {/* 결재완료 탭 전용 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          {/* 검색 + 필터 한 줄 */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="문서번호, 제목, 작성자..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={completedTypeFilter}
              onChange={e => setCompletedTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체 유형</option>
              {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            {/* 기간 필터: 컴팩트 범위 입력 */}
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 bg-white">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="text-sm py-2 bg-transparent focus:outline-none w-[120px] text-gray-600"
              />
              <span className="text-gray-300 text-sm">~</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="text-sm py-2 bg-transparent focus:outline-none w-[120px] text-gray-600"
              />
            </div>

            {hasActiveFilters && (
              <button
                onClick={resetCompletedFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <X className="w-3.5 h-3.5" />
                초기화
              </button>
            )}
          </div>

          {/* 요약 카운트 — 클릭하면 처리여부 필터링 */}
          {!loading && (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setProcessedFilter('')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  processedFilter === ''
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                전체 {total}건
              </button>
              <button
                onClick={() => setProcessedFilter(processedFilter === 'false' ? '' : 'false')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  processedFilter === 'false'
                    ? 'bg-orange-500 text-white'
                    : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                }`}
              >
                미처리 {unprocessedCount}건
              </button>
              <button
                onClick={() => setProcessedFilter(processedFilter === 'true' ? '' : 'true')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  processedFilter === 'true'
                    ? 'bg-green-500 text-white'
                    : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}
              >
                처리완료 {processedCount}건
              </button>
            </div>
          )}
        </div>

        {/* 모바일: 카드 목록 */}
        <div className="md:hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : docs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div
                  key={doc.id}
                  className={`bg-white rounded-xl border border-gray-200 border-l-4 ${doc.is_processed ? 'border-l-green-400' : 'border-l-blue-400'} px-4 py-3.5`}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => router.push(`/admin/approvals/${doc.id}?from=${tab}`)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-400 font-medium">
                            {DOC_TYPE_LABEL[doc.document_type] || doc.document_type}
                          </span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">{doc.requester_name}</span>
                          {doc.department && (
                            <>
                              <span className="text-xs text-gray-300">·</span>
                              <span className="text-xs text-gray-400">{doc.department}</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{doc.document_number}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                    </div>
                  </button>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">완료 {formatDate(doc.completed_at)}</span>
                    {doc.is_processed ? (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>처리완료 {formatDate(doc.processed_at)}</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setProcessTarget(doc)}
                        className="px-3 py-1 text-xs rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium"
                      >
                        처리확인
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 데스크탑: 테이블 */}
        <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : docs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">문서번호</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">유형</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">제목</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">작성자</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">부서</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">완료일</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {docs.map(doc => (
                    <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                      <td
                        className="px-4 py-3 text-xs text-gray-500 font-mono cursor-pointer hover:text-blue-600"
                        onClick={() => router.push(`/admin/approvals/${doc.id}?from=${tab}`)}
                      >
                        {doc.document_number}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {DOC_TYPE_LABEL[doc.document_type] || doc.document_type}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[180px] truncate cursor-pointer hover:text-blue-600"
                        onClick={() => router.push(`/admin/approvals/${doc.id}?from=${tab}`)}
                      >
                        {doc.title}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{doc.requester_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{doc.department || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(doc.completed_at)}</td>
                      <td className="px-4 py-3">
                        {doc.is_processed ? (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span className="font-medium">처리완료</span>
                            </div>
                            <span className="text-xs text-gray-400 mt-0.5">
                              {doc.processed_by_name} · {formatDate(doc.processed_at)}
                            </span>
                            {doc.process_note && (
                              <span className="text-xs text-gray-500 mt-0.5 max-w-[160px] truncate" title={doc.process_note}>
                                {doc.process_note}
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => setProcessTarget(doc)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium whitespace-nowrap transition-colors"
                          >
                            <Clock className="w-3 h-3" />
                            처리확인
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <AdminLayout
      title="전자결재"
      description="결재 문서 작성 및 결재 처리"
      actions={
        <button
          onClick={() => router.push('/admin/approvals/new')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">새 문서 작성</span>
          <span className="sm:hidden">작성</span>
        </button>
      }
    >
      <div className="space-y-4">
        {/* 탭 */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-full sm:w-fit overflow-x-auto">
          {(Object.keys(TAB_LABELS) as TabType[])
            .filter(t => t !== 'completed' || showCompletedTab)
            .map(t => (
              <button
                key={t}
                onClick={() => {
                  setTab(t)
                  setTypeFilter('')
                  setStatusFilter('')
                  setMySubTab('active')
                  router.push(`/admin/approvals?tab=${t}`)
                }}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {TAB_LABELS[t]}
                {t === 'pending' && pendingCount > 0 && (
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
                    tab === t ? 'bg-blue-600 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
            ))}
        </div>

        {/* 결재완료 탭 */}
        {tab === 'completed' ? (
          <CompletedTabContent />
        ) : (
          <>
            {/* 일반 탭 필터 */}
            <div className="flex flex-wrap gap-2">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체 유형</option>
                {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {tab === 'my' && (
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setMySubTab('active')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      mySubTab === 'active' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    진행중
                  </button>
                  <button
                    onClick={() => setMySubTab('approved')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      mySubTab === 'approved' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    승인완료
                  </button>
                </div>
              )}
              {tab !== 'pending' && tab !== 'my' && (
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">전체 상태</option>
                  <option value="draft">임시저장</option>
                  <option value="pending">결재중</option>
                  <option value="approved">승인완료</option>
                  <option value="rejected">반려</option>
                  <option value="returned">재상신필요</option>
                </select>
              )}
            </div>

            {/* 모바일: 카드형 목록 */}
            <div className="md:hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : docs.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-2">
                  {docs.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => router.push(`/admin/approvals/${doc.id}?from=${tab}`)}
                      className={`w-full text-left bg-white rounded-xl border border-gray-200 border-l-4 ${STATUS_BORDER[doc.status] || 'border-l-gray-300'} px-4 py-3.5 active:bg-gray-50 transition-colors`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-400 font-medium">
                              {DOC_TYPE_LABEL[doc.document_type] || doc.document_type}
                            </span>
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400">
                              {tab === 'all' ? (doc.submitted_at ? formatDate(doc.submitted_at) : '-') : formatDate(doc.created_at)}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-gray-500">{doc.requester_name}</span>
                            {doc.status === 'pending' && STEP_LABEL[doc.current_step] && (
                              <>
                                <span className="text-xs text-gray-300">·</span>
                                <span className="text-xs text-yellow-600 font-medium">{STEP_LABEL[doc.current_step]}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <ApprovalStatusBadge status={doc.status} />
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 데스크탑: 테이블 */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : docs.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">문서번호</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">유형</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">제목</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">작성자</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">상태</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">진행단계</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">제출일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {docs.map(doc => (
                        <tr
                          key={doc.id}
                          onClick={() => router.push(`/admin/approvals/${doc.id}?from=${tab}`)}
                          className="hover:bg-blue-50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-xs text-gray-500 font-mono">{doc.document_number}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {DOC_TYPE_LABEL[doc.document_type] || doc.document_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">{doc.title}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{doc.requester_name}</td>
                          <td className="px-4 py-3">
                            <ApprovalStatusBadge status={doc.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {doc.status === 'pending' ? STEP_LABEL[doc.current_step] || '' : ''}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{doc.submitted_at ? formatDate(doc.submitted_at) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 처리확인 모달 */}
      {processTarget && (
        <ProcessModal
          doc={processTarget}
          onConfirm={handleProcess}
          onClose={() => setProcessTarget(null)}
          processing={processing}
        />
      )}
    </AdminLayout>
  )
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={null}>
      <ApprovalsContent />
    </Suspense>
  )
}
