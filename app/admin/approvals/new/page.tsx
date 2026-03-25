'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import ApprovalLineHeader from '@/components/approvals/ApprovalLineHeader'
import ApproverSelector from '@/components/approvals/ApproverSelector'
import ExpenseClaimForm, { ExpenseClaimData } from '@/components/approvals/forms/ExpenseClaimForm'
import PurchaseRequestForm, { PurchaseRequestData, AttachmentFile } from '@/components/approvals/forms/PurchaseRequestForm'
import LeaveRequestForm, { LeaveRequestData } from '@/components/approvals/forms/LeaveRequestForm'
import BusinessProposalForm, { BusinessProposalData } from '@/components/approvals/forms/BusinessProposalForm'
import OvertimeLogForm, { OvertimeLogData } from '@/components/approvals/forms/OvertimeLogForm'
import { TokenManager } from '@/lib/api-client'
import { useAuth } from '@/contexts/AuthContext'
import { Save, Send, ChevronLeft } from 'lucide-react'

const DOC_TYPES = [
  { value: 'expense_claim',     label: '지출결의서',   desc: '지출 내역 승인 요청' },
  { value: 'purchase_request',  label: '구매요청서',   desc: '물품 구매 요청' },
  { value: 'leave_request',     label: '휴가원',       desc: '휴가/경조사 신청' },
  { value: 'business_proposal', label: '업무품의서',   desc: '업무 협의/승인 요청' },
  { value: 'overtime_log',      label: '연장근무일지', desc: '연장근무 내역 보고' },
] as const

type DocType = typeof DOC_TYPES[number]['value']

const TODAY = new Date().toISOString().split('T')[0]
const NOW = new Date()
const THIS_MONTH_TITLE = `${NOW.getFullYear()}년 ${NOW.getMonth() + 1}월 연장근무일지`

function getDefaultFormData(type: DocType, writerName: string, dept: string): any {
  switch (type) {
    case 'expense_claim':
      return { writer: writerName, department: dept, written_date: TODAY, note: '', items: [{ date: TODAY, description: '', amount: 0, note: '' }] } as ExpenseClaimData
    case 'purchase_request':
      return { writer: writerName, department: dept, written_date: TODAY, estimated_total: 0, special_notes: '상기와 같이 물품 구매를 요청합니다.\n(견적서 첨부 여 / 부)', attachment_included: false, items: Array.from({ length: 5 }, (_, i) => ({ seq: i+1, name: '', quantity: 0, unit_price: 0, estimated_amount: 0, reason: '' })) } as PurchaseRequestData
    case 'leave_request':
      return { writer: writerName, department: dept, written_date: TODAY, start_date: TODAY, end_date: TODAY, total_days: 1, leave_type: 'annual', reason: '', note: '' } as LeaveRequestData
    case 'business_proposal':
      return { writer: writerName, department: dept, department_id: '', written_date: TODAY, title: '', content: '', retention_period: '3년', cooperative_team: '', cooperative_team_id: '', instructions: '', attachments_desc: '없음' } as BusinessProposalData
    case 'overtime_log':
      return { writer: writerName, department: dept, written_date: TODAY, items: Array.from({ length: 5 }, () => ({ date: '', day_of_week: '', ot_hours: 1, start_time: '18:00', work_time: '근무시간 1H (18:00~19:00)', work_content: '' })) } as OvertimeLogData
  }
}

