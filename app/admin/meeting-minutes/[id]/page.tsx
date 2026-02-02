// ============================================
// 회의록 상세 보기 페이지
// ============================================
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  AlertCircle
} from 'lucide-react'
import { MeetingMinute, ActionItem } from '@/types/meeting-minutes'

export default function MeetingMinuteDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [minute, setMinute] = useState<MeetingMinute | null>(null)

  useEffect(() => {
    setMounted(true)
    loadMeetingMinute()
  }, [])

  const loadMeetingMinute = async () => {
    try {
      setLoading(true)

      const response = await fetch(`/api/meeting-minutes/${params.id}`)
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
    router.push(`/admin/meeting-minutes/${params.id}/edit`)
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
    router.push('/admin/meeting-minutes')
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
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">참석자</h2>
            <span className="text-sm text-gray-500">({minute.participants.length}명)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {minute.participants.map((participant, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  participant.attended
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                  {participant.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{participant.name}</div>
                  <div className="text-sm text-gray-500">{participant.role}</div>
                </div>
                {participant.attended && (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 안건 */}
        {minute.agenda.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">안건</h2>
            <div className="space-y-3">
              {minute.agenda.map((item, index) => (
                <div key={item.id} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                    <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                      {item.assignee_name && (
                        <span>담당자: {item.assignee_name}</span>
                      )}
                      {item.deadline && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>마감: {new Date(item.deadline).toLocaleDateString('ko-KR')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 회의 요약 */}
        {minute.content.summary && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">회의 요약</h2>
            <div className="prose max-w-none text-gray-700">
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
                <BusinessIssueCard key={issue.id} issue={issue} />
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
    assignee_id: string
    assignee_name: string
    is_completed: boolean
    completed_at?: string
  }
}

function BusinessIssueCard({ issue }: BusinessIssueCardProps) {
  return (
    <div className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      <input
        type="checkbox"
        checked={issue.is_completed}
        readOnly
        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            {issue.business_name}
          </span>
        </div>
        <div className="font-medium text-gray-900 mb-2">{issue.issue_description}</div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>담당자: {issue.assignee_name}</span>
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
