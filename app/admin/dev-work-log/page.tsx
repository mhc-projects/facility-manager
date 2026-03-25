'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AdminLayout from '@/components/ui/AdminLayout'
import { useAuth } from '@/contexts/AuthContext'
import { TokenManager } from '@/lib/api-client'
import {
  Plus,
  Search,
  FileText,
  X,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  PauseCircle,
  XCircle,
  Flag,
  Loader2,
  RefreshCw,
  Printer,
  Copy,
  Check,
  User,
  MessageSquarePlus,
  Trash2,
  Edit3,
  Filter,
  ArrowUpDown,
} from 'lucide-react'

// ──────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────

interface ProgressNote {
  note: string
  created_at: string
  author_name: string
}

interface WorkLog {
  id: string
  title: string
  type: 'feature' | 'bugfix' | 'infra' | 'other'
  priority: 'high' | 'medium' | 'low'
  status: 'in_progress' | 'completed' | 'on_hold' | 'cancelled'
  description: string | null
  target_location: string | null
  received_date: string
  expected_date: string | null
  completed_date: string | null
  assignee_id: string | null
  assignee_name: string | null
  progress_notes: ProgressNote[]
  progress_percent: number
  created_by: string | null
  creator_name: string | null
  created_at: string
  updated_at: string
}

interface Employee {
  id: string
  name: string
  department_name?: string
}

type FilterStatus = 'all' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled'
type FilterPeriod = 'all' | 'week' | 'month'
type SortKey = 'received' | 'completed' | 'priority'

// ──────────────────────────────────────────
// 상수 및 유틸
// ──────────────────────────────────────────

const TYPE_LABELS: Record<WorkLog['type'], string> = {
  feature: '기능개발',
  bugfix: '버그수정',
  infra: '인프라',
  other: '기타',
}

const TYPE_COLORS: Record<WorkLog['type'], string> = {
  feature: 'bg-violet-100 text-violet-700',
  bugfix: 'bg-red-100 text-red-700',
  infra: 'bg-slate-100 text-slate-700',
  other: 'bg-gray-100 text-gray-600',
}

const STATUS_LABELS: Record<WorkLog['status'], string> = {
  in_progress: '진행중',
  completed: '완료',
  on_hold: '보류',
  cancelled: '취소',
}

const STATUS_COLORS: Record<WorkLog['status'], string> = {
  in_progress: 'bg-blue-100 text-blue-700 border border-blue-200',
  completed: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  on_hold: 'bg-amber-100 text-amber-700 border border-amber-200',
  cancelled: 'bg-gray-100 text-gray-500 border border-gray-200',
}

const STATUS_ICONS: Record<WorkLog['status'], React.ReactNode> = {
  in_progress: <Clock size={12} className="inline-block mr-0.5" />,
  completed: <CheckCircle2 size={12} className="inline-block mr-0.5" />,
  on_hold: <PauseCircle size={12} className="inline-block mr-0.5" />,
  cancelled: <XCircle size={12} className="inline-block mr-0.5" />,
}

const PRIORITY_LABELS: Record<WorkLog['priority'], string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
}

const PRIORITY_DOTS: Record<WorkLog['priority'], string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-400',
  low: 'bg-emerald-400',
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return dateStr.slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ──────────────────────────────────────────
// 하위 컴포넌트: 상태 뱃지
// ──────────────────────────────────────────

function StatusBadge({ status }: { status: WorkLog['status'] }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_ICONS[status]}
      {STATUS_LABELS[status]}
    </span>
  )
}

// ──────────────────────────────────────────
// 하위 컴포넌트: 유형 태그
// ──────────────────────────────────────────

function TypeBadge({ type }: { type: WorkLog['type'] }) {
  return (
    <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  )
}

// ──────────────────────────────────────────
// 하위 컴포넌트: 우선순위 표시
// ──────────────────────────────────────────

function PriorityDot({ priority }: { priority: WorkLog['priority'] }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
      <span className={`w-2 h-2 rounded-full ${PRIORITY_DOTS[priority]}`} />
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

// ──────────────────────────────────────────
// 하위 컴포넌트: 진행률 바
// ──────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  const pct = Math.min(100, Math.max(0, percent))
  const color =
    pct === 100 ? 'bg-emerald-500' :
    pct >= 60 ? 'bg-indigo-500' :
    pct >= 30 ? 'bg-amber-400' : 'bg-gray-300'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-7 text-right">{pct}%</span>
    </div>
  )
}

