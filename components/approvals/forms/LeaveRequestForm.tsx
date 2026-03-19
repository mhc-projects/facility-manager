'use client'

export interface LeaveRequestData {
  writer: string
  department: string
  written_date: string
  start_date: string
  end_date: string
  total_days: number
  leave_type: 'annual' | 'condolence' | 'special' | 'other' | 'half_am' | 'half_pm'
  reason: string
  note: string
}

interface Props {
  data: LeaveRequestData
  onChange: (data: LeaveRequestData) => void
  disabled?: boolean
}

const LEAVE_TYPES = [
  { value: 'annual',     label: '① 유급휴가' },
  { value: 'condolence', label: '② 경조휴가' },
  { value: 'special',    label: '③ 특별휴가' },
  { value: 'half_am',    label: '④ 반차 (오전)' },
  { value: 'half_pm',    label: '⑤ 반차 (오후)' },
  { value: 'other',      label: '⑥ 기타' },
] as const

const IS_HALF = (t: string) => t === 'half_am' || t === 'half_pm'

function calcDays(start: string, end: string, leaveType: string): number {
  if (IS_HALF(leaveType)) return 0.5
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return diff > 0 ? diff : 0
}

function formatKorDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}. (${days[d.getDay()]})`
}

const cellInput = `w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-0 bg-transparent disabled:bg-gray-50 border-0 outline-none`

export default function LeaveRequestForm({ data, onChange, disabled = false }: Props) {
  const isHalf = IS_HALF(data.leave_type)

  const handleDateChange = (field: 'start_date' | 'end_date', value: string) => {
    const updated = { ...data, [field]: value }
    // 반차면 종료일 = 시작일 고정
    if (isHalf) updated.end_date = updated.start_date
    updated.total_days = calcDays(updated.start_date, updated.end_date, updated.leave_type)
    onChange(updated)
  }

  const handleTypeChange = (type: LeaveRequestData['leave_type']) => {
    if (disabled) return
    const updated = { ...data, leave_type: type }
    if (IS_HALF(type)) {
      updated.end_date = updated.start_date
      updated.total_days = 0.5
    } else {
      updated.total_days = calcDays(updated.start_date, updated.end_date, type)
    }
    onChange(updated)
  }

  return (
    <div className="space-y-4">
      {/* 기본 정보 */}
      <div className="border border-black">
        <div className="grid grid-cols-[100px_1fr_80px_1fr] divide-x divide-black">
          <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">작 성 자</div>
          <input className={cellInput} value={data.writer} onChange={e => onChange({ ...data, writer: e.target.value })} disabled={disabled} placeholder="홍길동 차장" />
          <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">부서명</div>
          <input className={cellInput} value={data.department} onChange={e => onChange({ ...data, department: e.target.value })} disabled={disabled} placeholder="부서명" />
        </div>
        <div className="grid grid-cols-[100px_1fr_80px_1fr] divide-x divide-black border-t border-black">
          <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">작성일자</div>
          <input type="date" className={cellInput} value={data.written_date} onChange={e => onChange({ ...data, written_date: e.target.value })} disabled={disabled} />
          <div />
          <div />
        </div>
      </div>

      <p className="text-sm text-gray-700">아래와 같이 사유로 휴가원을 제출합니다.</p>

      {/* 휴가 내용 */}
      <div className="border border-black">

        {/* 기간 — 현대적 인라인 레이아웃 */}
        <div className="grid grid-cols-[80px_1fr] divide-x divide-black">
          <div className="px-3 py-4 bg-gray-50 text-sm font-bold flex items-center justify-center">기 간</div>
          <div className="p-4">
            {/* 날짜 범위 행 */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 시작일 */}
              <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 border transition-colors ${disabled ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300 hover:border-blue-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100'}`}>
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <input
                  type="date"
                  className="text-sm bg-transparent border-0 outline-none focus:ring-0 disabled:text-gray-500 w-32"
                  value={data.start_date}
                  onChange={e => handleDateChange('start_date', e.target.value)}
                  disabled={disabled}
                />
              </div>

              {/* 구분 화살표 */}
              <div className="flex items-center gap-1 text-gray-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>

              {/* 종료일 */}
              <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 border transition-colors ${isHalf ? 'bg-gray-50 border-gray-200' : disabled ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300 hover:border-blue-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100'}`}>
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <input
                  type="date"
                  className="text-sm bg-transparent border-0 outline-none focus:ring-0 disabled:text-gray-500 w-32"
                  value={data.end_date}
                  onChange={e => handleDateChange('end_date', e.target.value)}
                  disabled={disabled || isHalf}
                />
              </div>

              {/* 총 기간 pill */}
              {data.total_days > 0 && (
                <div className="ml-1 flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-full px-3 py-1">
                  <span className="text-xs font-medium">총</span>
                  <span className="text-sm font-bold">{data.total_days}</span>
                  <span className="text-xs font-medium">일</span>
                </div>
              )}
            </div>

            {/* 날짜 텍스트 표시 */}
            {data.start_date && (
              <p className="mt-2 text-xs text-gray-400">
                {isHalf
                  ? `${formatKorDate(data.start_date)} · ${data.leave_type === 'half_am' ? '오전 반차' : '오후 반차'}`
                  : data.end_date
                    ? `${formatKorDate(data.start_date)} ~ ${formatKorDate(data.end_date)}`
                    : formatKorDate(data.start_date)
                }
              </p>
            )}

            {/* 반차 안내 */}
            {isHalf && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                반차는 0.5일 처리됩니다. 종료일은 시작일과 동일하게 고정됩니다.
              </div>
            )}
          </div>
        </div>

        {/* 구분 */}
        <div className="grid grid-cols-[80px_1fr] divide-x divide-black border-t border-black">
          <div className="px-3 py-4 bg-gray-50 text-sm font-bold flex items-center justify-center">구 분</div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {LEAVE_TYPES.map(lt => {
                const isSelected = data.leave_type === lt.value
                const isHalfType = lt.value === 'half_am' || lt.value === 'half_pm'
                return (
                  <button
                    key={lt.value}
                    type="button"
                    onClick={() => handleTypeChange(lt.value as LeaveRequestData['leave_type'])}
                    disabled={disabled}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      isSelected
                        ? isHalfType
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60'
                    }`}
                  >
                    {lt.label}
                  </button>
                )
              })}
            </div>
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
