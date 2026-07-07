'use client'

// 주간 회의 브리핑 스코어카드 - 계약/설치/인허가/미수금 지표를 지난주 대비로 보여주는 위젯
import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatFullAmount } from './charts/chart-kit'

interface CountPair {
  current: number
  previous: number
}

interface WeeklyScorecardData {
  contracts: { self: CountPair; subsidy: CountPair }
  installations: CountPair
  subsidyApprovals: CountPair
  surveys: {
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

function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

// invert: true면 값이 늘어나는 게 나쁜 신호(미수금, 위험도 건수 등)
function Delta({
  current,
  previous,
  invert = false,
  format = (n: number) => n.toLocaleString()
}: {
  current: number
  previous: number
  invert?: boolean
  format?: (n: number) => string
}) {
  const diff = current - previous
  if (diff === 0) return <span className="text-xs text-gray-400">— 동일</span>
  const isUp = diff > 0
  const isGood = invert ? !isUp : isUp
  return (
    <span className={`text-xs font-semibold whitespace-nowrap ${isGood ? 'text-green-600' : 'text-red-600'}`}>
      {isUp ? '▲' : '▼'} {format(Math.abs(diff))}
    </span>
  )
}

export default function WeeklyScorecard() {
  const [data, setData] = useState<WeeklyScorecardData | null>(null)
  const [period, setPeriod] = useState<WeeklyScorecardPeriod | null>(null)
  const [loading, setLoading] = useState(true)
  // 0 = 이번주, 1 = 지난주, 2 = 2주 전 ...
  const [weekOffset, setWeekOffset] = useState(0)

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

  const totalContracts = data.contracts.self.current + data.contracts.subsidy.current
  const totalContractsPrev = data.contracts.self.previous + data.contracts.subsidy.previous

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
              {weekOffset === 0 ? (
                <>이번주 {formatMonthDay(period.current.start)}~{formatMonthDay(period.current.end)}</>
              ) : (
                <>{formatMonthDay(period.current.start)}~{formatMonthDay(period.current.end)}</>
              )}
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
                <td className="py-2 text-gray-700 align-top">
                  계약 건수
                  <div className="text-[11px] text-gray-400">
                    자비 {data.contracts.self.current} · 보조금 {data.contracts.subsidy.current}
                  </div>
                </td>
                <td className="py-2 text-right font-bold tabular-nums">{totalContracts}</td>
                <td className="py-2 text-right w-20"><Delta current={totalContracts} previous={totalContractsPrev} /></td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">설치 수량</td>
                <td className="py-2 text-right font-bold tabular-nums">{data.installations.current}</td>
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
                <td className="py-2 text-gray-700">보조금 승인</td>
                <td className="py-2 text-right font-bold tabular-nums">{data.subsidyApprovals.current}</td>
                <td className="py-2 text-right w-20">
                  <Delta current={data.subsidyApprovals.current} previous={data.subsidyApprovals.previous} />
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">착공실사</td>
                <td className="py-2 text-right font-bold tabular-nums">{data.surveys.preConstruction.current}</td>
                <td className="py-2 text-right w-20">
                  <Delta current={data.surveys.preConstruction.current} previous={data.surveys.preConstruction.previous} />
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">준공실사</td>
                <td className="py-2 text-right font-bold tabular-nums">{data.surveys.completion.current}</td>
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
                <td className="py-2 text-right font-bold tabular-nums">{formatFullAmount(data.receivables.self.current)}</td>
                <td className="py-2 text-right">
                  <Delta current={data.receivables.self.current} previous={data.receivables.self.previous} invert format={formatFullAmount} />
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-2 text-gray-700">보조금</td>
                <td className="py-2 text-right font-bold tabular-nums">{formatFullAmount(data.receivables.subsidy.current)}</td>
                <td className="py-2 text-right">
                  <Delta current={data.receivables.subsidy.current} previous={data.receivables.subsidy.previous} invert format={formatFullAmount} />
                </td>
              </tr>
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-red-50 rounded p-1.5 text-center">
              <div className="text-[10px] text-gray-500">상 (90일+)</div>
              <div className="text-sm font-bold text-red-600 tabular-nums">{data.receivables.riskTiers.high.current}건</div>
              <Delta current={data.receivables.riskTiers.high.current} previous={data.receivables.riskTiers.high.previous} invert />
            </div>
            <div className="bg-amber-50 rounded p-1.5 text-center">
              <div className="text-[10px] text-gray-500">중 (60~89일)</div>
              <div className="text-sm font-bold text-amber-600 tabular-nums">{data.receivables.riskTiers.medium.current}건</div>
              <Delta current={data.receivables.riskTiers.medium.current} previous={data.receivables.riskTiers.medium.previous} invert />
            </div>
            <div className="bg-green-50 rounded p-1.5 text-center">
              <div className="text-[10px] text-gray-500">하 (30~59일)</div>
              <div className="text-sm font-bold text-green-600 tabular-nums">{data.receivables.riskTiers.low.current}건</div>
              <Delta current={data.receivables.riskTiers.low.current} previous={data.receivables.riskTiers.low.previous} invert />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
