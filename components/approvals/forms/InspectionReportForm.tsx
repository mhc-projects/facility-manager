// 검수보고서 전자결재 양식 - 검수물품 목록과 검수사진(이미지 미리보기) 입력
'use client'

import { useCallback } from 'react'
import { Plus, Trash2, X, FileText, File } from 'lucide-react'
import FileUploadArea from '../FileUploadArea'
import type { AttachmentFile } from './ExpenseClaimForm'

export interface InspectionItem {
  seq: number
  name: string    // 품명
  spec: string    // 규격/형식
  unit: string    // 단위
  quantity: number
  result: string  // 검수결과
}

export interface InspectionReportData {
  inspection_date: string     // 검수일자
  department: string          // 검수부서
  inspector_name: string      // 검수자
  inspector_position: string  // 직급
  usage_department: string    // 사용부서
  usage_purpose: string       // 사용목적
  items: InspectionItem[]     // 검수물품
  attachments?: AttachmentFile[]  // 검수사진
}

interface Props {
  data: InspectionReportData
  onChange: (data: InspectionReportData) => void
  disabled?: boolean
  onFileUpload?: (file: File) => Promise<AttachmentFile>
  onFileDelete?: (attachment: AttachmentFile) => Promise<void>
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function FileIcon({ type }: { type?: string }) {
  if (type === 'application/pdf') return <FileText className="w-4 h-4 text-red-500 shrink-0" />
  return <File className="w-4 h-4 text-blue-500 shrink-0" />
}

const cellInput = `w-full px-2 py-1.5 text-sm focus:outline-none bg-transparent disabled:bg-gray-50 border-0 outline-none`
const labelCell = `px-3 py-2 bg-gray-50 text-sm font-bold flex items-center justify-center whitespace-nowrap`
const mobileInput = `w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50`

const EMPTY_ITEM: InspectionItem = { seq: 1, name: '', spec: '', unit: '', quantity: 0, result: '' }

export default function InspectionReportForm({ data, onChange, disabled = false, onFileUpload, onFileDelete }: Props) {
  const attachments = data.attachments || []

  const update = useCallback((field: keyof InspectionReportData, value: any) => {
    onChange({ ...data, [field]: value })
  }, [data, onChange])

  const updateItem = useCallback((idx: number, field: keyof InspectionItem, value: string | number) => {
    const next = [...data.items]
    next[idx] = { ...next[idx], [field]: value }
    update('items', next)
  }, [data.items, update])

  const addItem = () => update('items', [...data.items, { ...EMPTY_ITEM, seq: data.items.length + 1 }])
  const removeItem = (idx: number) => {
    if (data.items.length <= 1) return
    update('items', data.items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, seq: i + 1 })))
  }

  const numInput = (val: number, onChangeFn: (v: number) => void) => (
    <input
      type="text" inputMode="numeric"
      className={`${cellInput} text-right`}
      value={val ? val.toLocaleString() : ''}
      onChange={e => { const raw = e.target.value.replace(/,/g, ''); onChangeFn(raw === '' ? 0 : parseInt(raw, 10) || 0) }}
      disabled={disabled}
    />
  )

  const mobileNumInput = (val: number, onChangeFn: (v: number) => void) => (
    <input
      type="text" inputMode="numeric"
      className={`${mobileInput} text-right`}
      value={val ? val.toLocaleString() : ''}
      onChange={e => { const raw = e.target.value.replace(/,/g, ''); onChangeFn(raw === '' ? 0 : parseInt(raw, 10) || 0) }}
      disabled={disabled}
      placeholder="0"
    />
  )

  const handleFiles = async (files: File[]) => {
    if (!onFileUpload) return
    for (const file of files) {
      try {
        const uploaded = await onFileUpload(file)
        update('attachments', [...(data.attachments || []), uploaded])
      } catch (err: any) {
        alert(err?.message || '파일 업로드에 실패했습니다')
      }
    }
  }

  const handleFileDelete = async (attachment: AttachmentFile) => {
    if (!onFileDelete) return
    try {
      await onFileDelete(attachment)
      update('attachments', attachments.filter(a => a.id !== attachment.id))
    } catch (err: any) {
      alert(err?.message || '파일 삭제에 실패했습니다')
    }
  }

  // 검수사진: 이미지는 썸네일 미리보기, 그 외 파일은 아이콘 목록으로 표시
  const PhotoGrid = () => {
    const images = attachments.filter(a => a.type?.startsWith('image/'))
    const others = attachments.filter(a => !a.type?.startsWith('image/'))
    return (
      <div className="space-y-3">
        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map(att => (
              <div key={att.id} className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                <a href={att.url} target="_blank" rel="noopener noreferrer" title={att.name}>
                  <img src={att.url} alt={att.name} className="w-full aspect-square object-cover" />
                </a>
                {!disabled && onFileDelete && (
                  <button
                    type="button"
                    onClick={() => handleFileDelete(att)}
                    className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="px-2 py-1 text-xs text-gray-500 truncate bg-white border-t border-gray-100">{att.name}</div>
              </div>
            ))}
          </div>
        )}

        {others.length > 0 && (
          <div className="space-y-2">
            {others.map(att => (
              <div key={att.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <FileIcon type={att.type} />
                <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-blue-600 hover:underline truncate">
                  {att.name}
                </a>
                <span className="text-xs text-gray-400 shrink-0">{formatFileSize(att.size)}</span>
                {!disabled && onFileDelete && (
                  <button type="button" onClick={() => handleFileDelete(att)} className="text-gray-400 hover:text-red-500 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!disabled && onFileUpload && <FileUploadArea onFiles={handleFiles} />}

        {disabled && attachments.length === 0 && (
          <p className="text-sm text-gray-400 italic">첨부된 검수사진이 없습니다</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5 font-sans">
      {/* ── 데스크탑 ── */}
      <div className="hidden md:block space-y-5">
        {/* 기본 정보 */}
        <div className="border border-black">
          <div className="grid grid-cols-[90px_1fr_90px_1fr] divide-x divide-black border-b border-black">
            <div className={labelCell}>검수일자</div>
            <input type="date" className={cellInput} value={data.inspection_date}
              onChange={e => update('inspection_date', e.target.value)} disabled={disabled} />
            <div className={labelCell}>검수부서</div>
            <input className={cellInput} value={data.department}
              onChange={e => update('department', e.target.value)} disabled={disabled} placeholder="검수부서" />
          </div>
          <div className="grid grid-cols-[90px_1fr_90px_1fr] divide-x divide-black border-b border-black">
            <div className={labelCell}>검 수 자</div>
            <input className={cellInput} value={data.inspector_name}
              onChange={e => update('inspector_name', e.target.value)} disabled={disabled} placeholder="검수자 성명" />
            <div className={labelCell}>직 급</div>
            <input className={cellInput} value={data.inspector_position}
              onChange={e => update('inspector_position', e.target.value)} disabled={disabled} placeholder="직급" />
          </div>
          <div className="grid grid-cols-[90px_1fr_90px_1fr] divide-x divide-black">
            <div className={labelCell}>사용부서</div>
            <input className={cellInput} value={data.usage_department}
              onChange={e => update('usage_department', e.target.value)} disabled={disabled} placeholder="사용부서" />
            <div className={labelCell}>사용목적</div>
            <input className={cellInput} value={data.usage_purpose}
              onChange={e => update('usage_purpose', e.target.value)} disabled={disabled} placeholder="사용목적" />
          </div>
        </div>

        {/* 검수물품 */}
        <div>
          <div className="text-sm font-bold mb-1.5">1. 검수물품</div>
          <div className="border border-black overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-black">
                  <th className="border-r border-black px-2 py-2 text-sm font-bold w-12">NO</th>
                  <th className="border-r border-black px-2 py-2 text-sm font-bold">품명</th>
                  <th className="border-r border-black px-2 py-2 text-sm font-bold w-32">규격/형식</th>
                  <th className="border-r border-black px-2 py-2 text-sm font-bold w-16">단위</th>
                  <th className="border-r border-black px-2 py-2 text-sm font-bold w-16">수량</th>
                  <th className={`px-2 py-2 text-sm font-bold w-48 ${!disabled ? 'border-r border-black' : ''}`}>검수결과</th>
                  {!disabled && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-black last:border-b-0">
                    <td className="border-r border-black text-center text-sm py-1.5">{item.seq}</td>
                    <td className="border-r border-black p-0">
                      <input className={cellInput} value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} disabled={disabled} placeholder="품명" />
                    </td>
                    <td className="border-r border-black p-0">
                      <input className={cellInput} value={item.spec} onChange={e => updateItem(idx, 'spec', e.target.value)} disabled={disabled} placeholder="규격/형식" />
                    </td>
                    <td className="border-r border-black p-0">
                      <input className={cellInput} value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} disabled={disabled} placeholder="개" />
                    </td>
                    <td className="border-r border-black p-0">{numInput(item.quantity, v => updateItem(idx, 'quantity', v))}</td>
                    <td className={`p-0 align-top ${!disabled ? 'border-r border-black' : ''}`}>
                      <textarea
                        className={`${cellInput} resize-none overflow-hidden leading-snug`}
                        rows={1}
                        value={item.result}
                        onChange={e => { updateItem(idx, 'result', e.target.value); autoResize(e.target) }}
                        onFocus={e => autoResize(e.target)}
                        ref={el => { if (el) autoResize(el) }}
                        disabled={disabled}
                        placeholder="검수결과"
                      />
                    </td>
                    {!disabled && (
                      <td className="text-center">
                        <button type="button" onClick={() => removeItem(idx)} disabled={data.items.length <= 1} className="text-red-400 hover:text-red-600 p-1 disabled:opacity-30">
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
            <button type="button" onClick={addItem} className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
              <Plus className="w-4 h-4" />행 추가
            </button>
          )}
        </div>

        {/* 검수사진 */}
        <div className="no-print">
          <div className="text-sm font-bold mb-1.5">2. 검수사진</div>
          <div className="border border-black p-3">
            <PhotoGrid />
          </div>
        </div>
      </div>

      {/* ── 모바일 ── */}
      <div className="md:hidden space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">검수일자</label>
            <input type="date" className={mobileInput} value={data.inspection_date} onChange={e => update('inspection_date', e.target.value)} disabled={disabled} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">검수부서</label>
            <input className={mobileInput} value={data.department} onChange={e => update('department', e.target.value)} disabled={disabled} placeholder="검수부서" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">검수자</label>
            <input className={mobileInput} value={data.inspector_name} onChange={e => update('inspector_name', e.target.value)} disabled={disabled} placeholder="검수자 성명" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">직급</label>
            <input className={mobileInput} value={data.inspector_position} onChange={e => update('inspector_position', e.target.value)} disabled={disabled} placeholder="직급" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">사용부서</label>
            <input className={mobileInput} value={data.usage_department} onChange={e => update('usage_department', e.target.value)} disabled={disabled} placeholder="사용부서" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">사용목적</label>
            <input className={mobileInput} value={data.usage_purpose} onChange={e => update('usage_purpose', e.target.value)} disabled={disabled} placeholder="사용목적" />
          </div>
        </div>

        {/* 검수물품 카드 */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">검수물품</p>
          {data.items.map((item, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-400">품목 {item.seq}</span>
                {!disabled && (
                  <button type="button" onClick={() => removeItem(idx)} disabled={data.items.length <= 1} className="text-red-400 active:text-red-600 p-1 disabled:opacity-30">
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
                  <label className="block text-xs text-gray-500 mb-1">규격/형식</label>
                  <input className={mobileInput} value={item.spec} onChange={e => updateItem(idx, 'spec', e.target.value)} disabled={disabled} placeholder="규격/형식" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">단위</label>
                  <input className={mobileInput} value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} disabled={disabled} placeholder="개" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">수량</label>
                {mobileNumInput(item.quantity, v => updateItem(idx, 'quantity', v))}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">검수결과</label>
                <textarea
                  className={`${mobileInput} resize-none overflow-hidden leading-snug`}
                  rows={2}
                  value={item.result}
                  onChange={e => { updateItem(idx, 'result', e.target.value); autoResize(e.target) }}
                  onFocus={e => autoResize(e.target)}
                  ref={el => { if (el) autoResize(el) }}
                  disabled={disabled}
                  placeholder="검수결과를 입력하세요"
                />
              </div>
            </div>
          ))}
          {!disabled && (
            <button type="button" onClick={addItem} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-blue-600 font-medium active:bg-gray-50">
              <Plus className="w-4 h-4" />품목 추가
            </button>
          )}
        </div>

        {/* 검수사진 */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500">검수사진</label>
          <PhotoGrid />
        </div>
      </div>
    </div>
  )
}
