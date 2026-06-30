// 전자결재 파일 첨부 드롭존 — 클릭 및 드래그앤드롭 지원
'use client'

import { useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.doc,.docx'

interface FileUploadAreaProps {
  onFiles: (files: File[]) => void
}

export default function FileUploadArea({ onFiles }: FileUploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  // dragCounter: 자식 요소 진입/이탈 시 dragLeave 오동작 방지
  const dragCounter = useRef(0)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragging(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`w-full flex flex-col items-center justify-center gap-1 py-3 border-2 border-dashed rounded-lg text-sm cursor-pointer transition-colors select-none ${
        isDragging
          ? 'border-blue-400 bg-blue-50 text-blue-600'
          : 'border-gray-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <Paperclip className="w-4 h-4" />
        <span>{isDragging ? '여기에 놓으세요' : '파일 추가'}</span>
      </div>
      {!isDragging && (
        <span className="text-xs text-gray-400">또는 파일을 여기에 드래그</span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files || [])
          if (files.length > 0) onFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
