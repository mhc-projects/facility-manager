'use client'

import { useState } from 'react'

export type LeaveType = 'annual' | 'condolence' | 'special' | 'other' | 'half_am' | 'half_pm'

export interface LeaveItem {
  date: string
  end_date?: string   // 기간 항목인 경우 종료일 (없으면 단일 날짜)
  leave_type: LeaveType
  days: number
}

export interface LeaveRequestData {
  writer: string
  department: string
  written_date: string
  items: LeaveItem[]
  total_days: number
  reason: string
  note: string
}

interface Props {
  data: LeaveRequestData
  onChange: (data: LeaveRequestData) => void
  disabled?: boolean
}

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'annual',     label: '① 유급휴가' },
  { value: 'condolence', label: '② 경조휴가' },
  { value: 'special',    label: '③ 특별휴가' },
  { value: 'half_am',    label: '④ 반차 (오전)' },
  { value: 'half_pm',    label: '⑤ 반차 (오후)' },
  { value: 'other',      label: '⑥ 기타' },
]

const IS_HALF = (t: string) => t === 'half_am' || t === 'half_pm'

function itemDays(leave_type: LeaveType): number {
  return IS_HALF(leave_type) ? 0.5 : 1
}

function calcTotal(items: LeaveItem[]): number {
  return items.reduce((sum, i) => sum + i.days, 0)
}

function formatKorDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}. (${days[d.getDay()]})`
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}(${days[d.getDay()]})`
}

function labelFor(leave_type: LeaveType): string {
  return LEAVE_TYPES.find(lt => lt.value === leave_type)?.label ?? ''
}

