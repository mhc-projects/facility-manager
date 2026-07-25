'use client'
// 영업비 마감 결재 문서 상세 내용을 읽기전용/수정 모드로 보여주는 폼 (InstallationClosingForm과 동일 패턴)

export interface CommissionClosingItem {
  id: string
  business_id: string
  business_name?: string
  sales_office: string
  progress_type: string
  actual_amount: number
}

export interface CommissionClosingData {
  writer: string
  department: string
  written_date: string
  payment_month: string
  commission_payment_ids: string[]
  sales_offices: string[]
  total_count: number
  total_amount: number
  items: CommissionClosingItem[]
  note: string
}

interface Props {
  data: CommissionClosingData
  onChange: (data: CommissionClosingData) => void
  disabled?: boolean
}

const PROGRESS_TYPE_LABELS: Record<string, string> = {
  self: '자비',
  subsidy: '보조금',
  subsidy_parallel: '보조금동시',
  subsidy_extra: '추가승인',
  dealer: '대리점',
  outsourcing: '외주',
  etc: '기타',
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}

export default function CommissionClosingForm({ data, onChange, disabled }: Props) {
  if (!data) return null

  const officeLabel = data.sales_offices?.length
    ? data.sales_offices.join(', ')
    : '-'

  return (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">작성자</label>
          <div className="text-sm font-medium text-gray-900">{data.writer}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">부서</label>
          <div className="text-sm font-medium text-gray-900">{data.department}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">귀속 월</label>
          <div className="text-sm font-medium text-gray-900">{data.payment_month}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">영업점</label>
          <div className="text-sm font-medium text-gray-900">{officeLabel}</div>
        </div>
      </div>

      {/* 요약 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            총 <span className="font-semibold text-gray-900">{data.total_count}건</span>
          </div>
          <div className="text-sm text-gray-600">
            총 지급액 <span className="font-bold text-blue-600 text-lg">{formatCurrency(data.total_amount)}원</span>
          </div>
        </div>
      </div>

      {/* 상세 내역 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">영업비 마감 상세 내역</h4>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">No</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">사업장명</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">영업점</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">유형</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">지급액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 text-sm text-gray-900">{item.business_name || '(사업장명 없음)'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 text-center">{item.sales_office}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 text-center">
                    {PROGRESS_TYPE_LABELS[item.progress_type] ?? item.progress_type}
                  </td>
                  <td className="px-3 py-2 text-sm font-semibold text-gray-900 text-right tabular-nums">{formatCurrency(item.actual_amount)}</td>
                </tr>
              ))}
              {/* 합계행 */}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-sm text-gray-700" colSpan={3}>합계</td>
                <td className="px-3 py-2 text-sm font-bold text-blue-600 text-right tabular-nums">
                  {formatCurrency(data.total_amount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 비고 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">비고</label>
        {disabled ? (
          <div className="text-sm text-gray-700 whitespace-pre-wrap">{data.note || '-'}</div>
        ) : (
          <textarea
            value={data.note || ''}
            onChange={(e) => onChange({ ...data, note: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="특이사항 입력"
          />
        )}
      </div>
    </div>
  )
}
