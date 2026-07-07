'use client'

// 주간 회의 브리핑 스코어카드 - 계약/설치/인허가/미수금 지표를 지난주 대비로 보여주는 위젯
import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatFullAmount } from './charts/chart-kit'

interface BusinessRef {
  id?: string
  business_name: string
  amount?: number
  elapsedDays?: number
}

interface CountPair {
  current: number
  previous: number
  currentBusinesses: BusinessRef[]
  previousBusinesses: BusinessRef[]
  changeBusinesses?: BusinessRef[]
}

interface WeeklyScorecardData {
  contracts: {
    selfContract: CountPair
    subsidyReceived: CountPair
    subsidyApproved: CountPair
  }
  installations: CountPair
  surveys: {
    estimate: CountPair
    preConstruction: CountPair
    completion: CountPair
  }
  receivables: {
    self: CountPair
    subsidy: CountPair
    riskTiers: {
      high: CountPair
      medium: CountPair
      low: CountPair
    }
  }
}

interface WeeklyScorecardPeriod {
  current: { start: string; end: string }
  previous: { start: string; end: string }
}

// 숫자 클릭 시 띄우는 사업장 목록 모달의 상태
interface BusinessModalState {
  title: string
  subtitle: string
  businesses: BusinessRef[]
  formatValue?: (b: BusinessRef) => ReactNode
}


function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

// invert: true면 값이 늘어나는 게 나쁜 신호(미수금, 위험도 건수 등)
// onClick을 주면 변동액 자체를 클릭해 어떤 사업장이 변동에 기여했는지 모달로 확인할 수 있다
function Delta({
  current,
  previous,
  invert = false,
  format = (n: number) => n.toLocaleString(),
  onClick
}: {
  current: number
  previous: number
  invert?: boolean
  format?: (n: number) => string
  onClick?: () => void
}) {
  const diff = current - previous
  if (diff === 0) return <span className="text-xs text-gray-400">— 동일</span>
  const isUp = diff > 0
  const isGood = invert ? !isUp : isUp
  const className = `text-xs font-semibold whitespace-nowrap ${isGood ? 'text-green-600' : 'text-red-600'}`
  const content = <>{isUp ? '▲' : '▼'} {format(Math.abs(diff))}</>
  if (!onClick) return <span className={className}>{content}</span>
  return (
    <button onClick={onClick} className={`${className} hover:underline`}>
      {content}
    </button>
  )
}

// 클릭하면 해당 사업장 목록 모달을 여는 지표 숫자
function ClickableCount({
  value,
  onClick,
  className = ''
}: {
  value: number | string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`font-bold tabular-nums hover:underline transition-colors ${className}`}
    >
      {value}
    </button>
  )
}

