'use client'

const STATUS_CONFIG = {
  draft:     { label: '임시저장', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  pending:   { label: '결재중',   className: 'bg-blue-50 text-blue-700 border-blue-200' },
  approved:  { label: '승인완료', className: 'bg-green-50 text-green-700 border-green-200' },
  rejected:  { label: '반려',     className: 'bg-red-50 text-red-700 border-red-200' },
  returned:  { label: '재상신필요', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled: { label: '취소',     className: 'bg-gray-100 text-gray-500 border-gray-200' },
} as const

type StatusKey = keyof typeof STATUS_CONFIG

interface Props {
  status: string
  className?: string
}

export default function ApprovalStatusBadge({ status, className = '' }: Props) {
  const config = STATUS_CONFIG[status as StatusKey] || {
    label: status, className: 'bg-gray-100 text-gray-600 border-gray-200'
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className} ${className}`}>
      {config.label}
    </span>
  )
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  expense_claim:     '지출결의서',
  purchase_request:  '구매요청서',
  leave_request:     '휴가원',
  business_proposal: '업무품의서',
  overtime_log:      '연장근무일지',
  installation_closing: '설치비 마감',
}
