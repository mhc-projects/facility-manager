'use client'

import { useState, useEffect, useCallback } from 'react'
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

interface MonthlyLeadsChartProps {
  filters?: DashboardFilters;
  initialData?: any;
  loading?: boolean;
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

// 월 표시 포맷 (YYYY-MM → YYYY년 MM월)
function formatMonthFull(month: string) {
  const [y, m] = month.split('-');
  return `${y}년 ${m}월`;
}

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
              {formatMonthFull(modalData.month)} 영업 인입 건 상세
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

export default function MonthlyLeadsChart({ filters, initialData, loading: externalLoading }: MonthlyLeadsChartProps) {
  const [data, setData] = useState<MonthlyLeadsData[]>([]);
  const [summary, setSummary] = useState<MonthlyLeadsSummary | null>(null);
  const [loading, setLoading] = useState(externalLoading ?? true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isUnassignedOpen, setIsUnassignedOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);

  useEffect(() => {
    if (initialData) {
      if (initialData.success) {
        setData(initialData.data || []);
        setSummary(initialData.summary || null);
        setLastUpdate(new Date());
      }
      setLoading(false);
    } else {
      loadData();
    }
  }, []);

  useEffect(() => {
    if (!initialData) loadData();
  }, [filters]);

  useEffect(() => {
    if (externalLoading !== undefined) setLoading(externalLoading);
    if (!externalLoading && initialData?.success) {
      setData(initialData.data || []);
      setSummary(initialData.summary || null);
      setLastUpdate(new Date());
    }
  }, [externalLoading, initialData]);

  const loadData = async () => {
    try {
      setLoading(true);
      const periodParams: Record<string, string> = {};
      if (filters?.startDate && filters?.endDate) {
        periodParams.startDate = filters.startDate;
        periodParams.endDate = filters.endDate;
      } else if (filters?.periodMode === 'custom') {
        if (filters.startDate) periodParams.startDate = filters.startDate;
        if (filters.endDate) periodParams.endDate = filters.endDate;
      } else if (filters?.periodMode === 'yearly') {
        periodParams.year = String(filters.year || new Date().getFullYear());
      } else {
        periodParams.months = String(filters?.months || 12);
      }
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

  // 차트 클릭 → 해당 월 상세 모달
  const handleBarClick = useCallback((chartPayload: any) => {
    if (!chartPayload?.activeLabel) return;
    const clickedMonth = chartPayload.activeLabel as string;
    const monthData = data.find(d => d.month === clickedMonth);
    if (!monthData || monthData.total === 0) return;

    // 해당 월에 실제 데이터가 있는 영업점만
    const activeOffices = offices.filter(o => (monthData.byOffice[o] || 0) > 0);

    setModalData({
      month: clickedMonth,
      total: monthData.total,
      offices: activeOffices,
      businessesByOffice: monthData.businessesByOffice || {},
      officeColorMap
    });
  }, [data, offices, officeColorMap]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-bold text-sm mb-1">{label}</p>
          <p className="text-xs text-gray-500 mb-1">총 {total}건 · 클릭하여 상세 보기</p>
          <div className="space-y-0.5">
            {payload.map((entry: any, index: number) => (
              entry.value > 0 && (
                <p key={index} style={{ color: entry.color }} className="text-xs">
                  {entry.name}: {entry.value}건
                </p>
              )
            ))}
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
        <div className="h-80 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white p-4 md:p-6 rounded-lg shadow">
        {/* 헤더 */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
          <h2 className="text-lg md:text-xl font-bold">월별 영업 인입 건</h2>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-xs text-gray-500">{lastUpdate.toLocaleTimeString()}</span>
            )}
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

        {/* 요약 카드 */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 p-3 rounded">
              <p className="text-xs text-gray-600">총 인입 건수</p>
              <p className="text-base md:text-lg font-bold text-blue-700">
                {summary.totalLeads.toLocaleString()}건
              </p>
            </div>
            <div className="bg-emerald-50 p-3 rounded">
              <p className="text-xs text-gray-600">월평균 인입</p>
              <p className="text-base md:text-lg font-bold text-emerald-700">
                {summary.avgMonthly}건/월
              </p>
            </div>
            <div
              className={`p-3 rounded col-span-2 lg:col-span-1 transition-colors ${
                unassignedCount > 0 ? 'bg-orange-50 hover:bg-orange-100 cursor-pointer' : 'bg-gray-50'
              }`}
              onClick={() => unassignedCount > 0 && setIsUnassignedOpen(!isUnassignedOpen)}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-600">미지정 건수</p>
                {unassignedCount > 0 && (
                  <span className="text-xs text-orange-600 font-medium">
                    {isUnassignedOpen ? '접기 ▲' : '목록 보기 ▶'}
                  </span>
                )}
              </div>
              <p className={`text-base md:text-lg font-bold ${unassignedCount > 0 ? 'text-orange-600' : 'text-gray-500'}`}>
                {unassignedCount.toLocaleString()}건
              </p>
            </div>
          </div>
        )}

        {/* 미지정 사업장 인라인 목록 */}
        {isUnassignedOpen && summary && summary.unassigned.length > 0 && (
          <div className="mb-4 border border-orange-200 rounded-lg overflow-hidden">
            <div className="bg-orange-50 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-800">영업점 미지정 사업장 목록</span>
                <span className="text-xs text-orange-600">({summary.unassigned.length}건)</span>
              </div>
              <button onClick={() => setIsUnassignedOpen(false)} className="text-orange-600 hover:text-orange-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">사업장명</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">접수일</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">바로가기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.unassigned.map((biz: UnassignedBusiness) => (
                    <tr key={biz.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-800">{biz.business_name}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{biz.receipt_date}</td>
                      <td className="px-3 py-2 text-right">
                        <a
                          href={`/admin/business?openModal=${biz.id}`}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          열기 →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 차트 */}
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
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: string) => {
                    const parts = value.split('-');
                    return parts.length === 2 ? `${parts[0].slice(2)}.${parts[1]}` : value;
                  }}
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

      {/* 상세 모달 */}
      {modalData && (
        <DetailModal
          modalData={modalData}
          onClose={() => setModalData(null)}
        />
      )}
    </>
  );
}
