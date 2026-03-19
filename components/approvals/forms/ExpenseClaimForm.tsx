'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

export interface ExpenseItem {
  date: string
  description: string
  amount: number
  note: string
}

export interface ExpenseClaimData {
  writer: string
  department: string
  written_date: string
  note: string
  items: ExpenseItem[]
}

interface Props {
  data: ExpenseClaimData
  onChange: (data: ExpenseClaimData) => void
  disabled?: boolean
}

const EMPTY_ITEM: ExpenseItem = { date: '', description: '', amount: 0, note: '' }

// 데스크탑 셀 input 스타일
const cellInput = `w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-0 bg-transparent disabled:bg-gray-50 border-0 outline-none`

function formatAmount(n: number) {
  return n ? n.toLocaleString() : ''
}

export default function ExpenseClaimForm({ data, onChange, disabled = false }: Props) {
  const totalAmount = data.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const updateItem = useCallback((idx: number, field: keyof ExpenseItem, value: string | number) => {
    const newItems = [...data.items]
    newItems[idx] = { ...newItems[idx], [field]: value }
    onChange({ ...data, items: newItems })
  }, [data, onChange])

  const addItem = () => {
    onChange({ ...data, items: [...data.items, { ...EMPTY_ITEM }] })
    setExpandedIdx(data.items.length) // 새 항목 바로 펼침
  }
  const removeItem = (idx: number) => {
    if (data.items.length <= 1) return
    onChange({ ...data, items: data.items.filter((_, i) => i !== idx) })
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  return (
    <div className="space-y-4 font-sans">
      {/* ── 데스크탑: 기존 테이블 레이아웃 ── */}
      <div className="hidden md:block space-y-4">
        {/* 기본 정보 */}
        <div className="border border-black">
          <div className="grid grid-cols-2 divide-x divide-black">
            <div className="grid grid-cols-[80px_1fr] divide-x divide-black">
              <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center whitespace-nowrap">작 성 자</div>
              <input className={cellInput} value={data.writer} onChange={e => onChange({ ...data, writer: e.target.value })} disabled={disabled} placeholder="작성자" />
            </div>
            <div className="grid grid-cols-[80px_1fr] divide-x divide-black">
              <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center whitespace-nowrap">작성일자</div>
              <input type="date" className={cellInput} value={data.written_date} onChange={e => onChange({ ...data, written_date: e.target.value })} disabled={disabled} />
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-black border-t border-black">
            <div className="grid grid-cols-[80px_1fr] divide-x divide-black">
              <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center whitespace-nowrap">부 서 명</div>
              <input className={cellInput} value={data.department} onChange={e => onChange({ ...data, department: e.target.value })} disabled={disabled} placeholder="부서명" />
            </div>
            <div className="grid grid-cols-[80px_1fr] divide-x divide-black">
              <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center whitespace-nowrap">비 고</div>
              <input className={cellInput} value={data.note} onChange={e => onChange({ ...data, note: e.target.value })} disabled={disabled} placeholder="비고" />
            </div>
          </div>
          <div className="grid grid-cols-[80px_1fr] divide-x divide-black border-t border-black">
            <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center whitespace-nowrap">지출금액</div>
            <div className="px-3 py-2 text-sm font-medium text-right pr-4">{totalAmount.toLocaleString()} 원</div>
          </div>
        </div>

        {/* 지출내역 테이블 */}
        <div className="border border-black">
          <div className="text-center py-2 font-bold text-sm border-b border-black bg-gray-50">지출내역</div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black bg-gray-50">
                <th className="border-r border-black px-2 py-2 text-sm font-bold w-28">날짜</th>
                <th className="border-r border-black px-2 py-2 text-sm font-bold">적요</th>
                <th className="border-r border-black px-2 py-2 text-sm font-bold w-32">금액</th>
                <th className={`px-2 py-2 text-sm font-bold w-32 ${!disabled ? 'border-r border-black' : ''}`}>비고</th>
                {!disabled && <th className="px-2 py-2 w-10" />}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx} className="border-b border-black last:border-b-0">
                  <td className="border-r border-black p-0">
                    <input type="date" className={cellInput} value={item.date} onChange={e => updateItem(idx, 'date', e.target.value)} disabled={disabled} />
                  </td>
                  <td className="border-r border-black p-0">
                    <input className={cellInput} value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} disabled={disabled} placeholder="적요" />
                  </td>
                  <td className="border-r border-black p-0">
                    <input
                      type="text" inputMode="numeric"
                      className={`${cellInput} text-right`}
                      value={formatAmount(item.amount)}
                      onChange={e => {
                        const raw = e.target.value.replace(/,/g, '')
                        updateItem(idx, 'amount', raw === '' ? 0 : parseInt(raw, 10) || 0)
                      }}
                      disabled={disabled} placeholder="0"
                    />
                  </td>
                  <td className={`p-0 ${!disabled ? 'border-r border-black' : ''}`}>
                    <input className={cellInput} value={item.note} onChange={e => updateItem(idx, 'note', e.target.value)} disabled={disabled} />
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
                <td colSpan={2} className="border-r border-black text-center py-2 font-bold text-sm">합계</td>
                <td className="border-r border-black text-right px-2 py-2 font-bold text-sm">{totalAmount.toLocaleString()}</td>
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

        <p className="text-center text-sm text-gray-600 pt-2">위 금액을 청구하오니 결재하여 주시기 바랍니다.</p>
      </div>

      {/* ── 모바일: 카드형 레이아웃 ── */}
      <div className="md:hidden space-y-4">
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">작성자</label>
            <input
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              value={data.writer} onChange={e => onChange({ ...data, writer: e.target.value })}
              disabled={disabled} placeholder="작성자"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">부서명</label>
            <input
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              value={data.department} onChange={e => onChange({ ...data, department: e.target.value })}
              disabled={disabled} placeholder="부서명"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">작성일자</label>
            <input
              type="date"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              value={data.written_date} onChange={e => onChange({ ...data, written_date: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">비고</label>
            <input
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              value={data.note} onChange={e => onChange({ ...data, note: e.target.value })}
              disabled={disabled} placeholder="비고"
            />
          </div>
        </div>

        {/* 합계 */}
        <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
          <span className="text-sm font-semibold text-blue-700">지출 합계</span>
          <span className="text-lg font-bold text-blue-700">{totalAmount.toLocaleString()}원</span>
        </div>

        {/* 지출 항목 카드 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">지출내역</p>
          {data.items.map((item, idx) => {
            const isExpanded = expandedIdx === idx
            return (
              <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* 요약 헤더 */}
                <button
                  type="button"
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{item.date || '날짜 미입력'}</span>
                      {item.description && (
                        <span className="text-sm font-medium text-gray-800 truncate">{item.description}</span>
                      )}
                    </div>
                    {item.amount > 0 && (
                      <span className="text-sm font-bold text-gray-900">{item.amount.toLocaleString()}원</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {!disabled && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removeItem(idx) }}
                        disabled={data.items.length <= 1}
                        className="text-red-400 active:text-red-600 p-1 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                </button>

                {/* 상세 입력 (펼침) */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">날짜</label>
                        <input
                          type="date"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
                          value={item.date}
                          onChange={e => updateItem(idx, 'date', e.target.value)}
                          disabled={disabled}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">금액</label>
                        <input
                          type="text" inputMode="numeric"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
                          value={formatAmount(item.amount)}
                          onChange={e => {
                            const raw = e.target.value.replace(/,/g, '')
                            updateItem(idx, 'amount', raw === '' ? 0 : parseInt(raw, 10) || 0)
                          }}
                          disabled={disabled} placeholder="0"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">적요</label>
                      <input
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
                        value={item.description}
                        onChange={e => updateItem(idx, 'description', e.target.value)}
                        disabled={disabled} placeholder="지출 내용"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">비고</label>
                      <input
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
                        value={item.note}
                        onChange={e => updateItem(idx, 'note', e.target.value)}
                        disabled={disabled} placeholder="비고"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!disabled && (
          <button
            onClick={addItem}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-blue-600 font-medium active:bg-gray-50"
          >
            <Plus className="w-4 h-4" />항목 추가
          </button>
        )}
      </div>
    </div>
  )
}
