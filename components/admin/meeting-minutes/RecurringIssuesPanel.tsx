'use client'

import { useState, useEffect } from 'react'
import { RecurringIssue, BusinessIssue, AgendaItem } from '@/types/meeting-minutes'
import RecurringIssueCard from './RecurringIssueCard'
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp, Calendar } from 'lucide-react'

interface GroupedIssues {
  meeting_id: string
  meeting_title: string
  meeting_date: string
  days_elapsed: number
  issues: RecurringIssue[]
}

interface RecurringIssuesPanelProps {
  onAddIssue: (issue: BusinessIssue) => void
  onAddAgendaItem?: (item: AgendaItem) => void
  addedIssueIds?: string[]
  addedAgendaIds?: string[]
  className?: string
}

function getDaysElapsedLabel(days: number): string {
  if (days === 0) return '오늘'
  if (days === 1) return '1일 전'
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  return `${Math.floor(days / 30)}개월 전`
}

export default function RecurringIssuesPanel({
  onAddIssue,
  onAddAgendaItem,
  addedIssueIds = [],
  addedAgendaIds = [],
  className = ''
}: RecurringIssuesPanelProps) {
  const [groups, setGroups] = useState<GroupedIssues[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPanelExpanded, setIsPanelExpanded] = useState(true)
  // 각 그룹의 접기/펼치기 상태: meeting_id → boolean (true = 펼침)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  // 추가된 이슈를 필터링한 그룹 목록
  const filteredGroups = groups
    .map(group => ({
      ...group,
      issues: group.issues.filter(issue => {
        if (issue.issue_type === 'agenda_item') return !addedAgendaIds.includes(issue.id)
        return !addedIssueIds.includes(issue.id)
      })
    }))
    .filter(group => group.issues.length > 0)

  const totalCount = filteredGroups.reduce((sum, g) => sum + g.issues.length, 0)

  const fetchRecurringIssues = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/meeting-minutes/recurring-issues?limit=100')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '이슈 조회에 실패했습니다.')
      }

      if (data.success) {
        const fetchedGroups: GroupedIssues[] = data.data.grouped_issues || []
        setGroups(fetchedGroups)

        // 마지막(가장 최근) 그룹만 펼쳐두기
        const lastIdx = fetchedGroups.length - 1
        const initialExpanded: Record<string, boolean> = {}
        fetchedGroups.forEach((g, idx) => {
          initialExpanded[g.meeting_id] = idx === lastIdx
        })
        setExpandedGroups(initialExpanded)
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

  useEffect(() => {
    fetchRecurringIssues()
  }, [])

  const toggleGroup = (meetingId: string) => {
    setExpandedGroups(prev => ({ ...prev, [meetingId]: !prev[meetingId] }))
  }

  const handleAddAllToMeeting = (issues: RecurringIssue[]) => {
    let agendaCount = 0
    let issueCount = 0
    issues.forEach(issue => {
      if (issue.issue_type === 'agenda_item' && onAddAgendaItem) {
        const agendaItem: AgendaItem = {
          id: issue.id,
          title: issue.issue_description.split(' — ')[0],
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
        agendaCount++
      } else {
        const businessIssue: BusinessIssue = {
          id: crypto.randomUUID(),
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
        issueCount++
      }
    })
    const parts: string[] = []
    if (issueCount > 0) parts.push(`사업장 이슈 ${issueCount}건`)
    if (agendaCount > 0) parts.push(`안건 ${agendaCount}건`)
    if (parts.length > 0) alert(`${parts.join(', ')}이 추가되었습니다.`)
  }

  const handleAddToMeeting = (issue: RecurringIssue) => {
    if (issue.issue_type === 'agenda_item' && onAddAgendaItem) {
      const agendaItem: AgendaItem = {
        id: issue.id,
        title: issue.issue_description.split(' — ')[0],
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
      const businessIssue: BusinessIssue = {
        id: crypto.randomUUID(),
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
        await fetchRecurringIssues()
      } else {
        throw new Error(data.error || '완료 처리에 실패했습니다.')
      }
    } catch (err: any) {
      console.error('Failed to mark issue as complete:', err)
      alert(err.message || '서버 오류가 발생했습니다.')
    }
  }

  if (!loading && filteredGroups.length === 0) {
    return null
  }

  return (
    <div className={`border border-blue-200 rounded-lg bg-blue-50 ${className}`}>
      {/* 패널 헤더 */}
      <div
        className="flex items-center justify-between p-2 bg-blue-100 cursor-pointer hover:bg-blue-200 transition-colors rounded-t-lg"
        onClick={() => setIsPanelExpanded(!isPanelExpanded)}
      >
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-blue-900">미해결 반복 이슈</h3>
          {totalCount > 0 && (
            <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-medium rounded-full">
              {totalCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isPanelExpanded && (
            <button
              onClick={(e) => { e.stopPropagation(); fetchRecurringIssues() }}
              disabled={loading}
              className="p-1 text-blue-600 hover:bg-blue-300 rounded transition-colors disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setIsPanelExpanded(!isPanelExpanded) }}
            className="p-1 text-blue-600 hover:bg-blue-300 rounded transition-colors"
            title={isPanelExpanded ? '접기' : '펼치기'}
          >
            {isPanelExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* 패널 내용 */}
      {isPanelExpanded && (
        <div className="p-2 space-y-2">
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
          ) : (
            <>
              {/* 안내 메시지 */}
              <div className="p-2 bg-blue-100 border border-blue-300 rounded">
                <p className="text-xs text-blue-900 leading-snug">
                  💡 <strong>이전 정기회의에서 미해결된 사업장 이슈 및 100% 미달 안건</strong>입니다.
                  <br />
                  "이슈 가져오기"를 클릭하면 현재 회의록의 사업장별 이슈 섹션에 추가됩니다.
                </p>
              </div>

              {/* 회의록별 그룹 */}
              {filteredGroups.map((group) => {
                const isGroupExpanded = expandedGroups[group.meeting_id] ?? false
                return (
                  <div key={group.meeting_id} className="border border-blue-200 rounded-lg overflow-hidden">
                    {/* 그룹 헤더 */}
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 bg-white hover:bg-blue-50 transition-colors text-left"
                      onClick={() => toggleGroup(group.meeting_id)}
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <span className="text-xs font-semibold text-gray-800">{group.meeting_title}</span>
                        <span className="text-[10px] text-gray-500">
                          • {getDaysElapsedLabel(group.days_elapsed)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded-full">
                          {group.issues.length}건
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddAllToMeeting(group.issues) }}
                          className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-medium rounded hover:bg-blue-700 transition-colors"
                        >
                          전체 가져오기
                        </button>
                        {isGroupExpanded
                          ? <ChevronUp className="w-3 h-3 text-gray-400" />
                          : <ChevronDown className="w-3 h-3 text-gray-400" />
                        }
                      </div>
                    </button>

                    {/* 그룹 이슈 목록 */}
                    {isGroupExpanded && (
                      <div className="p-2 bg-gray-50 grid gap-2 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                        {group.issues.map((issue) => (
                          <RecurringIssueCard
                            key={issue.id}
                            issue={issue}
                            onAddToMeeting={handleAddToMeeting}
                            onMarkComplete={handleMarkComplete}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
