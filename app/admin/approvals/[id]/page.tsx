'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import AdminLayout from '@/components/ui/AdminLayout'
import ApprovalLineHeader, { ApprovalStep } from '@/components/approvals/ApprovalLineHeader'
import ApprovalStatusBadge, { DOC_TYPE_LABEL } from '@/components/approvals/ApprovalStatusBadge'
import ApproverSelector from '@/components/approvals/ApproverSelector'
import ExpenseClaimForm from '@/components/approvals/forms/ExpenseClaimForm'
import PurchaseRequestForm, { AttachmentFile } from '@/components/approvals/forms/PurchaseRequestForm'
import LeaveRequestForm from '@/components/approvals/forms/LeaveRequestForm'
import BusinessProposalForm from '@/components/approvals/forms/BusinessProposalForm'
import OvertimeLogForm from '@/components/approvals/forms/OvertimeLogForm'
import { TokenManager } from '@/lib/api-client'
import { useAuth } from '@/contexts/AuthContext'
import { ChevronLeft, CheckCircle, XCircle, Send, Edit, Trash2, Save, Zap, Clock, CheckSquare } from 'lucide-react'

interface ApprovalDoc {
  id: string
  document_number: string
  document_type: string
  title: string
  status: string
  current_step: number
  department: string | null
  requester_id: string
  requester_name: string
  team_leader_id: string | null
  team_leader_name: string | null
  executive_id: string | null
  executive_name: string | null
  ceo_id: string | null
  ceo_name: string | null
  form_data: any
  rejection_history: any[]
  created_at: string
  submitted_at: string | null
  completed_at: string | null
  is_express_approved: boolean
  express_approved_by: string | null
  steps: (ApprovalStep & { approver_id?: string | null })[]
  // 처리확인 필드
  is_processed?: boolean
  processed_at?: string | null
  processed_by_name?: string | null
  process_note?: string | null
}

