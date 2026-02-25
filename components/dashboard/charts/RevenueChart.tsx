'use client'

import { useState, useEffect } from 'react'
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
import { RefreshCw, Target } from 'lucide-react'
import TargetSettingModal from '../modals/TargetSettingModal'
import MonthDetailModal from '../modals/MonthDetailModal'
import { determineAggregationLevel, getCurrentTimeKey } from '@/lib/dashboard-utils'

interface RevenueChartProps {
  filters?: DashboardFilters;
}

export default function RevenueChart({ filters }: RevenueChartProps) {
  const [data, setData] = useState<RevenueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedMonthData, setSelectedMonthData] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      setLoading(true);

      // 기간 필터 파라미터 구성
      const periodParams: Record<string, string> = {};

      // startDate/endDate가 있으면 우선 사용 (빠른 필터 지원)
      if (filters?.startDate && filters?.endDate) {
        // YYYY-MM-DD 형식 그대로 전달 (API에서 자동으로 집계 단위 결정)
        periodParams.startDate = filters.startDate;
        periodParams.endDate = filters.endDate;
      } else if (filters?.periodMode === 'custom') {
        if (filters.startDate) periodParams.startDate = filters.startDate;
        if (filters.endDate) periodParams.endDate = filters.endDate;
      } else if (filters?.periodMode === 'yearly') {
        periodParams.year = String(filters.year || new Date().getFullYear());
      } else {
        // recent 모드 (기본값)
        periodParams.months = String(filters?.months || 12);
      }

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
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to load revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBarClick = (event: any) => {
    if (event && event.activeLabel) {
      const clickedMonth = event.activeLabel;
      const clickedData = data.find((item: any) => item.month === clickedMonth);

      if (clickedData) {
        setSelectedMonthData({
          month: clickedData.month,
          type: 'revenue',
          data: clickedData
        });
        setIsDetailModalOpen(true);
      }
    }
  };

  const handleTargetSave = () => {
    loadData();
  };

  const formatCurrency = (value: number) => {
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(1)}억`;
    }
    return `${(value / 10000).toFixed(0)}만`;
  };

  // 현재 시점 계산
  const getCurrentTimePoint = () => {
    if (!filters) return null;

    // 집계 레벨 결정
    let aggregationLevel: 'daily' | 'weekly' | 'monthly' = 'monthly';

    if (filters.startDate && filters.endDate) {
      aggregationLevel = determineAggregationLevel(filters.startDate, filters.endDate);
    } else if (filters.periodMode === 'yearly' || filters.periodMode === 'recent' || !filters.periodMode) {
      aggregationLevel = 'monthly';
    }

    return getCurrentTimeKey(aggregationLevel);
  };

  const currentTimeKey = getCurrentTimePoint();

  // X축 레이블 포맷 함수
  const formatXAxisLabel = (value: string) => {
    // YYYY-MM-DD 형식 (일별): MM/DD로 변환
    if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [, month, day] = value.split('-');
      return `${month}/${day}`;
    }
    // YYYY-Www 형식 (주별): ww주차로 변환
    if (value.match(/^\d{4}-W\d{2}$/)) {
      const weekNum = value.split('-W')[1];
      return `${weekNum}주`;
    }
    // 그 외 (월별): 그대로 표시
    return value;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-bold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value.toLocaleString()}원
            </p>
          ))}
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              이익률: {data.profitRate.toFixed(1)}%
            </p>
            {data.target && (
              <p className="text-sm text-purple-600">
                목표 대비: {data.achievementRate.toFixed(1)}%
              </p>
            )}
            {data.prevMonthChange !== 0 && (
              <p className={`text-sm ${data.prevMonthChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                전월 대비: {data.prevMonthChange > 0 ? '+' : ''}{data.prevMonthChange.toFixed(1)}%
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="h-8 bg-gray-200 rounded w-48 mb-4 animate-pulse" />
        <div className="h-96 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <h2 className="text-lg md:text-xl font-bold">월별 매출/매입/이익 현황</h2>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => setIsTargetModalOpen(true)}
            className="px-3 py-1.5 bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-1 text-sm"
          >
            <Target className="w-4 h-4" />
            <span className="hidden sm:inline">목표설정</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-4">
          <div className="bg-green-50 p-3 rounded">
            <p className="text-xs text-gray-600">총 매출금액</p>
            <p className="text-sm font-bold text-green-600">{summary.totalRevenue.toLocaleString()}원</p>
          </div>
          <div className="bg-teal-50 p-3 rounded">
            <p className="text-xs text-gray-600">총 매입금액</p>
            <p className="text-sm font-bold text-teal-600">{(summary.totalCost || 0).toLocaleString()}원</p>
          </div>
          <div className="bg-orange-50 p-3 rounded">
            <p className="text-xs text-gray-600">총 영업비용</p>
            <p className="text-sm font-bold text-orange-600">{(summary.totalSalesCommission || 0).toLocaleString()}원</p>
          </div>
          <div className="bg-blue-50 p-3 rounded">
            <p className="text-xs text-gray-600">총 설치비용</p>
            <p className="text-sm font-bold text-blue-600">{(summary.totalInstallationCost || 0).toLocaleString()}원</p>
          </div>
          <div className="bg-amber-50 p-3 rounded">
            <p className="text-xs text-gray-600">기타 비용</p>
            <p className="text-sm font-bold text-amber-600">{(summary.totalOtherCosts || 0).toLocaleString()}원</p>
          </div>
          <div className="bg-purple-50 p-3 rounded">
            <p className="text-xs text-gray-600">총 이익금액</p>
            <p className="text-sm font-bold text-purple-600">{summary.totalProfit.toLocaleString()}원</p>
          </div>
          <div className="bg-indigo-50 p-3 rounded">
            <p className="text-xs text-gray-600">사업장 평균 이익률</p>
            <p className="text-sm font-bold text-indigo-600">{summary.avgProfitRateByBiz || 0}%</p>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data} onClick={handleBarClick}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickFormatter={formatXAxisLabel}
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            tickFormatter={formatCurrency}
            tick={{ fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '14px' }}
            iconType="square"
          />

          {/* 평균 라인 */}
          {summary && (
            <ReferenceLine
              y={summary.avgProfit}
              stroke="#888"
              strokeDasharray="3 3"
              label={{ value: '평균', fontSize: 12, fill: '#888' }}
            />
          )}

          {/* 현재 시점 강조 */}
          {currentTimeKey && data.some(d => d.month === currentTimeKey) && (
            <ReferenceLine
              x={currentTimeKey}
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="5 5"
              label={{ value: '현재', position: 'top', fontSize: 11, fill: '#ef4444', fontWeight: 'bold' }}
            />
          )}

          <Bar dataKey="revenue" fill="#3b82f6" name="매출" cursor="pointer" />
          <Bar dataKey="cost" fill="#f59e0b" name="매입" cursor="pointer" />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#10b981"
            strokeWidth={3}
            name="순이익"
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          {/* 목표 라인 (있는 경우) */}
          <Line
            type="monotone"
            dataKey="target"
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="목표"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {data.length === 0 && !loading && (
        <div className="text-center text-gray-500 py-8">
          데이터가 없습니다.
        </div>
      )}

      {/* 목표 설정 모달 */}
      <TargetSettingModal
        isOpen={isTargetModalOpen}
        onClose={() => setIsTargetModalOpen(false)}
        targetType="revenue"
        onSave={handleTargetSave}
      />

      {/* 월별 상세보기 모달 */}
      <MonthDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        monthData={selectedMonthData}
      />
    </div>
  );
}
