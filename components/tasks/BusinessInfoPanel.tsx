// components/tasks/BusinessInfoPanel.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ExternalLink, Pencil, X, Check, ChevronDown, ChevronUp,
  Calendar, Search, FileText, CreditCard, Banknote, AlertCircle,
  Loader2, CheckCircle2,
} from 'lucide-react'
import { formatDate, formatCurrency } from '@/utils/formatters'
import { useBusinessMemoRealtime, BusinessMemoRealtimePayload } from '@/hooks/useBusinessMemoRealtime'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnifiedBusinessInfo {
  id: string
  business_name: string
  address: string | null
  manager_name: string | null
  manager_contact: string | null

  // 프로젝트 관리
  receipt_date: string | null

  // 일정 관리
  subsidy_approval_date: string | null
  contract_sent_date: string | null
  order_request_date: string | null
  order_date: string | null
  shipment_date: string | null
  installation_date: string | null
  construction_report_submitted_at: string | null
  greenlink_confirmation_submitted_at: string | null
  attachment_completion_submitted_at: string | null
  attachment_support_application_date: string | null
  attachment_support_writing_date: string | null

  // 실사 관리
  estimate_survey_date: string | null
  estimate_survey_manager: string | null
  pre_construction_survey_date: string | null
  pre_construction_survey_manager: string | null
  completion_survey_date: string | null
  completion_survey_manager: string | null

  // 계산서 (보조금)
  invoice_1st_date: string | null
  invoice_1st_amount: number | null
  invoice_2nd_date: string | null
  invoice_2nd_amount: number | null
  invoice_additional_date: string | null

  // 계산서 (자비)
  invoice_advance_date: string | null
  invoice_advance_amount: number | null
  invoice_balance_date: string | null
  invoice_balance_amount: number | null

  // 입금 (보조금)
  payment_1st_date: string | null
  payment_1st_amount: number | null
  payment_2nd_date: string | null
  payment_2nd_amount: number | null
  payment_additional_date: string | null
  payment_additional_amount: number | null

  // 입금 (자비)
  payment_advance_date: string | null
  payment_advance_amount: number | null
  payment_balance_date: string | null
  payment_balance_amount: number | null
}

type Draft = Partial<UnifiedBusinessInfo>

interface Memo {
  id: string
  title?: string
  content: string
  author: string | null
  created_by?: string
  created_at: string
  updated_at?: string
  updated_by?: string
  source_type?: string
  task_status?: string | null
  task_type?: string | null
}

interface BusinessInfoPanelProps {
  businessId: string | null
  businessName?: string
  taskId?: string
  onModalClose?: () => void
  pendingMemo?: { content: string; author: string; createdAt: string } | null
}

// ─── Utility components ───────────────────────────────────────────────────────

function DateInput({
  value,
  onChange,
  placeholder = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative flex items-center">
      <input
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white transition-all"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 p-0.5 text-gray-300 hover:text-gray-500 transition-colors"
          tabIndex={-1}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function AmountInput({
  value,
  onChange,
  placeholder = '금액 입력',
}: {
  value: string | number | null | undefined
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [display, setDisplay] = useState(() => {
    const n = Number(value)
    return value && !isNaN(n) ? n.toLocaleString() : ''
  })

  useEffect(() => {
    const n = Number(value)
    setDisplay(value && !isNaN(n) ? n.toLocaleString() : '')
  }, [value])

  const handleChange = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '')
    setDisplay(digits ? Number(digits).toLocaleString() : '')
    onChange(digits)
  }

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white transition-all pr-6"
      />
      {display && (
        <button
          type="button"
          onClick={() => { setDisplay(''); onChange('') }}
          className="absolute right-1.5 p-0.5 text-gray-300 hover:text-gray-500 transition-colors"
          tabIndex={-1}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white transition-all"
    />
  )
}

// Section wrapper with collapse
function Section({
  icon,
  title,
  color,
  children,
  defaultOpen = true,
  isEmpty,
  isEditing,
}: {
  icon: React.ReactNode
  title: string
  color: string
  children: React.ReactNode
  defaultOpen?: boolean
  isEmpty?: boolean
  isEditing?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen || isEditing || !isEmpty)

  useEffect(() => {
    if (isEditing) setOpen(true)
  }, [isEditing])

  if (!isEditing && isEmpty) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50 ${open ? 'border-b border-gray-100' : ''}`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 ${color} rounded-lg flex items-center justify-center`}>
            {icon}
          </div>
          <span className="text-sm font-semibold text-gray-800">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 py-3">
          {children}
        </div>
      )}
    </div>
  )
}

