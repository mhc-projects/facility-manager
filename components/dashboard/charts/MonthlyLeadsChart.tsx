'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { MonthlyLeadsData, MonthlyLeadsSummary, DashboardFilters, UnassignedBusiness, LeadBusiness } from '@/types/dashboard'
import { RefreshCw, X, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatAggregationLabel, type AggregationLevel } from '@/lib/dashboard-utils'
import { PeriodPresetControl, PeriodPresetKey, resolvePeriodParams, HeroStat, DeltaTag, periodLabels } from './chart-kit'

const RANK_ROW_LIMIT = 8
const PERIOD_ROW_LIMIT = 6

// 월별 집계는 "26.02" 형태를 그대로 쓰고, 주별 집계만 "N주차"로 변환
function formatAxisLabel(value: string, level: AggregationLevel) {
  if (level === 'weekly') return formatAggregationLabel(value, level);
  const parts = value.split('-');
  return parts.length === 2 ? `${parts[0].slice(2)}.${parts[1]}` : value;
}

// 상세 모달/툴팁 헤더용 - 월은 "2026년 02월", 주는 "27주차"
function formatPeriodLabel(key: string, level: AggregationLevel) {
  if (level === 'weekly') return formatAggregationLabel(key, level);
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-');
    return `${y}년 ${m}월`;
  }
  return key;
}

interface MonthlyLeadsChartProps {
  filters?: DashboardFilters;
}

// 영업점별 색상 팔레트 (미지정은 항상 회색)
const OFFICE_COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#8B5CF6', // violet-500
  '#EF4444', // red-500
  '#06B6D4', // cyan-500
  '#EC4899', // pink-500
  '#84CC16', // lime-500
  '#F97316', // orange-500
  '#6366F1', // indigo-500
];
const UNASSIGNED_COLOR = '#9CA3AF';

// 진행구분 배지 색상
function getProgressBadgeClass(status: string | null) {
  if (!status) return 'bg-gray-100 text-gray-500';
  if (status.includes('보조금')) return 'bg-green-100 text-green-700';
  if (status === '자비') return 'bg-blue-100 text-blue-700';
  if (status === '대리점') return 'bg-purple-100 text-purple-700';
  if (status === 'AS') return 'bg-orange-100 text-orange-700';
  return 'bg-gray-100 text-gray-600';
}

interface ModalData {
  month: string;
  monthLabel: string;
  total: number;
  offices: string[];
  businessesByOffice: Record<string, LeadBusiness[]>;
  officeColorMap: Record<string, string>;
}

