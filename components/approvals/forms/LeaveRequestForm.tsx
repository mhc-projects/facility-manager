'use client'

export type LeaveType = 'annual' | 'condolence' | 'special' | 'other' | 'half_am' | 'half_pm'

export interface LeaveItem {
  date: string
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

  const updateItems = (items: LeaveItem[]) => {
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))
    onChange({ ...data, items: sorted, total_days: calcTotal(sorted) })
  }

  const handleAddItem = () => {
    // 마지막 항목의 다음날 또는 오늘을 기본값으로
    const lastDate = data.items.length > 0
      ? data.items[data.items.length - 1].date
      : new Date().toISOString().split('T')[0]
    const next = new Date(lastDate)
    next.setDate(next.getDate() + 1)
    const nextStr = next.toISOString().split('T')[0]

    // 중복되지 않는 날짜 찾기
    let candidate = nextStr
    const usedDates = new Set(data.items.map(i => i.date))
    while (usedDates.has(candidate)) {
      const d = new Date(candidate)
      d.setDate(d.getDate() + 1)
      candidate = d.toISOString().split('T')[0]
    }

    const newItem: LeaveItem = { date: candidate, leave_type: 'annual', days: 1 }
    updateItems([...data.items, newItem])
  }

  const handleRemoveItem = (index: number) => {
    const next = data.items.filter((_, i) => i !== index)
    updateItems(next)
  }

  const handleItemDate = (index: number, date: string) => {
    // 중복 날짜 방지
    if (data.items.some((item, i) => i !== index && item.date === date)) return
    const next = data.items.map((item, i) =>
      i === index ? { ...item, date } : item
    )
    updateItems(next)
  }

  const handleItemType = (index: number, leave_type: LeaveType) => {
    const next = data.items.map((item, i) =>
      i === index ? { ...item, leave_type, days: itemDays(leave_type) } : item
    )
    updateItems(next)
  }

  // 날짜 범위 요약 텍스트 (표시용)
  const periodSummary = () => {
    if (data.items.length === 0) return ''
    if (data.items.length === 1) {
      const item = data.items[0]
      return IS_HALF(item.leave_type)
        ? `${formatKorDate(item.date)} · ${item.leave_type === 'half_am' ? '오전 반차' : '오후 반차'}`
        : formatKorDate(item.date)
    }
    const sorted = [...data.items].sort((a, b) => a.date.localeCompare(b.date))
    return `${formatKorDate(sorted[0].date)} ~ ${formatKorDate(sorted[sorted.length - 1].date)}`
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

        {/* 기간 */}
        <div className="grid grid-cols-[80px_1fr] divide-x divide-black">
          <div className="px-3 py-4 bg-gray-50 text-sm font-bold flex items-center justify-center">기 간</div>
          <div className="p-4 space-y-3">

            {/* 날짜별 항목 */}
            {data.items.map((item, index) => {
              const isHalfItem = IS_HALF(item.leave_type)
              return (
                <div key={index} className={`rounded-xl border transition-all ${disabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white shadow-sm'}`}>
                  {/* 상단: 날짜 + 일수 + 삭제 */}
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <input
                      type="date"
                      className="text-sm bg-transparent border-0 outline-none focus:ring-0 disabled:text-gray-500 flex-1 min-w-0"
                      value={item.date}
                      onChange={e => handleItemDate(index, e.target.value)}
                      disabled={disabled}
                    />
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isHalfItem ? 'text-amber-600 bg-amber-50' : 'text-blue-600 bg-blue-50'}`}>
                      {item.days}일
                    </span>
                    {!disabled && data.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="text-gray-300 hover:text-red-400 transition-colors ml-0.5"
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {/* 하단: 구분선 + 타입 버튼 */}
                  <div className="border-t border-gray-100 px-3 py-2 flex flex-wrap gap-1.5">
                    {LEAVE_TYPES.map(lt => {
                      const isSelected = item.leave_type === lt.value
                      const isHalfType = IS_HALF(lt.value)
                      return (
                        <button
                          key={lt.value}
                          type="button"
                          onClick={() => handleItemType(index, lt.value)}
                          disabled={disabled}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                            isSelected
                              ? isHalfType
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'bg-blue-600 text-white shadow-sm'
                              : disabled
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {lt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* 추가 버튼 */}
            {!disabled && (
              <button
                type="button"
                onClick={handleAddItem}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-gray-400 hover:text-blue-500 border border-dashed border-gray-200 hover:border-blue-300 rounded-xl transition-all hover:bg-blue-50/50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                날짜 추가
              </button>
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
                    ({data.items.map(i => `${formatShortDate(i.date)} ${IS_HALF(i.leave_type) ? (i.leave_type === 'half_am' ? '오전반차' : '오후반차') : labelFor(i.leave_type)}`).join(' · ')})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 사유 */}
        <div className="grid grid-cols-[80px_1fr] divide-x divide-black border-t border-black">
          <div className="px-3 py-4 bg-gray-50 text-sm font-bold flex items-center justify-center">사 유</div>
          <textarea
            className="p-3 text-sm resize-none focus:outline-none bg-transparent disabled:text-gray-700 min-h-[80px]"
            value={data.reason}
            onChange={e => onChange({ ...data, reason: e.target.value })}
            disabled={disabled}
            placeholder="개인 사정"
          />
        </div>

        {/* 비고 */}
        <div className="grid grid-cols-[80px_1fr] divide-x divide-black border-t border-black">
          <div className="px-3 py-4 bg-gray-50 text-sm font-bold flex items-center justify-center">비 고</div>
          <textarea
            className="p-3 text-sm resize-none focus:outline-none bg-transparent disabled:text-gray-700 min-h-[60px]"
            value={data.note}
            onChange={e => onChange({ ...data, note: e.target.value })}
            disabled={disabled}
            placeholder=""
          />
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
