'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Package, Truck, Search, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { TokenManager } from '@/lib/api-client';
import AdminLayout from '@/components/ui/AdminLayout';

interface RevenueRecord {
  id: string;
  work_date: string;
  receipt_content: string | null;
  dispatch_count: number;
  dispatch_cost: number;
  dispatch_revenue: number;
  material_cost: number;
  material_revenue: number;
  total_cost: number;
  total_revenue: number;
  profit: number;
}

interface BusinessRevenue {
  business_id: string | null;
  business_name: string;
  record_count: number;
  total_dispatch_count: number;
  total_dispatch_cost: number;
  total_dispatch_revenue: number;
  total_material_cost: number;
  total_material_revenue: number;
  total_cost: number;
  total_revenue: number;
  profit: number;
  profit_rate: number;
  records: RevenueRecord[];
}

interface Summary {
  paid_count: number;
  total_dispatch_cost: number;
  total_dispatch_revenue: number;
  total_material_cost: number;
  total_material_revenue: number;
  total_cost: number;
  total_revenue: number;
  profit: number;
  profit_rate: number;
}

function getThisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(n: number) {
  return Math.round(n).toLocaleString();
}

function ProfitBadge({ rate }: { rate: number }) {
  const color = rate >= 30 ? 'text-emerald-700 bg-emerald-50' : rate >= 0 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
  return <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-semibold ${color}`}>{rate.toFixed(1)}%</span>;
}

export default function AsRevenuePage() {
  const thisMonth = getThisMonth();
  const [periodFrom, setPeriodFrom] = useState(thisMonth);
  const [periodTo, setPeriodTo] = useState(thisMonth);
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [businesses, setBusinesses] = useState<BusinessRevenue[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period_from: periodFrom, period_to: periodTo });
      if (businessName) params.set('business_name', businessName);
      const res = await fetch(`/api/as-revenue?${params}`, {
        headers: { 'Authorization': `Bearer ${TokenManager.getToken()}` },
      });
      const json = await res.json();
      if (json.success) {
        setSummary(json.summary);
        setBusinesses(json.businesses);
      }
    } catch (e) {
      console.error('매출 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [periodFrom, periodTo, businessName]);

  useEffect(() => { fetchRevenue(); }, [fetchRevenue]);

  const toggleExpand = (key: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <AdminLayout
      title="AS 매출관리"
      description="유상 AS 사업장별 원가·매출·순이익 현황"
    >
      <div className="max-w-7xl mx-auto space-y-5">

        {/* 뒤로가기 */}
        <div className="flex items-center">
          <Link href="/admin/as-management"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            AS 건 목록으로
          </Link>
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">기간 (시작)</label>
              <input type="month" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">기간 (종료)</label>
              <input type="month" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all" />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">사업장 검색</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)}
                  placeholder="사업장명..."
                  className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all w-full" />
              </div>
            </div>
            <button onClick={fetchRevenue}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm">
              조회
            </button>
          </div>
        </div>

        {/* 요약 카드 */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">유상 건수</p>
              <p className="text-2xl font-bold text-gray-900">{summary.paid_count}<span className="text-sm font-medium text-gray-500 ml-1">건</span></p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">총 매출</p>
              <p className="text-xl font-bold text-emerald-700">{fmt(summary.total_revenue)}<span className="text-sm font-normal ml-1">원</span></p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">총 원가</p>
              <p className="text-xl font-bold text-red-600">{fmt(summary.total_cost)}<span className="text-sm font-normal ml-1">원</span></p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">순이익</p>
              <p className={`text-xl font-bold ${summary.profit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {fmt(summary.profit)}<span className="text-sm font-normal ml-1">원</span>
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">이익률</p>
              <div className="flex items-center gap-2 mt-1">
                {summary.profit >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                <ProfitBadge rate={summary.profit_rate} />
              </div>
            </div>
          </div>
        )}

        {/* 원가 / 매출 세부 요약 */}
        {summary && (summary.total_dispatch_cost > 0 || summary.total_material_cost > 0) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-gray-700">자재</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-400 text-xs">원가</span><p className="font-semibold text-gray-800">{fmt(summary.total_material_cost)}원</p></div>
                <div><span className="text-gray-400 text-xs">매출</span><p className="font-semibold text-emerald-700">{fmt(summary.total_material_revenue)}원</p></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-gray-700">출동</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-400 text-xs">원가</span><p className="font-semibold text-gray-800">{fmt(summary.total_dispatch_cost)}원</p></div>
                <div><span className="text-gray-400 text-xs">매출</span><p className="font-semibold text-emerald-700">{fmt(summary.total_dispatch_revenue)}원</p></div>
              </div>
            </div>
          </div>
        )}

        {/* 사업장별 테이블 */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">조회 중...</p>
          </div>
        ) : businesses.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
            <TrendingUp className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-base font-semibold text-gray-700 mb-1">유상 AS 건 없음</p>
            <p className="text-sm text-gray-400">해당 기간에 유상 AS 건이 없습니다</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">사업장</th>
                  <th className="text-center px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">건수</th>
                  <th className="text-center px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">출동</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">출동 원가</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">출동 매출</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">자재 원가</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">자재 매출</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">총 매출</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">순이익</th>
                  <th className="text-center px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-20">이익률</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {businesses.map(biz => {
                  const key = biz.business_id || biz.business_name;
                  const isExpanded = expandedIds.has(key);
                  return (
                    <React.Fragment key={key}>
                      <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(key)}>
                        <td className="px-5 py-3 font-medium text-gray-900">{biz.business_name}</td>
                        <td className="px-3 py-3 text-center text-gray-600">{biz.record_count}</td>
                        <td className="px-3 py-3 text-center text-gray-600">{biz.total_dispatch_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmt(biz.total_dispatch_cost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{fmt(biz.total_dispatch_revenue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmt(biz.total_material_cost)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{fmt(biz.total_material_revenue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{fmt(biz.total_revenue)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-semibold ${biz.profit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                          {fmt(biz.profit)}
                        </td>
                        <td className="px-4 py-3 text-center"><ProfitBadge rate={biz.profit_rate} /></td>
                        <td className="px-3 py-3 text-center">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-gray-400 mx-auto" />
                            : <ChevronRight className="w-4 h-4 text-gray-400 mx-auto" />
                          }
                        </td>
                      </tr>

                      {/* 상세 펼치기 */}
                      {isExpanded && (
                        <tr className="bg-gray-50/80">
                          <td colSpan={11} className="px-0 py-0">
                            <div className="border-t border-gray-100">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-100">
                                    <th className="text-left pl-12 pr-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">작업일</th>
                                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">접수 내용</th>
                                    <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">출동</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">출동원가</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">출동매출</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">자재원가</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">자재매출</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">총매출</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">순이익</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {biz.records.map(rec => (
                                    <tr key={rec.id} className="border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                                      <td className="pl-12 pr-4 py-2 text-gray-600 whitespace-nowrap">{rec.work_date?.slice(0, 10) || '—'}</td>
                                      <td className="px-4 py-2 text-gray-600 max-w-[200px] truncate">{rec.receipt_content || '—'}</td>
                                      <td className="px-3 py-2 text-center text-gray-500">{rec.dispatch_count}회</td>
                                      <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmt(rec.dispatch_cost)}</td>
                                      <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{fmt(rec.dispatch_revenue)}</td>
                                      <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmt(rec.material_cost)}</td>
                                      <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{fmt(rec.material_revenue)}</td>
                                      <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-800">{fmt(rec.total_revenue)}</td>
                                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${rec.profit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                                        {fmt(rec.profit)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {/* 합계 행 */}
              {summary && businesses.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50/50">
                    <td className="px-5 py-3 text-xs font-bold text-gray-700 uppercase tracking-wide" colSpan={3}>합계</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-700">{fmt(summary.total_dispatch_cost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{fmt(summary.total_dispatch_revenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-700">{fmt(summary.total_material_cost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{fmt(summary.total_material_revenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">{fmt(summary.total_revenue)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold ${summary.profit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {fmt(summary.profit)}
                    </td>
                    <td className="px-4 py-3 text-center"><ProfitBadge rate={summary.profit_rate} /></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
