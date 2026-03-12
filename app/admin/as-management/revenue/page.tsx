'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Package, Truck, Search, ChevronLeft, User, Download, X, ExternalLink } from 'lucide-react';
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
  incentive_pay: number;
  dispatch_pay: number;
  total_manager_pay: number;
  net_profit: number;
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
  incentive_pay: number;
  dispatch_pay: number;
  total_manager_pay: number;
  net_profit: number;
  records: RevenueRecord[];
}

interface ManagerPay {
  manager_name: string;
  record_count: number;
  total_dispatch_count: number;
  dispatch_pay: number;
  incentive_pay: number;
  total_pay: number;
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
  total_manager_pay: number;
  net_profit: number;
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
  const [managers, setManagers] = useState<ManagerPay[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [managerModalOpen, setManagerModalOpen] = useState(false);

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
        setManagers(json.managers || []);
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

  const downloadManagerPayExcel = async () => {
    if (!managers.length) return;
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('담당자 지급 현황');

    const CURRENCY_COLS = [4, 5, 6];
    sheet.columns = [
      { header: '담당자',               key: 'manager_name',  width: 18 },
      { header: '건수',                 key: 'record_count',  width: 10 },
      { header: '출동 횟수',            key: 'dispatch_cnt',  width: 12 },
      { header: '출동원가 지급(원)',     key: 'dispatch_pay',  width: 18 },
      { header: '자재마진 인센티브(원)', key: 'incentive_pay', width: 22 },
      { header: '총 지급액(원)',         key: 'total_pay',     width: 16 },
    ];

    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD9B3' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE07020' } } };
    });

    managers.forEach(mgr => {
      const row = sheet.addRow({
        manager_name:  mgr.manager_name,
        record_count:  mgr.record_count,
        dispatch_cnt:  mgr.total_dispatch_count,
        dispatch_pay:  mgr.dispatch_pay,
        incentive_pay: mgr.incentive_pay,
        total_pay:     mgr.total_pay,
      });
      CURRENCY_COLS.forEach(col => {
        const cell = row.getCell(col);
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right' };
      });
    });

    // 합계 행
    if (managers.length > 1) {
      const totalRow = sheet.addRow({
        manager_name:  '합계',
        record_count:  managers.reduce((s, m) => s + m.record_count, 0),
        dispatch_cnt:  managers.reduce((s, m) => s + m.total_dispatch_count, 0),
        dispatch_pay:  managers.reduce((s, m) => s + m.dispatch_pay, 0),
        incentive_pay: managers.reduce((s, m) => s + m.incentive_pay, 0),
        total_pay:     managers.reduce((s, m) => s + m.total_pay, 0),
      });
      totalRow.font = { bold: true };
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
      CURRENCY_COLS.forEach(col => {
        const cell = totalRow.getCell(col);
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right' };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `담당자지급현황_${periodFrom}~${periodTo}.xlsx`;
    link.click();
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
          <>
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
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => managers.length > 0 && setManagerModalOpen(true)}
                className="bg-orange-50 rounded-xl border border-orange-100 shadow-sm px-4 py-3 text-left hover:shadow-md hover:border-orange-200 transition-all cursor-pointer group relative"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide">담당자 지급 합계</p>
                  <ExternalLink className="w-3.5 h-3.5 text-orange-300 group-hover:text-orange-500 transition-colors" />
                </div>
                <p className="text-xl font-bold text-orange-700">{fmt(summary.total_manager_pay)}<span className="text-sm font-normal ml-1">원</span></p>
                <p className="text-xs text-orange-400 mt-1">출동원가 + 자재마진×30% · 클릭하여 담당자별 상세 보기</p>
              </button>
              <div className="bg-purple-50 rounded-xl border border-purple-100 shadow-sm px-4 py-3">
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-1">회사 실수익</p>
                <p className={`text-xl font-bold ${summary.net_profit >= 0 ? 'text-purple-700' : 'text-red-700'}`}>
                  {fmt(summary.net_profit)}<span className="text-sm font-normal ml-1">원</span>
                </p>
                <p className="text-xs text-purple-400 mt-1">순이익 - 담당자 지급 합계</p>
              </div>
            </div>
          </>
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
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-orange-400 uppercase tracking-wider">담당자 지급</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-purple-400 uppercase tracking-wider">회사 실수익</th>
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
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-orange-600">{fmt(biz.total_manager_pay)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-semibold ${biz.net_profit >= 0 ? 'text-purple-700' : 'text-red-700'}`}>
                          {fmt(biz.net_profit)}
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
                          <td colSpan={13} className="px-0 py-0">
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
                                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-orange-400 uppercase tracking-wider">담당자 지급</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-purple-400 uppercase tracking-wider">회사 실수익</th>
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
                                      <td className="px-4 py-2 text-right tabular-nums text-orange-600">{fmt(rec.total_manager_pay)}</td>
                                      <td className={`px-4 py-2 text-right tabular-nums ${rec.net_profit >= 0 ? 'text-purple-700' : 'text-red-700'}`}>
                                        {fmt(rec.net_profit)}
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
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-600">{fmt(summary.total_manager_pay)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold ${summary.net_profit >= 0 ? 'text-purple-700' : 'text-red-700'}`}>
                      {fmt(summary.net_profit)}
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

      {/* 담당자별 지급 현황 모달 */}
      {managerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setManagerModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-orange-500" />
                <span className="text-base font-semibold text-gray-800">담당자별 지급 현황</span>
                <span className="text-xs text-gray-400 ml-1">{periodFrom} ~ {periodTo}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadManagerPayExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  엑셀 다운로드
                </button>
                <button
                  onClick={() => setManagerModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            {/* 모달 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">담당자</th>
                    <th className="text-center px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-14">건수</th>
                    <th className="text-center px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-14">출동</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">출동원가 지급</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">자재마진 인센티브<br/><span className="font-normal normal-case">(자재마진×30%)</span></th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-orange-400 uppercase tracking-wider">총 지급액</th>
                  </tr>
                </thead>
                <tbody>
                  {managers.map(mgr => (
                    <tr key={mgr.manager_name} className="border-b border-gray-50 hover:bg-orange-50/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{mgr.manager_name}</td>
                      <td className="px-3 py-3 text-center text-gray-600">{mgr.record_count}</td>
                      <td className="px-3 py-3 text-center text-gray-600">{mgr.total_dispatch_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmt(mgr.dispatch_pay)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmt(mgr.incentive_pay)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-orange-600">{fmt(mgr.total_pay)}</td>
                    </tr>
                  ))}
                </tbody>
                {managers.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-orange-50/40">
                      <td className="px-5 py-3 text-xs font-bold text-gray-700 uppercase tracking-wide" colSpan={3}>합계</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-700">
                        {fmt(managers.reduce((s, m) => s + m.dispatch_pay, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-700">
                        {fmt(managers.reduce((s, m) => s + m.incentive_pay, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-600">
                        {fmt(managers.reduce((s, m) => s + m.total_pay, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* 모달 푸터 - 계산식 설명 */}
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                총 지급액 = 출동원가(전액) + (자재 매출 − 자재 원가) × 30%
              </p>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