export default function LeaveRequestForm({ data, onChange, disabled = false }: Props) {
  const [range, setRange] = useState<{ open: boolean; start: string; end: string; leave_type: LeaveType }>({
    open: false,
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
    leave_type: 'annual',
  })

  const updateItems = (items: LeaveItem[]) => {
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))
    onChange({ ...data, items: sorted, total_days: calcTotal(sorted) })
  }

  // 단일 날짜가 기존 항목(단일/기간 모두)과 충돌하는지 확인
  const isDateUsed = (dateStr: string, excludeIndex?: number): boolean =>
    data.items.some((item, i) => {
      if (i === excludeIndex) return false
      if (item.end_date) {
        return dateStr >= item.date && dateStr <= item.end_date
      }
      return item.date === dateStr
    })

  const handleAddItem = () => {
    const lastDate = data.items.length > 0
      ? (data.items[data.items.length - 1].end_date ?? data.items[data.items.length - 1].date)
      : new Date().toISOString().split('T')[0]
    const next = new Date(lastDate)
    next.setDate(next.getDate() + 1)

    let candidate = next.toISOString().split('T')[0]
    let guard = 0
    while (isDateUsed(candidate) && guard++ < 60) {
      const d = new Date(candidate)
      d.setDate(d.getDate() + 1)
      candidate = d.toISOString().split('T')[0]
    }
    updateItems([...data.items, { date: candidate, leave_type: 'annual', days: 1 }])
  }

  const handleRemoveItem = (index: number) => {
    updateItems(data.items.filter((_, i) => i !== index))
  }

  // 단일 날짜 항목: 날짜 변경
  const handleItemDate = (index: number, date: string) => {
    if (isDateUsed(date, index)) return
    updateItems(data.items.map((item, i) => i === index ? { ...item, date } : item))
  }

  // 기간 항목: 시작/종료일 변경
  const handlePeriodDate = (index: number, field: 'date' | 'end_date', value: string) => {
    const item = data.items[index]
    const newItem = { ...item, [field]: value }
    const start = field === 'date' ? value : item.date
    const end = field === 'end_date' ? value : (item.end_date ?? item.date)
    if (!start || !end || start > end) return
    const dayCount = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
    updateItems(data.items.map((it, i) => i === index ? { ...newItem, days: dayCount } : it))
  }

  const handleItemType = (index: number, leave_type: LeaveType) => {
    updateItems(data.items.map((item, i) =>
      i === index ? { ...item, leave_type, days: item.end_date ? item.days : itemDays(leave_type) } : item
    ))
  }

  // 기간 추가: 단일 LeaveItem(start~end)으로 저장
  const handleAddRange = () => {
    if (!range.start || !range.end || range.start > range.end) return
    const diff = Math.round((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86400000)
    if (diff >= 31) return
    const dayCount = diff + 1
    updateItems([...data.items, { date: range.start, end_date: range.end, leave_type: range.leave_type, days: dayCount }])
    setRange(r => ({ ...r, open: false }))
  }

  // 기간 패널 미리보기
  const rangePreview = (): string => {
    if (!range.start || !range.end || range.start > range.end) return ''
    const diff = Math.round((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86400000)
    if (diff >= 31) return '31일 이하 범위만 입력 가능합니다'
    return `${diff + 1}일 추가 예정`
  }

  const isRangeValid = (): boolean => {
    if (!range.start || !range.end || range.start > range.end) return false
    const diff = Math.round((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86400000)
    return diff < 31
  }

  const periodSummary = () => {
    if (data.items.length === 0) return ''
    const sorted = [...data.items].sort((a, b) => a.date.localeCompare(b.date))
    const first = sorted[0].date
    const last = sorted[sorted.length - 1]
    const lastDate = last.end_date ?? last.date
    if (data.items.length === 1 && !data.items[0].end_date) {
      const item = data.items[0]
      return IS_HALF(item.leave_type)
        ? `${formatKorDate(item.date)} · ${item.leave_type === 'half_am' ? '오전 반차' : '오후 반차'}`
        : formatKorDate(item.date)
    }
    return `${formatKorDate(first)} ~ ${formatKorDate(lastDate)}`
  }

  return (
    <div className="space-y-4">
      {/* 기본 정보 */}
      <div className="border border-black">
        <div className="grid grid-cols-[100px_1fr_80px_1fr] divide-x divide-black">
          <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">작 성 자</div>
          <input className="w-full px-2 py-1.5 text-sm focus:outline-none bg-transparent border-0 outline-none disabled:bg-gray-50" value={data.writer} onChange={e => onChange({ ...data, writer: e.target.value })} disabled={disabled} placeholder="홍길동 차장" />
          <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">부서명</div>
          <input className="w-full px-2 py-1.5 text-sm focus:outline-none bg-transparent border-0 outline-none disabled:bg-gray-50" value={data.department} onChange={e => onChange({ ...data, department: e.target.value })} disabled={disabled} placeholder="부서명" />
        </div>
        <div className="grid grid-cols-[100px_1fr_80px_1fr] divide-x divide-black border-t border-black">
          <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">작성일자</div>
          <input type="date" className="w-full px-2 py-1.5 text-sm focus:outline-none bg-transparent border-0 outline-none disabled:bg-gray-50" value={data.written_date} onChange={e => onChange({ ...data, written_date: e.target.value })} disabled={disabled} />
          <div />
          <div />
        </div>
      </div>

      <p className="text-sm text-gray-700">아래와 같이 사유로 휴가원을 제출합니다.</p>

      {/* 휴가 내용 */}
      <div className="border border-black">
        <div className="grid grid-cols-[80px_1fr] divide-x divide-black">
          <div className="px-3 py-4 bg-gray-50 text-sm font-bold flex items-center justify-center">기 간</div>
          <div className="p-4 space-y-3">

            {data.items.map((item, index) => {
              const isPeriod = !!item.end_date
              const isHalfItem = IS_HALF(item.leave_type)
              return (
                <div key={index} className={`rounded-xl border transition-all ${disabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white shadow-sm'}`}>
                  {isPeriod ? (
                    /* 기간 항목 */
                    <>
                      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
                        {/* 달력 아이콘 */}
                        <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {disabled ? (
                          <span className="text-sm text-gray-700 flex-1">
                            {formatShortDate(item.date)} ~ {formatShortDate(item.end_date!)}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <input
                              type="date"
                              className="text-sm bg-transparent border-0 outline-none focus:ring-0 flex-1 min-w-0"
                              value={item.date}
                              onChange={e => handlePeriodDate(index, 'date', e.target.value)}
                            />
                            <span className="text-gray-300 text-xs flex-shrink-0">~</span>
                            <input
                              type="date"
                              className="text-sm bg-transparent border-0 outline-none focus:ring-0 flex-1 min-w-0"
                              value={item.end_date}
                              onChange={e => handlePeriodDate(index, 'end_date', e.target.value)}
                            />
                          </div>
                        )}
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-indigo-600 bg-indigo-50 flex-shrink-0">
                          {item.days}일
                        </span>
                        {!disabled && data.items.length > 1 && (
                          <button type="button" onClick={() => handleRemoveItem(index)} className="text-gray-300 hover:text-red-400 transition-colors ml-0.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="border-t border-gray-100 px-3 py-2 flex flex-wrap gap-1.5">
                        {LEAVE_TYPES.filter(lt => !IS_HALF(lt.value)).map(lt => {
                          const isSelected = item.leave_type === lt.value
                          return (
                            <button key={lt.value} type="button" onClick={() => handleItemType(index, lt.value)} disabled={disabled}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                              {lt.label}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    /* 단일 날짜 항목 */
                    <>
                      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <input type="date" className="text-sm bg-transparent border-0 outline-none focus:ring-0 disabled:text-gray-500 flex-1 min-w-0"
                          value={item.date} onChange={e => handleItemDate(index, e.target.value)} disabled={disabled} />
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${isHalfItem ? 'text-amber-600 bg-amber-50' : 'text-blue-600 bg-blue-50'}`}>
                          {item.days}일
                        </span>
                        {!disabled && data.items.length > 1 && (
                          <button type="button" onClick={() => handleRemoveItem(index)} className="text-gray-300 hover:text-red-400 transition-colors ml-0.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="border-t border-gray-100 px-3 py-2 flex flex-wrap gap-1.5">
                        {LEAVE_TYPES.map(lt => {
                          const isSelected = item.leave_type === lt.value
                          const isHalfType = IS_HALF(lt.value)
                          return (
                            <button key={lt.value} type="button" onClick={() => handleItemType(index, lt.value)} disabled={disabled}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${isSelected ? isHalfType ? 'bg-amber-500 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm' : disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                              {lt.label}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )
            })}

            {/* 추가 버튼 */}
            {!disabled && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button type="button" onClick={handleAddItem} data-testid="add-single-day"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-gray-400 hover:text-blue-500 border border-dashed border-gray-200 hover:border-blue-300 rounded-xl transition-all hover:bg-blue-50/50">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    날짜 추가
                  </button>
                  <button type="button" onClick={() => setRange(r => ({ ...r, open: !r.open }))} data-testid="toggle-range-panel"
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm border border-dashed rounded-xl transition-all ${range.open ? 'border-indigo-400 text-indigo-600 bg-indigo-50' : 'border-gray-200 text-gray-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50/50'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    기간으로 추가
                  </button>
                </div>

                {range.open && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3" data-testid="range-panel">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">시작일</label>
                        <input type="date" data-testid="range-start"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} />
                      </div>
                      <span className="text-gray-400 mt-5">~</span>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">종료일</label>
                        <input type="date" data-testid="range-end"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">휴가 구분</label>
                      <div className="flex flex-wrap gap-1.5">
                        {LEAVE_TYPES.filter(lt => !IS_HALF(lt.value)).map(lt => (
                          <button key={lt.value} type="button" data-testid={`range-type-${lt.value}`}
                            onClick={() => setRange(r => ({ ...r, leave_type: lt.value }))}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${range.leave_type === lt.value ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                            {lt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className={`text-xs ${isRangeValid() ? 'text-indigo-600' : 'text-amber-500'}`} data-testid="range-preview">
                        {rangePreview()}
                      </span>
                      <div className="flex gap-2 flex-shrink-0">
                        <button type="button" onClick={() => setRange(r => ({ ...r, open: false }))}
                          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white transition-colors">
                          취소
                        </button>
                        <button type="button" data-testid="confirm-range" onClick={handleAddRange} disabled={!isRangeValid()}
                          className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          추가하기
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 합계 + 요약 */}
            {data.total_days > 0 && (
              <div className="pt-1 border-t border-gray-100 flex items-baseline gap-2 flex-wrap">
                <span className="text-xs text-gray-400">합계</span>
                <span className="text-sm font-bold text-blue-600">{data.total_days}일</span>
                {data.items[0]?.date && (
                  <span className="text-xs text-gray-400">{periodSummary()}</span>
                )}
                {data.items.length > 1 && (
                  <span className="text-xs text-gray-400">
                    ({data.items.map(i =>
                      i.end_date
                        ? `${formatShortDate(i.date)}~${formatShortDate(i.end_date)} ${labelFor(i.leave_type)}`
                        : `${formatShortDate(i.date)} ${IS_HALF(i.leave_type) ? (i.leave_type === 'half_am' ? '오전반차' : '오후반차') : labelFor(i.leave_type)}`
                    ).join(' · ')})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 사유 */}
        <div className="grid grid-cols-[80px_1fr] divide-x divide-black border-t border-black">
          <div className="px-3 py-4 bg-gray-50 text-sm font-bold flex items-center justify-center">사 유</div>
          <textarea className="p-3 text-sm resize-none focus:outline-none bg-transparent disabled:text-gray-700 min-h-[80px]"
            value={data.reason} onChange={e => onChange({ ...data, reason: e.target.value })} disabled={disabled} placeholder="개인 사정" />
        </div>

        {/* 비고 */}
        <div className="grid grid-cols-[80px_1fr] divide-x divide-black border-t border-black">
          <div className="px-3 py-4 bg-gray-50 text-sm font-bold flex items-center justify-center">비 고</div>
          <textarea className="p-3 text-sm resize-none focus:outline-none bg-transparent disabled:text-gray-700 min-h-[60px]"
            value={data.note} onChange={e => onChange({ ...data, note: e.target.value })} disabled={disabled} placeholder="" />
        </div>

        {/* 주의 */}
        <div className="grid grid-cols-[80px_1fr] divide-x divide-black border-t border-black">
          <div className="px-3 py-4 bg-gray-50 text-sm font-bold flex items-center justify-center">주 의</div>
          <div className="p-4 text-sm text-gray-600 space-y-1">
            <p>1. 신고서는 휴가의 전일까지 제출</p>
            <p>2. 신고서는 해당 소속장의 승인을 득한 후 담당부서에 제출</p>
          </div>
        </div>
      </div>
    </div>
  )
}
