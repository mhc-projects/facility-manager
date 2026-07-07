'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { InstallationData, InstallationSummary, DashboardFilters } from '@/types/dashboard'
import { RefreshCw, ChevronDown } from 'lucide-react'
import MonthDetailModal from '../modals/MonthDetailModal'
import { formatAggregationLabel, getCurrentTimeKey, type AggregationLevel } from '@/lib/dashboard-utils'
import {
  PeriodPresetControl, PeriodPresetKey, resolvePeriodParams,
  HeroStat, DeltaTag, periodLabels
} from './chart-kit'

interface InstallationChartProps {
  filters?: DashboardFilters;
}

const TABLE_ROW_LIMIT = 6

export default function InstallationChart({ filters }: InstallationChartProps) {
  const [data, setData] = useState<InstallationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InstallationSummary | null>(null);
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

      const response = await fetch(`/api/dashboard/installations?${params}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setSummary(result.summary);
        setAggLevel(level);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to load installation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const chronological = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  const tableRows = useMemo(() => [...chronological].reverse(), [chronological]);

  const latest = chronological[chronological.length - 1];
  const prior = chronological[chronological.length - 2];
  const completedDelta = latest && prior && prior.completed !== 0
    ? ((latest.completed - prior.completed) / Math.abs(prior.completed)) * 100
    : null;
  const completionRateDeltaPts = latest && prior ? latest.completionRate - prior.completionRate : null;

  const sparkTotal = chronological.slice(-8).map(d => d.total);
  const sparkCompleted = chronological.slice(-8).map(d => d.completed);
  const sparkCompletionRate = chronological.slice(-8).map(d => d.completionRate);

  const { comparedTo: comparedToLabel, columnName: periodLabelName, current: currentLabel } = periodLabels(aggLevel);

  const handleBarClick = (event: any) => {
    if (event && event.activeLabel) {
      const clickedMonth = event.activeLabel;
      const clickedData = data.find((item: any) => item.month === clickedMonth);

      if (clickedData) {
        setSelectedMonthData({
          month: formatAggregationLabel(clickedData.month, aggLevel),
          type: 'installation',
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
          <p className="text-xs text-gray-500 mb-1">총 {point.total}건</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm flex items-center gap-2 text-gray-700">
              <span className="inline-block w-2.5 h-0.5 rounded" style={{ backgroundColor: entry.color }} />
              {entry.name}: <span className="font-semibold tabular-nums">{entry.value}건</span>
            </p>
          ))}
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500">완료율: {point.completionRate.toFixed(1)}%</p>
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
          <h2 className="text-lg md:text-xl font-bold text-gray-900">설치 현황</h2>
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

      {latest && (
        <div className="flex flex-wrap gap-3 mb-3">
          <HeroStat
            label="전체 설치"
            valueLabel={`${latest.total}건`}
            delta={latest.prevMonthChange}
            comparedTo={comparedToLabel}
            sparkValues={sparkTotal}
          />
          <HeroStat
            label="완료"
            valueLabel={`${latest.completed}건`}
            delta={completedDelta}
            comparedTo={comparedToLabel}
            sparkValues={sparkCompleted}
            valueClassName="text-emerald-600"
          />
          <HeroStat
            label="완료율"
            valueLabel={`${latest.completionRate.toFixed(1)}%`}
            delta={completionRateDeltaPts}
            deltaSuffix="%p"
            comparedTo={comparedToLabel}
            sparkValues={sparkCompletionRate}
            valueClassName="text-emerald-600"
          />
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          <div className="px-3 py-2 rounded-lg bg-gray-50">
            <p className="text-[11px] text-gray-500">{periodLabelName}평균 설치</p>
            <p className="text-sm font-semibold text-gray-700 tabular-nums">{summary.avgMonthlyInstallations || 0}건</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50">
            <p className="text-[11px] text-gray-500">평균 완료율</p>
            <p className="text-sm font-semibold text-gray-700 tabular-nums">{summary.avgCompletionRate || 0}%</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50 col-span-2 md:col-span-1">
            <p className="text-[11px] text-gray-500">총 설치 (조회기간 누계)</p>
            <p className="text-sm font-semibold text-gray-700 tabular-nums">{summary.totalInstallations || 0}건</p>
          </div>
        </div>
      )}

      {/* 설치 상태 안내 */}
      <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-lg mb-4">
        <p className="text-xs font-medium text-blue-900 mb-2">설치 상태 구분</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-blue-800">
          <div className="flex items-start gap-1.5">
            <span className="inline-block w-3 h-3 bg-gray-400 rounded mt-0.5"></span>
            <div><span className="font-medium">대기:</span><span className="ml-1">설치 예정</span></div>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="inline-block w-3 h-3 bg-amber-400 rounded mt-0.5"></span>
            <div><span className="font-medium">진행중:</span><span className="ml-1">설치 완료, 준공실사 대기</span></div>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="inline-block w-3 h-3 bg-emerald-500 rounded mt-0.5"></span>
            <div><span className="font-medium">완료:</span><span className="ml-1">모든 작업 완료</span></div>
          </div>
        </div>
        <p className="text-[10px] text-blue-700 mt-2">
          자비/대리점/AS는 준공실사 없이 설치 완료 시 &lsquo;완료&rsquo;로 표시됩니다
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chronological} onClick={handleBarClick} barGap={2} barCategoryGap="30%">
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
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            label={{ value: '건수', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#9ca3af' }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
          <Legend wrapperStyle={{ fontSize: '13px' }} iconType="circle" iconSize={8} />

          {summary && (
            <ReferenceLine
              y={summary.avgMonthlyInstallations}
              stroke="#d1d5db"
              strokeDasharray="4 3"
              label={{ value: '평균', fontSize: 11, fill: '#9ca3af' }}
            />
          )}

          {currentTimeKey && chronological.some(d => d.month === currentTimeKey) && (
            <ReferenceLine
              x={currentTimeKey}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: currentLabel, position: 'top', fontSize: 11, fill: '#ef4444', fontWeight: 600 }}
            />
          )}

          <Bar dataKey="waiting" stackId="a" fill="#9ca3af" name="대기" cursor="pointer" />
          <Bar dataKey="inProgress" stackId="a" fill="#fbbf24" name="진행중" cursor="pointer" />
          <Bar dataKey="completed" stackId="a" fill="#10b981" name="완료" cursor="pointer" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {data.length === 0 && !loading && (
        <div className="text-center text-gray-400 py-8 text-sm">
          데이터가 없습니다.
        </div>
      )}

      {/* 항상 보이는 기간별 비교 표 */}
      {tableRows.length > 0 && (
        <div className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">{periodLabelName}</th>
                  <th className="pb-2 font-medium text-right">대기</th>
                  <th className="pb-2 font-medium text-right">진행중</th>
                  <th className="pb-2 font-medium text-right">완료</th>
                  <th className="pb-2 font-medium text-right">완료율</th>
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
                    <td className="py-2 text-right tabular-nums text-gray-500">{d.waiting}건</td>
                    <td className="py-2 text-right tabular-nums text-amber-600">{d.inProgress}건</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-emerald-600">{d.completed}건</td>
                    <td className="py-2 text-right tabular-nums text-gray-500">{d.completionRate.toFixed(1)}%</td>
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

      <MonthDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        monthData={selectedMonthData}
      />
    </div>
  );
}
