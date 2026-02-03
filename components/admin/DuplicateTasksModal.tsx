import { useState, useEffect } from 'react'
import { FileX, AlertCircle, Trash2, X, Loader2 } from 'lucide-react'
import { TaskType, TaskStatus } from '@/lib/task-steps'
import DuplicateGroupCard from './DuplicateGroupCard'

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

interface DuplicateSummary {
  totalGroups: number
  totalDuplicates: number
  toDelete: number
}

interface DuplicateTasksModalProps {
  isOpen: boolean
  onClose: () => void
  duplicates: DuplicateGroup[]
  summary: DuplicateSummary
  onDelete: (taskIds: string[]) => Promise<{ success: number; failed: number }>
}

export default function DuplicateTasksModal({
  isOpen,
  onClose,
  duplicates,
  summary,
  onDelete
}: DuplicateTasksModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

  // 삭제 대상 자동 선택 (keep: false인 항목들)
  useEffect(() => {
    if (isOpen && duplicates.length > 0) {
      const toDelete = duplicates
        .flatMap(group => group.tasks)
        .filter(task => !task.keep)
        .map(task => task.id)
      setSelectedIds(toDelete)
    }
  }, [isOpen, duplicates])

  const handleDelete = async () => {
    if (selectedIds.length === 0) {
      alert('삭제할 업무를 선택해주세요.')
      return
    }

    const confirmed = confirm(
      `총 ${selectedIds.length}개의 중복 업무를 삭제하시겠습니까?\n\n` +
      `이 작업은 되돌릴 수 있습니다 (soft delete).`
    )

    if (!confirmed) return

    setIsDeleting(true)
    try {
      const result = await onDelete(selectedIds)

      if (result.success > 0) {
        alert(`${result.success}개의 중복 업무가 성공적으로 삭제되었습니다.`)
        onClose()
      }

      if (result.failed > 0) {
        alert(`${result.failed}개의 업무 삭제에 실패했습니다.`)
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSelectAll = () => {
    const allToDelete = duplicates
      .flatMap(group => group.tasks)
      .filter(task => !task.keep)
      .map(task => task.id)
    setSelectedIds(allToDelete)
  }

  const handleDeselectAll = () => {
    setSelectedIds([])
  }

  const toggleTaskSelection = (taskId: string) => {
    setSelectedIds(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col m-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileX className="w-5 h-5 text-orange-600" />
              <h2 className="text-lg font-semibold text-gray-900">중복 업무 관리</h2>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>중복 그룹: {summary.totalGroups}개</span>
              <span>전체 중복: {summary.totalDuplicates}개</span>
              <span className="text-orange-600 font-medium">
                삭제 대상: {summary.toDelete}개
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isDeleting}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 안내 메시지 */}
        <div className="p-6 border-b border-gray-200">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-orange-900">
              <p className="font-medium mb-1">중복 업무 삭제 안내</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>각 그룹에서 <strong>가장 최근 업무</strong>는 자동으로 보존됩니다.</li>
                <li>삭제는 <strong>Soft Delete</strong> 방식으로 진행되어 복구 가능합니다.</li>
                <li>삭제 후 업무 목록이 자동으로 새로고침됩니다.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 중복 그룹 목록 (스크롤 가능) */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {duplicates.map((group, index) => (
              <DuplicateGroupCard
                key={group.key}
                index={index}
                group={group}
                selectedIds={selectedIds}
                onToggle={toggleTaskSelection}
              />
            ))}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-700"
              disabled={isDeleting}
            >
              전체 선택
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleDeselectAll}
              className="text-sm text-blue-600 hover:text-blue-700"
              disabled={isDeleting}
            >
              전체 해제
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isDeleting}
            >
              취소
            </button>
            <button
              onClick={handleDelete}
              disabled={selectedIds.length === 0 || isDeleting}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  삭제 중...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  선택한 {selectedIds.length}개 삭제
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
