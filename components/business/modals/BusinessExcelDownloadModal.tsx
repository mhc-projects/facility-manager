'use client'

import React, { useState } from 'react'
import { X, Download, CheckSquare, Square } from 'lucide-react'

interface UnifiedBusinessInfo {
  [key: string]: any
}

interface BusinessExcelDownloadModalProps {
  isOpen: boolean
  onClose: () => void
  businesses: UnifiedBusinessInfo[]
  totalCount: number
}

interface ColumnDef {
  key: string
  label: string
  default?: boolean
  width?: number
  type?: 'text' | 'number' | 'date'
}

interface ColumnGroup {
  label: string
  columns: ColumnDef[]
}

const COLUMN_GROUPS: ColumnGroup[] = [
  {
    label: '기본 정보',
    columns: [
      { key: 'business_name', label: '사업장명', default: true, width: 24 },
      { key: 'manager_name', label: '담당자명', default: true, width: 14 },
      { key: 'manager_contact', label: '담당자 연락처', default: true, width: 16 },
      { key: 'sales_office', label: '영업점', default: true, width: 12 },
      { key: 'address', label: '주소', default: true, width: 30 },
      { key: 'progress_status', label: '진행구분', default: true, width: 14 },
      { key: 'project_year', label: '사업 진행연도', default: true, width: 14 },
      { key: 'business_registration_number', label: '사업자등록번호', default: true, width: 16 },
      { key: 'business_type', label: '업종', width: 14 },
      { key: 'local_government', label: '지자체', width: 14 },
      { key: 'manufacturer', label: '제조사', width: 14 },
      { key: 'representative_name', label: '대표자명', width: 14 },
      { key: 'manager_position', label: '담당자 직급', width: 12 },
      { key: 'fax_number', label: '팩스번호', width: 14 },
      { key: 'email', label: '이메일', width: 20 },
      { key: 'business_contact', label: '사업장 연락처', width: 16 },
      { key: 'business_management_code', label: '사업장관리코드', width: 16 },
      { key: 'is_active', label: '활성여부', width: 10 },
    ],
  },
  {
    label: '설치/장비 정보',
    columns: [
      { key: 'installation_date', label: '설치일', width: 14, type: 'date' },
      { key: 'installation_team', label: '설치팀', width: 12 },
      { key: 'revenue_source', label: '매출처', width: 20 },
      { key: 'additional_cost', label: '추가공사비', width: 14, type: 'number' },
      { key: 'installation_extra_cost', label: '추가설치비', width: 14, type: 'number' },
      { key: 'ph_meter', label: 'pH계', width: 10, type: 'number' },
      { key: 'differential_pressure_meter', label: '차압계', width: 10, type: 'number' },
      { key: 'temperature_meter', label: '온도계', width: 10, type: 'number' },
      { key: 'discharge_current_meter', label: '배출전류계', width: 12, type: 'number' },
      { key: 'fan_current_meter', label: '송풍전류계', width: 12, type: 'number' },
      { key: 'pump_current_meter', label: '펌프전류계', width: 12, type: 'number' },
      { key: 'gateway_1_2', label: '게이트웨이(1,2)', width: 14, type: 'number' },
      { key: 'gateway_3_4', label: '게이트웨이(3,4)', width: 14, type: 'number' },
      { key: 'vpn_wired', label: 'VPN유선', width: 10, type: 'number' },
      { key: 'vpn_wireless', label: 'VPN무선', width: 10, type: 'number' },
      { key: 'expansion_device', label: '확장디바이스', width: 12, type: 'number' },
      { key: 'relay_8ch', label: '중계기8채널', width: 12, type: 'number' },
      { key: 'relay_16ch', label: '중계기16채널', width: 12, type: 'number' },
      { key: 'multiple_stack', label: '복수굴뚝', width: 10, type: 'number' },
      { key: 'multiple_stack_cost', label: '복수굴뚝비용', width: 14, type: 'number' },
      { key: 'main_board_replacement', label: '메인보드교체', width: 12, type: 'number' },
      { key: 'explosion_proof_differential_pressure_meter_domestic', label: '방폭차압계(국산)', width: 16, type: 'number' },
      { key: 'explosion_proof_temperature_meter_domestic', label: '방폭온도계(국산)', width: 16, type: 'number' },
      { key: 'expansion_pack', label: '확장팩', width: 10, type: 'number' },
      { key: 'greenlink_id', label: '그린링크ID', width: 16 },
      { key: 'greenlink_pw', label: '그린링크PW', width: 16 },
    ],
  },
  {
    label: '계약/재무 정보',
    columns: [
      { key: 'invoice_1st_amount', label: '계산서1차금액', width: 16, type: 'number' },
      { key: 'invoice_1st_date', label: '계산서1차발행일', width: 16, type: 'date' },
      { key: 'invoice_2nd_amount', label: '계산서2차금액', width: 16, type: 'number' },
      { key: 'invoice_2nd_date', label: '계산서2차발행일', width: 16, type: 'date' },
      { key: 'invoice_advance_amount', label: '계산서선급금액', width: 16, type: 'number' },
      { key: 'invoice_advance_date', label: '계산서선급발행일', width: 16, type: 'date' },
      { key: 'invoice_balance_amount', label: '계산서잔금금액', width: 16, type: 'number' },
      { key: 'invoice_balance_date', label: '계산서잔금발행일', width: 16, type: 'date' },
      { key: 'invoice_additional_date', label: '계산서추가발행일', width: 16, type: 'date' },
      { key: 'payment_1st_amount', label: '입금1차금액', width: 14, type: 'number' },
      { key: 'payment_1st_date', label: '입금1차일', width: 14, type: 'date' },
      { key: 'payment_2nd_amount', label: '입금2차금액', width: 14, type: 'number' },
      { key: 'payment_2nd_date', label: '입금2차일', width: 14, type: 'date' },
      { key: 'payment_advance_amount', label: '선급금액', width: 14, type: 'number' },
      { key: 'payment_advance_date', label: '선급입금일', width: 14, type: 'date' },
      { key: 'payment_balance_amount', label: '잔금금액', width: 14, type: 'number' },
      { key: 'payment_balance_date', label: '잔금입금일', width: 14, type: 'date' },
      { key: 'payment_additional_amount', label: '추가입금금액', width: 14, type: 'number' },
      { key: 'payment_additional_date', label: '추가입금일', width: 14, type: 'date' },
      { key: 'payment_scheduled_date', label: '납기예정일', width: 14, type: 'date' },
      { key: 'negotiation', label: '협의/할인', width: 14, type: 'number' },
      { key: 'survey_fee_adjustment', label: '실사비조정', width: 14, type: 'number' },
    ],
  },
  {
    label: '일정 정보',
    columns: [
      { key: 'estimate_survey_date', label: '견적실사일', width: 14, type: 'date' },
      { key: 'estimate_survey_manager', label: '견적실사담당자', width: 14 },
      { key: 'pre_construction_survey_date', label: '착공전실사일', width: 14, type: 'date' },
      { key: 'pre_construction_survey_manager', label: '착공전실사담당자', width: 16 },
      { key: 'completion_survey_date', label: '준공실사일', width: 14, type: 'date' },
      { key: 'completion_survey_manager', label: '준공실사담당자', width: 14 },
      { key: 'contract_sent_date', label: '계약서발송일', width: 14, type: 'date' },
      { key: 'subsidy_approval_date', label: '보조금승인일', width: 14, type: 'date' },
      { key: 'order_request_date', label: '발주요청일', width: 14, type: 'date' },
      { key: 'order_date', label: '발주일', width: 14, type: 'date' },
      { key: 'order_manager', label: '발주담당자', width: 14 },
      { key: 'shipment_date', label: '출하일', width: 14, type: 'date' },
      { key: 'receipt_date', label: '입고일', width: 14, type: 'date' },
      { key: 'greenlink_confirmation_submitted_at', label: '그린링크제출일', width: 16, type: 'date' },
      { key: 'construction_report_submitted_at', label: '공사실적제출일', width: 16, type: 'date' },
      { key: 'attachment_completion_submitted_at', label: '준공서류제출일', width: 16, type: 'date' },
      { key: 'attachment_support_application_date', label: '부착지원신청서신청일', width: 20, type: 'date' },
      { key: 'attachment_support_writing_date', label: '부착지원신청서작성일', width: 20, type: 'date' },
    ],
  },
]

