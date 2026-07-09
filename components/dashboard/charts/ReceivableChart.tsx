'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { ReceivableData, ReceivableSummary, DashboardFilters } from '@/types/dashboard'
import { RefreshCw, ChevronDown } from 'lucide-react'
import MonthDetailModal from '../modals/MonthDetailModal'
import { formatAggregationLabel, getCurrentTimeKey, type AggregationLevel } from '@/lib/dashboard-utils'
import {
  PeriodPresetControl, PeriodPresetKey, resolvePeriodParams,
  formatFullAmount, formatAbbrCurrency, HeroStat, DeltaTag, periodLabels
} from './chart-kit'

interface ReceivableChartProps {
  filters?: DashboardFilters;
}

const TABLE_ROW_LIMIT = 6

export default function ReceivableChart({ filters }: ReceivableChartProps) {
  const [data, setData] = useState<ReceivableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ReceivableSummary | null>(null);
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

      const response = await fetch(`/api/dashboard/receivables?${params}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setSummary(result.summary);
        setAggLevel(level);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to load receivable data:', error);
    } finally {
      setLoading(false);
    }
  };

  const chronological = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  const tableRows = useMemo(() => [...chronological].reverse(), [chronological]);

  const latest = chronological[chronological.length - 1];
  const prior = chronological[chronological.length - 2];
  const collectedDelta = latest && prior && prior.collected !== 0
    ? ((latest.collected - prior.collected) / Math.abs(prior.collected)) * 100
    : null;
  const collectionRateDeltaPts = latest && prior ? latest.collectionRate - prior.collectionRate : null;

  const sparkOutstanding = chronological.slice(-8).map(d => d.outstanding);
  const sparkCollected = chronological.slice(-8).map(d => d.collected);
  const sparkCollectionRate = chronological.slice(-8).map(d => d.collectionRate);

  const { comparedTo: comparedToLabel, columnName: periodLabelName, current: currentLabel } = periodLabels(aggLevel);

  const handleBarClick = (event: any) => {
    if (event && event.activeLabel) {
      const clickedMonth = event.activeLabel;
      const clickedData = data.find((item: any) => item.month === clickedMonth);

      if (clickedData) {
        setSelectedMonthData({
          month: formatAggregationLabel(clickedData.month, aggLevel),
          type: 'receivable',
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
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500">회수율: {point.collectionRate.toFixed(1)}%</p>
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
        <div className="h-80 bg-gray-50 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg md:text-xl font-bold text-gray-900">미수금 현황</h2>
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

      {/* 핵심 지표 - 미수금은 줄어드는 게 좋음(goodDirection=down), 회수금/회수율은 느는 게 좋음 */}
      {latest && (
        <div className="flex flex-wrap gap-3 mb-3">
          <HeroStat
            label="미수금"
            valueLabel={formatFullAmount(latest.outstanding)}
            delta={latest.prevMonthChange}
            comparedTo={comparedToLabel}
            sparkValues={sparkOutstanding}
            valueClassName="text-red-600"
            goodDirection="down"
          />
          <HeroStat
            label="회수금"
            valueLabel={formatFullAmount(latest.collected)}
            delta={collectedDelta}
            comparedTo={comparedToLabel}
            sparkValues={sparkCollected}
            valueClassName="text-emerald-600"
          />
          <HeroStat
            label="회수율"
            valueLabel={`${latest.collectionRate.toFixed(1)}%`}
            delta={collectionRateDeltaPts}
            deltaSuffix="%p"
            comparedTo={comparedToLabel}
            sparkValues={sparkCollectionRate}
          />
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="px-3 py-2 rounded-lg bg-gray-50">
            <p className="text-[11px] text-gray-500">총 미수금 (최근 시점 기준)</p>
            <p className="text-sm font-semibold text-gray-700 tabular-nums">{formatFullAmount(summary.totalOutstanding)}</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50">
            <p className="text-[11px] text-gray-500">평균 회수율</p>
            <p className="text-sm font-semibold text-gray-700 tabular-nums">{summary.avgCollectionRate}%</p>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chronological} onClick={handleBarClick}>
          <defs>
            <linearGradient id="colorOutstanding" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02}/>
            </linearGradient>
            <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02}/>
            </linearGradient>
          </defs>
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
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e5e7eb' }} />
          <Legend wrapperStyle={{ fontSize: '13px' }} iconType="circle" iconSize={8} />

          {currentTimeKey && chronological.some(d => d.month === currentTimeKey) && (
            <ReferenceLine
              x={currentTimeKey}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: currentLabel, position: 'top', fontSize: 11, fill: '#ef4444', fontWeight: 600 }}
            />
          )}

          <Area
            type="monotone"
            dataKey="outstanding"
            stroke="#ef4444"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorOutstanding)"
            name="미수금"
            cursor="pointer"
            dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }}
            label={(props: any) => {
              if (props.index !== chronological.length - 1) return null;
              return (
                <text x={props.x} y={props.y - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#111827">
                  {formatAbbrCurrency(props.value)}
                </text>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="collected"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorCollected)"
            name="회수금"
            cursor="pointer"
            dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {data.length === 0 && !loading && (
        <div className="text-center text-gray-400 py-8 text-sm">
          데이터가 없습니다.
        </div>
      )}

      {/* 항상 보이는 기간별 비교 표 - 금액은 전체 자릿수 콤마 표기 */}
      {tableRows.length > 0 && (
        <div className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">{periodLabelName}</th>
                  <th className="pb-2 font-medium text-right">미수금</th>
                  <th className="pb-2 font-medium text-right">회수금</th>
                  <th className="pb-2 font-medium text-right">회수율</th>
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
                    <td className="py-2 text-right tabular-nums font-semibold text-red-600">{formatFullAmount(d.outstanding)}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-600">{formatFullAmount(d.collected)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-500">{d.collectionRate.toFixed(1)}%</td>
                    <td className="py-2 text-right">
                      <DeltaTag value={d.prevMonthChange} comparedTo="" goodDirection="down" />
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

      <MonthDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        monthData={selectedMonthData}
      />
    </div>
  );
}