export default function NewApprovalPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [docType, setDocType] = useState<DocType>('expense_claim')
  const [title, setTitle] = useState('')
  const [teamLeaderId, setTeamLeaderId] = useState('')
  const [executiveId, setExecutiveId] = useState('')
  const [ceoId, setCeoId] = useState('')
  const [formData, setFormData] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  const handleDocTypeChange = (type: DocType) => {
    if (type === docType) return
    setFormData(null)
    setDocType(type)
    if (type === 'overtime_log') setTitle(THIS_MONTH_TITLE)
    else setTitle('')
  }

  useEffect(() => {
    if (user) {
      setFormData(getDefaultFormData(docType, user.name || '', (user as any).department || ''))
    }
  }, [docType, user])

  const getToken = () => TokenManager.getToken()

  const handleFileUpload = async (file: File): Promise<AttachmentFile> => {
    const token = getToken()
    if (!token) throw new Error('인증 토큰이 없습니다')

    // 문서가 아직 저장되지 않은 경우 먼저 임시 저장
    let docId = savedId
    if (!docId) {
      docId = await handleSave()
    }

    const fd = new FormData()
    fd.append('file', file)
    if (docId) fd.append('document_id', docId)

    const res = await fetch('/api/approvals/attachments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '업로드 실패')
    return data.data as AttachmentFile
  }

  const handleFileDelete = async (attachment: AttachmentFile) => {
    const token = getToken()
    if (!token) throw new Error('인증 토큰이 없습니다')
    if (!attachment.path) return

    const res = await fetch('/api/approvals/attachments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: attachment.path }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '삭제 실패')
  }

  const handleSave = async (): Promise<string | null> => {
    const token = getToken()
    if (!token || !formData) return null
    setSaving(true)
    try {
      const method = savedId ? 'PUT' : 'POST'
      const url = savedId ? `/api/approvals/${savedId}` : '/api/approvals'
      const defaultTitle = docType === 'overtime_log' ? THIS_MONTH_TITLE : `${DOC_TYPES.find(d => d.value === docType)?.label} - ${TODAY}`
      const body: any = { document_type: docType, title: title || defaultTitle, team_leader_id: teamLeaderId || null, executive_id: executiveId || null, ceo_id: ceoId || null, form_data: formData, department: formData.department || '' }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.success) {
        const id = data.data?.id || savedId
        setSavedId(id)
        return id
      }
      alert(data.error || '저장 실패')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!teamLeaderId || !executiveId || !ceoId) {
      alert('팀장, 중역, 대표이사를 모두 선택해 주세요')
      return
    }
    setSubmitting(true)
    try {
      const id = await handleSave()
      if (!id) return
      const token = getToken()
      const res = await fetch(`/api/approvals/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resubmit: false })
      })
      const data = await res.json()
      if (data.success) {
        router.push(`/admin/approvals/${id}`)
      } else {
        alert(data.error || '상신 실패')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const selectedType = DOC_TYPES.find(d => d.value === docType)

  return (
    <AdminLayout
      title="새 결재 문서"
      description="결재 문서를 작성하고 상신하세요"
      actions={
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm">
          <ChevronLeft className="w-4 h-4" />목록
        </button>
      }
    >
      <div className="max-w-4xl mx-auto space-y-6 pb-24 md:pb-0">
        {/* 문서 유형 선택 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">문서 유형 선택</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {DOC_TYPES.map(dt => (
              <button
                key={dt.value}
                onClick={() => handleDocTypeChange(dt.value as DocType)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  docType === dt.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <div className="font-medium text-sm">{dt.label}</div>
                <div className="text-xs text-gray-500 mt-1">{dt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 문서 제목 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">문서 제목</label>
          <input
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={`${selectedType?.label} 제목 입력...`}
          />
        </div>

        {/* 결재선 지정 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">결재선 지정</h3>
          <ApproverSelector
            teamLeaderId={teamLeaderId}
            executiveId={executiveId}
            ceoId={ceoId}
            onTeamLeaderChange={setTeamLeaderId}
            onExecutiveChange={setExecutiveId}
            onCeoChange={setCeoId}
          />
        </div>

        {/* 결재선 미리보기 */}
        {formData && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">양식 미리보기</h3>
            <ApprovalLineHeader
              documentTitle={selectedType?.label || ''}
              previewNames={{
                requester: user?.name,
                teamLeader: undefined,
                executive: undefined,
                ceo: undefined,
              }}
            />
          </div>
        )}

        {/* 양식 */}
        {formData && (
          <div key={docType} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-6">
              {selectedType?.label} 작성
            </h3>
            {docType === 'expense_claim' && (
              <ExpenseClaimForm
                data={formData}
                onChange={setFormData}
                onFileUpload={handleFileUpload}
                onFileDelete={handleFileDelete}
              />
            )}
            {docType === 'purchase_request' && (
              <PurchaseRequestForm
                data={formData}
                onChange={setFormData}
                onFileUpload={handleFileUpload}
                onFileDelete={handleFileDelete}
              />
            )}
            {docType === 'leave_request' && (
              <LeaveRequestForm data={formData} onChange={setFormData} />
            )}
            {docType === 'business_proposal' && (
              <BusinessProposalForm
                data={formData}
                onChange={setFormData}
                onFileUpload={handleFileUpload}
                onFileDelete={handleFileDelete}
              />
            )}
            {docType === 'overtime_log' && (
              <OvertimeLogForm data={formData} onChange={setFormData} />
            )}
          </div>
        )}

        {/* 액션 버튼 — 데스크탑 */}
        <div className="hidden md:flex justify-end gap-3 pb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : '임시저장'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
            {submitting ? '상신 중...' : '결재 상신'}
          </button>
        </div>
      </div>

      {/* 액션 버튼 — 모바일 하단 고정 */}
      <div className="fixed bottom-0 inset-x-0 z-20 md:hidden bg-white border-t border-gray-200 px-4 pt-3 pb-[env(safe-area-inset-bottom,12px)]">
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || submitting}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm active:bg-gray-50 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : '임시저장'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || saving}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitting ? '상신 중...' : '결재 상신'}
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}