// Row for a single field (label + input or display)
function FieldRow({
  label,
  editContent,
  viewContent,
  isEditing,
}: {
  label: string
  editContent: React.ReactNode
  viewContent: React.ReactNode
  isEditing: boolean
}) {
  return (
    <div className={`flex items-center gap-2 ${isEditing ? 'py-1' : 'py-0.5'}`}>
      <span className="text-xs text-gray-500 min-w-[90px] shrink-0">{label}</span>
      <div className="flex-1 min-w-0">
        {isEditing ? editContent : viewContent}
      </div>
    </div>
  )
}

function ViewDate({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-gray-300">—</span>
  return <span className="text-xs font-medium text-gray-800">{formatDate(value)}</span>
}

function ViewAmount({ value }: { value: number | null }) {
  if (!value && value !== 0) return <span className="text-xs text-gray-300">—</span>
  return <span className="text-xs font-semibold text-blue-700">{formatCurrency(value)}원</span>
}

function ViewText({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-gray-300">—</span>
  return <span className="text-xs font-medium text-gray-800">{value}</span>
}

// Invoice + Payment paired row
function InvoicePaymentPair({
  label,
  invoiceDate,
  invoiceAmount,
  paymentDate,
  paymentAmount,
  onInvoiceDate,
  onInvoiceAmount,
  onPaymentDate,
  onPaymentAmount,
  isEditing,
  showAmount = true,
}: {
  label: string
  invoiceDate: string | null
  invoiceAmount?: number | null
  paymentDate: string | null
  paymentAmount: number | null
  onInvoiceDate: (v: string) => void
  onInvoiceAmount?: (v: string) => void
  onPaymentDate: (v: string) => void
  onPaymentAmount: (v: string) => void
  isEditing: boolean
  showAmount?: boolean
}) {
  const hasData = invoiceDate || paymentDate

  if (!isEditing && !hasData) return null

  return (
    <div className="border border-gray-100 rounded-lg p-3 mb-2 last:mb-0 bg-gray-50/50">
      <div className="text-xs font-semibold text-gray-600 mb-2">{label}</div>
      <div className="space-y-1.5">
        {/* 계산서 발행 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 min-w-[52px]">발행일</span>
          <div className="flex-1">
            {isEditing
              ? <DateInput value={invoiceDate || ''} onChange={onInvoiceDate} />
              : <ViewDate value={invoiceDate} />
            }
          </div>
        </div>
        {showAmount && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 min-w-[52px]">발행금액</span>
            <div className="flex-1">
              {isEditing
                ? <AmountInput value={invoiceAmount} onChange={onInvoiceAmount!} />
                : <ViewAmount value={invoiceAmount ?? null} />
              }
            </div>
          </div>
        )}
        {/* 입금 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 min-w-[52px]">입금일</span>
          <div className="flex-1">
            {isEditing
              ? <DateInput value={paymentDate || ''} onChange={onPaymentDate} />
              : <ViewDate value={paymentDate} />
            }
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 min-w-[52px]">입금금액</span>
          <div className="flex-1">
            {isEditing
              ? <AmountInput value={paymentAmount} onChange={onPaymentAmount} />
              : <ViewAmount value={paymentAmount} />
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function BusinessInfoPanel({
  businessId,
  taskId,
  onModalClose,
  pendingMemo,
}: BusinessInfoPanelProps) {
  const router = useRouter()
  const [data, setData] = useState<UnifiedBusinessInfo | null>(null)
  const [memos, setMemos] = useState<Memo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [saveMsg, setSaveMsg] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/business-info-direct?id=${businessId}&t=${Date.now()}`, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      })
      if (!res.ok) throw new Error(`API 오류: ${res.status}`)
      const json = await res.json()
      if (json.success && json.data?.length > 0) {
        setData(json.data[0])
      } else {
        setData(null)
      }

      const memRes = await fetch(`/api/business-memos?businessId=${businessId}`, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      })
      if (memRes.ok) {
        const memJson = await memRes.json()
        if (memJson.success && memJson.data) {
          const arr = Array.isArray(memJson.data) ? memJson.data : (memJson.data.data || [])
          setMemos(arr.map((m: any) => ({ ...m, author: m.author || m.created_by || null })))
        }
      }
    } catch (e: any) {
      setError(e.message || '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    if (businessId) fetchData()
    else { setData(null); setMemos([]) }
  }, [businessId, fetchData])

  // ── Memo realtime ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!pendingMemo) return
    const temp: Memo = {
      id: `pending-${Date.now()}`,
      content: pendingMemo.content,
      author: pendingMemo.author,
      created_at: pendingMemo.createdAt,
      source_type: 'task_sync',
    }
    setMemos(prev => {
      if (prev.some(m => m.content === pendingMemo.content && m.author === pendingMemo.author)) return prev
      return [temp, ...prev]
    })
  }, [pendingMemo])

  const handleRealtimeInsert = useCallback((p: BusinessMemoRealtimePayload) => {
    setMemos(prev => {
      if (prev.some(m => m.id === p.id)) return prev
      const mapped: Memo = { ...p, author: p.created_by || null }
      const without = prev.filter(m => !(m.id.startsWith('pending-') && m.content === p.content))
      return [mapped, ...without]
    })
  }, [])

  const handleRealtimeUpdate = useCallback((p: BusinessMemoRealtimePayload) => {
    setMemos(prev => prev.map(m => m.id === p.id ? { ...p, author: p.created_by || null } : m))
  }, [])

  const handleRealtimeDelete = useCallback((id: string) => {
    setMemos(prev => prev.filter(m => m.id !== id))
  }, [])

  useBusinessMemoRealtime({
    businessId: businessId || '',
    enabled: !!businessId,
    onInsert: handleRealtimeInsert,
    onUpdate: handleRealtimeUpdate,
    onDelete: handleRealtimeDelete,
  })

  // ── Edit helpers ───────────────────────────────────────────────────────────

  const startEdit = () => {
    if (!data) return
    setDraft({ ...data })
    setIsEditing(true)
    setSaveStatus('idle')
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setDraft({})
    setSaveStatus('idle')
  }

  const set = (field: keyof Draft) => (v: string) => {
    setDraft(prev => ({ ...prev, [field]: v || null }))
  }

  const setAmount = (field: keyof Draft) => (v: string) => {
    setDraft(prev => ({ ...prev, [field]: v ? parseInt(v) : null }))
  }

  const get = (field: keyof Draft): string => {
    const v = draft[field]
    return typeof v === 'string' ? v : ''
  }

  const getAmt = (field: keyof Draft): number | null => {
    const v = draft[field]
    return typeof v === 'number' ? v : null
  }

  const handleSave = async () => {
    if (!data?.id || !draft) return
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      const res = await fetch('/api/business-info-direct', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.id, ...draft }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || '저장에 실패했습니다.')

      // 낙관적 반영
      setData(prev => prev ? { ...prev, ...draft } : prev)
      setIsEditing(false)
      setDraft({})
      setSaveStatus('success')
      setSaveMsg('저장되었습니다.')

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (e: any) {
      setSaveStatus('error')
      setSaveMsg(e.message || '저장 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenBusinessDetail = () => {
    if (!businessId || !taskId) return
    router.push(`/admin/business?openModal=${businessId}&returnTo=tasks&taskId=${taskId}`)
    if (onModalClose) onModalClose()
  }

  // ── Render guards ──────────────────────────────────────────────────────────

  if (!businessId) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-5xl mb-3 opacity-30">🏢</div>
          <p className="text-sm text-gray-400">사업장을 선택하면<br />상세 정보가 표시됩니다.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-red-500 text-center">{error}</p>
        <button
          onClick={fetchData}
          className="text-xs text-blue-600 underline underline-offset-2"
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <p className="text-sm text-gray-400">사업장 정보를 찾을 수 없습니다.</p>
      </div>
    )
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const d = isEditing ? draft : data

  const hasSchedule = !!(
    data.subsidy_approval_date || data.contract_sent_date || data.order_request_date ||
    data.order_date || data.shipment_date || data.installation_date ||
    data.construction_report_submitted_at || data.greenlink_confirmation_submitted_at ||
    data.attachment_completion_submitted_at || data.attachment_support_application_date ||
    data.attachment_support_writing_date
  )

  const hasSurvey = !!(
    data.estimate_survey_date || data.estimate_survey_manager ||
    data.pre_construction_survey_date || data.pre_construction_survey_manager ||
    data.completion_survey_date || data.completion_survey_manager
  )

  const hasInvoice = !!(
    data.invoice_1st_date || data.invoice_2nd_date || data.invoice_additional_date ||
    data.invoice_advance_date || data.invoice_balance_date
  )

  const hasPayment = !!(
    data.payment_1st_date || data.payment_2nd_date || data.payment_additional_date ||
    data.payment_advance_date || data.payment_balance_date
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-blue-200 font-medium uppercase tracking-wide mb-1">사업장 정보</p>
              <h3 className="text-sm font-bold text-white leading-tight truncate">{data.business_name}</h3>
              {data.manager_name && (
                <p className="text-xs text-blue-100 mt-0.5">
                  {data.manager_name}{data.manager_contact ? ` · ${data.manager_contact}` : ''}
                </p>
              )}
              {data.address && (
                <p className="text-[11px] text-blue-200/80 mt-0.5 line-clamp-1">{data.address}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {!isEditing ? (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-medium transition-all border border-white/20 hover:border-white/40"
                >
                  <Pencil className="w-3 h-3" />
                  편집
                </button>
              ) : (
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg text-xs font-medium transition-all border border-white/10"
                >
                  <X className="w-3 h-3" />
                  취소
                </button>
              )}
              {businessId && taskId && !isEditing && (
                <button
                  onClick={handleOpenBusinessDetail}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white/70 rounded-lg text-xs transition-all border border-white/10"
                  title="사업장 상세보기"
                >
                  <ExternalLink className="w-3 h-3" />
                  상세
                </button>
              )}
            </div>
          </div>

          {/* Save status toast */}
          {saveStatus === 'success' && (
            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/20 border border-green-400/30 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-300 shrink-0" />
              <span className="text-xs text-green-200">{saveMsg}</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/20 border border-red-400/30 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-red-300 shrink-0" />
              <span className="text-xs text-red-200">{saveMsg}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {/* 편집 모드 안내 배너 */}
        {isEditing && (
          <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
            <Pencil className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">날짜·금액을 수정하고 아래 <strong>저장</strong>을 눌러주세요.</p>
          </div>
        )}

        {/* 1. 접수일 */}
        <Section
          icon={<Calendar className="w-3.5 h-3.5 text-white" />}
          title="접수일"
          color="bg-slate-500"
          defaultOpen={!!data.receipt_date}
          isEmpty={!data.receipt_date}
          isEditing={isEditing}
        >
          <FieldRow
            label="접수일"
            isEditing={isEditing}
            viewContent={<ViewDate value={data.receipt_date} />}
            editContent={<DateInput value={get('receipt_date')} onChange={set('receipt_date')} />}
          />
        </Section>

        {/* 2. 일정관리 */}
        <Section
          icon={<Calendar className="w-3.5 h-3.5 text-white" />}
          title="일정관리"
          color="bg-blue-500"
          defaultOpen={hasSchedule}
          isEmpty={!hasSchedule}
          isEditing={isEditing}
        >
          <div className="space-y-1">
            <FieldRow label="보조금 승인일" isEditing={isEditing}
              viewContent={<ViewDate value={data.subsidy_approval_date} />}
              editContent={<DateInput value={get('subsidy_approval_date')} onChange={set('subsidy_approval_date')} />}
            />
            <FieldRow label="계약서 발송일" isEditing={isEditing}
              viewContent={<ViewDate value={data.contract_sent_date} />}
              editContent={<DateInput value={get('contract_sent_date')} onChange={set('contract_sent_date')} />}
            />
            <FieldRow label="발주요청일" isEditing={isEditing}
              viewContent={<ViewDate value={data.order_request_date} />}
              editContent={<DateInput value={get('order_request_date')} onChange={set('order_request_date')} />}
            />
            <FieldRow label="발주일" isEditing={isEditing}
              viewContent={<ViewDate value={data.order_date} />}
              editContent={<DateInput value={get('order_date')} onChange={set('order_date')} />}
            />
            <FieldRow label="출하일" isEditing={isEditing}
              viewContent={<ViewDate value={data.shipment_date} />}
              editContent={<DateInput value={get('shipment_date')} onChange={set('shipment_date')} />}
            />
            <FieldRow label="설치일" isEditing={isEditing}
              viewContent={<ViewDate value={data.installation_date} />}
              editContent={<DateInput value={get('installation_date')} onChange={set('installation_date')} />}
            />
            {(isEditing || data.construction_report_submitted_at) && (
              <div className="pt-1 mt-1 border-t border-gray-100">
                <FieldRow label="착공신고서 제출" isEditing={isEditing}
                  viewContent={<ViewDate value={data.construction_report_submitted_at} />}
                  editContent={<DateInput value={get('construction_report_submitted_at')} onChange={set('construction_report_submitted_at')} />}
                />
              </div>
            )}
            {(isEditing || data.greenlink_confirmation_submitted_at) && (
              <FieldRow label="그린링크 제출" isEditing={isEditing}
                viewContent={<ViewDate value={data.greenlink_confirmation_submitted_at} />}
                editContent={<DateInput value={get('greenlink_confirmation_submitted_at')} onChange={set('greenlink_confirmation_submitted_at')} />}
              />
            )}
            {(isEditing || data.attachment_completion_submitted_at) && (
              <FieldRow label="부착완료 통보" isEditing={isEditing}
                viewContent={<ViewDate value={data.attachment_completion_submitted_at} />}
                editContent={<DateInput value={get('attachment_completion_submitted_at')} onChange={set('attachment_completion_submitted_at')} />}
              />
            )}
            {(isEditing || data.attachment_support_application_date) && (
              <FieldRow label="부착지원신청일" isEditing={isEditing}
                viewContent={<ViewDate value={data.attachment_support_application_date} />}
                editContent={<DateInput value={get('attachment_support_application_date')} onChange={set('attachment_support_application_date')} />}
              />
            )}
            {(isEditing || data.attachment_support_writing_date) && (
              <FieldRow label="부착지원작성일" isEditing={isEditing}
                viewContent={<ViewDate value={data.attachment_support_writing_date} />}
                editContent={<DateInput value={get('attachment_support_writing_date')} onChange={set('attachment_support_writing_date')} />}
              />
            )}
          </div>
        </Section>

        {/* 3. 실사관리 */}
        <Section
          icon={<Search className="w-3.5 h-3.5 text-white" />}
          title="실사관리"
          color="bg-violet-500"
          defaultOpen={hasSurvey}
          isEmpty={!hasSurvey}
          isEditing={isEditing}
        >
          {(['견적실사', '착공전실사', '준공실사'] as const).map((label, idx) => {
            const dateKey = (['estimate_survey_date', 'pre_construction_survey_date', 'completion_survey_date'] as const)[idx]
            const mgrKey = (['estimate_survey_manager', 'pre_construction_survey_manager', 'completion_survey_manager'] as const)[idx]
            const hasThis = !!(data[dateKey] || data[mgrKey])
            if (!isEditing && !hasThis) return null
            return (
              <div key={label} className={`${idx > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}`}>
                <p className="text-[11px] font-semibold text-violet-600 mb-1.5">{label}</p>
                <div className="space-y-1">
                  <FieldRow label="날짜" isEditing={isEditing}
                    viewContent={<ViewDate value={data[dateKey]} />}
                    editContent={<DateInput value={get(dateKey)} onChange={set(dateKey)} />}
                  />
                  <FieldRow label="담당자" isEditing={isEditing}
                    viewContent={<ViewText value={data[mgrKey] as string | null} />}
                    editContent={<TextInput value={get(mgrKey)} onChange={set(mgrKey)} placeholder="담당자 이름" />}
                  />
                </div>
              </div>
            )
          })}
        </Section>

        {/* 4. 계산서 & 입금 */}
        <Section
          icon={<CreditCard className="w-3.5 h-3.5 text-white" />}
          title="계산서 · 입금"
          color="bg-emerald-500"
          defaultOpen={hasInvoice || hasPayment}
          isEmpty={!hasInvoice && !hasPayment}
          isEditing={isEditing}
        >
          <InvoicePaymentPair
            label="1차 (보조금)"
            invoiceDate={isEditing ? get('invoice_1st_date') : data.invoice_1st_date}
            invoiceAmount={isEditing ? getAmt('invoice_1st_amount') : data.invoice_1st_amount}
            paymentDate={isEditing ? get('payment_1st_date') : data.payment_1st_date}
            paymentAmount={isEditing ? getAmt('payment_1st_amount') : data.payment_1st_amount}
            onInvoiceDate={set('invoice_1st_date')}
            onInvoiceAmount={setAmount('invoice_1st_amount')}
            onPaymentDate={set('payment_1st_date')}
            onPaymentAmount={setAmount('payment_1st_amount')}
            isEditing={isEditing}
          />
          <InvoicePaymentPair
            label="2차 (보조금)"
            invoiceDate={isEditing ? get('invoice_2nd_date') : data.invoice_2nd_date}
            invoiceAmount={isEditing ? getAmt('invoice_2nd_amount') : data.invoice_2nd_amount}
            paymentDate={isEditing ? get('payment_2nd_date') : data.payment_2nd_date}
            paymentAmount={isEditing ? getAmt('payment_2nd_amount') : data.payment_2nd_amount}
            onInvoiceDate={set('invoice_2nd_date')}
            onInvoiceAmount={setAmount('invoice_2nd_amount')}
            onPaymentDate={set('payment_2nd_date')}
            onPaymentAmount={setAmount('payment_2nd_amount')}
            isEditing={isEditing}
          />
          <InvoicePaymentPair
            label="추가"
            invoiceDate={isEditing ? get('invoice_additional_date') : data.invoice_additional_date}
            paymentDate={isEditing ? get('payment_additional_date') : data.payment_additional_date}
            paymentAmount={isEditing ? getAmt('payment_additional_amount') : data.payment_additional_amount}
            onInvoiceDate={set('invoice_additional_date')}
            onPaymentDate={set('payment_additional_date')}
            onPaymentAmount={setAmount('payment_additional_amount')}
            isEditing={isEditing}
            showAmount={false}
          />
          <InvoicePaymentPair
            label="선급 (자비)"
            invoiceDate={isEditing ? get('invoice_advance_date') : data.invoice_advance_date}
            invoiceAmount={isEditing ? getAmt('invoice_advance_amount') : data.invoice_advance_amount}
            paymentDate={isEditing ? get('payment_advance_date') : data.payment_advance_date}
            paymentAmount={isEditing ? getAmt('payment_advance_amount') : data.payment_advance_amount}
            onInvoiceDate={set('invoice_advance_date')}
            onInvoiceAmount={setAmount('invoice_advance_amount')}
            onPaymentDate={set('payment_advance_date')}
            onPaymentAmount={setAmount('payment_advance_amount')}
            isEditing={isEditing}
          />
          <InvoicePaymentPair
            label="잔금 (자비)"
            invoiceDate={isEditing ? get('invoice_balance_date') : data.invoice_balance_date}
            invoiceAmount={isEditing ? getAmt('invoice_balance_amount') : data.invoice_balance_amount}
            paymentDate={isEditing ? get('payment_balance_date') : data.payment_balance_date}
            paymentAmount={isEditing ? getAmt('payment_balance_amount') : data.payment_balance_amount}
            onInvoiceDate={set('invoice_balance_date')}
            onInvoiceAmount={setAmount('invoice_balance_amount')}
            onPaymentDate={set('payment_balance_date')}
            onPaymentAmount={setAmount('payment_balance_amount')}
            isEditing={isEditing}
          />
        </Section>

        {/* 5. 메모 */}
        {!isEditing && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-3">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <div className="w-6 h-6 bg-amber-500 rounded-lg flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800">업무진행현황 메모</span>
              {memos.length > 0 && (
                <span className="ml-auto text-xs text-gray-400">{memos.length}건</span>
              )}
            </div>
            <div className="px-4 py-3 max-h-64 overflow-y-auto">
              {memos.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-2">등록된 메모가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {memos.map((m, i) => {
                    const isSys = !m.author || m.author === 'system'
                    return (
                      <div
                        key={m.id || i}
                        className={`p-2.5 rounded-lg text-xs border ${isSys ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100'}`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-1.5">
                            {m.source_type === 'task_sync' && !isSys && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">업무</span>
                            )}
                            {isSys
                              ? <span className="text-[10px] text-gray-400 italic">자동 기록</span>
                              : <span className="font-medium text-gray-700">{m.author}</span>
                            }
                          </div>
                          <span className="text-[10px] text-gray-400">{formatDate(m.created_at)}</span>
                        </div>
                        <p className={`whitespace-pre-wrap leading-relaxed ${isSys ? 'text-gray-400 italic text-[11px]' : 'text-gray-600'}`}>
                          {m.content}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit mode bottom padding */}
        {isEditing && <div className="h-20" />}
      </div>

      {/* ── Sticky save bar ────────────────────────────────────────────────── */}
      {isEditing && (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3 flex items-center gap-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={cancelEdit}
            disabled={isSaving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl transition-all shadow-sm disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                저장
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