function DetailModal({
  modalData,
  onClose
}: {
  modalData: ModalData;
  onClose: () => void;
}) {
  const [collapsedOffices, setCollapsedOffices] = useState<Set<string>>(new Set());

  // ESC 키 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const toggleOffice = (office: string) => {
    setCollapsedOffices(prev => {
      const next = new Set(prev);
      if (next.has(office)) next.delete(office);
      else next.add(office);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {modalData.monthLabel} 영업 인입 건 상세
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">총 {modalData.total}건</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 영업점별 섹션 */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
          {modalData.offices.map(office => {
            const businesses = modalData.businessesByOffice[office] || [];
            const count = businesses.length;
            const color = modalData.officeColorMap[office] || UNASSIGNED_COLOR;
            const isCollapsed = collapsedOffices.has(office);

            return (
              <div key={office} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* 영업점 헤더 */}
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  onClick={() => toggleOffice(office)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm font-semibold text-gray-800">{office}</span>
                    <span className="text-xs text-gray-500 font-normal">{count}건</span>
                  </div>
                  {isCollapsed
                    ? <ChevronDown className="w-4 h-4 text-gray-400" />
                    : <ChevronUp className="w-4 h-4 text-gray-400" />
                  }
                </button>

                {/* 사업장 목록 */}
                {!isCollapsed && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">사업장명</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">접수일</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">진행구분</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">바로가기</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {businesses.map(biz => (
                        <tr key={biz.id} className="hover:bg-blue-50 transition-colors">
                          <td className="px-4 py-2 text-sm text-gray-800 font-medium">{biz.business_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{biz.receipt_date}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${getProgressBadgeClass(biz.progress_status)}`}>
                              {biz.progress_status || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <a
                              href={`/admin/business?openModal=${biz.id}`}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                            >
                              열기 →
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          {modalData.offices.length === 0 && (
            <div className="py-8 text-center text-gray-400 text-sm">
              데이터가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UnassignedModal({
  unassigned,
  onClose
}: {
  unassigned: UnassignedBusiness[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-orange-600" />
            <h3 className="text-base font-bold text-gray-900">영업점 미지정 사업장 목록</h3>
            <span className="text-xs text-gray-500">({unassigned.length}건)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">사업장명</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">접수일</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">바로가기</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {unassigned.map((biz: UnassignedBusiness) => (
                <tr key={biz.id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-2 text-sm text-gray-800 font-medium">{biz.business_name}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{biz.receipt_date}</td>
                  <td className="px-4 py-2 text-right">
                    <a
                      href={`/admin/business?openModal=${biz.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                    >
                      열기 →
                    </a>
                  </td>
                </tr>
              ))}
              {unassigned.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-400 text-sm">데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function MonthlyLeadsChart({ filters }: MonthlyLeadsChartProps) {
  const [data, setData] = useState<MonthlyLeadsData[]>([]);
  const [summary, setSummary] = useState<MonthlyLeadsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isUnassignedOpen, setIsUnassignedOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [periodPreset, setPeriodPreset] = useState<PeriodPresetKey>('8w');
  const [aggLevel, setAggLevel] = useState<AggregationLevel>('weekly');
  const [showAllOfficeRanks, setShowAllOfficeRanks] = useState(false);
  const [showAllPeriods, setShowAllPeriods] = useState(false);

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
        ...(filters?.salesOffice && { salesOffice: filters.salesOffice }),
        ...(filters?.progressStatus && { progressStatus: filters.progressStatus })
      });
      const response = await fetch(`/api/dashboard/monthly-leads?${params}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data || []);
        setSummary(result.summary || null);
        setAggLevel(level);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to load monthly leads data:', error);
    } finally {
      setLoading(false);
    }
  };

  const offices = summary?.offices || [];

  const officeColorMap: Record<string, string> = {};
  let colorIndex = 0;
  offices.forEach(office => {
    if (office === '미지정') {
      officeColorMap[office] = UNASSIGNED_COLOR;
    } else {
      officeColorMap[office] = OFFICE_COLORS[colorIndex % OFFICE_COLORS.length];
      colorIndex++;
    }
  });

  const chartData = data.map(d => ({
    month: d.month,
    total: d.total,
    ...d.byOffice
  }));

  const unassignedCount = summary?.unassigned?.length || 0;

  // 집계 키(YYYY-MM)는 문자열 정렬이 곧 시간순
  const chronological = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);
  const latestMonth = chronological[chronological.length - 1];
  const priorMonth = chronological[chronological.length - 2];
  const totalDelta = latestMonth && priorMonth && priorMonth.total !== 0
    ? ((latestMonth.total - priorMonth.total) / Math.abs(priorMonth.total)) * 100
    : null;
  const sparkTotal = chronological.slice(-8).map(d => d.total);

  // 영업점이 30개 이상이라 전부 표로 펼치면 못 읽힘 - 이번 달 기준 상위 5개 + 기타로 요약
  const officeBreakdown = useMemo(() => {
    if (!latestMonth) return { top5: [] as Array<{ office: string; count: number; delta: number | null }>, otherCount: 0, otherOfficeCount: 0 };
    const entries = offices
      .map(office => {
        const count = latestMonth.byOffice[office] || 0;
        const priorCount = priorMonth?.byOffice[office] || 0;
        const delta = priorCount !== 0 ? ((count - priorCount) / Math.abs(priorCount)) * 100 : null;
        return { office, count, delta };
      })
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count);
    const top5 = entries.slice(0, 5);
    const rest = entries.slice(5);
    return {
      top5,
      otherCount: rest.reduce((sum, e) => sum + e.count, 0),
      otherOfficeCount: rest.length
    };
  }, [offices, latestMonth, priorMonth]);

  // 영업점 전체 인입수량 순위 - 선택한 조회기간 전체를 합산 (호버 없이 전체 영업점을 자유롭게 확인)
  const officeTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    chronological.forEach(period => {
      offices.forEach(o => {
        totals[o] = (totals[o] || 0) + (period.byOffice[o] || 0);
      });
    });
    const entries = offices
      .map(office => ({ office, count: totals[office] || 0 }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count);
    const grandTotal = entries.reduce((sum, e) => sum + e.count, 0);
    return { entries, grandTotal };
  }, [chronological, offices]);

  // 기간별 인입 건수 표 - 최신 기간이 먼저 오도록 정렬, 전기간 대비 증감률 포함
  const periodRows = useMemo(() => {
    return chronological
      .map((d, idx) => {
        const prev = idx > 0 ? chronological[idx - 1] : undefined;
        const delta = prev && prev.total !== 0 ? ((d.total - prev.total) / Math.abs(prev.total)) * 100 : null;
        return { ...d, delta, unassigned: d.byOffice['미지정'] || 0 };
      })
      .reverse();
  }, [chronological]);

  // 해당 기간 상세 모달 열기 - 차트 막대 클릭과 기간별 표 행 클릭이 공유
  const openPeriodDetail = useCallback((monthKey: string) => {
    const monthData = data.find(d => d.month === monthKey);
    if (!monthData || monthData.total === 0) return;

    // 해당 월에 실제 데이터가 있는 영업점만
    const activeOffices = offices.filter(o => (monthData.byOffice[o] || 0) > 0);

    setModalData({
      month: monthKey,
      monthLabel: formatPeriodLabel(monthKey, aggLevel),
      total: monthData.total,
      offices: activeOffices,
      businessesByOffice: monthData.businessesByOffice || {},
      officeColorMap
    });
  }, [data, offices, officeColorMap, aggLevel]);

  // 차트 클릭 → 해당 월 상세 모달
  const handleBarClick = useCallback((chartPayload: any) => {
    if (!chartPayload?.activeLabel) return;
    openPeriodDetail(chartPayload.activeLabel as string);
  }, [openPeriodDetail]);

  // 영업점이 많으면 전부 나열 시 겹쳐 보여서, 상위 4개 + 나머지 합계만 표시 (전체는 클릭해서 상세보기)
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);
      const activeEntries = payload.filter((e: any) => e.value > 0).sort((a: any, b: any) => b.value - a.value);
      const topEntries = activeEntries.slice(0, 4);
      const restEntries = activeEntries.slice(4);
      const restTotal = restEntries.reduce((sum: number, e: any) => sum + e.value, 0);
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg w-[200px]">
          <p className="font-bold text-sm mb-1">{formatPeriodLabel(label, aggLevel)}</p>
          <p className="text-xs text-gray-500 mb-1.5">총 {total}건 · 클릭하여 상세 보기</p>
          <div className="space-y-1">
            {topEntries.map((entry: any, index: number) => (
              <p key={index} className="text-xs flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="font-medium shrink-0">{entry.value}건</span>
              </p>
            ))}
            {restEntries.length > 0 && (
              <p className="text-xs text-gray-400 flex items-center justify-between gap-2 pt-1 mt-1 border-t border-gray-100">
                <span>외 {restEntries.length}개 영업점</span>
                <span>{restTotal}건</span>
              </p>
            )}
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
    <>
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
        {/* 헤더 */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg md:text-xl font-bold text-gray-900">영업 인입 건</h2>
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

        {/* 핵심 지표 */}
        {latestMonth && (
          <div className="flex flex-wrap gap-3 mb-3">
            <HeroStat
              label={`${periodLabels(aggLevel).current} 인입`}
              valueLabel={`${latestMonth.total.toLocaleString()}건`}
              delta={totalDelta}
              comparedTo={periodLabels(aggLevel).comparedTo}
              sparkValues={sparkTotal}
            />
          </div>
        )}

        {/* 요약 카드 */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
            <div className="px-3 py-2 rounded-lg bg-gray-50">
              <p className="text-[11px] text-gray-500">총 인입 (조회기간 누계)</p>
              <p className="text-sm font-semibold text-gray-700 tabular-nums">
                {summary.totalLeads.toLocaleString()}건
              </p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-gray-50">
              <p className="text-[11px] text-gray-500">{aggLevel === 'weekly' ? '주평균 인입' : '월평균 인입'}</p>
              <p className="text-sm font-semibold text-gray-700 tabular-nums">
                {summary.avgMonthly}건/{aggLevel === 'weekly' ? '주' : '월'}
              </p>
            </div>
            <div
              className={`px-3 py-2 rounded-lg col-span-2 lg:col-span-1 transition-colors ${
                unassignedCount > 0 ? 'bg-orange-50 hover:bg-orange-100 cursor-pointer' : 'bg-gray-50'
              }`}
              onClick={() => unassignedCount > 0 && setIsUnassignedOpen(true)}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-500">미지정 건수</p>
                {unassignedCount > 0 && (
                  <span className="text-xs text-orange-600 font-medium">목록 보기 ▶</span>
                )}
              </div>
              <p className={`text-base md:text-lg font-bold ${unassignedCount > 0 ? 'text-orange-600' : 'text-gray-500'}`}>
                {unassignedCount.toLocaleString()}건
              </p>
            </div>
          </div>
        )}

        {/* 차트+표 좌우 배치 - 기간 변경 시 페이지 스크롤 없이 표를 바로 확인할 수 있도록 배치 */}
        <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:flex-1 lg:min-w-0 flex flex-col justify-center">
        {chartData.length > 0 && offices.length > 0 ? (
          <>
            <p className="text-xs text-gray-400 text-right mb-1">막대를 클릭하면 상세 내역을 확인할 수 있습니다</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                onClick={handleBarClick}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="none" stroke="#f1f2f4" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: string) => formatAxisLabel(value, aggLevel)}
                  angle={chartData.length > 8 ? -45 : 0}
                  textAnchor={chartData.length > 8 ? 'end' : 'middle'}
                  height={chartData.length > 8 ? 55 : 30}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                {offices.map(office => (
                  <Bar
                    key={office}
                    dataKey={office}
                    name={office}
                    stackId="leads"
                    fill={officeColorMap[office] || UNASSIGNED_COLOR}
                    radius={offices.indexOf(office) === offices.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-400">
            <p className="text-sm">해당 기간의 인입 데이터가 없습니다.</p>
          </div>
        )}
        </div>

        {/* 표 영역 - 차트와 나란히 배치, 내용이 넘치면 페이지 대신 이 영역만 스크롤 */}
        <div className="lg:w-[360px] lg:shrink-0 lg:max-h-[420px] lg:overflow-y-auto lg:pr-1 space-y-5">

        {/* 영업점이 30개 이상이라 전부 표로 펼치면 못 읽힘 - 이번주(달) 상위 5개 + 기타로 요약, 호버 없이 바로 확인 */}
        {officeBreakdown.top5.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">{periodLabels(aggLevel).current} 영업점 TOP 5</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="pb-2 font-medium">영업점</th>
                    <th className="pb-2 font-medium text-right">{periodLabels(aggLevel).current}</th>
                    <th className="pb-2 font-medium text-right">{periodLabels(aggLevel).comparedTo}</th>
                  </tr>
                </thead>
                <tbody>
                  {officeBreakdown.top5.map(e => (
                    <tr key={e.office} className="border-b border-gray-50">
                      <td className="py-2 text-gray-700 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: officeColorMap[e.office] || UNASSIGNED_COLOR }} />
                        {e.office}
                      </td>
                      <td className="py-2 text-right tabular-nums font-semibold text-gray-900">{e.count}건</td>
                      <td className="py-2 text-right"><DeltaTag value={e.delta} comparedTo="" /></td>
                    </tr>
                  ))}
                  {officeBreakdown.otherOfficeCount > 0 && (
                    <tr>
                      <td className="py-2 text-gray-400">기타 {officeBreakdown.otherOfficeCount}개 영업점</td>
                      <td className="py-2 text-right tabular-nums text-gray-400">{officeBreakdown.otherCount}건</td>
                      <td className="py-2 text-right text-gray-300">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 선택 기간 전체 영업점 순위 - 특정 시점이 아니라 조회기간 전체 누계를 자유롭게 확인 */}
        {officeTotals.entries.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">조회기간 전체 영업점 순위</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="pb-2 font-medium">영업점</th>
                    <th className="pb-2 font-medium text-right">합계</th>
                    <th className="pb-2 font-medium text-right">비중</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllOfficeRanks ? officeTotals.entries : officeTotals.entries.slice(0, RANK_ROW_LIMIT)).map(e => (
                    <tr key={e.office} className="border-b border-gray-50">
                      <td className="py-2 text-gray-700 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: officeColorMap[e.office] || UNASSIGNED_COLOR }} />
                        {e.office}
                      </td>
                      <td className="py-2 text-right tabular-nums font-semibold text-gray-900">{e.count}건</td>
                      <td className="py-2 text-right tabular-nums text-gray-400">
                        {officeTotals.grandTotal > 0 ? ((e.count / officeTotals.grandTotal) * 100).toFixed(1) : '0.0'}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {officeTotals.entries.length > RANK_ROW_LIMIT && (
              <button
                onClick={() => setShowAllOfficeRanks(v => !v)}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllOfficeRanks ? 'rotate-180' : ''}`} />
                {showAllOfficeRanks ? '접기' : `${officeTotals.entries.length - RANK_ROW_LIMIT}개 영업점 더보기`}
              </button>
            )}
          </div>
        )}
        </div>

        {/* 기간별 인입 건수 표 - 영업점 TOP5 컬럼 오른쪽에 별도 컬럼으로 배치, 차트 막대만으로는 정확한 수치를 읽기 어려워서 기간별 합계를 표로도 제공 */}
        {periodRows.length > 0 && (
          <div className="lg:w-[360px] lg:shrink-0 lg:max-h-[420px] lg:overflow-y-auto lg:pr-1">
            <p className="text-xs font-medium text-gray-500 mb-2">{periodLabels(aggLevel).columnName}별 인입 건수</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="pb-2 font-medium">{periodLabels(aggLevel).columnName}</th>
                    <th className="pb-2 font-medium text-right">총 건수</th>
                    <th className="pb-2 font-medium text-right">미지정</th>
                    <th className="pb-2 font-medium text-right">{periodLabels(aggLevel).comparedTo}</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllPeriods ? periodRows : periodRows.slice(0, PERIOD_ROW_LIMIT)).map((d, i) => (
                    <tr
                      key={d.month}
                      className={`border-b border-gray-50 cursor-pointer hover:bg-blue-50 transition-colors ${i === 0 ? 'bg-blue-50/50' : ''}`}
                      onClick={() => openPeriodDetail(d.month)}
                    >
                      <td className="py-2 text-gray-700">
                        {formatPeriodLabel(d.month, aggLevel)}
                        {i === 0 && (
                          <span className="ml-1.5 text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                            {periodLabels(aggLevel).current}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums font-semibold text-gray-900">{d.total.toLocaleString()}건</td>
                      <td className="py-2 text-right tabular-nums text-gray-400">{d.unassigned > 0 ? `${d.unassigned}건` : '-'}</td>
                      <td className="py-2 text-right"><DeltaTag value={d.delta} comparedTo="" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {periodRows.length > PERIOD_ROW_LIMIT && (
              <button
                onClick={() => setShowAllPeriods(v => !v)}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllPeriods ? 'rotate-180' : ''}`} />
                {showAllPeriods ? '접기' : `${periodRows.length - PERIOD_ROW_LIMIT}개 더보기`}
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      {/* 상세 모달 */}
      {modalData && (
        <DetailModal
          modalData={modalData}
          onClose={() => setModalData(null)}
        />
      )}

      {/* 미지정 사업장 목록 모달 */}
      {isUnassignedOpen && summary && (
        <UnassignedModal
          unassigned={summary.unassigned}
          onClose={() => setIsUnassignedOpen(false)}
        />
      )}
    </>
  );
}
