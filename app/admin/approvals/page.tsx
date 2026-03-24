'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import ApprovalStatusBadge, { DOC_TYPE_LABEL } from '@/components/approvals/ApprovalStatusBadge'
import { TokenManager } from '@/lib/api-client'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Plus, FileText, ChevronRight } from 'lucide-react'
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
}

type TabType = 'my' | 'pending' | 'all'

const TAB_LABELS: Record<TabType, string> = {
  my: '내 문서',
  pending: '결재 대기',
  all: '전체',
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const STEP_LABEL = ['', '팀장 결재중', '중역 결재중', '대표이사 결재중', '완료']

// 상태별 왼쪽 보더 컬러
const STATUS_BORDER: Record<string, string> = {
  draft:     'border-l-gray-300',
  pending:   'border-l-yellow-400',
  approved:  'border-l-green-400',
  rejected:  'border-l-red-400',
  returned:  'border-l-amber-400',
  cancelled: 'border-l-gray-300',
}

function ApprovalsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [tab, setTab] = useState<TabType>(() => {
    const t = searchParams?.get('tab')
    return (t === 'pending' || t === 'my' || t === 'all') ? t : 'my'
  })
  const [docs, setDocs] = useState<ApprovalDoc[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const channelRef = useRef<RealtimeChannel | null>(null)

  const fetchDocs = useCallback(async () => {
    const token = TokenManager.getToken()
    if (!token) return

    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab === 'my') params.set('mine', 'true')
      if (tab === 'pending') params.set('pending_mine', 'true')
      if (typeFilter) params.set('type', typeFilter)
      if (statusFilter) params.set('status', statusFilter)
      params.set('limit', '100')

      const res = await fetch(`/api/approvals?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setDocs(data.data || [])
      }
    } finally {
      setLoading(false)
    }
  }, [tab, typeFilter, statusFilter])

  // 결재 대기 건수 (뱃지용)
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

  // URL ?tab= 파라미터 변경 감지 (배너에서 이동 시)
  useEffect(() => {
    const t = searchParams?.get('tab')
    if (t === 'pending' || t === 'my' || t === 'all') setTab(t)
  }, [searchParams])

  useEffect(() => { fetchDocs() }, [fetchDocs])
  useEffect(() => { fetchPendingCount() }, [fetchPendingCount])

  // 30초마다 폴링 (Realtime 연결 실패 시 폴백, 사파리 대응)
  useEffect(() => {
    const interval = setInterval(() => { fetchPendingCount() }, 30000)
    return () => clearInterval(interval)
  }, [fetchPendingCount])

  // Realtime: postgres_changes(RLS 허용 범위) + Broadcast(서버에서 직접 push) 이중 구독
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`approvals-page-badge:${user.id}`)
      // postgres_changes: 본인 문서 변경 감지 (RLS 허용 범위 내)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'approval_documents' },
        () => { fetchPendingCount(); fetchDocs() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'approval_documents' },
        () => { fetchPendingCount(); fetchDocs() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'approval_steps' },
        () => { fetchPendingCount(); fetchDocs() })
      // Broadcast: 서버 API가 직접 push — RLS 제약 없이 크로스 유저 변경 반영
      .on('broadcast', { event: 'new_notification' }, (payload) => {
        const cat = payload.payload?.category
        if (['report_submitted', 'report_approved', 'report_rejected'].includes(cat)) {
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

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <FileText className="w-12 h-12 mb-3 opacity-30" />
      <p className="text-sm">
        {tab === 'pending' ? '결재 대기 중인 문서가 없습니다' : '문서가 없습니다'}
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
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-full sm:w-fit">
          {(Object.keys(TAB_LABELS) as TabType[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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

        {/* 필터 */}
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
          {tab !== 'pending' && (
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

        {/* ── 모바일: 카드형 목록 ── */}
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
                  onClick={() => router.push(`/admin/approvals/${doc.id}`)}
                  className={`w-full text-left bg-white rounded-xl border border-gray-200 border-l-4 ${STATUS_BORDER[doc.status] || 'border-l-gray-300'} px-4 py-3.5 active:bg-gray-50 transition-colors`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {/* 유형 + 날짜 */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400 font-medium">
                          {DOC_TYPE_LABEL[doc.document_type] || doc.document_type}
                        </span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{formatDate(doc.created_at)}</span>
                      </div>
                      {/* 제목 */}
                      <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
                      {/* 작성자 + 단계 */}
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

        {/* ── 데스크탑: 기존 테이블 ── */}
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">작성일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {docs.map(doc => (
                    <tr
                      key={doc.id}
                      onClick={() => router.push(`/admin/approvals/${doc.id}`)}
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
                      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(doc.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
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
