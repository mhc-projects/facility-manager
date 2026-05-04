// ============================================
// 회의록 상세 보기 페이지
// ============================================
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import {
  ArrowLeft,
  Edit,
  Trash2,
  Download,
  Share2,
  Calendar,
  MapPin,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Monitor,
  MessageSquare
} from 'lucide-react'
import { MeetingMinute, ActionItem } from '@/types/meeting-minutes'
import PresentationMode from '@/components/meeting-minutes/PresentationMode'
import { sanitizeLegacyEscapedHtml } from '@/lib/rich-text'

export default function MeetingMinuteDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const updated = searchParams.get('updated')  // 타임스탬프 파라미터 감지

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [minute, setMinute] = useState<MeetingMinute | null>(null)
  const [departments, setDepartments] = useState<string[]>([]) // 부서 목록
  const [presentationMode, setPresentationMode] = useState(false)

  useEffect(() => {
    setMounted(true)
    // 부서 목록 로드
    fetch('/api/meeting-departments', { cache: 'no-store' })
      .then(r => r.json())
      .then(result => { if (result.success) setDepartments(result.data) })
      .catch(() => {})
    loadMeetingMinute()
  }, [updated])  // updated 파라미터 변경 시 재실행

  // 브라우저 뒤로가기/앞으로가기로 상세 페이지에 복귀했을 때 최신 데이터 재로드
  // (Next.js Router Cache 때문에 URL이 동일하면 useEffect가 재발동되지 않을 수 있음)
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) loadMeetingMinute()
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  const loadMeetingMinute = async () => {
    try {
      setLoading(true)

      // 캐시 우회를 위한 타임스탬프 추가
      const timestamp = Date.now()
      const response = await fetch(`/api/meeting-minutes/${params.id}?_t=${timestamp}`, {
        cache: 'no-store'  // 캐시 비활성화로 항상 최신 데이터 표시
      })
      const result = await response.json()

      if (result.success) {
        setMinute(result.data)
      } else {
        console.error('[MEETING-MINUTE] Load failed:', result.error)
        alert('회의록을 불러오는데 실패했습니다.')
        router.push('/admin/meeting-minutes')
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Load error:', error)
      alert('회의록을 불러오는데 실패했습니다.')
      router.push('/admin/meeting-minutes')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    const timestamp = Date.now()
    router.push(`/admin/meeting-minutes/${params.id}/edit?refresh=${timestamp}`)
  }

  const handleDelete = async () => {
    if (!confirm('정말로 이 회의록을 삭제하시겠습니까?')) {
      return
    }

    try {
      const response = await fetch(`/api/meeting-minutes/${params.id}`, {
        method: 'DELETE'
      })
      const result = await response.json()

      if (result.success) {
        alert('회의록이 삭제되었습니다.')
        // 삭제 후 목록 페이지로 이동하면서 새로고침
        window.location.href = '/admin/meeting-minutes'
      } else {
        alert('회의록 삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Delete error:', error)
      alert('회의록 삭제에 실패했습니다.')
    }
  }

  const handleBack = () => {
    const timestamp = Date.now()
    router.push(`/admin/meeting-minutes?refresh=${timestamp}`)
  }

  const handleIssueToggle = (issueId: string, newValue: boolean) => {
    if (!minute) return
    setMinute({
      ...minute,
      content: {
        ...minute.content,
        business_issues: minute.content.business_issues?.map(issue =>
          issue.id === issueId
            ? { ...issue, is_completed: newValue, completed_at: newValue ? new Date().toISOString() : undefined }
            : issue
        )
      }
    })
  }

  if (!mounted || loading) {
    return (
      <AdminLayout title="회의록 상세">
        <div className="h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">회의록을 불러오는 중...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (!minute) {
    return (
      <AdminLayout title="회의록 상세">
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">회의록을 찾을 수 없습니다</h3>
          <button
            onClick={handleBack}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            목록으로 돌아가기
          </button>
        </div>
      </AdminLayout>
    )
  }

  const statusColors = {
    draft: 'bg-amber-100 text-amber-800',
    completed: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-800'
  }

  const statusLabels = {
    draft: '작성중',
    completed: '완료',
    archived: '보관'
  }

  return (
    <>
    {presentationMode && (
      <PresentationMode
        minute={minute}
        onClose={() => setPresentationMode(false)}
        departments={departments}
      />
    )}
    <AdminLayout
      title={minute.title}
      actions={
        <div className="flex gap-2">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">목록</span>
          </button>
          <button
            onClick={() => setPresentationMode(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Monitor className="w-4 h-4" />
            <span className="hidden sm:inline">프레젠테이션</span>
          </button>
          <button
            onClick={handleEdit}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Edit className="w-4 h-4" />
            <span className="hidden sm:inline">편집</span>
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">삭제</span>
          </button>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* 상태 배지 및 메타정보 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${statusColors[minute.status]}`}>
              {statusLabels[minute.status]}
            </span>
            <span className="text-sm text-gray-600">{minute.meeting_type}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 text-gray-700">
              <Calendar className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-sm text-gray-500">일시</div>
                <div className="font-medium">
                  {new Date(minute.meeting_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-gray-700">
              <MapPin className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-sm text-gray-500">장소</div>
                <div className="font-medium">{minute.location}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 참석자 */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-1.5 mb-3">
            <Users className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">참석자</h2>
            <span className="text-xs text-gray-500">({minute.participants.length}명)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {minute.participants.map((participant, index) => (
              <div
                key={index}
                className={`flex items-center gap-2 p-2 rounded-lg border ${
                  participant.attended
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                  {participant.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate">{participant.name}</div>
                  <div className="text-[10px] text-gray-500">{participant.role}</div>
                </div>
                {participant.attended && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 안건 */}
        {minute.agenda.length > 0 && (() => {
          // 부서별 그룹화: 편집 페이지와 동일한 순서 적용
          const grouped: Record<string, typeof minute.agenda> = {}
          minute.agenda.forEach(item => {
            const key = (item as any).department || ''
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(item)
          })
          const hasDepts = Object.keys(grouped).some(k => k !== '')

          // 편집 페이지와 동일한 순서: departments 배열 순서를 따름
          const sections = departments.length > 0
            ? [...departments, undefined] // undefined = 공통(부서 미지정), 마지막에 위치
            : [undefined]

          // grouped에 실제로 존재하는 부서만 필터링
          const sortedKeys = sections
            .map(dept => dept || '')
            .filter(key => grouped[key] && grouped[key].length > 0)

          let globalIndex = 0
          return (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">안건</h2>
              <div className="space-y-4">
                {sortedKeys.filter(key => grouped[key]).map(deptKey => (
                  <div key={deptKey || '__no_dept__'}>
                    {/* 부서가 하나라도 있을 때만 부서 헤더 표시 */}
                    {hasDepts && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          deptKey
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {deptKey || '부서 미지정'}
                        </span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                    )}
                    <div className="space-y-3">
                      {grouped[deptKey].map((item, sectionIndex) => {
                        const displayIndex = ++globalIndex
                        return (
                          <div key={item.id} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">
                              {sectionIndex + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                              {(() => {
                                if (!item.description) return null
                                // 레거시 버그: Tiptap 에디터에 HTML 텍스트를 plain-text paste 한 경우
                                // `<p>&lt;p&gt;...&lt;/p&gt;</p>` 형태로 저장된 데이터가 있음. 디코딩해 정상 HTML로 복원.
                                const desc = sanitizeLegacyEscapedHtml(item.description)
                                return /<[a-z][\s\S]*>/i.test(desc) ? (
                                  <div className="overflow-x-auto">
                                    <div
                                      className="tiptap-readonly text-sm text-gray-600 mb-2"
                                      dangerouslySetInnerHTML={{ __html: desc }}
                                    />
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-600 mb-2 whitespace-pre-wrap">{desc}</p>
                                )
                              })()}
                              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                                {/* 다중 담당자 우선, 없으면 단일 담당자 폴백 */}
                                {(item.assignees && item.assignees.length > 0) ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-gray-500">담당자:</span>
                                    {item.assignees.map((assignee: { id: string; name: string }) => (
                                      <span key={assignee.id} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                        {assignee.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : item.assignee_name ? (
                                  <span>담당자: {item.assignee_name}</span>
                                ) : null}
                                {item.deadline && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    <span>마감: {new Date(item.deadline).toLocaleDateString('ko-KR')}</span>
                                  </div>
                                )}
                              </div>
                              {item.progress !== undefined && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                    <span>진행률</span>
                                    <span className={`font-medium ${
                                      item.progress === 0 ? 'text-gray-500' :
                                      item.progress <= 25 ? 'text-blue-600' :
                                      item.progress <= 50 ? 'text-yellow-600' :
                                      item.progress <= 75 ? 'text-orange-600' :
                                      'text-green-600'
                                    }`}>
                                      {item.progress}%
                                      {item.progress === 0 && ' 미착수'}
                                      {item.progress === 25 && ' 시작'}
                                      {item.progress === 50 && ' 진행중'}
                                      {item.progress === 75 && ' 마무리'}
                                      {item.progress === 100 && ' 완료'}
                                    </span>
                                  </div>
                                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        item.progress === 0 ? 'bg-gray-400' :
                                        item.progress <= 25 ? 'bg-blue-500' :
                                        item.progress <= 50 ? 'bg-yellow-500' :
                                        item.progress <= 75 ? 'bg-orange-500' :
                                        'bg-green-500'
                                      }`}
                                      style={{ width: `${item.progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              {/* 안건 코멘트 */}
                              {item.comment && (
                                <div className="mt-3 flex gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                  <MessageSquare className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                                  <p className="text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">{item.comment}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* 회의 요약 */}
        {minute.content.summary && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">회의 요약</h2>
            <div className="prose max-w-none text-gray-700 whitespace-pre-wrap">
              {minute.content.summary}
            </div>
          </div>
        )}

        {/* 논의사항 */}
        {minute.content.discussions && minute.content.discussions.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">논의사항</h2>
            <div className="space-y-6">
              {minute.content.discussions.map((discussion, index) => (
                <div key={index} className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">📌 {discussion.topic}</h3>
                  <p className="text-gray-700 mb-3 whitespace-pre-wrap">{discussion.notes}</p>
                  {discussion.decisions.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-sm font-medium text-blue-900 mb-2">결정사항</div>
                      <ul className="space-y-1">
                        {discussion.decisions.map((decision, idx) => (
                          <li key={idx} className="text-sm text-blue-800 flex items-start gap-2">
                            <span className="text-blue-600 mt-1">•</span>
                            <span>{decision}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 액션 아이템 */}
        {minute.content.action_items && minute.content.action_items.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">액션 아이템</h2>
            <div className="space-y-3">
              {minute.content.action_items.map((item) => (
                <ActionItemCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* 사업장별 이슈 */}
        {minute.content.business_issues && minute.content.business_issues.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">사업장별 이슈</h2>
            <div className="space-y-3">
              {minute.content.business_issues.map((issue) => (
                <BusinessIssueCard
                  key={issue.id}
                  issue={issue}
                  meetingId={params.id}
                  onToggle={handleIssueToggle}
                />
              ))}
            </div>
          </div>
        )}

        {/* 첨부파일 */}
        {minute.attachments && minute.attachments.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">첨부파일</h2>
            <div className="space-y-2">
              {minute.attachments.map((file) => (
                <a
                  key={file.id}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Download className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">{file.name}</div>
                      <div className="text-sm text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  <Download className="w-5 h-5 text-blue-600" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 메타 정보 */}
        <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
          <div className="flex justify-between">
            <span>작성일: {new Date(minute.created_at).toLocaleString('ko-KR')}</span>
            <span>수정일: {new Date(minute.updated_at).toLocaleString('ko-KR')}</span>
          </div>
        </div>
      </div>
    </AdminLayout>
    </>
  )
}

// ============================================
// 액션 아이템 카드 컴포넌트
// ============================================
interface ActionItemCardProps {
  item: ActionItem
}

function ActionItemCard({ item }: ActionItemCardProps) {
  const statusColors = {
    pending: 'bg-gray-100 text-gray-800 border-gray-300',
    in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
    completed: 'bg-green-100 text-green-800 border-green-300'
  }

  const statusLabels = {
    pending: '대기중',
    in_progress: '진행중',
    completed: '완료'
  }

  const priorityColors = {
    low: 'text-gray-500',
    medium: 'text-yellow-500',
    high: 'text-red-500'
  }

  return (
    <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      <input
        type="checkbox"
        checked={item.status === 'completed'}
        readOnly
        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
      />
      <div className="flex-1">
        <div className="font-medium text-gray-900 mb-1">{item.task}</div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>담당자: {item.assignee_name || item.assignee_id}</span>
          <span>마감: {new Date(item.due_date).toLocaleDateString('ko-KR')}</span>
          {item.priority && (
            <span className={`font-medium ${priorityColors[item.priority]}`}>
              {item.priority === 'high' ? '높음' : item.priority === 'medium' ? '보통' : '낮음'}
            </span>
          )}
        </div>
      </div>
      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[item.status]}`}>
        {statusLabels[item.status]}
      </span>
    </div>
  )
}

// ============================================
// 사업장별 이슈 카드 컴포넌트
// ============================================
interface BusinessIssueCardProps {
  issue: {
    id: string
    business_id: string
    business_name: string
    issue_description: string
    assignee_id?: string
    assignee_name?: string
    assignee_ids?: string[]
    assignees?: { id: string; name: string }[]
    is_completed: boolean
    completed_at?: string
  }
  meetingId: string
  onToggle: (issueId: string, newValue: boolean) => void
}

function BusinessIssueCard({ issue, meetingId, onToggle }: BusinessIssueCardProps) {
  const [loading, setLoading] = useState(false)
  const hasMultipleAssignees = issue.assignees && issue.assignees.length > 0
  const hasSingleAssignee = !hasMultipleAssignees && issue.assignee_name

  const handleToggle = async () => {
    if (loading) return
    setLoading(true)
    const newValue = !issue.is_completed
    try {
      const response = await fetch(`/api/meeting-minutes/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'toggle_business_issue',
          issue_id: issue.id,
          is_completed: newValue
        })
      })
      const result = await response.json()
      if (result.success) {
        // 완료로 표시하는 경우 모든 정기회의에서 동일 이슈 일괄 완료 처리
        if (newValue) {
          await fetch('/api/meeting-minutes/business-issues/complete', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              issue_id: issue.id,
              business_id: issue.business_id,
              issue_content: issue.issue_description
            })
          })
        }
        onToggle(issue.id, newValue)
      } else {
        alert('상태 변경에 실패했습니다.')
      }
    } catch {
      alert('상태 변경에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`flex items-start gap-4 p-4 border rounded-lg transition-colors cursor-pointer ${
        issue.is_completed
          ? 'border-green-200 bg-green-50 hover:bg-green-100'
          : 'border-gray-200 hover:bg-gray-50'
      }`}
      onClick={handleToggle}
    >
      <input
        type="checkbox"
        checked={issue.is_completed}
        onChange={() => {}}
        disabled={loading}
        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mt-0.5 cursor-pointer"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            {issue.business_name}
          </span>
          {issue.is_completed && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">완료</span>
          )}
        </div>
        <div className={`font-medium mb-2 whitespace-pre-wrap ${issue.is_completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {issue.issue_description}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          {/* 다중 담당자 우선, 없으면 단일 담당자 폴백 */}
          {hasMultipleAssignees ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-gray-500">담당자:</span>
              {issue.assignees!.map((assignee) => (
                <span key={assignee.id} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                  {assignee.name}
                </span>
              ))}
            </div>
          ) : hasSingleAssignee ? (
            <span>담당자: {issue.assignee_name}</span>
          ) : null}
          {issue.is_completed && issue.completed_at && (
            <span className="text-green-600">
              완료: {new Date(issue.completed_at).toLocaleDateString('ko-KR')}
            </span>
          )}
        </div>
      </div>
      {issue.is_completed && (
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
      )}
    </div>
  )
}