function formatDate(d?: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function FormViewer({
  doc, editing, onFormDataChange, onFileUpload, onFileDelete,
}: {
  doc: ApprovalDoc
  editing: boolean
  onFormDataChange?: (d: any) => void
  onFileUpload?: (file: File) => Promise<AttachmentFile>
  onFileDelete?: (att: AttachmentFile) => Promise<void>
}) {
  const props = { data: doc.form_data, onChange: onFormDataChange || (() => {}), disabled: !editing }
  switch (doc.document_type) {
    case 'expense_claim':     return (
      <ExpenseClaimForm
        {...props}
        onFileUpload={editing ? onFileUpload : undefined}
        onFileDelete={editing ? onFileDelete : undefined}
      />
    )
    case 'purchase_request':  return (
      <PurchaseRequestForm
        {...props}
        onFileUpload={editing ? onFileUpload : undefined}
        onFileDelete={editing ? onFileDelete : undefined}
      />
    )
    case 'leave_request':     return <LeaveRequestForm {...props} />
    case 'business_proposal': return (
      <BusinessProposalForm
        {...props}
        onFileUpload={editing ? onFileUpload : undefined}
        onFileDelete={editing ? onFileDelete : undefined}
      />
    )
    case 'overtime_log':      return <OvertimeLogForm {...props} />
    default: return <div className="text-gray-400 text-sm">알 수 없는 문서 유형</div>
  }
}

export default function ApprovalDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const id = params?.id as string

  const [doc, setDoc] = useState<ApprovalDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editFormData, setEditFormData] = useState<any>(null)
  const [editTeamLeader, setEditTeamLeader] = useState('')
  const [editExecutive, setEditExecutive] = useState('')
  const [editCeo, setEditCeo] = useState('')
  const [editTitle, setEditTitle] = useState('')

  const [rejectSheetOpen, setRejectSheetOpen] = useState(false)
  const [rejectComment, setRejectComment] = useState('')
  const [approveSheetOpen, setApproveSheetOpen] = useState(false)
  const [approveComment, setApproveComment] = useState('')
  const [processing, setProcessing] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  // ref로 최신값 유지: 클로저 캡처 문제 없이 채널 재구독 방지
  const editingRef = useRef(false)
  const fetchDocRef = useRef<() => void>(() => {})

  const [expressModalOpen, setExpressModalOpen] = useState(false)
  const [expressComment, setExpressComment] = useState('')

  // 처리확인 상태
  const [processModalOpen, setProcessModalOpen] = useState(false)
  const [processNote, setProcessNote] = useState('')
  const [isManagementSupport, setIsManagementSupport] = useState(false)
  const [processEditMode, setProcessEditMode] = useState(false)
  const [processDeleteConfirmOpen, setProcessDeleteConfirmOpen] = useState(false)

  const token = () => TokenManager.getToken()

  const fetchDoc = useCallback(async () => {
    const t = token()
    if (!t) return
    setLoading(true)
    try {
      const res = await fetch(`/api/approvals/${id}`, { headers: { Authorization: `Bearer ${t}` } })
      const data = await res.json()
      if (data.success) {
        setDoc(data.data)
        setEditFormData(data.data.form_data)
        setEditTeamLeader(data.data.team_leader_id || '')
        setEditExecutive(data.data.executive_id || '')
        setEditCeo(data.data.ceo_id || '')
        setEditTitle(data.data.title)
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  // fetchDocRef 동기화: 채널 클로저가 항상 최신 fetchDoc 참조
  useEffect(() => { fetchDocRef.current = fetchDoc }, [fetchDoc])
  // editingRef 동기화
  useEffect(() => { editingRef.current = editing }, [editing])

  useEffect(() => { fetchDoc() }, [fetchDoc])

  // 문서 ID 기반 Broadcast 구독: id가 바뀔 때만 재구독 (editing/fetchDoc 변경 시 재구독 없음)
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`approval-doc:${id}`)
      .on('broadcast', { event: 'doc_updated' }, (payload) => {
        // 삭제된 문서면 목록으로 이동
        if (payload.payload?.status === 'deleted') {
          router.push('/admin/approvals')
          return
        }
        // ref로 최신 editing 상태 확인 — 편집 중이 아닐 때만 갱신
        if (!editingRef.current) fetchDocRef.current()
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [id, router])

  const isMyDoc = doc?.requester_id === user?.id
  const isSuperAdmin = (user?.role ?? 0) >= 4

  // 경영지원부 여부 확인 (최초 1회, isSuperAdmin 선언 이후)
  useEffect(() => {
    if (isSuperAdmin) return
    const t = TokenManager.getToken()
    if (!t) return
    fetch('/api/employees/me/department-info', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setIsManagementSupport(d.data.is_management_support) })
      .catch(() => {})
  }, [isSuperAdmin])
  const canEdit = isMyDoc && ['draft', 'returned', 'rejected'].includes(doc?.status || '')
  const canDelete = isMyDoc && ['draft', 'returned', 'rejected'].includes(doc?.status || '')
  const canForceCancel = isSuperAdmin && !['draft', 'returned', 'rejected'].includes(doc?.status || '') && doc?.status !== undefined
  const canSubmit = isMyDoc && ['draft', 'returned', 'rejected'].includes(doc?.status || '')
  const isResubmit = ['returned', 'rejected'].includes(doc?.status || '')

  const myPendingStep = doc?.steps?.find(s =>
    s.approver_id === user?.id && s.status === 'pending' &&
    s.step_order === doc.current_step + 1
  )
  const canApprove = !!myPendingStep && doc?.status === 'pending'

  // 전결 조건: 결재선의 중역으로 지정된 사람 + pending + 전결 미처리
  // role 체크는 API에서 수행 (Employee 타입의 role은 숫자형 permission_level)
  const canExpressApprove =
    !!user?.id &&
    doc?.executive_id === user?.id &&
    doc?.status === 'pending' &&
    !doc?.is_express_approved


  const handleFileUpload = async (file: File): Promise<AttachmentFile> => {
    const t = token()
    if (!t) throw new Error('인증 토큰이 없습니다')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('document_id', id)

    const res = await fetch('/api/approvals/attachments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
      body: fd,
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '업로드 실패')
    return data.data as AttachmentFile
  }

  const handleFileDelete = async (attachment: AttachmentFile) => {
    const t = token()
    if (!t) throw new Error('인증 토큰이 없습니다')
    if (!attachment.path) return

    const res = await fetch('/api/approvals/attachments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ path: attachment.path }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '삭제 실패')
  }

  const handleSaveEdit = async () => {
    const t = token()
    if (!t || !doc) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ title: editTitle, team_leader_id: editTeamLeader || null, executive_id: editExecutive || null, ceo_id: editCeo || null, form_data: editFormData })
      })
      const data = await res.json()
      if (data.success) { setEditing(false); fetchDoc() }
      else alert(data.error || '저장 실패')
    } finally { setProcessing(false) }
  }

  const handleSubmit = async () => {
    if (!editTeamLeader || !editExecutive || !editCeo) {
      alert('팀장, 중역, 대표이사를 모두 선택해 주세요')
      return
    }
    setProcessing(true)
    try {
      if (editing) await handleSaveEdit()
      const t = token()
      const res = await fetch(`/api/approvals/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ resubmit: isResubmit })
      })
      const data = await res.json()
      if (data.success) fetchDoc()
      else alert(data.error || '상신 실패')
    } finally { setProcessing(false) }
  }

  const handleApprove = async () => {
    setProcessing(true)
    try {
      const t = token()
      const res = await fetch(`/api/approvals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ comment: approveComment.trim() })
      })
      const data = await res.json()
      if (data.success) { setApproveSheetOpen(false); setApproveComment(''); fetchDoc() }
      else alert(data.error || '승인 실패')
    } finally { setProcessing(false) }
  }

  const handleReject = async () => {
    if (!rejectComment.trim()) { alert('반려 사유를 입력해 주세요'); return }
    setProcessing(true)
    try {
      const t = token()
      const res = await fetch(`/api/approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ comment: rejectComment })
      })
      const data = await res.json()
      if (data.success) { setRejectSheetOpen(false); setRejectComment(''); fetchDoc() }
      else alert(data.error || '반려 실패')
    } finally { setProcessing(false) }
  }

  const handleExpressApprove = async () => {
    setProcessing(true)
    try {
      const t = token()
      const res = await fetch(`/api/approvals/${id}/express-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ comment: expressComment }),
      })
      const data = await res.json()
      if (data.success) {
        setExpressModalOpen(false)
        setExpressComment('')
        fetchDoc()
      } else {
        alert(data.error || '전결 처리 실패')
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleProcess = async () => {
    if (!doc) return
    setProcessing(true)
    try {
      const t = token()
      const res = await fetch(`/api/approvals/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ process_note: processNote.trim() || undefined }),
      })
      const data = await res.json()
      if (data.success) {
        setProcessModalOpen(false)
        setProcessNote('')
        fetchDoc()
      } else {
        alert(data.error || '처리확인 실패')
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleProcessEdit = async () => {
    if (!doc) return
    setProcessing(true)
    try {
      const t = token()
      const res = await fetch(`/api/approvals/${id}/process`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ process_note: processNote.trim() || null }),
      })
      const data = await res.json()
      if (data.success) {
        setProcessModalOpen(false)
        setProcessEditMode(false)
        setProcessNote('')
        fetchDoc()
      } else {
        alert(data.error || '수정 실패')
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleProcessDelete = async () => {
    if (!doc) return
    setProcessing(true)
    try {
      const t = token()
      const res = await fetch(`/api/approvals/${id}/process`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}` },
      })
      const data = await res.json()
      if (data.success) {
        setProcessDeleteConfirmOpen(false)
        fetchDoc()
      } else {
        alert(data.error || '삭제 실패')
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('문서를 삭제하시겠습니까?')) return
    const t = token()
    const res = await fetch(`/api/approvals/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
    const data = await res.json()
    if (data.success) router.push('/admin/approvals')
    else alert(data.error || '삭제 실패')
  }

  if (loading) {
    return (
      <AdminLayout title="결재 문서">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    )
  }

  if (!doc) {
    return (
      <AdminLayout title="결재 문서">
        <div className="text-center py-20 text-gray-400">문서를 찾을 수 없습니다</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout
      title={DOC_TYPE_LABEL[doc.document_type] || '결재 문서'}
      description={doc.document_number}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/admin/approvals')} className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-sm px-3 py-2">
            <ChevronLeft className="w-4 h-4" />목록
          </button>
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-gray-700 border border-gray-300 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm">
              <Edit className="w-4 h-4" />수정
            </button>
          )}
          {canDelete && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 text-red-600 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg text-sm">
              <Trash2 className="w-4 h-4" />삭제
            </button>
          )}
          {canForceCancel && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg text-sm">
              <Trash2 className="w-4 h-4" />강제 취소
            </button>
          )}
        </div>
      }
    >
      {/* 하단 여백 (모바일 고정 버튼 공간) */}
      <div className={`max-w-4xl mx-auto space-y-6 ${(canApprove || canExpressApprove || (canSubmit && !editing)) ? 'pb-24 md:pb-8' : 'pb-8'}`}>

        {/* 문서 헤더 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6">
            <ApprovalLineHeader
              documentTitle={DOC_TYPE_LABEL[doc.document_type] || doc.document_type}
              steps={doc.steps}
            />
          </div>

          {/* 메타 정보 */}
          <div className="px-4 md:px-6 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-gray-100 pt-4">
            <div>
              <div className="text-xs text-gray-400">작성자</div>
              <div className="text-sm font-medium">{doc.requester_name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">상태</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <ApprovalStatusBadge status={doc.status} />
                {doc.is_express_approved && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-300">
                    <Zap className="w-3 h-3" />전결
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">작성일</div>
              <div className="text-sm">{formatDate(doc.created_at)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">상신일</div>
              <div className="text-sm">{formatDate(doc.submitted_at)}</div>
            </div>
          </div>
        </div>

        {/* 편집 모드 - 결재선 변경 */}
        {editing && (
          <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 md:p-6">
            <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-4">결재선 변경</h3>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">제목</label>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
              />
            </div>
            <ApproverSelector
              teamLeaderId={editTeamLeader}
              executiveId={editExecutive}
              ceoId={editCeo}
              onTeamLeaderChange={setEditTeamLeader}
              onExecutiveChange={setEditExecutive}
              onCeoChange={setEditCeo}
            />
          </div>
        )}

        {/* 반려 이력 */}
        {doc.rejection_history && doc.rejection_history.length > 0 && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-red-700 mb-3">반려 이력</h3>
            <div className="space-y-3">
              {doc.rejection_history.map((h: any, i: number) => (
                <div key={i} className="bg-white rounded-lg p-3 border border-red-100">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-red-700">{h.rejected_by} ({h.role_label})</span>
                    <span className="text-xs text-gray-400">{formatDate(h.rejected_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{h.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 결재 의견 */}
        {doc.steps && doc.steps.filter(s => s.status === 'approved' && s.comment).length > 0 && (
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-blue-700 mb-3">결재 의견</h3>
            <div className="space-y-3">
              {doc.steps
                .filter(s => s.status === 'approved' && s.comment)
                .map((s, i) => (
                  <div key={i} className="bg-white rounded-lg p-3 border border-blue-100">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-sm font-medium text-blue-700">{s.approver_name_live || s.approver_name} ({s.role_label})</span>
                      <span className="text-xs text-gray-400">{formatDate(s.approved_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700">{s.comment}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 양식 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 md:mb-6">
            {editing ? '내용 수정' : '문서 내용'}
          </h3>
          <FormViewer
            doc={{ ...doc, form_data: editing ? editFormData : doc.form_data }}
            editing={editing}
            onFormDataChange={setEditFormData}
            onFileUpload={handleFileUpload}
            onFileDelete={handleFileDelete}
          />
        </div>

        {/* 처리확인 섹션 (경영지원부 또는 권한4, approved 상태에서만) */}
        {(isManagementSupport || isSuperAdmin) && doc?.status === 'approved' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              처리확인
            </h3>
            {doc.is_processed ? (
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-700">처리완료</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {doc.processed_by_name} · {formatDate(doc.processed_at)}
                    </p>
                    {doc.process_note && (
                      <p className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-lg px-3 py-2">{doc.process_note}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setProcessEditMode(true)
                      setProcessNote(doc.process_note || '')
                      setProcessModalOpen(true)
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    수정
                  </button>
                  <button
                    onClick={() => setProcessDeleteConfirmOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    삭제
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-orange-600">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">미처리</span>
                </div>
                <button
                  onClick={() => { setProcessEditMode(false); setProcessNote(''); setProcessModalOpen(true) }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <CheckSquare className="w-4 h-4" />
                  처리확인
                </button>
              </div>
            )}
          </div>
        )}

        {/* 결재 처리 영역 — 데스크탑만 (모바일은 하단 고정 버튼) */}
        {(canApprove || canExpressApprove) && (
          <div className="hidden md:block bg-white rounded-xl border border-blue-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-4">
              결재 처리 {canApprove ? `(${myPendingStep?.role_label})` : ''}
            </h3>
            <div className="flex gap-3">
              {canApprove && (
                <>
                  <button
                    onClick={() => setApproveSheetOpen(true)}
                    disabled={processing}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />승인
                  </button>
                  <button
                    onClick={() => setRejectSheetOpen(true)}
                    disabled={processing}
                    className="flex items-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />반려
                  </button>
                </>
              )}
              {canExpressApprove && (
                <button
                  onClick={() => setExpressModalOpen(true)}
                  disabled={processing}
                  className="flex items-center gap-2 border border-amber-400 text-amber-700 hover:bg-amber-50 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  <Zap className="w-4 h-4" />전결
                </button>
              )}
            </div>
          </div>
        )}

        {/* 하단 액션 — 데스크탑 편집 모드 */}
        <div className="hidden md:flex justify-end gap-3">
          {editing && (
            <>
              <button onClick={() => setEditing(false)} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                취소
              </button>
              <button onClick={handleSaveEdit} disabled={processing} className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                <Save className="w-4 h-4" />저장
              </button>
            </>
          )}
          {canSubmit && !editing && (
            <button onClick={handleSubmit} disabled={processing} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              <Send className="w-4 h-4" />{processing ? '처리 중...' : isResubmit ? '재상신' : '결재 상신'}
            </button>
          )}
        </div>
      </div>

      {/* ── 모바일 하단 고정 액션 바 ── */}
      {/* 결재자: 승인 / 반려 (+ 전결 버튼 중역에게 표시) */}
      {(canApprove || canExpressApprove) && (
        <div className="fixed bottom-0 inset-x-0 z-20 md:hidden bg-white border-t border-gray-200 px-4 pt-3 pb-[env(safe-area-inset-bottom,12px)]">
          <div className="flex gap-2">
            {canApprove && (
              <>
                <button
                  onClick={() => setRejectSheetOpen(true)}
                  disabled={processing}
                  className="flex-1 py-3.5 rounded-xl border border-red-300 text-red-600 font-semibold text-sm active:bg-red-50 disabled:opacity-50"
                >
                  반려
                </button>
                <button
                  onClick={() => setApproveSheetOpen(true)}
                  disabled={processing}
                  className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-50"
                >
                  ✓ 승인
                </button>
              </>
            )}
            {canExpressApprove && (
              <button
                onClick={() => setExpressModalOpen(true)}
                disabled={processing}
                className={`py-3.5 rounded-xl border border-amber-400 text-amber-700 font-semibold text-sm active:bg-amber-50 disabled:opacity-50 flex items-center justify-center gap-1.5 ${canApprove ? 'px-4' : 'flex-1'}`}
              >
                <Zap className="w-4 h-4" />전결
              </button>
            )}
          </div>
        </div>
      )}

      {/* 요청자: 결재 상신 */}
      {canSubmit && !editing && !canApprove && (
        <div className="fixed bottom-0 inset-x-0 z-20 md:hidden bg-white border-t border-gray-200 px-4 pt-3 pb-[env(safe-area-inset-bottom,12px)]">
          <button
            onClick={handleSubmit}
            disabled={processing}
            className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {processing ? '처리 중...' : isResubmit ? '재상신' : '결재 상신'}
          </button>
        </div>
      )}

      {/* ── 처리확인 모달 (신규 + 수정 공용) ── */}
      {processModalOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30" onClick={() => { setProcessModalOpen(false); setProcessEditMode(false); setProcessNote('') }} />

          {/* 모바일: Bottom Sheet */}
          <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom,16px)]">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="px-5 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <CheckSquare className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-gray-900">{processEditMode ? '처리확인 수정' : '처리확인'}</h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                {processEditMode ? '처리 메모를 수정합니다. 처리일시가 현재 시간으로 갱신됩니다.' : '이 결재 문서를 처리완료 상태로 변경합니다.'}
              </p>
              <textarea
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[100px]"
                value={processNote}
                onChange={e => setProcessNote(e.target.value)}
                placeholder="처리 메모 (선택사항)"
                autoFocus
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setProcessModalOpen(false); setProcessEditMode(false); setProcessNote('') }}
                  className="flex-1 py-3.5 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
                >
                  취소
                </button>
                <button
                  onClick={processEditMode ? handleProcessEdit : handleProcess}
                  disabled={processing}
                  className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-50"
                >
                  {processing ? '처리 중...' : processEditMode ? '저장' : '처리확인'}
                </button>
              </div>
            </div>
          </div>

          {/* 데스크탑: Center Modal */}
          <div className="hidden md:flex fixed inset-0 items-center justify-center z-40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckSquare className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">{processEditMode ? '처리확인 수정' : '처리확인'}</h3>
              </div>
              <p className="text-sm text-gray-500 mb-1">
                {processEditMode ? '처리 메모를 수정합니다. 처리일시가 현재 시간으로 갱신됩니다.' : '이 결재 문서를 처리완료 상태로 변경합니다.'}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                문서번호: {doc.document_number}
              </p>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  처리 메모 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  rows={3}
                  value={processNote}
                  onChange={e => setProcessNote(e.target.value)}
                  placeholder="처리 메모를 입력해 주세요..."
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setProcessModalOpen(false); setProcessEditMode(false); setProcessNote('') }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={processEditMode ? handleProcessEdit : handleProcess}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {processing ? '처리 중...' : processEditMode ? '저장' : '처리확인'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 처리확인 삭제 확인 다이얼로그 ── */}
      {processDeleteConfirmOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30" onClick={() => setProcessDeleteConfirmOpen(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-40 px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
              <div className="flex items-center gap-2 mb-3">
                <Trash2 className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-semibold text-gray-900">처리확인 취소</h3>
              </div>
              <p className="text-sm text-gray-600 mb-1">처리확인을 취소하시겠습니까?</p>
              <p className="text-xs text-gray-400 mb-6">처리 상태가 <span className="font-medium text-orange-600">미처리</span>로 변경됩니다.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setProcessDeleteConfirmOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleProcessDelete}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {processing ? '처리 중...' : '확인'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 전결 확인 모달 ── */}
      {expressModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-30"
            onClick={() => { setExpressModalOpen(false); setExpressComment('') }}
          />

          {/* 모바일: Bottom Sheet */}
          <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom,16px)]">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="px-5 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-semibold text-gray-900">전결 처리</h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                나머지 결재 단계를 건너뛰고 즉시 최종 완료 처리합니다.
              </p>
              <textarea
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[100px]"
                value={expressComment}
                onChange={e => setExpressComment(e.target.value)}
                placeholder="전결 사유 (선택)"
                autoFocus
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setExpressModalOpen(false); setExpressComment('') }}
                  className="flex-1 py-3.5 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
                >
                  취소
                </button>
                <button
                  onClick={handleExpressApprove}
                  disabled={processing}
                  className="flex-1 py-3.5 rounded-xl bg-amber-500 text-white font-semibold text-sm active:bg-amber-600 disabled:opacity-50"
                >
                  {processing ? '처리 중...' : '전결 확인'}
                </button>
              </div>
            </div>
          </div>

          {/* 데스크탑: Center Modal */}
          <div className="hidden md:flex fixed inset-0 items-center justify-center z-40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold text-gray-900">전결 처리</h3>
              </div>
              <p className="text-sm text-gray-500 mb-1">
                나머지 결재 단계를 건너뛰고 즉시 최종 완료 처리합니다.
              </p>
              <p className="text-xs text-gray-400 mb-4">
                이후 단계(대표이사 결재 등)는 자동으로 건너뜀 처리됩니다.
              </p>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  전결 사유 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                  rows={3}
                  value={expressComment}
                  onChange={e => setExpressComment(e.target.value)}
                  placeholder="전결 사유를 입력해 주세요..."
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setExpressModalOpen(false); setExpressComment('') }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleExpressApprove}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-amber-500 hover:bg-amber-600 rounded-lg disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {processing ? '처리 중...' : '전결 처리 확인'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 승인 UI: 모바일=Bottom Sheet / 데스크탑=Modal ── */}
      {approveSheetOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-30"
            onClick={() => { setApproveSheetOpen(false); setApproveComment('') }}
          />

          {/* 모바일: Bottom Sheet */}
          <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom,16px)]">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="px-5 pb-2">
              <h3 className="text-base font-semibold text-gray-900 mb-3">결재 승인</h3>
              <textarea
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[100px]"
                value={approveComment}
                onChange={e => setApproveComment(e.target.value)}
                placeholder="승인 의견을 남길 수 있습니다 (선택사항)"
                autoFocus
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setApproveSheetOpen(false); setApproveComment('') }}
                  className="flex-1 py-3.5 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
                >
                  취소
                </button>
                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-50"
                >
                  {processing ? '처리 중...' : '✓ 승인 확인'}
                </button>
              </div>
            </div>
          </div>

          {/* 데스크탑: Center Modal */}
          <div className="hidden md:flex fixed inset-0 items-center justify-center z-40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">결재 승인</h3>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  코멘트 <span className="text-gray-400 font-normal normal-case">(선택사항)</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  rows={4}
                  value={approveComment}
                  onChange={e => setApproveComment(e.target.value)}
                  placeholder="승인 의견을 남길 수 있습니다 (선택사항)"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setApproveSheetOpen(false); setApproveComment('') }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                >
                  {processing ? '처리 중...' : '✓ 승인 확인'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 반려 UI: 모바일=Bottom Sheet / 데스크탑=Modal ── */}
      {rejectSheetOpen && (
        <>
          {/* 딤 배경 (공통) */}
          <div
            className="fixed inset-0 bg-black/40 z-30"
            onClick={() => { setRejectSheetOpen(false); setRejectComment('') }}
          />

          {/* 모바일: Bottom Sheet */}
          <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom,16px)]">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="px-5 pb-2">
              <h3 className="text-base font-semibold text-gray-900 mb-3">반려 사유</h3>
              <textarea
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 min-h-[120px]"
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                placeholder="반려 사유를 입력해 주세요..."
                autoFocus
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setRejectSheetOpen(false); setRejectComment('') }}
                  className="flex-1 py-3.5 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
                >
                  취소
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="flex-1 py-3.5 rounded-xl bg-red-600 text-white font-semibold text-sm active:bg-red-700 disabled:opacity-50"
                >
                  {processing ? '처리 중...' : '반려 확인'}
                </button>
              </div>
            </div>
          </div>

          {/* 데스크탑: Center Modal */}
          <div className="hidden md:flex fixed inset-0 items-center justify-center z-40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">결재 반려</h3>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  반려 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                  rows={4}
                  value={rejectComment}
                  onChange={e => setRejectComment(e.target.value)}
                  placeholder="반려 사유를 입력해 주세요..."
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setRejectSheetOpen(false); setRejectComment('') }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  {processing ? '처리 중...' : '반려 확인'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  )
}
