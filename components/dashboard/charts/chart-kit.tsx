'use client'

// 대시보드 차트 공통 UI - 기간 프리셋, 스파크라인, 증감 표시, 핵심지표 카드
import { DashboardFilters } from '@/types/dashboard'
import { determineAggregationLevel, type AggregationLevel } from '@/lib/dashboard-utils'

export const PERIOD_PRESETS = [
  { key: '4w', label: '4주' },
  { key: '8w', label: '8주' },
  { key: '6m', label: '6개월' },
  { key: '12m', label: '1년' }
] as const
export type PeriodPresetKey = typeof PERIOD_PRESETS[number]['key']

// 콤마 3자리 전체 금액 표기 (상시 노출되는 카드/표에서 사용)
export function formatFullAmount(value: number) {
  return `${Math.round(value).toLocaleString()}원`
}

// 억/만 축약 표기 (차트 축·범례처럼 공간이 좁은 곳에서만 사용)
export function formatAbbrCurrency(value: number) {
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1)}억`
  return `${(value / 10000).toFixed(0)}만`
}

// 부모(전역 필터) 지정이 없을 때는 로컬 프리셋으로 기간을 계산 - 4개 차트가 동일 규칙 공유
export function resolvePeriodParams(
  filters: DashboardFilters | undefined,
  periodPreset: PeriodPresetKey,
  options: { allowWeekly?: boolean } = {}
): { params: Record<string, string>; level: AggregationLevel } {
  const allowWeekly = options.allowWeekly ?? true
  const params: Record<string, string> = {}
  let level: AggregationLevel = 'monthly'

  const parentHasExplicitOverride = filters?.periodMode === 'custom' || filters?.periodMode === 'yearly'

  if (parentHasExplicitOverride && filters?.periodMode === 'custom' && filters?.startDate && filters?.endDate) {
    params.startDate = filters.startDate
    params.endDate = filters.endDate
    level = determineAggregationLevel(filters.startDate, filters.endDate)
  } else if (parentHasExplicitOverride && filters?.periodMode === 'yearly') {
    params.year = String(filters.year || new Date().getFullYear())
    level = 'monthly'
  } else if (filters?.startDate && filters?.endDate) {
    params.startDate = filters.startDate
    params.endDate = filters.endDate
    level = determineAggregationLevel(filters.startDate, filters.endDate)
  } else if (allowWeekly && (periodPreset === '4w' || periodPreset === '8w')) {
    const days = periodPreset === '4w' ? 27 : 55
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    params.startDate = start.toISOString().split('T')[0]
    params.endDate = end.toISOString().split('T')[0]
    level = 'weekly'
  } else {
    const monthsFallback = periodPreset === '4w' || periodPreset === '6m' ? 6 : 12
    params.months = String(monthsFallback)
    level = 'monthly'
  }

  return { params, level }
}

export function PeriodPresetControl({
  value, onChange, disabled, options
}: {
  value: PeriodPresetKey
  onChange: (key: PeriodPresetKey) => void
  disabled?: boolean
  options?: readonly { key: PeriodPresetKey; label: string }[]
}) {
  const items = options ?? PERIOD_PRESETS
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {items.map(p => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          disabled={disabled}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            value === p.key && !disabled ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// 12포인트 스파크라인 - 추세만 보여주는 보조 표시, 정확한 값은 옆 수치/표가 담당
export function Sparkline({ values, width = 64, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [x, y]
  })
  const last = points[points.length - 1]
  return (
    <svg width={width} height={height} className="overflow-visible flex-shrink-0">
      <polyline
        points={points.map(p => p.join(',')).join(' ')}
        fill="none"
        stroke="#d1d5db"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="#2563eb" />
    </svg>
  )
}

export function DeltaTag({ value, suffix = '%', comparedTo, goodDirection = 'up' }: {
  value: number | null
  suffix?: string
  comparedTo: string
  goodDirection?: 'up' | 'down'
}) {
  if (value === null || value === 0 || Number.isNaN(value)) {
    return <span className="text-xs text-gray-300">— 변동없음</span>
  }
  const isUp = value > 0
  const isGood = goodDirection === 'up' ? isUp : !isUp
  return (
    <span className={`text-xs font-semibold ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
      {isUp ? '▲' : '▼'} {Math.abs(value).toFixed(1)}{suffix}
      {comparedTo && <span className="ml-1 font-normal text-gray-400">{comparedTo}</span>}
    </span>
  )
}

export function HeroStat({
  label, valueLabel, delta, deltaSuffix, comparedTo, sparkValues, valueClassName = 'text-gray-900', goodDirection = 'up'
}: {
  label: string
  valueLabel: string
  delta: number | null
  deltaSuffix?: string
  comparedTo: string
  sparkValues: number[]
  valueClassName?: string
  goodDirection?: 'up' | 'down'
}) {
  return (
    <div className="flex-1 min-w-[160px] rounded-xl border border-gray-100 bg-white p-4 hover:border-gray-200 transition-colors">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p className={`text-xl font-semibold tracking-tight tabular-nums ${valueClassName}`}>{valueLabel}</p>
        <Sparkline values={sparkValues} />
      </div>
      <div className="mt-1.5">
        <DeltaTag value={delta} suffix={deltaSuffix} comparedTo={comparedTo} goodDirection={goodDirection} />
      </div>
    </div>
  )
}

export function periodLabels(level: AggregationLevel) {
  if (level === 'weekly') return { comparedTo: '전주 대비', columnName: '주차', current: '이번주' }
  if (level === 'daily') return { comparedTo: '전일 대비', columnName: '일자', current: '오늘' }
  return { comparedTo: '전월 대비', columnName: '기간', current: '이번달' }
}
