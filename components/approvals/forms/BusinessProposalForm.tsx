'use client'

import { useState, useEffect, useRef } from 'react'
import { Paperclip, X, FileText, Image, File } from 'lucide-react'

export interface AttachmentFile {
  id: string
  name: string
  url: string
  size: number
  type?: string
  path?: string
  uploaded_at: string
}

export interface BusinessProposalData {
  writer: string
  department: string
  department_id?: string
  written_date: string
  title: string
  content: string
  retention_period: string
  cooperative_team: string
  cooperative_team_id?: string
  instructions: string
  attachments_desc: string
  attachments?: AttachmentFile[]
}

interface Department {
  id: string
  name: string
}

interface Props {
  data: BusinessProposalData
  onChange: (data: BusinessProposalData) => void
  disabled?: boolean
  onFileUpload?: (file: File) => Promise<AttachmentFile>
  onFileDelete?: (attachment: AttachmentFile) => Promise<void>
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function FileIcon({ type }: { type?: string }) {
  if (type?.startsWith('image/')) return <Image className="w-4 h-4 text-green-500 shrink-0" />
  if (type === 'application/pdf') return <FileText className="w-4 h-4 text-red-500 shrink-0" />
  return <File className="w-4 h-4 text-blue-500 shrink-0" />
}

const cellInput = `w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-0 bg-transparent disabled:bg-gray-50 border-0 outline-none`
const cellClass = `px-3 py-2 bg-gray-50 text-sm font-bold flex items-center whitespace-nowrap`
const selectInput = `w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-0 bg-transparent border-0 outline-none cursor-pointer`

export default function BusinessProposalForm({ data, onChange, disabled = false, onFileUpload, onFileDelete }: Props) {
  const [departments, setDepartments] = useState<Department[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachments = data.attachments || []

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onFileUpload) return
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      try {
        const uploaded = await onFileUpload(file)
        onChange({ ...data, attachments: [...(data.attachments || []), uploaded] })
      } catch (err: any) {
        alert(err?.message || '파일 업로드에 실패했습니다')
      }
    }
    e.target.value = ''
  }

  const handleFileDelete = async (attachment: AttachmentFile) => {
    if (!onFileDelete) return
    try {
      await onFileDelete(attachment)
      onChange({ ...data, attachments: attachments.filter(a => a.id !== attachment.id) })
    } catch (err: any) {
      alert(err?.message || '파일 삭제에 실패했습니다')
    }
  }

  useEffect(() => {
    if (disabled) return
    fetch('/api/organization/departments')
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setDepartments(res.data.map((d: any) => ({ id: String(d.id), name: d.name })))
        }
      })
      .catch(() => {})
  }, [disabled])

  return (
    <div className="space-y-4">
      {/* 기본 정보 */}
      <div className="border border-black">
        <div className="grid grid-cols-2 divide-x divide-black">
          <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
            <div className={cellClass}>작성일</div>
            <input type="date" className={cellInput} value={data.written_date} onChange={e => onChange({ ...data, written_date: e.target.value })} disabled={disabled} />
          </div>
          <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
            <div className={cellClass}>보존기간</div>
            <input className={cellInput} value={data.retention_period} onChange={e => onChange({ ...data, retention_period: e.target.value })} disabled={disabled} placeholder="3년" />
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-black border-t border-black">
          <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
            <div className={cellClass}>작성자</div>
            <input className={cellInput} value={data.writer} onChange={e => onChange({ ...data, writer: e.target.value })} disabled={disabled} placeholder="홍길동" />
          </div>
          <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
            <div className={cellClass}>작성팀</div>
            {disabled ? (
              <input className={cellInput} value={data.department} disabled />
            ) : (
              <select
                className={selectInput}
                value={data.department_id || ''}
                onChange={e => {
                  const dept = departments.find(d => d.id === e.target.value)
                  onChange({ ...data, department_id: dept?.id || '', department: dept?.name || '' })
                }}
              >
                <option value="">작성팀 선택...</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-black border-t border-black">
          <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
            <div className={cellClass}>협조팀</div>
            {disabled ? (
              <input className={cellInput} value={data.cooperative_team} disabled />
            ) : (
              <select
                className={selectInput}
                value={data.cooperative_team_id || ''}
                onChange={e => {
                  const dept = departments.find(d => d.id === e.target.value)
                  onChange({ ...data, cooperative_team_id: dept?.id || '', cooperative_team: dept?.name || '' })
                }}
              >
                <option value="">협조팀 선택...</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
            <div className={cellClass}>지시사항</div>
            <input className={cellInput} value={data.instructions} onChange={e => onChange({ ...data, instructions: e.target.value })} disabled={disabled} />
          </div>
        </div>
      </div>

      {/* 제목 */}
      <div className="border border-black">
        <div className="grid grid-cols-[60px_1fr] divide-x divide-black">
          <div className={`${cellClass} justify-center`}>제목</div>
          <input className={`${cellInput} font-medium`} value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} disabled={disabled} placeholder="제목을 입력하세요" />
        </div>
      </div>

      {/* 내용 */}
      <div className="border border-black">
        <div className="grid grid-cols-[60px_1fr] divide-x divide-black">
          <div className={`${cellClass} justify-center items-start pt-3`}>내용</div>
          <textarea
            className="p-3 text-sm focus:outline-none bg-transparent disabled:text-gray-700 w-full resize-none min-h-[280px]"
            value={data.content}
            onChange={e => onChange({ ...data, content: e.target.value })}
            disabled={disabled}
            placeholder="업무 내용을 상세히 작성하세요..."
          />
        </div>
      </div>

      {/* 첨부서류 */}
      <div className="border border-black">
        <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
          <div className={`${cellClass} justify-center items-start pt-3`}>첨부서류</div>
          <div className="p-2 space-y-1.5">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <FileIcon type={att.type} />
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch(att.url)
                    const blob = await res.blob()
                    const blobUrl = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = blobUrl
                    a.download = att.name
                    a.click()
                    URL.revokeObjectURL(blobUrl)
                  }}
                  className="flex-1 text-sm text-blue-600 hover:underline truncate text-left"
                >
                  {att.name}
                </button>
                <span className="text-xs text-gray-400 shrink-0">{formatFileSize(att.size)}</span>
                {!disabled && onFileDelete && (
                  <button type="button" onClick={() => handleFileDelete(att)} className="text-gray-400 hover:text-red-500 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}

            {!disabled && onFileUpload && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                  파일 추가
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.doc,.docx"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}

            {disabled && attachments.length === 0 && (
              <p className="text-sm text-gray-400 italic px-1 py-1">첨부된 파일이 없습니다</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