const DEFAULT_COLUMNS = new Set<string>(
  COLUMN_GROUPS.flatMap(g => g.columns.filter(c => c.default).map(c => c.key))
)

function formatCellValue(business: UnifiedBusinessInfo, col: ColumnDef): any {
  const raw = business[col.key]
  if (raw === null || raw === undefined || raw === '') return ''
  if (col.key === 'is_active') return raw ? '활성' : '비활성'
  if (col.type === 'date') {
    return typeof raw === 'string' ? raw.slice(0, 10) : raw
  }
  if (col.type === 'number') {
    const n = Number(raw)
    return isNaN(n) ? '' : n
  }
  return raw
}

export default function BusinessExcelDownloadModal({
  isOpen,
  onClose,
  businesses,
  totalCount,
}: BusinessExcelDownloadModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(DEFAULT_COLUMNS))
  const [isDownloading, setIsDownloading] = useState(false)

  if (!isOpen) return null

  const allColumns = COLUMN_GROUPS.flatMap(g => g.columns)
  const allKeys = allColumns.map(c => c.key)
  const isAllSelected = allKeys.every(k => selectedColumns.has(k))
  const isNoneSelected = allKeys.every(k => !selectedColumns.has(k))

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleGroup = (group: ColumnGroup) => {
    const groupKeys = group.columns.map(c => c.key)
    const allGroupSelected = groupKeys.every(k => selectedColumns.has(k))
    setSelectedColumns(prev => {
      const next = new Set(prev)
      if (allGroupSelected) groupKeys.forEach(k => next.delete(k))
      else groupKeys.forEach(k => next.add(k))
      return next
    })
  }

  const selectAll = () => setSelectedColumns(new Set(allKeys))
  const clearAll = () => setSelectedColumns(new Set())

  const handleDownload = async () => {
    if (selectedColumns.size === 0) {
      alert('다운로드할 항목을 하나 이상 선택해주세요.')
      return
    }
    setIsDownloading(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('사업장관리')

      const selectedCols = allColumns.filter(c => selectedColumns.has(c.key))

      sheet.columns = selectedCols.map(c => ({
        header: c.label,
        key: c.key,
        width: c.width ?? 16,
      }))

      // 헤더 스타일
      sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FF4472C4' } },
        }
      })

      // 데이터 행
      businesses.forEach(b => {
        const rowData: Record<string, any> = {}
        selectedCols.forEach(c => {
          rowData[c.key] = formatCellValue(b, c)
        })
        const row = sheet.addRow(rowData)

        // 숫자 서식
        selectedCols.forEach((c, idx) => {
          if (c.type === 'number') {
            const cell = row.getCell(idx + 1)
            cell.numFmt = '#,##0'
            cell.alignment = { horizontal: 'right' }
          }
        })
      })

      const today = new Date().toISOString().split('T')[0]
      const isFiltered = businesses.length < totalCount
      const fileName = isFiltered
        ? `사업장관리_필터링(${businesses.length}건)_${today}.xlsx`
        : `사업장관리_전체(${businesses.length}건)_${today}.xlsx`

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      link.click()
      URL.revokeObjectURL(link.href)

      onClose()
    } catch (err) {
      console.error('엑셀 다운로드 오류:', err)
      alert('엑셀 다운로드 중 오류가 발생했습니다.')
    } finally {
      setIsDownloading(false)
    }
  }

  const isFiltered = businesses.length < totalCount

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-green-600" />
            <h2 className="text-base font-semibold text-gray-900">엑셀 다운로드</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 안내 + 전체선택 */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-600">
            {isFiltered ? (
              <>
                <span className="font-semibold text-blue-700">{businesses.length}개</span>
                {' '}사업장 (필터링됨, 전체{' '}
                <span className="font-semibold">{totalCount}개</span>
                {')'}을 다운로드합니다.
              </>
            ) : (
              <>
                전체{' '}
                <span className="font-semibold text-blue-700">{businesses.length}개</span>
                {' '}사업장을 다운로드합니다.
              </>
            )}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={selectAll}
              disabled={isAllSelected}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              전체 선택
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={clearAll}
              disabled={isNoneSelected}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              전체 해제
            </button>
            <span className="text-xs text-gray-500 ml-auto">
              {selectedColumns.size}개 항목 선택됨
            </span>
          </div>
        </div>

        {/* 컬럼 선택 */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {COLUMN_GROUPS.map(group => {
            const groupKeys = group.columns.map(c => c.key)
            const allGroupSelected = groupKeys.every(k => selectedColumns.has(k))
            const someGroupSelected = groupKeys.some(k => selectedColumns.has(k))

            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-2"
                >
                  {allGroupSelected ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : someGroupSelected ? (
                    <CheckSquare className="w-4 h-4 text-blue-300" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                  {group.label}
                </button>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {group.columns.map(col => {
                    const checked = selectedColumns.has(col.key)
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-sm transition-colors select-none
                          ${checked
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumn(col.key)}
                          className="sr-only"
                        />
                        {checked ? (
                          <CheckSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        )}
                        <span className="truncate">{col.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading || selectedColumns.size === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDownloading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border border-white border-t-transparent" />
                다운로드 중...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                다운로드 ({businesses.length}건)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