function BusinessListModal({ state, onClose }: { state: BusinessModalState | null; onClose: () => void }) {
  useEffect(() => {
    if (!state) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [state, onClose])

  if (!state) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">{state.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{state.subtitle} · 총 {state.businesses.length}건</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-2">
          {state.businesses.length === 0 ? (
            <p className="py-8 text-center text-gray-400 text-sm">해당하는 사업장이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {state.businesses.map((b, i) => (
                <li key={`${b.business_name}-${i}`} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-800">{b.business_name}</span>
                  {state.formatValue && (
                    <span className="text-xs text-gray-500 tabular-nums shrink-0">{state.formatValue(b)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default function WeeklyScorecard() {
  const [data, setData] = useState<WeeklyScorecardData | null>(null)
  const [period, setPeriod] = useState<WeeklyScorecardPeriod | null>(null)
  const [loading, setLoading] = useState(true)
  // 0 = 이번주, 1 = 지난주, 2 = 2주 전 ...
  const [weekOffset, setWeekOffset] = useState(0)
  const [modalState, setModalState] = useState<BusinessModalState | null>(null)

  // 매번 새로 계산되면 today() 호출 시점이 달라져 무한 재조회될 수 있어 offset에만 의존
  const referenceDate = useMemo(() => {
    if (weekOffset === 0) return null
    const d = new Date()
    d.setDate(d.getDate() - weekOffset * 7)
    return d.toISOString().split('T')[0]
  }, [weekOffset])

  useEffect(() => {
    loadData()
  }, [weekOffset])

  const loadData = async () => {
    try {
      setLoading(true)
      const url = referenceDate
        ? `/api/dashboard/weekly-scorecard?referenceDate=${referenceDate}`
        : '/api/dashboard/weekly-scorecard'
      const response = await fetch(url)
      const result = await response.json()
      if (result.success) {
        setData(result.data)
        setPeriod(result.period)
      }
    } catch (error) {
      console.error('Failed to load weekly scorecard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="bg-white p-4 md:p-6 rounded-lg shadow">
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      </div>
    )
  }

  if (!data || !period) return null

  const periodLabel = weekOffset === 0
    ? `이번주 ${formatMonthDay(period.current.start)}~${formatMonthDay(period.current.end)}`
    : `${formatMonthDay(period.current.start)}~${formatMonthDay(period.current.end)}`

  const openModal = (title: string, pair: CountPair, formatValue?: (b: BusinessRef) => ReactNode) => {
    setModalState({ title, subtitle: periodLabel, businesses: pair.currentBusinesses, formatValue })
  }

  // 미수금 변동액 클릭 - 어떤 사업장의 금액이 늘고 줄었는지 색상으로 구분해 보여준다
  // (changeBusinesses는 API에서 부호 상관없이 전부 계산해서 내려주므로, 총 변동액과 목록 합계가 항상 일치한다)
  const openChangeModal = (title: string, pair: CountPair) => {
    setModalState({
      title,
      subtitle: `${periodLabel} · ${weekOffset === 0 ? '지난주' : '전주'} 대비 변동`,
      businesses: pair.changeBusinesses || [],
      formatValue: b => (
        <span className={(b.amount || 0) > 0 ? 'text-red-600' : 'text-green-600'}>
          {(b.amount || 0) > 0 ? '▲' : '▼'} {formatFullAmount(Math.abs(b.amount || 0))}
        </span>
      )
    })
  }

  return (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <div>
          <h2 className="text-lg md:text-xl font-bold">주간 브리핑</h2>
          <div className="flex items-center gap-1 mt-0.5">
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              disabled={loading}
              title="이전주"
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <p className="text-xs text-gray-500 whitespace-nowrap">
              {periodLabel}
              {' · '}{weekOffset === 0 ? '지난주' : '전주'} {formatMonthDay(period.previous.start)}~{formatMonthDay(period.previous.end)} 대비
            </p>
            <button
              onClick={() => setWeekOffset(o => Math.max(0, o - 1))}
              disabled={loading || weekOffset === 0}
              title="다음주"
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {weekOffset > 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs text-blue-600 hover:underline ml-1 whitespace-nowrap"
              >
                이번주로
              </button>
            )}
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">새로고침</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* 영업 · 설치 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">영업 · 설치</h3>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">자비 계약체결</td>
                <td className="py-2 text-right">
                  <ClickableCount
                    value={data.contracts.selfContract.current}
                    onClick={() => openModal('자비 계약체결', data.contracts.selfContract)}
                  />
                </td>
                <td className="py-2 text-right w-20">
                  <Delta current={data.contracts.selfContract.current} previous={data.contracts.selfContract.previous} />
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">보조금 신청서접수</td>
                <td className="py-2 text-right">
                  <ClickableCount
                    value={data.contracts.subsidyReceived.current}
                    onClick={() => openModal('보조금 신청서접수', data.contracts.subsidyReceived)}
                  />
                </td>
                <td className="py-2 text-right w-20">
                  <Delta current={data.contracts.subsidyReceived.current} previous={data.contracts.subsidyReceived.previous} />
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">보조금 승인</td>
                <td className="py-2 text-right">
                  <ClickableCount
                    value={data.contracts.subsidyApproved.current}
                    onClick={() => openModal('보조금 승인', data.contracts.subsidyApproved)}
                  />
                </td>
                <td className="py-2 text-right w-20">
                  <Delta current={data.contracts.subsidyApproved.current} previous={data.contracts.subsidyApproved.previous} />
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">설치 수량</td>
                <td className="py-2 text-right">
                  <ClickableCount
                    value={data.installations.current}
                    onClick={() => openModal('설치 수량', data.installations)}
                  />
                </td>
                <td className="py-2 text-right w-20">
                  <Delta current={data.installations.current} previous={data.installations.previous} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 인허가 · 실사 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">인허가 · 실사</h3>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">견적실사</td>
                <td className="py-2 text-right">
                  <ClickableCount
                    value={data.surveys.estimate.current}
                    onClick={() => openModal('견적실사', data.surveys.estimate)}
                  />
                </td>
                <td className="py-2 text-right w-20">
                  <Delta current={data.surveys.estimate.current} previous={data.surveys.estimate.previous} />
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">착공실사</td>
                <td className="py-2 text-right">
                  <ClickableCount
                    value={data.surveys.preConstruction.current}
                    onClick={() => openModal('착공실사', data.surveys.preConstruction)}
                  />
                </td>
                <td className="py-2 text-right w-20">
                  <Delta current={data.surveys.preConstruction.current} previous={data.surveys.preConstruction.previous} />
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">준공실사</td>
                <td className="py-2 text-right">
                  <ClickableCount
                    value={data.surveys.completion.current}
                    onClick={() => openModal('준공실사', data.surveys.completion)}
                  />
                </td>
                <td className="py-2 text-right w-20">
                  <Delta current={data.surveys.completion.current} previous={data.surveys.completion.previous} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 미수금 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">미수금</h3>
          <table className="w-full text-sm mb-2">
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">자비</td>
                <td className="py-2 text-right">
                  <ClickableCount
                    value={formatFullAmount(data.receivables.self.current)}
                    onClick={() => openModal('자비 미수금', data.receivables.self, b => formatFullAmount(b.amount || 0))}
                  />
                </td>
                <td className="py-2 text-right">
                  <Delta
                    current={data.receivables.self.current}
                    previous={data.receivables.self.previous}
                    invert
                    format={formatFullAmount}
                    onClick={() => openChangeModal('자비 미수금 변동', data.receivables.self)}
                  />
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">보조금</td>
                <td className="py-2 text-right">
                  <ClickableCount
                    value={formatFullAmount(data.receivables.subsidy.current)}
                    onClick={() => openModal('보조금 미수금', data.receivables.subsidy, b => formatFullAmount(b.amount || 0))}
                  />
                </td>
                <td className="py-2 text-right">
                  <Delta
                    current={data.receivables.subsidy.current}
                    previous={data.receivables.subsidy.previous}
                    invert
                    format={formatFullAmount}
                    onClick={() => openChangeModal('보조금 미수금 변동', data.receivables.subsidy)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-red-50 rounded p-1.5 text-center">
              <div className="text-[10px] text-gray-500">상 (90일+)</div>
              <div className="text-sm">
                <ClickableCount
                  className="text-red-600 hover:text-red-700"
                  value={`${data.receivables.riskTiers.high.current}건`}
                  onClick={() => openModal('미수금 상 (90일+)', data.receivables.riskTiers.high, b => `${b.elapsedDays}일 경과`)}
                />
              </div>
              <Delta current={data.receivables.riskTiers.high.current} previous={data.receivables.riskTiers.high.previous} invert />
            </div>
            <div className="bg-amber-50 rounded p-1.5 text-center">
              <div className="text-[10px] text-gray-500">중 (60~89일)</div>
              <div className="text-sm">
                <ClickableCount
                  className="text-amber-600 hover:text-amber-700"
                  value={`${data.receivables.riskTiers.medium.current}건`}
                  onClick={() => openModal('미수금 중 (60~89일)', data.receivables.riskTiers.medium, b => `${b.elapsedDays}일 경과`)}
                />
              </div>
              <Delta current={data.receivables.riskTiers.medium.current} previous={data.receivables.riskTiers.medium.previous} invert />
            </div>
            <div className="bg-green-50 rounded p-1.5 text-center">
              <div className="text-[10px] text-gray-500">하 (30~59일)</div>
              <div className="text-sm">
                <ClickableCount
                  className="text-green-600 hover:text-green-700"
                  value={`${data.receivables.riskTiers.low.current}건`}
                  onClick={() => openModal('미수금 하 (30~59일)', data.receivables.riskTiers.low, b => `${b.elapsedDays}일 경과`)}
                />
              </div>
              <Delta current={data.receivables.riskTiers.low.current} previous={data.receivables.riskTiers.low.previous} invert />
            </div>
          </div>
        </div>
      </div>

      <BusinessListModal state={modalState} onClose={() => setModalState(null)} />
    </div>
  )
}
