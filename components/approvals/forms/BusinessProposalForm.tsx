'use client'

import { useState, useEffect } from 'react'
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
}

interface Department {
  id: string
  name: string
}

interface Props {
  data: BusinessProposalData
  onChange: (data: BusinessProposalData) => void
  disabled?: boolean
}

const cellInput = `w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-0 bg-transparent disabled:bg-gray-50 border-0 outline-none`
const cellClass = `px-3 py-2 bg-gray-50 text-sm font-bold flex items-center whitespace-nowrap`
const selectInput = `w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-0 bg-transparent border-0 outline-none cursor-pointer`

export default function BusinessProposalForm({ data, onChange, disabled = false }: Props) {
  const [departments, setDepartments] = useState<Department[]>([])

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
          <div className={`${cellClass} justify-center`}>첨부서류</div>
          <input className={cellInput} value={data.attachments_desc} onChange={e => onChange({ ...data, attachments_desc: e.target.value })} disabled={disabled} placeholder="없음" />
        </div>
      </div>
    </div>
  )
}
