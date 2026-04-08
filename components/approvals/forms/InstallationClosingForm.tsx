'use client'

export interface InstallationClosingItem {
  business_id: string
  business_name: string
  task_type_label: string
  task_status_label: string
  base_installation_cost: number
  extra_installation_cost: number
  total_amount: number
}

export interface InstallationClosingData {
  writer: string
  department: string
  written_date: string
  closing_type: 'forecast' | 'final'
  closing_month: string
  items: InstallationClosingItem[]
  total_count: number
  total_amount: number
  note: string
}

interface Props {
  data: InstallationClosingData
  onChange: (data: InstallationClosingData) => void
  disabled?: boolean
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}

export default function InstallationClosingForm({ data, onChange, disabled }: Props) {
  if (!data) return null

  const closingLabel = data.closing_type === 'forecast' ? '예측마감' : '본마감'

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
          <label className="block text-xs font-medium text-gray-500 mb-1">마감 유형</label>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            data.closing_type === 'forecast' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
          }`}>
            {closingLabel}
          </span>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">귀속 월</label>
          <div className="text-sm font-medium text-gray-900">{data.closing_month}</div>
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
        <h4 className="text-sm font-semibold text-gray-700 mb-2">{closingLabel} 상세 내역</h4>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">No</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">사업장명</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">유형</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">기본설치비</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">추가설치비</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.items.map((item, idx) => (
                <tr key={item.business_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 text-sm text-gray-900">{item.business_name}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 text-center">{item.task_type_label}</td>
                  <td className="px-3 py-2 text-sm text-gray-900 text-right tabular-nums">{formatCurrency(item.base_installation_cost)}</td>
                  <td className="px-3 py-2 text-sm text-gray-900 text-right tabular-nums">
                    {item.extra_installation_cost > 0 ? formatCurrency(item.extra_installation_cost) : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm font-semibold text-gray-900 text-right tabular-nums">{formatCurrency(item.total_amount)}</td>
                </tr>
              ))}
              {/* 합계행 */}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-sm text-gray-700">합계</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-sm text-gray-900 text-right tabular-nums">
                  {formatCurrency(data.items.reduce((s, i) => s + i.base_installation_cost, 0))}
                </td>
                <td className="px-3 py-2 text-sm text-gray-900 text-right tabular-nums">
                  {formatCurrency(data.items.reduce((s, i) => s + i.extra_installation_cost, 0))}
                </td>
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