// ──────────────────────────────────────────
// 하위 컴포넌트: 보고서 생성 모달
// ──────────────────────────────────────────

interface ReportModalProps {
  items: WorkLog[]
  onClose: () => void
}

function ReportModal({ items, onClose }: ReportModalProps) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(today)
  const [completedOnly, setCompletedOnly] = useState(false)
  const [copied, setCopied] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const filtered = items.filter(item => {
    const inRange = item.received_date >= startDate && item.received_date <= endDate
    if (!inRange) return false
    if (completedOnly && item.status !== 'completed') return false
    return true
  })

  // 통계
  const stats = {
    total: filtered.length,
    completed: filtered.filter(i => i.status === 'completed').length,
    inProgress: filtered.filter(i => i.status === 'in_progress').length,
    onHold: filtered.filter(i => i.status === 'on_hold').length,
    avgProgress: filtered.length
      ? Math.round(filtered.reduce((s, i) => s + i.progress_percent, 0) / filtered.length)
      : 0,
  }

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1000,height=750')
    if (!win) return
    const now = new Date().toLocaleString('ko-KR')
    const rows = filtered.map((item, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="title">${item.title}</td>
        <td><span class="badge type-${item.type}">${TYPE_LABELS[item.type]}</span></td>
        <td><span class="priority p-${item.priority}">● ${PRIORITY_LABELS[item.priority]}</span></td>
        <td>${formatDate(item.received_date)}</td>
        <td>${formatDate(item.expected_date)}</td>
        <td>${formatDate(item.completed_date)}</td>
        <td>${item.assignee_name || '—'}</td>
        <td>
          <div class="prog-wrap"><div class="prog-bar" style="width:${item.progress_percent}%"></div></div>
          <span class="prog-num">${item.progress_percent}%</span>
        </td>
        <td><span class="badge status-${item.status}">${STATUS_LABELS[item.status]}</span></td>
      </tr>`).join('')

    win.document.write(`<!DOCTYPE html><html lang="ko"><head>
      <meta charset="UTF-8">
      <title>개발 업무 보고서 ${startDate} ~ ${endDate}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; background: #fff; color: #1e293b; padding: 40px; font-size: 11px; }
        .report-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 2px solid #6366f1; }
        .report-title { font-size: 20px; font-weight: 700; color: #1e293b; letter-spacing: -0.5px; }
        .report-title span { color: #6366f1; }
        .report-meta { font-size: 10px; color: #64748b; text-align: right; line-height: 1.6; }
        .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 24px; }
        .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
        .stat-label { font-size: 9px; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .stat-value { font-size: 20px; font-weight: 700; color: #1e293b; }
        .stat-value.blue { color: #6366f1; }
        .stat-value.green { color: #10b981; }
        .stat-value.amber { color: #f59e0b; }
        table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
        thead tr { background: linear-gradient(135deg, #6366f1, #818cf8); color: white; }
        thead th { padding: 9px 10px; text-align: left; font-weight: 600; font-size: 10px; letter-spacing: 0.3px; white-space: nowrap; }
        tbody tr { border-bottom: 1px solid #f1f5f9; }
        tbody tr:nth-child(even) { background: #fafbff; }
        tbody tr:hover { background: #f0f4ff; }
        td { padding: 8px 10px; vertical-align: middle; }
        td.num { text-align: center; color: #94a3b8; font-size: 10px; width: 30px; }
        td.title { font-weight: 500; color: #1e293b; max-width: 200px; }
        .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 9.5px; font-weight: 600; white-space: nowrap; }
        .type-feature { background: #ede9fe; color: #7c3aed; }
        .type-bugfix  { background: #fee2e2; color: #dc2626; }
        .type-infra   { background: #f1f5f9; color: #475569; }
        .type-other   { background: #f3f4f6; color: #6b7280; }
        .status-in_progress { background: #dbeafe; color: #1d4ed8; }
        .status-completed   { background: #d1fae5; color: #065f46; }
        .status-on_hold     { background: #fef3c7; color: #92400e; }
        .status-cancelled   { background: #f3f4f6; color: #6b7280; }
        .priority { font-size: 10px; font-weight: 600; white-space: nowrap; }
        .p-high   { color: #dc2626; }
        .p-medium { color: #d97706; }
        .p-low    { color: #059669; }
        .prog-wrap { background: #e2e8f0; border-radius: 99px; height: 5px; width: 60px; display: inline-block; vertical-align: middle; margin-right: 5px; overflow: hidden; }
        .prog-bar  { background: linear-gradient(90deg, #6366f1, #818cf8); height: 100%; border-radius: 99px; }
        .prog-num  { font-size: 10px; color: #64748b; vertical-align: middle; }
        .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; color: #94a3b8; font-size: 9px; }
        @media print {
          body { padding: 20px; }
          .stats { break-inside: avoid; }
        }
      </style>
    </head><body>
      <div class="report-header">
        <div>
          <div class="report-title">개발 업무 <span>보고서</span></div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">${startDate} ~ ${endDate}</div>
        </div>
        <div class="report-meta">
          생성일시: ${now}<br>
          ${completedOnly ? '완료 업무만 포함' : '전체 업무 포함'}
        </div>
      </div>
      <div class="stats">
        <div class="stat-card"><div class="stat-label">전체 업무</div><div class="stat-value blue">${stats.total}</div></div>
        <div class="stat-card"><div class="stat-label">완료</div><div class="stat-value green">${stats.completed}</div></div>
        <div class="stat-card"><div class="stat-label">진행중</div><div class="stat-value blue">${stats.inProgress}</div></div>
        <div class="stat-card"><div class="stat-label">보류</div><div class="stat-value amber">${stats.onHold}</div></div>
        <div class="stat-card"><div class="stat-label">평균 진행률</div><div class="stat-value">${stats.avgProgress}%</div></div>
      </div>
      <table>
        <thead><tr>
          <th>#</th><th>업무명</th><th>유형</th><th>우선순위</th>
          <th>접수일</th><th>예상완료</th><th>실제완료</th><th>담당자</th><th>진행률</th><th>상태</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="10" style="text-align:center;padding:20px;color:#94a3b8;">해당 기간에 업무가 없습니다</td></tr>`}</tbody>
      </table>
      <div class="footer">
        <span>개발부서 업무 일지 시스템</span>
        <span>총 ${stats.total}건 · 완료율 ${stats.total ? Math.round(stats.completed / stats.total * 100) : 0}%</span>
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  const handleCopy = async () => {
    const lines = [
      `개발 업무 보고서 (${startDate} ~ ${endDate})`,
      `생성: ${new Date().toLocaleString('ko-KR')} | 총 ${filtered.length}건`,
      '',
      ['#', '업무명', '유형', '우선순위', '접수일', '예상완료', '실제완료', '담당자', '진행률', '상태'].join('\t'),
      ...filtered.map((item, i) => [
        i + 1, item.title, TYPE_LABELS[item.type], PRIORITY_LABELS[item.priority],
        formatDate(item.received_date), formatDate(item.expected_date),
        formatDate(item.completed_date), item.assignee_name || '-',
        `${item.progress_percent}%`, STATUS_LABELS[item.status],
      ].join('\t')),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const completionRate = stats.total ? Math.round(stats.completed / stats.total * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── 헤더 ── */}
        <div className="relative bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-7 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <FileText size={18} className="text-white/80" />
              <h2 className="text-lg font-bold text-white tracking-tight">개발 업무 보고서</h2>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-white/90 text-xs font-medium">미리보기</span>
            </div>
            <p className="text-indigo-200 text-xs mt-1">{startDate} ~ {endDate} · {filtered.length}건</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <X size={17} className="text-white" />
          </button>
        </div>

        {/* ── 필터 바 ── */}
        <div className="px-7 py-4 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-3 items-end">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">시작일</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <span className="text-gray-400 pb-2">—</span>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">종료일</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 cursor-pointer hover:border-indigo-300 transition-colors">
            <input type="checkbox" checked={completedOnly} onChange={e => setCompletedOnly(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            완료 업무만
          </label>
          <div className="ml-auto flex gap-2">
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all font-medium">
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copied ? '복사됨!' : '탭 복사'}
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition-colors font-medium shadow-sm shadow-indigo-200">
              <Printer size={14} />
              인쇄 / PDF
            </button>
          </div>
        </div>

        {/* ── 미리보기 본문 ── */}
        <div className="flex-1 overflow-auto px-7 py-6 space-y-5" ref={printRef}>

          {/* 통계 카드 */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: '전체', value: stats.total, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
              { label: '완료', value: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
              { label: '진행중', value: stats.inProgress, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
              { label: '보류', value: stats.onHold, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
              { label: '완료율', value: `${completionRate}%`, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border rounded-xl px-4 py-3`}>
                <div className="text-xs text-gray-500 font-medium mb-1">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* 평균 진행률 바 */}
          <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl px-5 py-3 flex items-center gap-4">
            <span className="text-xs font-semibold text-indigo-700 whitespace-nowrap">평균 진행률</span>
            <div className="flex-1 h-2 bg-indigo-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${stats.avgProgress}%` }} />
            </div>
            <span className="text-sm font-bold text-indigo-700 w-10 text-right">{stats.avgProgress}%</span>
          </div>

          {/* 업무 테이블 */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText size={36} className="mb-3 opacity-30" />
              <p className="text-sm">해당 기간에 업무가 없습니다</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                    {['#', '업무명', '유형', '우선순위', '접수일', '예상완료', '실제완료', '담당자', '진행률', '상태'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap first:w-10 first:text-center">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, i) => (
                    <tr key={item.id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-indigo-50/40 transition-colors`}>
                      <td className="px-3 py-2.5 text-center text-xs text-gray-400 font-mono">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[200px]">
                        <div className="truncate" title={item.title}>{item.title}</div>
                      </td>
                      <td className="px-3 py-2.5"><TypeBadge type={item.type} /></td>
                      <td className="px-3 py-2.5"><PriorityDot priority={item.priority} /></td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(item.received_date)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(item.expected_date)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDate(item.completed_date)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">{item.assignee_name || '—'}</td>
                      <td className="px-3 py-2.5"><ProgressBar percent={item.progress_percent} /></td>
                      <td className="px-3 py-2.5"><StatusBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-slate-50 border-t border-gray-100 px-4 py-2.5 flex justify-between items-center">
                <span className="text-xs text-gray-400">
                  생성: {new Date().toLocaleString('ko-KR')}
                </span>
                <span className="text-xs font-medium text-gray-600">
                  총 {stats.total}건 · 완료 {stats.completed}건 ({completionRate}%)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────
// 하위 컴포넌트: 상세/편집 슬라이드 패널
// ──────────────────────────────────────────

interface DetailPanelProps {
  item: WorkLog | null
  isNew: boolean
  employees: Employee[]
  onClose: () => void
  onSave: (data: Partial<WorkLog> & { new_note?: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  saving: boolean
}

function DetailPanel({ item, isNew, employees, onClose, onSave, onDelete, saving }: DetailPanelProps) {
  const buildForm = (src: WorkLog | null) => ({
    title: src?.title || '',
    type: (src?.type || 'feature') as WorkLog['type'],
    priority: (src?.priority || 'medium') as WorkLog['priority'],
    status: (src?.status || 'in_progress') as WorkLog['status'],
    description: src?.description || '',
    target_location: src?.target_location || '',
    received_date: src?.received_date || today(),
    expected_date: src?.expected_date || '',
    completed_date: src?.completed_date || '',
    assignee_id: src?.assignee_id || '',
    progress_percent: src?.progress_percent ?? 0,
  })

  const [form, setForm] = useState(() => buildForm(item))
  const [newNote, setNewNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // item 또는 isNew 변경 시 폼 전체 리셋 (updated_at 포함하여 저장 후 갱신도 반영)
  useEffect(() => {
    setForm(buildForm(item))
    setNewNote('')
    setConfirmDelete(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.updated_at, isNew])

  const notes: ProgressNote[] = item?.progress_notes || []

  const set = (key: string, val: string | number) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const handleSubmit = async () => {
    await onSave({
      ...form,
      expected_date: form.expected_date || null,
      completed_date: form.completed_date || null,
      assignee_id: form.assignee_id || null,
      new_note: newNote.trim() || undefined,
    })
    setNewNote('')
  }

  const handleComplete = async () => {
    await onSave({
      ...form,
      status: 'completed',
      completed_date: form.completed_date || today(),
      progress_percent: 100,
    })
  }

  const inputClass =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
  const labelClass = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="h-full flex flex-col">
      {/* 패널 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">
          {isNew ? '새 업무 추가' : '업무 상세'}
        </h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <X size={16} className="text-gray-500" />
        </button>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* 업무명 */}
        <div>
          <label className={labelClass}>업무명 *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="업무명을 입력하세요"
            className={inputClass}
          />
        </div>

        {/* 유형 / 우선순위 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>유형</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} className={inputClass}>
              <option value="feature">기능개발</option>
              <option value="bugfix">버그수정</option>
              <option value="infra">인프라</option>
              <option value="other">기타</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>우선순위</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputClass}>
              <option value="high">높음</option>
              <option value="medium">보통</option>
              <option value="low">낮음</option>
            </select>
          </div>
        </div>

        {/* 상태 / 진행률 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>상태</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inputClass}>
              <option value="in_progress">진행중</option>
              <option value="completed">완료</option>
              <option value="on_hold">보류</option>
              <option value="cancelled">취소</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>진행률 ({form.progress_percent}%)</label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progress_percent}
              onChange={e => set('progress_percent', Number(e.target.value))}
              className="w-full mt-2 accent-indigo-600"
            />
          </div>
        </div>

        {/* 날짜 */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={labelClass}>접수일 *</label>
            <input type="date" value={form.received_date} onChange={e => set('received_date', e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>예상완료일</label>
              <input type="date" value={form.expected_date} onChange={e => set('expected_date', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>실제완료일</label>
              <input type="date" value={form.completed_date} onChange={e => set('completed_date', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* 담당자 */}
        <div>
          <label className={labelClass}>담당자</label>
          <select value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)} className={inputClass}>
            <option value="">미배정</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>

        {/* 진행 위치 */}
        <div>
          <label className={labelClass}>
            진행 위치
            <span className="ml-1.5 text-gray-400 font-normal">(파일 경로 · 페이지 · URL)</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none select-none font-mono text-xs">/</span>
            <input
              type="text"
              value={form.target_location}
              onChange={e => set('target_location', e.target.value)}
              placeholder="예: app/admin/tasks/page.tsx · /admin/business · components/ui/Modal"
              className={`${inputClass} pl-5 font-mono text-xs`}
            />
          </div>
          {form.target_location && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {form.target_location.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean).map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 설명 */}
        <div>
          <label className={labelClass}>설명/내용</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={4}
            placeholder="업무 내용을 입력하세요"
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* 진행 메모 타임라인 (기존 업무만) */}
        {!isNew && (
          <div>
            <label className={labelClass}>진행 메모</label>

            {/* 기존 메모 타임라인 */}
            {notes.length > 0 && (
              <div className="mb-3 space-y-2">
                {[...notes].reverse().map((n, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                      {i < notes.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-gray-700">{n.author_name}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(n.created_at).toLocaleString('ko-KR', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">{n.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 새 메모 입력 */}
            <div className="flex gap-2">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={2}
                placeholder="진행 상황 메모를 추가하세요..."
                className={`${inputClass} resize-none flex-1`}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newNote.trim()) {
                    handleSubmit()
                  }
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={saving || !newNote.trim()}
                title="메모만 저장 (Cmd+Enter)"
                className="self-end flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <MessageSquarePlus size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Cmd+Enter로 빠른 저장</p>
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 space-y-2">
        {/* 완료 처리 버튼 */}
        {!isNew && item?.status !== 'completed' && (
          <button
            onClick={handleComplete}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 size={16} />
            완료 처리
          </button>
        )}

        {/* 저장 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={saving || !form.title.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Edit3 size={16} />}
          {isNew ? '업무 추가' : '변경사항 저장'}
        </button>

        {/* 삭제 버튼 */}
        {!isNew && item && (
          <div>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} />
                삭제
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => onDelete(item.id)}
                  disabled={saving}
                  className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  확인 삭제
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────
// 메인 페이지 컴포넌트
// ──────────────────────────────────────────

export default function DevWorkLogPage() {
  const { user } = useAuth()

  // 접근 제어 상태
  const [isDeveloper, setIsDeveloper] = useState<boolean | null>(null)
  const [deptCheckLoading, setDeptCheckLoading] = useState(true)

  // 데이터
  const [items, setItems] = useState<WorkLog[]>([])
  const [total, setTotal] = useState(0)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 필터 상태
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all')
  const [sortKey, setSortKey] = useState<SortKey>('received')

  // 패널 상태
  const [selectedItem, setSelectedItem] = useState<WorkLog | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [isNew, setIsNew] = useState(false)

  // 모달
  const [reportOpen, setReportOpen] = useState(false)

  // 알림
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const authHeader = useCallback(() => {
    const token = TokenManager.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  // ── 부서 확인 ──
  useEffect(() => {
    if (!user) return
    const permissionLevel = (user as { permission_level?: number }).permission_level || 1

    if (permissionLevel >= 4) {
      setIsDeveloper(true)
      setDeptCheckLoading(false)
      return
    }

    fetch('/api/employees/me/department-info', { headers: authHeader() as HeadersInit })
      .then(r => r.json())
      .then(data => {
        // 응답: { data: { department_name, is_management_support } }
        const deptName = data.data?.department_name || data.department?.name || data.department_name || ''
        setIsDeveloper(deptName.includes('개발'))
      })
      .catch(() => setIsDeveloper(false))
      .finally(() => setDeptCheckLoading(false))
  }, [user, authHeader])

  // ── 직원 목록 로드 ──
  useEffect(() => {
    if (isDeveloper !== true) return
    const headers = authHeader() as HeadersInit
    fetch('/api/employees?limit=200', { headers })
      .then(r => {
        if (!r.ok) throw new Error(`employees API ${r.status}`)
        return r.json()
      })
      .then(data => {
        // 응답: { success, data: Employee[], pagination }
        const list: Array<{ id: string; name: string; department?: string; is_active?: boolean }> =
          Array.isArray(data.data) ? data.data :
          Array.isArray(data.employees) ? data.employees : []
        const mapped = list
          .filter(e => e.is_active !== false && (e.department || '').includes('개발'))
          .map(e => ({ id: e.id, name: e.name, department_name: e.department }))
        // 현재 로그인 사용자가 목록에 없으면 맨 앞에 추가 (자신은 항상 선택 가능)
        const currentUser = user as { id?: string; name?: string } | null
        if (currentUser?.id && !mapped.some(e => e.id === currentUser.id)) {
          mapped.unshift({ id: currentUser.id, name: currentUser.name || '나', department_name: undefined })
        }
        setEmployees(mapped)
      })
      .catch(err => console.error('[dev-work-log] 직원 목록 로드 실패:', err))
  }, [isDeveloper, authHeader])

  // ── 목록 로드 ──
  const loadItems = useCallback(async () => {
    if (!isDeveloper) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        search,
        status: filterStatus,
        period: filterPeriod,
        sort: sortKey,
        limit: '100',
        offset: '0',
      })
      const res = await fetch(`/api/dev-work-log?${params}`, {
        headers: authHeader() as HeadersInit,
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.success) {
        setItems(data.data || [])
        setTotal(data.total || 0)
      }
    } catch {
      showToast('목록을 불러오는 데 실패했습니다', 'error')
    } finally {
      setLoading(false)
    }
  }, [isDeveloper, search, filterStatus, filterPeriod, sortKey, authHeader])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // ── 업무 저장 ──
  const handleSave = async (data: Partial<WorkLog> & { new_note?: string }) => {
    setSaving(true)
    try {
      if (isNew) {
        const res = await fetch('/api/dev-work-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader() as Record<string, string>) },
          body: JSON.stringify(data),
        })
        const result = await res.json()
        if (!result.success) throw new Error(result.error)
        // 생성된 항목을 즉시 목록 맨 앞에 추가
        if (result.data?.id) {
          const fresh = await fetch(`/api/dev-work-log/${result.data.id}`, {
            headers: authHeader() as HeadersInit,
            cache: 'no-store',
          }).then(r => r.json())
          if (fresh.success) {
            setItems(prev => [fresh.data, ...prev])
            setTotal(prev => prev + 1)
          }
        }
        showToast('업무가 추가되었습니다')
        setPanelOpen(false)
        setIsNew(false)
      } else if (selectedItem) {
        const res = await fetch(`/api/dev-work-log/${selectedItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(authHeader() as Record<string, string>) },
          body: JSON.stringify(data),
        })
        const result = await res.json()
        if (!result.success) throw new Error(result.error)
        showToast('저장되었습니다')
        // 패널 내 최신 데이터로 갱신
        const fresh = await fetch(`/api/dev-work-log/${selectedItem.id}`, {
          headers: authHeader() as HeadersInit,
          cache: 'no-store',
        }).then(r => r.json())
        if (fresh.success) setSelectedItem(fresh.data)
      }
      await loadItems()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '저장에 실패했습니다', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── 업무 삭제 ──
  const handleDelete = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/dev-work-log/${id}`, {
        method: 'DELETE',
        headers: authHeader() as HeadersInit,
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error)
      showToast('삭제되었습니다')
      setPanelOpen(false)
      setSelectedItem(null)
      await loadItems()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '삭제에 실패했습니다', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openDetail = (item: WorkLog) => {
    setSelectedItem(item)
    setIsNew(false)
    setPanelOpen(true)
  }

  const openNew = () => {
    setSelectedItem(null)
    setIsNew(true)
    setPanelOpen(true)
  }

  // ── 로딩 중 ──
  if (deptCheckLoading) {
    return (
      <AdminLayout title="개발 업무 일지">
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-indigo-500" />
        </div>
      </AdminLayout>
    )
  }

  // ── 접근 거부 ──
  if (!isDeveloper) {
    return (
      <AdminLayout title="개발 업무 일지">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-gray-900">접근 권한이 없습니다</p>
            <p className="text-sm text-gray-500 mt-1">개발부서 소속 직원만 이 페이지에 접근할 수 있습니다.</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  // ── 통계 집계 ──
  const stats = {
    total: items.length,
    in_progress: items.filter(i => i.status === 'in_progress').length,
    completed: items.filter(i => i.status === 'completed').length,
    on_hold: items.filter(i => i.status === 'on_hold').length,
  }

  return (
    <AdminLayout title="개발 업무 일지">
      {/* 토스트 */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <div className="flex h-full">
        {/* 메인 영역 */}
        <div
          className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ${panelOpen ? 'mr-0' : ''}`}
          onClick={panelOpen ? (e) => {
            // 클릭된 요소가 인터랙티브 요소(버튼, 입력, 링크, 테이블 행)가 아닐 때만 패널 닫기
            const target = e.target as HTMLElement
            const interactive = target.closest('button, a, input, select, textarea, tr, label')
            if (!interactive) {
              setPanelOpen(false)
              setSelectedItem(null)
              setIsNew(false)
            }
          } : undefined}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-gray-900">개발 업무 일지</h1>
              <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-xs font-bold tracking-wide">
                DEV ONLY
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setReportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FileText size={15} />
                <span className="hidden sm:inline">보고서 생성</span>
              </button>
              <button
                onClick={openNew}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <Plus size={15} />
                <span className="hidden sm:inline">새 업무 추가</span>
              </button>
            </div>
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 bg-white border-b border-gray-100 flex-shrink-0">
            {[
              { label: '전체', value: stats.total, color: 'text-gray-900' },
              { label: '진행중', value: stats.in_progress, color: 'text-blue-600' },
              { label: '완료', value: stats.completed, color: 'text-emerald-600' },
              { label: '보류', value: stats.on_hold, color: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* 필터 바 */}
          <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-white border-b border-gray-100 flex-shrink-0">
            {/* 검색 */}
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="업무명, 담당자 검색"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X size={14} className="text-gray-400" />
                </button>
              )}
            </div>

            {/* 상태 필터 */}
            <div className="flex items-center gap-1">
              <Filter size={13} className="text-gray-400" />
              {(['all', 'in_progress', 'completed', 'on_hold', 'cancelled'] as FilterStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filterStatus === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s === 'all' ? '전체' : STATUS_LABELS[s as WorkLog['status']]}
                </button>
              ))}
            </div>

            {/* 기간 필터 */}
            <select
              value={filterPeriod}
              onChange={e => setFilterPeriod(e.target.value as FilterPeriod)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-700"
            >
              <option value="all">전체 기간</option>
              <option value="week">이번 주</option>
              <option value="month">이번 달</option>
            </select>

            {/* 정렬 */}
            <div className="flex items-center gap-1 ml-auto">
              <ArrowUpDown size={13} className="text-gray-400" />
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-700"
              >
                <option value="received">접수일순</option>
                <option value="completed">완료일순</option>
                <option value="priority">우선순위순</option>
              </select>
              <button
                onClick={loadItems}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500"
                title="새로고침"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* 테이블 */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <FileText size={20} className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-500">등록된 업무가 없습니다</p>
                <button
                  onClick={openNew}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  첫 번째 업무를 추가하세요
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-10">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">업무명</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-28 hidden md:table-cell">유형</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-20 hidden lg:table-cell">우선순위</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-24 hidden md:table-cell">접수일</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-24 hidden xl:table-cell">예상완료</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-24 hidden xl:table-cell">실제완료</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-24 hidden lg:table-cell">담당자</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-28 hidden md:table-cell">진행률</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-24">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr
                      key={item.id}
                      onClick={() => openDetail(item)}
                      className={`group border-b border-gray-50 cursor-pointer hover:bg-gray-50 hover:shadow-sm transition-all ${
                        selectedItem?.id === item.id ? 'border-l-4 border-l-indigo-500 bg-indigo-50/30' : 'border-l-4 border-l-transparent'
                      }`}
                    >
                      <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 group-hover:text-indigo-700 transition-colors line-clamp-1">
                          {item.title}
                        </span>
                        {item.target_location && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0" />
                            <span className="text-xs text-indigo-500 font-mono truncate max-w-[220px]">
                              {item.target_location.split(/[\n,;]+/)[0].trim()}
                            </span>
                          </div>
                        )}
                        {/* 모바일: 부가 정보 */}
                        <div className="flex items-center gap-2 mt-1 md:hidden">
                          <TypeBadge type={item.type} />
                          <span className="text-xs text-gray-400">{formatDate(item.received_date)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <TypeBadge type={item.type} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <PriorityDot priority={item.priority} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 hidden md:table-cell">
                        {formatDate(item.received_date)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 hidden xl:table-cell">
                        {formatDate(item.expected_date)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 hidden xl:table-cell">
                        {formatDate(item.completed_date)}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {item.assignee_name ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                              {item.assignee_name[0]}
                            </div>
                            <span className="text-xs text-gray-700">{item.assignee_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">미배정</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <ProgressBar percent={item.progress_percent} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 페이지 하단 요약 */}
          {!loading && items.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-100 bg-white flex-shrink-0">
              <p className="text-xs text-gray-500">
                총 <span className="font-semibold text-gray-700">{total}</span>건
                {filterStatus !== 'all' && ` · ${STATUS_LABELS[filterStatus as WorkLog['status']]} ${items.length}건`}
              </p>
            </div>
          )}
        </div>

        {/* 슬라이드 패널 */}
        <div
          className={`flex-shrink-0 border-l border-gray-200 bg-white transition-all duration-300 overflow-hidden ${
            panelOpen ? 'w-full sm:w-80 lg:w-96' : 'w-0'
          }`}
          style={{ maxHeight: '100%' }}
        >
          {panelOpen && (
            <DetailPanel
              item={selectedItem}
              isNew={isNew}
              employees={employees}
              onClose={() => { setPanelOpen(false); setSelectedItem(null) }}
              onSave={handleSave}
              onDelete={handleDelete}
              saving={saving}
            />
          )}
        </div>
      </div>

      {/* 보고서 모달 */}
      {reportOpen && (
        <ReportModal items={items} onClose={() => setReportOpen(false)} />
      )}
    </AdminLayout>
  )
}
