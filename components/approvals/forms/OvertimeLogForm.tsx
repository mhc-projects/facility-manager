'use client'

import { useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'

export interface OvertimeItem {
  date: string
  day_of_week: string
  ot_hours: number
  work_time: string
  start_time: string
  work_content: string
}

export interface OvertimeLogData {
  writer: string
  department: string
  written_date: string
  items: OvertimeItem[]
}

interface Props {
  data: OvertimeLogData
  onChange: (data: OvertimeLogData) => void
  disabled?: boolean
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function getDayOfWeek(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return DAY_NAMES[d.getDay()]
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return 0
  return h * 60 + m
}

function calcWorkTime(startTime: string, otHours: number): string {
  const startMinutes = timeToMinutes(startTime || '18:00')
  const endMinutes = startMinutes + Math.round(otHours * 60)
  const endH = Math.floor(endMinutes / 60) % 24
  const endM = endMinutes % 60
  const fmt = (n: number) => String(n).padStart(2, '0')
  return `근무시간 ${otHours}H (${startTime || '18:00'}~${fmt(endH)}:${fmt(endM)})`
}

const DEFAULT_START = '18:00'

function makeEmptyItem(): OvertimeItem {
  return {
    date: '', day_of_week: '', ot_hours: 1,
    start_time: DEFAULT_START,
    work_time: calcWorkTime(DEFAULT_START, 1),
    work_content: ''
  }
}

const cellInput = `w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-0 bg-transparent disabled:bg-gray-50 border-0 outline-none`
const mobileInput = `w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50`

export default function OvertimeLogForm({ data, onChange, disabled = false }: Props) {
  const totalOT = data.items.reduce((sum, item) => sum + (Number(item.ot_hours) || 0), 0)

  const updateItem = useCallback((idx: number, field: keyof OvertimeItem, value: string | number) => {
    const newItems = [...data.items]
    const updated = { ...newItems[idx], [field]: value }

    if (field === 'date') {
      updated.day_of_week = getDayOfWeek(value as string)
    }
    if (field === 'start_time' || field === 'ot_hours') {
      const startTime = field === 'start_time' ? (value as string) : (updated.start_time || DEFAULT_START)
      const hours = field === 'ot_hours' ? (Number(value) || 0) : (Number(updated.ot_hours) || 0)
      updated.work_time = calcWorkTime(startTime, hours)
    }

    newItems[idx] = updated
    onChange({ ...data, items: newItems })
  }, [data, onChange])

  const addItem = () => onChange({ ...data, items: [...data.items, makeEmptyItem()] })
  const removeItem = (idx: number) => {
    if (data.items.length <= 1) return
    onChange({ ...data, items: data.items.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-4">
      {/* ── 데스크탑 ── */}
      <div className="hidden md:block space-y-4">
        {/* 기본 정보 */}
        <div className="border border-black">
          <div className="grid grid-cols-[1fr_80px_1fr] divide-x divide-black">
            <div className="grid grid-cols-[60px_1fr] divide-x divide-black">
              <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center whitespace-nowrap">작성자</div>
              <input className={cellInput} value={data.writer} onChange={e => onChange({ ...data, writer: e.target.value })} disabled={disabled} placeholder="홍길동 차장" />
            </div>
            <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">부서명</div>
            <input className={cellInput} value={data.department} onChange={e => onChange({ ...data, department: e.target.value })} disabled={disabled} placeholder="IoT 사업부" />
          </div>
        </div>

        {/* 연장근무 내역 테이블 */}
        <div className="border border-black">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black bg-gray-50">
                <th className="border-r border-black px-2 py-2 text-sm font-bold w-28">날짜</th>
                <th className="border-r border-black px-2 py-2 text-sm font-bold w-12">요일</th>
                <th className="border-r border-black px-2 py-2 text-sm font-bold w-14">O/T</th>
                <th className={`px-2 py-2 text-sm font-bold ${!disabled ? 'border-r border-black' : ''}`}>근무내용</th>
                {!disabled && <th className="px-2 py-2 w-10" />}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx} className="border-b border-black last:border-b-0">
                  <td className="border-r border-black p-0">
                    <input type="date" className={cellInput} value={item.date} onChange={e => updateItem(idx, 'date', e.target.value)} disabled={disabled} />
                  </td>
                  <td className="border-r border-black text-center text-sm font-medium text-gray-700">
                    {item.day_of_week || (item.date ? getDayOfWeek(item.date) : '')}
                  </td>
                  <td className="border-r border-black text-center align-middle py-2">
                    {disabled ? (
                      <span className="text-sm">{item.ot_hours || 0}</span>
                    ) : (
                      <input
                        type="number" step="0.5" min="0"
                        className="w-10 text-center text-sm focus:outline-none bg-transparent border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={item.ot_hours || ''}
                        onChange={e => updateItem(idx, 'ot_hours', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    )}
                  </td>
                  <td className={`${!disabled ? 'border-r border-black' : ''}`}>
                    <div className="space-y-1 p-1.5">
                      {(() => {
                        const startTime = item.start_time || DEFAULT_START
                        const hours = Number(item.ot_hours) || 0
                        const endMinutes = timeToMinutes(startTime) + Math.round(hours * 60)
                        const endH = Math.floor(endMinutes / 60) % 24
                        const endM = endMinutes % 60
                        const fmt = (n: number) => String(n).padStart(2, '0')
                        return disabled ? (
                          <span className="text-sm text-gray-700">{item.work_time}</span>
                        ) : (
                          <span className="text-sm text-gray-700 whitespace-nowrap">
                            근무시간 {hours}H (
                            <input
                              type="text" inputMode="numeric" placeholder="18:00" maxLength={5}
                              className="text-sm text-gray-700 bg-transparent border-0 border-b border-dashed border-gray-400 focus:border-blue-500 focus:outline-none w-12 text-center px-0 py-0 inline"
                              value={startTime}
                              onChange={e => updateItem(idx, 'start_time', e.target.value)}
                              onBlur={e => { if (!/^\d{2}:\d{2}$/.test(e.target.value)) updateItem(idx, 'start_time', DEFAULT_START) }}
                            />
                            ~{fmt(endH)}:{fmt(endM)})
                          </span>
                        )
                      })()}
                      <input
                        className={`${cellInput} border border-gray-200 rounded px-2`}
                        value={item.work_content}
                        onChange={e => updateItem(idx, 'work_content', e.target.value)}
                        disabled={disabled} placeholder="업무 내용"
                      />
                    </div>
                  </td>
                  {!disabled && (
                    <td className="text-center">
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1" disabled={data.items.length <= 1}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black bg-gray-50">
                <td colSpan={2} className="border-r border-black text-center py-2 font-bold text-sm">Total</td>
                <td className="border-r border-black text-center py-2 font-bold text-sm text-blue-700">{totalOT}</td>
                <td colSpan={disabled ? 1 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {!disabled && (
          <button onClick={addItem} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-sm font-medium">
            <Plus className="w-4 h-4" />행 추가
          </button>
        )}
      </div>

      {/* ── 모바일 ── */}
      <div className="md:hidden space-y-4">
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">작성자</label>
            <input className={mobileInput} value={data.writer} onChange={e => onChange({ ...data, writer: e.target.value })} disabled={disabled} placeholder="홍길동 차장" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">부서명</label>
            <input className={mobileInput} value={data.department} onChange={e => onChange({ ...data, department: e.target.value })} disabled={disabled} placeholder="IoT 사업부" />
          </div>
        </div>

        {/* 합계 */}
        <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
          <span className="text-sm font-semibold text-blue-700">총 연장근무</span>
          <span className="text-lg font-bold text-blue-700">{totalOT}H</span>
        </div>

        {/* 연장근무 카드 */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">연장근무 내역</p>
          {data.items.map((item, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">항목 {idx + 1}</span>
                {!disabled && (
                  <button onClick={() => removeItem(idx)} disabled={data.items.length <= 1} className="text-red-400 active:text-red-600 p-1 disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">날짜</label>
                  <input
                    type="date" className={mobileInput}
                    value={item.date}
                    onChange={e => updateItem(idx, 'date', e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">O/T (시간)</label>
                  <input
                    type="number" step="0.5" min="0"
                    className={`${mobileInput} text-right`}
                    value={item.ot_hours || ''}
                    onChange={e => updateItem(idx, 'ot_hours', parseFloat(e.target.value) || 0)}
                    disabled={disabled} placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">시작 시간</label>
                <input
                  type="text" inputMode="numeric" placeholder="18:00" maxLength={5}
                  className={mobileInput}
                  value={item.start_time || DEFAULT_START}
                  onChange={e => updateItem(idx, 'start_time', e.target.value)}
                  onBlur={e => { if (!/^\d{2}:\d{2}$/.test(e.target.value)) updateItem(idx, 'start_time', DEFAULT_START) }}
                  disabled={disabled}
                />
              </div>
              {item.ot_hours > 0 && item.start_time && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
                  {calcWorkTime(item.start_time || DEFAULT_START, item.ot_hours)}
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">업무 내용</label>
                <input
                  className={mobileInput}
                  value={item.work_content}
                  onChange={e => updateItem(idx, 'work_content', e.target.value)}
                  disabled={disabled} placeholder="업무 내용"
                />
              </div>
            </div>
          ))}
        </div>

        {!disabled && (
          <button onClick={addItem} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-blue-600 font-medium active:bg-gray-50">
            <Plus className="w-4 h-4" />항목 추가
          </button>
        )}
      </div>
    </div>
  )
}
