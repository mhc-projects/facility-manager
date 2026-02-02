'use client'

import { RecurringIssue } from '@/types/meeting-minutes'
import { Clock, Building2, User, Calendar } from 'lucide-react'

interface RecurringIssueCardProps {
  issue: RecurringIssue
  onAddToMeeting: (issue: RecurringIssue) => void
  onMarkComplete: (issue: RecurringIssue) => void
}

/**
 * 경과 일수에 따른 색상 코드 반환
 * - 7일 미만: 녹색 (안전)
 * - 7-30일: 노란색 (주의)
 * - 30일 이상: 빨간색 (위험)
 */
function getDaysElapsedColor(days: number): string {
  if (days < 7) {
    return 'bg-green-100 text-green-800 border-green-300'
  } else if (days < 30) {
    return 'bg-yellow-100 text-yellow-800 border-yellow-300'
  } else {
    return 'bg-red-100 text-red-800 border-red-300'
  }
}

/**
 * 경과 일수 레이블 생성
 */
function getDaysElapsedLabel(days: number): string {
  if (days === 0) return '오늘'
  if (days === 1) return '1일 전'
  if (days < 7) return `${days}일 전`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks}주 전`
  }
  const months = Math.floor(days / 30)
  return `${months}개월 전`
}

export default function RecurringIssueCard({
  issue,
  onAddToMeeting,
  onMarkComplete
}: RecurringIssueCardProps) {
  const colorClass = getDaysElapsedColor(issue.days_elapsed)
  const daysLabel = getDaysElapsedLabel(issue.days_elapsed)

  return (
    <div className="border border-gray-200 rounded-lg p-2 hover:shadow-md transition-shadow bg-white">
      {/* 헤더: 경과 일수 배지 */}
      <div className="flex items-center justify-between mb-2">
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
          <Clock className="w-3 h-3" />
          <span>{daysLabel}</span>
        </div>
        <span className="text-[10px] text-gray-500">
          {issue.original_meeting_date}
        </span>
      </div>

      {/* 원본 회의 정보 */}
      <div className="flex items-start gap-1.5 mb-2">
        <Calendar className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-[10px] text-gray-600">출처:</p>
          <p className="text-xs font-medium text-gray-900">{issue.original_meeting_title}</p>
        </div>
      </div>

      {/* 사업장 정보 */}
      <div className="flex items-start gap-1.5 mb-2">
        <Building2 className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-[10px] text-gray-600">사업장:</p>
          <p className="text-xs font-medium text-gray-900">{issue.business_name}</p>
        </div>
      </div>

      {/* 담당자 정보 */}
      <div className="flex items-start gap-1.5 mb-2">
        <User className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-[10px] text-gray-600">담당자:</p>
          <p className="text-xs font-medium text-gray-900">{issue.assignee_name}</p>
        </div>
      </div>

      {/* 이슈 내용 */}
      <div className="mb-2">
        <p className="text-[10px] text-gray-600 mb-0.5">이슈 내용:</p>
        <p className="text-xs text-gray-900 leading-snug bg-gray-50 p-2 rounded border border-gray-200">
          {issue.issue_description}
        </p>
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-1.5">
        <button
          onClick={() => onAddToMeeting(issue)}
          className="flex-1 px-2 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
        >
          이슈 가져오기
        </button>
        <button
          onClick={() => onMarkComplete(issue)}
          className="flex-1 px-2 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition-colors"
        >
          해결 완료
        </button>
      </div>
    </div>
  )
}
