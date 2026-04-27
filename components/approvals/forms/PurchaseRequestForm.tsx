'use client'

import { useCallback, useRef } from 'react'
import { Plus, Trash2, Paperclip, X, FileText, Image, File } from 'lucide-react'

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

export interface PurchaseItem {
  seq: number
  name: string
  quantity: number
  unit_price: number
  estimated_amount: number
  reason: string
}

export interface AttachmentFile {
  id: string
  name: string
  url: string
  size: number
  type?: string
  path?: string
  uploaded_at: string
}

export interface PurchaseRequestData {
  writer: string
  department: string
  written_date: string
  estimated_total: number
  special_notes: string
  attachment_included: boolean
  attachments?: AttachmentFile[]
  items: PurchaseItem[]
}

interface Props {
  data: PurchaseRequestData
  onChange: (data: PurchaseRequestData) => void
  disabled?: boolean
  onFileUpload?: (file: File) => Promise<AttachmentFile>
  onFileDelete?: (attachment: AttachmentFile) => Promise<void>
}

const cellInput = `w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-0 bg-transparent disabled:bg-gray-50 border-0 outline-none`
const mobileInput = `w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50`
const mobileInputRight = `${mobileInput} text-right`

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

export default function PurchaseRequestForm({ data, onChange, disabled = false, onFileUpload, onFileDelete }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const estimatedTotal = data.items.reduce((sum, item) => sum + (Number(item.estimated_amount) || 0), 0)
  const totalQty = data.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  const attachments = data.attachments || []

  const updateItem = useCallback((idx: number, field: keyof PurchaseItem, value: string | number) => {
    const newItems = [...data.items]
    const updated = { ...newItems[idx], [field]: value }
    if (field === 'quantity' || field === 'unit_price') {
      updated.estimated_amount = (Number(field === 'quantity' ? value : updated.quantity) || 0)
        * (Number(field === 'unit_price' ? value : updated.unit_price) || 0)
    }
    newItems[idx] = updated
    onChange({ ...data, items: newItems, estimated_total: newItems.reduce((s, i) => s + (Number(i.estimated_amount) || 0), 0) })
  }, [data, onChange])

  const addItem = () => {
    const seq = data.items.length + 1
    onChange({ ...data, items: [...data.items, { seq, name: '', quantity: 0, unit_price: 0, estimated_amount: 0, reason: '' }] })
  }

  const removeItem = (idx: number) => {
    if (data.items.length <= 1) return
    const newItems = data.items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, seq: i + 1 }))
    onChange({ ...data, items: newItems, estimated_total: newItems.reduce((s, i) => s + (Number(i.estimated_amount) || 0), 0) })
  }

  const handleAttachmentToggle = (value: boolean) => {
    if (disabled) return
    onChange({ ...data, attachment_included: value })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onFileUpload) return
    const files = e.target.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      try {
        const uploaded = await onFileUpload(file)
        onChange({
          ...data,
          attachments: [...attachments, uploaded],
        })
      } catch (err: any) {
        alert(err?.message || '파일 업로드에 실패했습니다')
      }
    }
    // input 초기화 (같은 파일 재선택 허용)
    e.target.value = ''
  }

  const handleFileDelete = async (attachment: AttachmentFile) => {
    if (!onFileDelete) return
    try {
      await onFileDelete(attachment)
      onChange({
        ...data,
        attachments: attachments.filter(a => a.id !== attachment.id),
      })
    } catch (err: any) {
      alert(err?.message || '파일 삭제에 실패했습니다')
    }
  }

  const numInput = (val: number, onChangeFn: (v: number) => void, isDisabled: boolean) => (
    <input
      type="text" inputMode="numeric"
      className={`${cellInput} text-right`}
      value={val ? val.toLocaleString() : ''}
      onChange={e => { const raw = e.target.value.replace(/,/g, ''); onChangeFn(raw === '' ? 0 : parseInt(raw, 10) || 0) }}
      disabled={isDisabled}
    />
  )

  const mobileNumInput = (val: number, onChangeFn: (v: number) => void, isDisabled: boolean) => (
    <input
      type="text" inputMode="numeric"
      className={mobileInputRight}
      value={val ? val.toLocaleString() : ''}
      onChange={e => { const raw = e.target.value.replace(/,/g, ''); onChangeFn(raw === '' ? 0 : parseInt(raw, 10) || 0) }}
      disabled={isDisabled}
      placeholder="0"
    />
  )

  // 첨부파일 목록 (데스크탑/모바일 공통)
  const AttachmentList = () => (
    <div className="mt-3 space-y-2">
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
            <button
              type="button"
              onClick={() => handleFileDelete(att)}
              className="text-gray-400 hover:text-red-500 shrink-0"
            >
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
        <p className="text-sm text-gray-400 italic">첨부된 파일이 없습니다</p>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* ── 데스크탑 ── */}
      <div className="hidden md:block space-y-4">
        {/* 기본 정보 */}
        <div className="border border-black">
          <div className="grid grid-cols-2 divide-x divide-black">
            <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
              <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">작성자</div>
              <input className={cellInput} value={data.writer} onChange={e => onChange({ ...data, writer: e.target.value })} disabled={disabled} placeholder="작성자" />
            </div>
            <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
              <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">작성일자</div>
              <input type="date" className={cellInput} value={data.written_date} onChange={e => onChange({ ...data, written_date: e.target.value })} disabled={disabled} />
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-black border-t border-black">
            <div className="grid grid-cols-[70px_1fr] divide-x divide-black">
              <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center">부서명</div>
              <input className={cellInput} value={data.department} onChange={e => onChange({ ...data, department: e.target.value })} disabled={disabled} placeholder="부서명" />
            </div>
            <div className="grid grid-cols-[100px_1fr] divide-x divide-black">
              <div className="px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center whitespace-nowrap">구매 예상 금액</div>
              <div className="px-3 py-2 text-sm font-medium text-right">{estimatedTotal.toLocaleString()} 원</div>
            </div>
          </div>
        </div>

        {/* 품목 테이블 */}
        <div className="border border-black">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black bg-gray-50">
                <th className="border-r border-black px-2 py-2 text-sm font-bold w-10">연번</th>
                <th className="border-r border-black px-2 py-2 text-sm font-bold">품명</th>
                <th className="border-r border-black px-2 py-2 text-sm font-bold w-16">수량</th>
                <th className="border-r border-black px-2 py-2 text-sm font-bold w-24">단가</th>
                <th className="border-r border-black px-2 py-2 text-sm font-bold w-28">예상금액</th>
                <th className={`px-2 py-2 text-sm font-bold ${!disabled ? 'border-r border-black' : ''}`}>구매사유</th>
                {!disabled && <th className="px-2 py-2 w-10" />}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx} className="border-b border-black last:border-b-0">
                  <td className="border-r border-black text-center text-sm py-1.5">{item.seq}</td>
                  <td className="border-r border-black p-0">
                    <input className={cellInput} value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} disabled={disabled} placeholder="품명" />
                  </td>
                  <td className="border-r border-black p-0">{numInput(item.quantity, v => updateItem(idx, 'quantity', v), disabled)}</td>
                  <td className="border-r border-black p-0">{numInput(item.unit_price, v => updateItem(idx, 'unit_price', v), disabled)}</td>
                  <td className="border-r border-black">
                    <div className="px-2 py-1.5 text-sm text-right">{(item.estimated_amount || 0).toLocaleString()}</div>
                  </td>
                  <td className={`p-0 align-top ${!disabled ? 'border-r border-black' : ''}`}>
                    <textarea
                      className={`${cellInput} resize-none overflow-hidden leading-snug`}
                      rows={1}
                      value={item.reason}
                      onChange={e => { updateItem(idx, 'reason', e.target.value); autoResize(e.target) }}
                      onFocus={e => autoResize(e.target)}
                      ref={el => { if (el) autoResize(el) }}
                      disabled={disabled}
                      placeholder="구매사유"
                    />
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
                <td className="border-r border-black text-right px-2 py-2 font-bold text-sm">{totalQty.toLocaleString()}</td>
                <td className="border-r border-black" />
                <td className="border-r border-black text-right px-2 py-2 font-bold text-sm">{estimatedTotal.toLocaleString()}</td>
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

        {/* 특이사항/첨부 */}
        <div className="border border-black">
          <div className="grid grid-cols-[80px_1fr] divide-x divide-black">
            <div className="px-3 py-3 bg-gray-50 text-sm font-bold flex items-center justify-center">특이사항</div>
            <div className="p-3">
              <textarea className="w-full text-sm resize-none focus:outline-none bg-transparent disabled:text-gray-700" rows={3} value={data.special_notes} onChange={e => onChange({ ...data, special_notes: e.target.value })} disabled={disabled} placeholder="상기와 같이 물품 구매를 요청합니다." />
              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm text-gray-600">견적서 첨부:</span>
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" checked={data.attachment_included} onChange={() => handleAttachmentToggle(true)} disabled={disabled} />여
                </label>
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" checked={!data.attachment_included} onChange={() => handleAttachmentToggle(false)} disabled={disabled} />부
                </label>
              </div>

              {/* 견적서 '여' 선택 시 파일 업로드 영역 */}
              {data.attachment_included && (
                <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                    <Paperclip className="w-3.5 h-3.5" />
                    첨부 파일 (PDF, 이미지, Excel, Word)
                  </p>
                  <AttachmentList />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 모바일 ── */}
      <div className="md:hidden space-y-4">
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">작성자</label>
            <input className={mobileInput} value={data.writer} onChange={e => onChange({ ...data, writer: e.target.value })} disabled={disabled} placeholder="작성자" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">부서명</label>
            <input className={mobileInput} value={data.department} onChange={e => onChange({ ...data, department: e.target.value })} disabled={disabled} placeholder="부서명" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1">작성일자</label>
            <input type="date" className={mobileInput} value={data.written_date} onChange={e => onChange({ ...data, written_date: e.target.value })} disabled={disabled} />
          </div>
        </div>

        {/* 합계 */}
        <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
          <span className="text-sm font-semibold text-blue-700">구매 예상 합계</span>
          <span className="text-lg font-bold text-blue-700">{estimatedTotal.toLocaleString()}원</span>
        </div>

        {/* 품목 카드 */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">구매 품목</p>
          {data.items.map((item, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-400">품목 {item.seq}</span>
                {!disabled && (
                  <button onClick={() => removeItem(idx)} disabled={data.items.length <= 1} className="text-red-400 active:text-red-600 p-1 disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">품명</label>
                <input className={mobileInput} value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} disabled={disabled} placeholder="품명" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">수량</label>
                  {mobileNumInput(item.quantity, v => updateItem(idx, 'quantity', v), disabled)}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">단가</label>
                  {mobileNumInput(item.unit_price, v => updateItem(idx, 'unit_price', v), disabled)}
                </div>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-500">예상 금액</span>
                <span className="text-sm font-bold text-gray-900">{(item.estimated_amount || 0).toLocaleString()}원</span>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">구매 사유</label>
                <textarea
                  className={`${mobileInput} resize-none overflow-hidden leading-snug`}
                  rows={2}
                  value={item.reason}
                  onChange={e => { updateItem(idx, 'reason', e.target.value); autoResize(e.target) }}
                  onFocus={e => autoResize(e.target)}
                  ref={el => { if (el) autoResize(el) }}
                  disabled={disabled}
                  placeholder="구매 사유를 입력하세요"
                />
              </div>
            </div>
          ))}
        </div>

        {!disabled && (
          <button onClick={addItem} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-blue-600 font-medium active:bg-gray-50">
            <Plus className="w-4 h-4" />품목 추가
          </button>
        )}

        {/* 특이사항 */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500">특이사항</label>
          <textarea
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            rows={3} value={data.special_notes}
            onChange={e => onChange({ ...data, special_notes: e.target.value })}
            disabled={disabled} placeholder="상기와 같이 물품 구매를 요청합니다."
          />
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">견적서 첨부</span>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={data.attachment_included} onChange={() => handleAttachmentToggle(true)} disabled={disabled} />여
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={!data.attachment_included} onChange={() => handleAttachmentToggle(false)} disabled={disabled} />부
            </label>
          </div>

          {/* 견적서 '여' 선택 시 파일 업로드 영역 */}
          {data.attachment_included && (
            <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5" />
                첨부 파일 (PDF, 이미지, Excel, Word)
              </p>
              <AttachmentList />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
