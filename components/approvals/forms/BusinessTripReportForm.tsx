'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'

export interface TripScheduleItem {
  date: string
  time: string
  main_schedule: string
  location: string
  note: string
}

export interface BusinessTripReportData {
  writer: string
  department: string
  written_date: string
  // 출장 정보
  trip_purpose: string
  trip_period: string
  trip_region: string
  traveler: string
  visited_company: string
  companion_count: string
  // 출장 일정
  schedule_items: TripScheduleItem[]
  // 주요 내용
  work_content: string
  discussion_items: string
  special_notes: string
  // 기타
  other_notes: string
}

interface Props {
  data: BusinessTripReportData
  onChange: (data: BusinessTripReportData) => void
  disabled?: boolean
}

const EMPTY_SCHEDULE: TripScheduleItem = {
  date: '', time: '', main_schedule: '', location: '', note: '',
}

const cellInput = `w-full px-2 py-1.5 text-sm focus:outline-none bg-transparent disabled:bg-gray-50 border-0 outline-none`
const labelCell = `px-3 py-2 bg-gray-50 text-sm font-bold flex items-center whitespace-nowrap`

export default function BusinessTripReportForm({ data, onChange, disabled = false }: Props) {
  const update = useCallback((field: keyof BusinessTripReportData, value: string | TripScheduleItem[]) => {
    onChange({ ...data, [field]: value })
  }, [data, onChange])

  const updateSchedule = useCallback((idx: number, field: keyof TripScheduleItem, value: string) => {
    const next = [...data.schedule_items]
    next[idx] = { ...next[idx], [field]: value }
    update('schedule_items', next)
  }, [data.schedule_items, update])

  const addRow = () => update('schedule_items', [...data.schedule_items, { ...EMPTY_SCHEDULE }])
  const removeRow = (idx: number) => {
    if (data.schedule_items.length <= 1) return
    update('schedule_items', data.schedule_items.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-5 font-sans">

      {/* ── 기본 정보 ── */}
      <div className="border border-black">
        <div className="grid grid-cols-[90px_1fr_90px_1fr] divide-x divide-black border-b border-black">
          <div className={labelCell}>작 성 일</div>
          <input type="date" className={cellInput} value={data.written_date}
            onChange={e => update('written_date', e.target.value)} disabled={disabled} />
          <div className={labelCell}>부 서 명</div>
          <input className={cellInput} value={data.department}
            onChange={e => update('department', e.target.value)} disabled={disabled} placeholder="부서명" />
        </div>
        <div className="grid grid-cols-[90px_1fr] divide-x divide-black">
          <div className={labelCell}>작 성 자</div>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <input className={`${cellInput} flex-1`} value={data.writer}
              onChange={e => update('writer', e.target.value)} disabled={disabled} placeholder="작성자" />
            <span className="text-sm text-gray-500 shrink-0 pr-1">(인)</span>
          </div>
        </div>
      </div>

      {/* ── 출장 정보 ── */}
      <div>
        <div className="text-sm font-bold mb-1.5">출장 정보</div>
        <div className="border border-black">
          <div className="grid grid-cols-2 divide-x divide-black border-b border-black">
            <div className="grid grid-cols-[90px_1fr] divide-x divide-black">
              <div className={labelCell}>출장 목적</div>
              <input className={cellInput} value={data.trip_purpose}
                onChange={e => update('trip_purpose', e.target.value)} disabled={disabled} placeholder="출장 목적" />
            </div>
            <div className="grid grid-cols-[90px_1fr] divide-x divide-black">
              <div className={labelCell}>출장 기간</div>
              <input className={cellInput} value={data.trip_period}
                onChange={e => update('trip_period', e.target.value)} disabled={disabled} placeholder="예: 2026.05.15 ~ 05.16" />
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-black border-b border-black">
            <div className="grid grid-cols-[90px_1fr] divide-x divide-black">
              <div className={labelCell}>출장 지역</div>
              <input className={cellInput} value={data.trip_region}
                onChange={e => update('trip_region', e.target.value)} disabled={disabled} placeholder="출장 지역" />
            </div>
            <div className="grid grid-cols-[90px_1fr] divide-x divide-black">
              <div className={labelCell}>출 장 자</div>
              <input className={cellInput} value={data.traveler}
                onChange={e => update('traveler', e.target.value)} disabled={disabled} placeholder="출장자 성명" />
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-black">
            <div className="grid grid-cols-[90px_1fr] divide-x divide-black">
              <div className={labelCell}>방문 업체</div>
              <input className={cellInput} value={data.visited_company}
                onChange={e => update('visited_company', e.target.value)} disabled={disabled} placeholder="방문 업체명" />
            </div>
            <div className="grid grid-cols-[90px_1fr] divide-x divide-black">
              <div className={labelCell}>동행 인원</div>
              <input className={cellInput} value={data.companion_count}
                onChange={e => update('companion_count', e.target.value)} disabled={disabled} placeholder="예: 2명" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 출장 일정 ── */}
      <div>
        <div className="text-sm font-bold mb-1.5">출장 일정</div>
        <div className="border border-black overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 border-b border-black">
                <th className="px-2 py-2 text-sm font-bold text-center border-r border-black w-28">일자</th>
                <th className="px-2 py-2 text-sm font-bold text-center border-r border-black w-24">시간</th>
                <th className="px-2 py-2 text-sm font-bold text-center border-r border-black">주요 일정</th>
                <th className="px-2 py-2 text-sm font-bold text-center border-r border-black w-32">장소</th>
                <th className="px-2 py-2 text-sm font-bold text-center w-28">비고</th>
                {!disabled && <th className="w-8 border-l border-black" />}
              </tr>
            </thead>
            <tbody>
              {data.schedule_items.map((row, idx) => (
                <tr key={idx} className="border-t border-black">
                  <td className="border-r border-black p-0">
                    <input type="date" className={`${cellInput} text-center`} value={row.date}
                      onChange={e => updateSchedule(idx, 'date', e.target.value)} disabled={disabled} />
                  </td>
                  <td className="border-r border-black p-0">
                    <input className={`${cellInput} text-center`} value={row.time}
                      onChange={e => updateSchedule(idx, 'time', e.target.value)} disabled={disabled} placeholder="09:00~11:00" />
                  </td>
                  <td className="border-r border-black p-0">
                    <input className={cellInput} value={row.main_schedule}
                      onChange={e => updateSchedule(idx, 'main_schedule', e.target.value)} disabled={disabled} placeholder="주요 일정 내용" />
                  </td>
                  <td className="border-r border-black p-0">
                    <input className={cellInput} value={row.location}
                      onChange={e => updateSchedule(idx, 'location', e.target.value)} disabled={disabled} placeholder="장소" />
                  </td>
                  <td className="p-0">
                    <input className={cellInput} value={row.note}
                      onChange={e => updateSchedule(idx, 'note', e.target.value)} disabled={disabled} placeholder="비고" />
                  </td>
                  {!disabled && (
                    <td className="border-l border-black text-center">
                      <button type="button" onClick={() => removeRow(idx)}
                        disabled={data.schedule_items.length <= 1}
                        className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!disabled && (
          <button type="button" onClick={addRow}
            className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
            <Plus className="w-4 h-4" /> 행 추가
          </button>
        )}
      </div>

      {/* ── 주요 내용 ── */}
      <div>
        <div className="text-sm font-bold mb-1.5">주요 내용</div>
        <div className="border border-black divide-y divide-black">
          {[
            { label: '업무 내용', field: 'work_content' as const },
            { label: '협의 사항', field: 'discussion_items' as const },
            { label: '특이 사항', field: 'special_notes' as const },
          ].map(({ label, field }) => (
            <div key={field}>
              <div className="px-3 py-1.5 bg-gray-50 text-sm font-bold border-b border-black">{label}</div>
              <textarea
                rows={4}
                className="w-full px-3 py-2 text-sm focus:outline-none bg-transparent disabled:bg-gray-50 resize-none"
                value={data[field]}
                onChange={e => update(field, e.target.value)}
                disabled={disabled}
                placeholder={label + ' 입력'}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── 기타(첨부 서류 등) ── */}
      <div>
        <div className="text-sm font-bold mb-1.5">기타(첨부 서류 등)</div>
        <div className="border border-black">
          <textarea
            rows={3}
            className="w-full px-3 py-2 text-sm focus:outline-none bg-transparent disabled:bg-gray-50 resize-none"
            value={data.other_notes}
            onChange={e => update('other_notes', e.target.value)}
            disabled={disabled}
            placeholder="첨부 서류 목록 또는 기타 사항 입력"
          />
        </div>
      </div>
    </div>
  )
}
