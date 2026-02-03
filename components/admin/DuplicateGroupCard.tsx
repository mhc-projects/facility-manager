import { Check } from 'lucide-react'
import { TaskType, TaskStatus, getStatusLabel } from '@/lib/task-steps'

interface DuplicateTask {
  id: string
  title: string
  created_at: string
  assignee?: string
  due_date?: string
  keep: boolean
}

interface DuplicateGroup {
  key: string
  business_name: string
  task_type: TaskType
  status: TaskStatus
  count: number
  tasks: DuplicateTask[]
}

interface DuplicateGroupCardProps {
  index: number
  group: DuplicateGroup
  selectedIds: string[]
  onToggle: (taskId: string) => void
}

function getTaskTypeLabel(type: TaskType): string {
  const labels: Record<TaskType, string> = {
    self: '자비',
    subsidy: '보조금',
    as: 'AS',
    dealer: '대리점',
    outsourcing: '외주설치',
    etc: '기타'
  }
  return labels[type] || type
}

export default function DuplicateGroupCard({
  index,
  group,
  selectedIds,
  onToggle
}: DuplicateGroupCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {/* 그룹 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900">
            [{index + 1}] {group.business_name}
          </span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
            {getTaskTypeLabel(group.task_type)}
          </span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
            {getStatusLabel(group.task_type, group.status)}
          </span>
        </div>
        <span className="text-xs text-gray-600 whitespace-nowrap">
          중복: {group.count}개
        </span>
      </div>

      {/* 업무 목록 */}
      <div className="space-y-2">
        {group.tasks.map((task, taskIndex) => (
          <div
            key={task.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              task.keep
                ? 'bg-green-50 border-green-300'
                : selectedIds.includes(task.id)
                ? 'bg-orange-50 border-orange-300'
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            {/* 체크박스 (보존 대상은 비활성화) */}
            <div className="flex-shrink-0 mt-0.5">
              {task.keep ? (
                <div className="w-4 h-4 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
              ) : (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(task.id)}
                  onChange={() => onToggle(task.id)}
                  className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                />
              )}
            </div>

            {/* 업무 정보 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-medium text-gray-900">
                  {taskIndex + 1}. {task.title || '(제목 없음)'}
                </span>
                {task.keep && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium whitespace-nowrap">
                    ✅ 보존
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                <span>생성: {new Date(task.created_at).toLocaleString('ko-KR')}</span>
                {task.assignee && <span>담당: {task.assignee}</span>}
                {task.due_date && <span>마감: {task.due_date}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
