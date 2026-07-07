'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { RevenueData, RevenueSummary, DashboardFilters } from '@/types/dashboard'
import { RefreshCw, ChevronDown } from 'lucide-react'
import MonthDetailModal from '../modals/MonthDetailModal'
import { formatAggregationLabel, getCurrentTimeKey, type AggregationLevel } from '@/lib/dashboard-utils'
import {
  PeriodPresetControl, PeriodPresetKey, resolvePeriodParams,
  formatFullAmount, formatAbbrCurrency, HeroStat, DeltaTag, periodLabels
} from './chart-kit'

interface RevenueChartProps {
  filters?: DashboardFilters;
}

const TABLE_ROW_LIMIT = 6

export default function RevenueChart({ filters }: RevenueChartProps) {
  const [data, setData] = useState<RevenueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedMonthData, setSelectedMonthData] = useState<any>(null);
  const [periodPreset, setPeriodPreset] = useState<PeriodPresetKey>('8w');
  const [showAllRows, setShowAllRows] = useState(false);
  const [aggLevel, setAggLevel] = useState<AggregationLevel>('weekly');

  useEffect(() => {
    loadData();
  }, [filters, periodPreset]);

  const loadData = async () => {
    try {
      setLoading(true);

      const { params: periodParams, level } = resolvePeriodParams(filters, periodPreset);

      const params = new URLSearchParams({
        ...periodParams,
        ...(filters?.office && { office: filters.office }),
        ...(filters?.manufacturer && { manufacturer: filters.manufacturer }),
        ...(filters?.salesOffice && { salesOffice: filters.salesOffice }),
        ...(filters?.progressStatus && { progressStatus: filters.progressStatus })
      });

      const response = await fetch(`/api/dashboard/revenue?${params}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setSummary(result.summary);
        setAggLevel(level);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to load revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 집계 키는 어떤 포맷이든(YYYY-MM-DD/YYYY-Www/YYYY-MM) 문자열 정렬이 곧 시간순
  const chronological = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  const tableRows = useMemo(() => [...chronological].reverse(), [chronological]);

  const latest = chronological[chronological.length - 1];
  const prior = chronological[chronological.length - 2];
  const revenueDelta = latest && prior && prior.revenue !== 0
    ? ((latest.revenue - prior.revenue) / Math.abs(prior.revenue)) * 100
    : null;
  const profitRateDeltaPts = latest && prior ? latest.profitRate - prior.profitRate : null;

  const sparkRevenue = chronological.slice(-8).map(d => d.revenue);
  const sparkProfit = chronological.slice(-8).map(d => d.profit);
  const sparkProfitRate = chronological.slice(-8).map(d => d.profitRate);

  const { comparedTo: comparedToLabel, columnName: periodLabelName, current: currentLabel } = periodLabels(aggLevel);

  const handleBarClick = (event: any) => {
    if (event && event.activeLabel) {
      const clickedMonth = event.activeLabel;
      const clickedData = data.find((item: any) => item.month === clickedMonth);

      if (clickedData) {
        setSelectedMonthData({
          month: formatAggregationLabel(clickedData.month, aggLevel),
          type: 'revenue',
          data: clickedData
        });
        setIsDetailModalOpen(true);
      }
    }
  };

  const currentTimeKey = getCurrentTimeKey(aggLevel);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-gray-100 rounded-xl shadow-lg">
          <p className="font-semibold mb-2 text-gray-900">{formatAggregationLabel(label, aggLevel)}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm flex items-center gap-2 text-gray-700">
              <span className="inline-block w-2.5 h-0.5 rounded" style={{ backgroundColor: entry.color }} />
              {entry.name}: <span className="font-semibold tabular-nums">{entry.value.toLocaleString()}원</span>
            </p>
          ))}
          <div className="mt-2 pt-2 border-t border-gray-100 space-y-0.5">
            <p className="text-xs text-gray-500">이익률: {point.profitRate.toFixed(1)}%</p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading && data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="h-8 bg-gray-100 rounded w-48 mb-4 animate-pulse" />
        <div className="h-24 bg-gray-50 rounded mb-4 animate-pulse" />
        <div className="h-96 bg-gray-50 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
      {/* 헤더: 타이틀 + 기간 프리셋 + 액션 */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg md:text-xl font-bold text-gray-900">매출·매입·이익 현황</h2>
          <PeriodPresetControl
            value={periodPreset}
            onChange={setPeriodPreset}
            disabled={!!(filters?.startDate && filters?.endDate)}
          />
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-gray-400 hidden sm:inline">{lastUpdate.toLocaleTimeString()}</span>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 text-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>
      </div>

      {/* 핵심 지표 - 스파크라인 + 증감 항상 노출, 금액은 전체 자릿수 콤마 표기 */}
      {latest && (
        <div className="flex flex-wrap gap-3 mb-3">
          <HeroStat
            label="매출"
            valueLabel={formatFullAmount(latest.revenue)}
            delta={revenueDelta}
            comparedTo={comparedToLabel}
            sparkValues={sparkRevenue}
          />
          <HeroStat
            label="순이익"
            valueLabel={formatFullAmount(latest.profit)}
            delta={latest.prevMonthChange}
            comparedTo={comparedToLabel}
            sparkValues={sparkProfit}
            valueClassName="text-violet-600"
          />
          <HeroStat
            label="이익률"
            valueLabel={`${latest.profitRate.toFixed(1)}%`}
            delta={profitRateDeltaPts}
            deltaSuffix="%p"
            comparedTo={comparedToLabel}
            sparkValues={sparkProfitRate}
            valueClassName="text-emerald-600"
          />
        </div>
      )}

      {/* 보조 지표 - 누적 총액, 스파크라인 없이 간결하게 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          <div className="px-3 py-2 rounded-lg bg-gray-50">
            <p className="text-[11px] text-gray-500">총 매입금액</p>
            <p className="text-sm font-semibold text-gray-700 tabular-nums">{formatFullAmount(summary.totalCost || 0)}</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50">
            <p className="text-[11px] text-gray-500">총 영업비용</p>
            <p className="text-sm font-semibold text-gray-700 tabular-nums">{formatFullAmount(summary.totalSalesCommission || 0)}</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50">
            <p className="text-[11px] text-gray-500">총 설치비용</p>
            <p className="text-sm font-semibold text-gray-700 tabular-nums">{formatFullAmount(summary.totalInstallationCost || 0)}</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50">
            <p className="text-[11px] text-gray-500">사업장 평균 이익률</p>
            <p className="text-sm font-semibold text-gray-700 tabular-nums">{summary.avgProfitRateByBiz || 0}%</p>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chronological} onClick={handleBarClick} barGap={4} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="none" stroke="#f1f2f4" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(v) => formatAggregationLabel(v, aggLevel)}
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
            angle={chronological.length > 8 ? -45 : 0}
            textAnchor={chronological.length > 8 ? 'end' : 'middle'}
            height={chronological.length > 8 ? 70 : 30}
          />
          <YAxis
            tickFormatter={formatAbbrCurrency}
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
          <Legend
            wrapperStyle={{ fontSize: '13px' }}
            iconType="circle"
            iconSize={8}
          />

          {/* 평균 라인 */}
          {summary && (
            <ReferenceLine
              y={summary.avgProfit}
              stroke="#d1d5db"
              strokeDasharray="4 3"
              label={{ value: '평균', fontSize: 11, fill: '#9ca3af' }}
            />
          )}

          {/* 현재 시점 강조 */}
          {currentTimeKey && chronological.some(d => d.month === currentTimeKey) && (
            <ReferenceLine
              x={currentTimeKey}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: currentLabel, position: 'top', fontSize: 11, fill: '#ef4444', fontWeight: 600 }}
            />
          )}

          <Bar dataKey="revenue" fill="#2563eb" name="매출" cursor="pointer" radius={[4, 4, 0, 0]} barSize={22} />
          <Bar dataKey="cost" fill="#fbbf24" name="매입" cursor="pointer" radius={[4, 4, 0, 0]} barSize={22} />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#7c3aed"
            strokeWidth={2}
            name="순이익"
            dot={{ r: 4, fill: '#7c3aed', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6 }}
            label={(props: any) => {
              if (props.index !== chronological.length - 1) return null;
              return (
                <text x={props.x} y={props.y - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#111827">
                  {formatAbbrCurrency(props.value)}
                </text>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {data.length === 0 && !loading && (
        <div className="text-center text-gray-400 py-8 text-sm">
          데이터가 없습니다.
        </div>
      )}

      {/* 항상 보이는 기간별 비교 표 - 호버 없이 바로 수치 확인, 금액은 전체 자릿수 콤마 표기 */}
      {tableRows.length > 0 && (
        <div className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">{periodLabelName}</th>
                  <th className="pb-2 font-medium text-right">매출</th>
                  <th className="pb-2 font-medium text-right">매입</th>
                  <th className="pb-2 font-medium text-right">순이익</th>
                  <th className="pb-2 font-medium text-right">{comparedToLabel}</th>
                </tr>
              </thead>
              <tbody>
                {(showAllRows ? tableRows : tableRows.slice(0, TABLE_ROW_LIMIT)).map((d, i) => (
                  <tr key={d.month} className={`border-b border-gray-50 ${i === 0 ? 'bg-blue-50/50' : ''}`}>
                    <td className="py-2 text-gray-700">
                      {formatAggregationLabel(d.month, aggLevel)}
                      {i === 0 && (
                        <span className="ml-1.5 text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                          {currentLabel}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-700">{formatFullAmount(d.revenue)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-500">{formatFullAmount(d.cost)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-gray-900">{formatFullAmount(d.profit)}</td>
                    <td className="py-2 text-right">
                      <DeltaTag value={d.prevMonthChange} comparedTo="" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tableRows.length > TABLE_ROW_LIMIT && (
            <button
              onClick={() => setShowAllRows(v => !v)}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllRows ? 'rotate-180' : ''}`} />
              {showAllRows ? '접기' : `${tableRows.length - TABLE_ROW_LIMIT}개 더보기`}
            </button>
          )}
        </div>
      )}

      {/* 기간별 상세보기 모달 */}
      <MonthDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        monthData={selectedMonthData}
      />
    </div>
  );
}
