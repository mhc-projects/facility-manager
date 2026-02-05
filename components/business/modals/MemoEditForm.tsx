'use client'

import { Save, X } from 'lucide-react'

interface MemoEditFormProps {
  mode: 'create' | 'edit'
  memoForm: { title: string; content: string }
  setMemoForm: (form: { title: string; content: string }) => void
  onSave: () => void
  onCancel: () => void
  isSubmitting?: boolean
}

export default function MemoEditForm({
  mode,
  memoForm,
  setMemoForm,
  onSave,
  onCancel,
  isSubmitting = false
}: MemoEditFormProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 animate-slideDown">
      <div className="space-y-3">
        {/* Title Input */}
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1 sm:mb-1.5">
            제목
          </label>
          <input
            type="text"
            value={memoForm.title}
            onChange={(e) => setMemoForm({ ...memoForm, title: e.target.value })}
            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="메모 제목을 입력하세요"
            disabled={isSubmitting}
          />
        </div>

        {/* Content Textarea */}
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1 sm:mb-1.5">
            내용
          </label>
          <textarea
            value={memoForm.content}
            onChange={(e) => setMemoForm({ ...memoForm, content: e.target.value })}
            rows={4}
            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="메모 내용을 입력하세요"
            disabled={isSubmitting}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            취소
          </button>
          <button
            onClick={onSave}
            disabled={isSubmitting}
            className="flex items-center px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
            {mode === 'create' ? '추가' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
