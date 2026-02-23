'use client'

import { useState, useEffect } from 'react'
import { RecurringIssue, BusinessIssue, AgendaItem } from '@/types/meeting-minutes'
import RecurringIssueCard from './RecurringIssueCard'
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

interface RecurringIssuesPanelProps {
  onAddIssue: (issue: BusinessIssue) => void // 사업장 이슈를 추가하는 콜백
  onAddAgendaItem?: (item: AgendaItem) => void // 미완료 안건을 안건 섹션에 추가하는 콜백
  addedIssueIds?: string[] // 이미 추가된 이슈 ID 목록 (businessIssues)
  addedAgendaIds?: string[] // 이미 추가된 안건 ID 목록 (agenda)
  className?: string
}

export default function RecurringIssuesPanel({
  onAddIssue,
  onAddAgendaItem,
  addedIssueIds = [],
  addedAgendaIds = [],
  className = ''
}: RecurringIssuesPanelProps) {
  const [issues, setIssues] = useState<RecurringIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)

  // 이미 추가된 이슈/안건을 필터링
  const filteredIssues = issues.filter(issue => {
    if (issue.issue_type === 'agenda_item') return !addedAgendaIds.includes(issue.id)
    return !addedIssueIds.includes(issue.id)
  })

  // 미해결 이슈 조회
  const fetchRecurringIssues = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/meeting-minutes/recurring-issues?limit=20')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '이슈 조회에 실패했습니다.')
      }

      if (data.success) {
        setIssues(data.data.recurring_issues || [])
      } else {
        throw new Error(data.error || '이슈 조회에 실패했습니다.')
      }
    } catch (err: any) {
      console.error('Failed to fetch recurring issues:', err)
      setError(err.message || '서버 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 초기 로딩
  useEffect(() => {
    fetchRecurringIssues()
  }, [])

  // 이슈 가져오기 핸들러
  const handleAddToMeeting = (issue: RecurringIssue) => {
    if (issue.issue_type === 'agenda_item' && onAddAgendaItem) {
      // 안건 타입: AgendaItem으로 변환하여 안건 섹션에 추가
      const agendaItem: AgendaItem = {
        id: issue.id, // 원본 ID 유지 (필터링에 사용)
        title: issue.issue_description.split(' — ')[0], // "제목 — 설명" 형태에서 제목만 추출
        description: issue.issue_description.includes(' — ')
          ? issue.issue_description.split(' — ').slice(1).join(' — ')
          : '',
        department: issue.business_name === '안건' ? undefined : issue.business_name,
        deadline: '',
        progress: (issue.original_progress ?? 0) as 0 | 25 | 50 | 75 | 100,
        assignee_id: issue.assignee_id,
        assignee_name: issue.assignee_name,
        assignee_ids: issue.assignee_ids || [],
        assignees: issue.assignees || []
      }
      onAddAgendaItem(agendaItem)
      alert(`"${issue.issue_description.split(' — ')[0]}" 안건이 안건 섹션에 추가되었습니다.`)
    } else {
      // 사업장 이슈 타입: BusinessIssue로 변환하여 사업장별 이슈에 추가
      const businessIssue: BusinessIssue = {
        id: crypto.randomUUID(), // 새 ID 생성 (원본과 충돌 방지)
        business_id: issue.business_id,
        business_name: issue.business_name,
        issue_description: issue.issue_description,
        assignee_id: issue.assignee_id,
        assignee_name: issue.assignee_name,
        assignee_ids: issue.assignee_ids,
        assignees: issue.assignees,
        is_completed: false,
        completed_at: undefined
      }
      onAddIssue(businessIssue)
      alert(`"${issue.business_name}" 이슈가 사업장별 이슈 섹션에 추가되었습니다.`)
    }
  }

  // 이슈 완료 처리 핸들러
  const handleMarkComplete = async (issue: RecurringIssue) => {
    const confirmed = confirm(
      `"${issue.business_name}" 이슈를 완료 처리하시겠습니까?\n\n` +
      `모든 회의록에서 동일한 이슈가 완료로 표시됩니다.`
    )

    if (!confirmed) return

    try {
      const response = await fetch('/api/meeting-minutes/business-issues/complete', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_id: issue.id,
          business_id: issue.business_id,
          issue_content: issue.issue_description
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '완료 처리에 실패했습니다.')
      }

      if (data.success) {
        alert(`${data.data.updated_count}개의 회의록에서 이슈가 완료 처리되었습니다.`)
        // 목록 새로고침
        await fetchRecurringIssues()
      } else {
        throw new Error(data.error || '완료 처리에 실패했습니다.')
      }
    } catch (err: any) {
      console.error('Failed to mark issue as complete:', err)
      alert(err.message || '서버 오류가 발생했습니다.')
    }
  }

  // 이슈가 없으면 렌더링하지 않음 (접기/펼치기 상태와 무관)
  if (filteredIssues.length === 0) {
    return null
  }

  return (
    <div className={`border border-blue-200 rounded-lg bg-blue-50 ${className}`}>
      {/* 헤더 - 항상 표시 */}
      <div
        className="flex items-center justify-between p-2 bg-blue-100 cursor-pointer hover:bg-blue-200 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-blue-900">
            미해결 반복 이슈
          </h3>
          {filteredIssues.length > 0 && (
            <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-medium rounded-full">
              {filteredIssues.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation() // 헤더 클릭 이벤트 전파 방지
                fetchRecurringIssues()
              }}
              disabled={loading}
              className="p-1 text-blue-600 hover:bg-blue-300 rounded transition-colors disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation() // 헤더 클릭 이벤트 전파 방지
              setIsExpanded(!isExpanded)
            }}
            className="p-1 text-blue-600 hover:bg-blue-300 rounded transition-colors"
            title={isExpanded ? '접기' : '펼치기'}
          >
            {isExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* 내용 */}
      {isExpanded && (
        <div className="p-2">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="ml-1.5 text-xs text-blue-700">로딩 중...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-4 text-red-600">
              <AlertCircle className="w-4 h-4 mr-1.5" />
              <span className="text-xs">{error}</span>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <p className="text-xs">미해결 반복 이슈가 없습니다.</p>
              <p className="text-[10px] mt-0.5">모든 이슈가 해결되었습니다! 🎉</p>
            </div>
          ) : (
            <>
              {/* 안내 메시지 */}
              <div className="mb-2 p-2 bg-blue-100 border border-blue-300 rounded">
                <p className="text-xs text-blue-900 leading-snug">
                  💡 <strong>이전 정기회의에서 미해결된 사업장 이슈 및 100% 미달 안건</strong>입니다.
                  <br />
                  "이슈 가져오기"를 클릭하면 현재 회의록의 사업장별 이슈 섹션에 추가됩니다. 사업장 이슈는 "해결 완료"로 일괄 처리할 수 있습니다.
                </p>
              </div>

              {/* 이슈 카드 그리드 */}
              <div className="grid gap-2 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredIssues.map((issue) => (
                  <RecurringIssueCard
                    key={issue.id}
                    issue={issue}
                    onAddToMeeting={handleAddToMeeting}
                    onMarkComplete={handleMarkComplete}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
