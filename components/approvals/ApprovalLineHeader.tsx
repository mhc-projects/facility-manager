'use client'

import { Check, X } from 'lucide-react'

export interface ApprovalStep {
  step_order: number
  role_label: string
  approver_name?: string | null
  approver_name_live?: string | null
  status: 'pending' | 'approved' | 'rejected' | 'skipped'
  approved_at?: string | null
  comment?: string | null
}

interface ApprovalLineHeaderProps {
  documentTitle: string
  steps?: ApprovalStep[]
  /** 결재 단계가 생성되기 전(draft 상태) 미리보기용 이름 */
  previewNames?: {
    requester?: string
    teamLeader?: string
    executive?: string
    ceo?: string
  }
}

function formatApprovalDate(dateStr?: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function ApprovalLineHeader({
  documentTitle,
  steps,
  previewNames,
}: ApprovalLineHeaderProps) {
  const getCell = (stepOrder: number, label: string, previewName?: string | null) => {
    if (steps && steps.length > 0) {
      const s = steps.find(s => s.step_order === stepOrder)
      return {
        label,
        name: s?.approver_name_live || s?.approver_name || previewName,
        date: s?.approved_at,
        status: s?.status || 'pending',
      }
    }
    return {
      label,
      name: previewName,
      date: undefined,
      status: 'pending' as const,
    }
  }

  const cells = [
    getCell(1, '담당',     previewNames?.requester),
    getCell(2, '팀장',     previewNames?.teamLeader),
    getCell(3, '중역',     previewNames?.executive),
    getCell(4, '대표이사', previewNames?.ceo),
  ]

  return (
    <>
      {/* 데스크탑: 기존 공문서 형식 가로 4칸 */}
      <div className="hidden md:flex w-full border border-black">
        {/* 문서 제목 영역 */}
        <div className="flex items-center justify-center flex-1 px-6 py-4 border-r border-black">
          <h1 className="text-2xl font-bold tracking-widest">{documentTitle}</h1>
        </div>
        {/* 결재 영역 */}
        <div className="flex flex-col" style={{ minWidth: 280 }}>
          <div className="flex">
            <div className="flex items-center justify-center border-r border-black px-2">
              <span className="text-sm font-bold" style={{ writingMode: 'vertical-rl', letterSpacing: '0.3em' }}>결재</span>
            </div>
            <div className="flex flex-1">
              {cells.map((cell, i) => (
                <div key={i} className={`flex-1 flex flex-col ${i > 0 ? 'border-l border-black' : ''}`}>
                  <div className="text-center text-xs font-bold py-1 border-b border-black bg-gray-50 whitespace-nowrap px-1">
                    {cell.label}
                  </div>
                  <div className={`flex items-center justify-center min-h-[52px] border-b border-black text-sm font-medium px-1 ${
                    cell.status === 'approved' ? 'text-blue-700' :
                    cell.status === 'rejected' ? 'text-red-600' :
                    cell.status === 'skipped' ? 'text-gray-300' : 'text-gray-300'
                  }`}>
                    {cell.status === 'rejected' ? (
                      <span className="text-xs text-red-500">반려</span>
                    ) : cell.status === 'skipped' ? (
                      <span className="text-xs text-gray-400">-</span>
                    ) : (
                      <span>{cell.name || ''}</span>
                    )}
                  </div>
                  <div className="text-center text-xs py-1 text-gray-500 min-h-[22px]">
                    {cell.status === 'approved' ? formatApprovalDate(cell.date) : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 모바일: 문서명 + 가로 스텝 바 */}
      <div className="md:hidden">
        <h2 className="text-lg font-bold text-gray-900 mb-3">{documentTitle}</h2>
        <div className="flex items-center">
          {cells.map((cell, i) => (
            <div key={i} className="flex items-center flex-1 min-w-0">
              {/* 스텝 노드 */}
              <div className="flex flex-col items-center flex-1 min-w-0">
                {/* 아이콘 원 */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  cell.status === 'approved'
                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400'
                    : cell.status === 'rejected'
                    ? 'bg-red-100 text-red-600 ring-2 ring-red-400'
                    : cell.status === 'skipped'
                    ? 'bg-gray-50 text-gray-300 ring-1 ring-gray-200'
                    : cell.status === 'pending' && steps && steps.find(s => s.step_order === i + 1)?.status === 'pending'
                    ? 'bg-yellow-50 text-yellow-700 ring-2 ring-yellow-400'
                    : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'
                }`}>
                  {cell.status === 'approved'
                    ? <Check className="w-4 h-4" />
                    : cell.status === 'rejected'
                    ? <X className="w-4 h-4" />
                    : cell.status === 'skipped'
                    ? <span className="text-gray-300">–</span>
                    : <span>{i + 1}</span>
                  }
                </div>
                {/* 역할 */}
                <span className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">{cell.label}</span>
                {/* 이름 */}
                <span className="text-[11px] font-medium text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis max-w-[60px]">
                  {cell.name || '-'}
                </span>
                {/* 승인일 */}
                {cell.status === 'approved' && cell.date && (
                  <span className="text-[9px] text-blue-500 whitespace-nowrap">
                    {formatApprovalDate(cell.date)}
                  </span>
                )}
                {cell.status === 'rejected' && (
                  <span className="text-[9px] text-red-500">반려</span>
                )}
              </div>
              {/* 연결선 */}
              {i < cells.length - 1 && (
                <div className={`h-0.5 w-4 flex-shrink-0 mx-0.5 ${
                  cell.status === 'approved' ? 'bg-blue-300' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
