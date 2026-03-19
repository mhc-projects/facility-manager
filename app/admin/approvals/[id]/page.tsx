'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
import { ChevronLeft, CheckCircle, XCircle, Send, Edit, Trash2, Save } from 'lucide-react'

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
  steps: (ApprovalStep & { approver_id?: string | null })[]
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
    case 'expense_claim':     return <ExpenseClaimForm {...props} />
    case 'purchase_request':  return (
      <PurchaseRequestForm
        {...props}
        onFileUpload={editing ? onFileUpload : undefined}
        onFileDelete={editing ? onFileDelete : undefined}
      />
    )
    case 'leave_request':     return <LeaveRequestForm {...props} />
    case 'business_proposal': return <BusinessProposalForm {...props} />
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
  const [processing, setProcessing] = useState(false)

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

  useEffect(() => { fetchDoc() }, [fetchDoc])

  const isMyDoc = doc?.requester_id === user?.id
  const canEdit = isMyDoc && ['draft', 'returned', 'rejected'].includes(doc?.status || '')
  const canDelete = isMyDoc && ['draft', 'returned', 'rejected'].includes(doc?.status || '')
  const canSubmit = isMyDoc && ['draft', 'returned', 'rejected'].includes(doc?.status || '')
  const isResubmit = ['returned', 'rejected'].includes(doc?.status || '')

  const myPendingStep = doc?.steps?.find(s =>
    s.approver_id === user?.id && s.status === 'pending' &&
    s.step_order === doc.current_step + 1
  )
  const canApprove = !!myPendingStep && doc?.status === 'pending'

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
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.success) { fetchDoc() }
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
        </div>
      }
    >
      {/* 하단 여백 (모바일 고정 버튼 공간) */}
      <div className={`max-w-4xl mx-auto space-y-6 ${(canApprove || (canSubmit && !editing)) ? 'pb-24 md:pb-8' : 'pb-8'}`}>

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
              <ApprovalStatusBadge status={doc.status} />
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

        {/* 결재 처리 영역 — 데스크탑만 (모바일은 하단 고정 버튼) */}
        {canApprove && (
          <div className="hidden md:block bg-white rounded-xl border border-blue-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-4">
              결재 처리 ({myPendingStep?.role_label})
            </h3>
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                disabled={processing}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />{processing ? '처리 중...' : '승인'}
              </button>
              <button
                onClick={() => setRejectSheetOpen(true)}
                disabled={processing}
                className="flex items-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-4 h-4" />반려
              </button>
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
      {/* 결재자: 승인 / 반려 */}
      {canApprove && (
        <div className="fixed bottom-0 inset-x-0 z-20 md:hidden bg-white border-t border-gray-200 px-4 pt-3 pb-[env(safe-area-inset-bottom,12px)]">
          <div className="flex gap-3">
            <button
              onClick={() => setRejectSheetOpen(true)}
              disabled={processing}
              className="flex-1 py-3.5 rounded-xl border border-red-300 text-red-600 font-semibold text-sm active:bg-red-50 disabled:opacity-50"
            >
              반려
            </button>
            <button
              onClick={handleApprove}
              disabled={processing}
              className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-50"
            >
              {processing ? '처리 중...' : '✓ 승인'}
            </button>
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
