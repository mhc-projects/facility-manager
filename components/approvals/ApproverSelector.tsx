'use client'

import { useState, useEffect } from 'react'
import { TokenManager } from '@/lib/api-client'
import { ChevronDown } from 'lucide-react'

interface Approver {
  id: string
  name: string
  department?: string
  position?: string
  role: string
}

interface ApproverData {
  teamLeaders: Approver[]
  executives: Approver[]
  ceoList: Approver[]
}

interface ApproverSelectorProps {
  teamLeaderId: string
  executiveId: string
  ceoId: string
  onTeamLeaderChange: (id: string) => void
  onExecutiveChange: (id: string) => void
  onCeoChange: (id: string) => void
  disabled?: boolean
}

export default function ApproverSelector({
  teamLeaderId,
  executiveId,
  ceoId,
  onTeamLeaderChange,
  onExecutiveChange,
  onCeoChange,
  disabled = false,
}: ApproverSelectorProps) {
  const [approvers, setApprovers] = useState<ApproverData>({
    teamLeaders: [],
    executives: [],
    ceoList: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = TokenManager.getToken()
    if (!token) return

    fetch('/api/approvals/approvers', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) setApprovers(res.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // 대표이사가 1명이면 자동 선택
  useEffect(() => {
    if (approvers.ceoList.length === 1 && !ceoId) {
      onCeoChange(approvers.ceoList[0].id)
    }
  }, [approvers.ceoList, ceoId, onCeoChange])

  const selectClass = `w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm
    focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed
    appearance-none`

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {['팀장', '중역', '대표이사'].map(label => (
          <div key={label}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
            <div className="w-full h-10 bg-gray-100 animate-pulse rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* 팀장 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          팀장 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <select
            value={teamLeaderId}
            onChange={e => onTeamLeaderChange(e.target.value)}
            disabled={disabled}
            className={selectClass}
          >
            <option value="">팀장 선택</option>
            {approvers.teamLeaders.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}{a.position ? ` (${a.position})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        {approvers.teamLeaders.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">팀장 권한 계정이 없습니다</p>
        )}
      </div>

      {/* 중역 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          중역 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <select
            value={executiveId}
            onChange={e => onExecutiveChange(e.target.value)}
            disabled={disabled}
            className={selectClass}
          >
            <option value="">중역 선택</option>
            {approvers.executives.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}{a.position ? ` (${a.position})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        {approvers.executives.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">중역 권한 계정이 없습니다</p>
        )}
      </div>

      {/* 대표이사 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          대표이사 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <select
            value={ceoId}
            onChange={e => onCeoChange(e.target.value)}
            disabled={disabled}
            className={selectClass}
          >
            <option value="">대표이사 선택</option>
            {approvers.ceoList.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}{a.position ? ` (${a.position})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        {approvers.ceoList.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">대표이사 권한 계정이 없습니다</p>
        )}
      </div>
    </div>
  )
}
