'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/ui/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { TokenManager } from '@/lib/api-client';
import {
  Calculator,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Download,
  AlertTriangle,
  Banknote,
  Building2,
  FileSpreadsheet,
  ArrowUpDown,
  X,
  Filter,
  History,
} from 'lucide-react';
import ApproverSelector from '@/components/approvals/ApproverSelector';

// ============================================================
// Types
// ============================================================
interface ForecastBusiness {
  id: string;
  business_name: string;
  sales_office: string | null;
  order_date: string;
  installation_date: string | null;
  local_government: string | null;
  task_status: string;
  task_status_label: string;
  task_type: string;
  task_type_label: string;
  base_installation_cost: number;
  additional_construction_cost: number;
  extra_installation_cost: number;
  total_forecast_amount: number;
  is_paid: boolean;
  paid_amount: number;
  paid_month: string | null;
  forecast_payments: any[];
}

interface ForecastStats {
  total_count: number;
  paid_count: number;
  pending_count: number;
  total_amount: number;
  paid_total: number;
}

interface DiffDetail {
  category: string;
  label: string;
  forecast_amount: number;
  final_amount: number;
  diff: number;
}

interface FinalBusiness {
  id: string;
  business_name: string;
  sales_office: string | null;
  installation_date: string;
  payment_status: string;
  has_final_record: boolean;
  final_status: string | null;
  assigned_final_month: string | null;
  forecast_total: number;
  final_total: number;
  diff_total: number;
  diff_details: DiffDetail[];
}

interface FinalStats {
  total_count: number;
  final_completed: number;
  final_pending: number;
  has_diff: number;
  total_diff: number;
  total_final_amount: number;
  total_forecast_amount: number;
}

// ============================================================
// Helpers
// ============================================================
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
}

function getStatusBadge(status: string, isPaid: boolean) {
  if (isPaid) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">완료</span>;
  }
  switch (status) {
    case 'forecast_pending':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">대기</span>;
    case 'forecast_completed':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">예측완료</span>;
    default:
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">대기</span>;
  }
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

function getMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  return `${year}년 ${parseInt(m)}월`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

// ============================================================
// Main Component
// ============================================================
export default function InstallationClosingPage() {
  const router = useRouter();
  const { user } = useAuth();

  // State
  const [month, setMonth] = useState(getCurrentMonth);
  const [activeTab, setActiveTab] = useState<'forecast' | 'final' | 'transfer' | 'history'>('forecast');
  const [businesses, setBusinesses] = useState<ForecastBusiness[]>([]);
  const [stats, setStats] = useState<ForecastStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Final tab state
  const [finalBusinesses, setFinalBusinesses] = useState<FinalBusiness[]>([]);
  const [finalStats, setFinalStats] = useState<FinalStats | null>(null);
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalSelectedIds, setFinalSelectedIds] = useState<Set<string>>(new Set());
  const [diffOnlyFilter, setDiffOnlyFilter] = useState(false);
  const [diffDetailBiz, setDiffDetailBiz] = useState<FinalBusiness | null>(null);

  // Transfer tab state
  const [transfers, setTransfers] = useState<any[]>([]);
  const [transferSummary, setTransferSummary] = useState<any>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [showAddTransfer, setShowAddTransfer] = useState(false);
  const [newTransfer, setNewTransfer] = useState({ transfer_date: '', transfer_amount: '', bank_reference: '', notes: '' });
  const [addingTransfer, setAddingTransfer] = useState(false);
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null);
  const [transferPayments, setTransferPayments] = useState<{ matched: any[]; unmatched: any[] }>({ matched: [], unmatched: [] });
  const [matchLoading, setMatchLoading] = useState(false);

  // Approval state
  const [showApprovalModal, setShowApprovalModal] = useState<'forecast' | 'final' | null>(null);
  const [approvalTeamLeaderId, setApprovalTeamLeaderId] = useState('');
  const [approvalExecutiveId, setApprovalExecutiveId] = useState('');
  const [approvalCeoId, setApprovalCeoId] = useState('');
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  // History tab state
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [historySummary, setHistorySummary] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyType, setHistoryType] = useState<'all' | 'forecast' | 'final'>('all');

  // ============================================================
  // Data Fetching
  // ============================================================
  const fetchForecastData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const token = TokenManager.getToken();
      const res = await fetch(`/api/installation-closing/forecast`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setBusinesses(data.data.businesses);
        setStats(data.data.stats);
      } else {
        setMessage({ type: 'error', text: data.message || '데이터 조회 실패' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    } finally {
      setLoading(false);
      setSelectedIds(new Set());
    }
  }, []);

  const fetchFinalData = useCallback(async () => {
    setFinalLoading(true);
    setMessage(null);
    try {
      const token = TokenManager.getToken();
      const res = await fetch(`/api/installation-closing/final?month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setFinalBusinesses(data.data.businesses);
        setFinalStats(data.data.stats);
      } else {
        setMessage({ type: 'error', text: data.message || '데이터 조회 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    } finally {
      setFinalLoading(false);
      setFinalSelectedIds(new Set());
    }
  }, [month]);

  const fetchTransferData = useCallback(async () => {
    setTransferLoading(true);
    try {
      const token = TokenManager.getToken();
      const res = await fetch(`/api/installation-closing/transfers?month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setTransfers(data.data.transfers);
        setTransferSummary(data.data.summary);
      }
    } catch {
      setMessage({ type: 'error', text: '송금 기록 조회 실패' });
    } finally {
      setTransferLoading(false);
    }
  }, [month]);

  const fetchHistoryData = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const token = TokenManager.getToken();
      const res = await fetch(`/api/installation-closing/history?month=${month}&type=${historyType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setHistoryRecords(data.data.records);
        setHistorySummary(data.data.summary);
      }
    } catch {
      setMessage({ type: 'error', text: '이력 조회 실패' });
    } finally {
      setHistoryLoading(false);
    }
  }, [month, historyType]);

  useEffect(() => {
    if (activeTab === 'forecast') {
      fetchForecastData();
    } else if (activeTab === 'final') {
      fetchFinalData();
    } else if (activeTab === 'transfer') {
      fetchTransferData();
    } else if (activeTab === 'history') {
      fetchHistoryData();
    }
  }, [fetchForecastData, fetchFinalData, fetchTransferData, fetchHistoryData, activeTab]);

  // ============================================================
  // Selection
  // ============================================================
  const pendingBusinesses = businesses.filter(b => !b.is_paid);
  const allPendingSelected = pendingBusinesses.length > 0 && pendingBusinesses.every(b => selectedIds.has(b.id));

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingBusinesses.map(b => b.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // ============================================================
  // Process Forecast
  // ============================================================
  // ============================================================
  // Final Tab Logic
  // ============================================================
  const filteredFinalBiz = diffOnlyFilter
    ? finalBusinesses.filter(b => b.diff_total !== 0)
    : finalBusinesses;

  const pendingFinalBiz = filteredFinalBiz.filter(b => b.final_status !== 'paid');

  const toggleFinalSelectAll = () => {
    if (pendingFinalBiz.every(b => finalSelectedIds.has(b.id))) {
      setFinalSelectedIds(new Set());
    } else {
      setFinalSelectedIds(new Set(pendingFinalBiz.map(b => b.id)));
    }
  };

  const toggleFinalSelect = (id: string) => {
    const next = new Set(finalSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFinalSelectedIds(next);
  };


  // ============================================================
  // Approval Logic
  // ============================================================
  const handleApprovalSubmit = async (closingType: 'forecast' | 'final') => {
    const isForecast = closingType === 'forecast';
    const selectedBiz = isForecast
      ? businesses.filter(b => selectedIds.has(b.id))
      : finalBusinesses.filter(b => finalSelectedIds.has(b.id));

    if (selectedBiz.length === 0 || !approvalCeoId) return;
    setApprovalSubmitting(true);

    try {
      const token = TokenManager.getToken();
      const items = selectedBiz.map((b: any) => ({
        business_id: b.id,
        business_name: b.business_name,
        task_type_label: b.task_type_label || b.sales_office || '',
        task_status_label: b.task_status_label || '',
        base_installation_cost: isForecast ? b.base_installation_cost : (b.diff_details?.find((d: any) => d.category === 'base_installation')?.final_amount || 0),
        extra_installation_cost: isForecast ? b.extra_installation_cost : (b.diff_details?.find((d: any) => d.category === 'extra_installation')?.final_amount || 0),
        total_amount: isForecast ? b.total_forecast_amount : b.final_total,
      }));

      const totalAmount = items.reduce((s: number, i: any) => s + i.total_amount, 0);

      const res = await fetch('/api/installation-closing/approval', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closing_type: closingType,
          business_ids: selectedBiz.map((b: any) => b.id),
          items,
          total_amount: totalAmount,
          closing_month: isForecast ? getCurrentMonth() : month,
          team_leader_id: approvalTeamLeaderId || undefined,
          executive_id: approvalExecutiveId || undefined,
          ceo_id: approvalCeoId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `${data.message}` });
        setShowApprovalModal(null);
        setApprovalTeamLeaderId('');
        setApprovalExecutiveId('');
        setApprovalCeoId('');
        if (isForecast) fetchForecastData();
        else fetchFinalData();
      } else {
        setMessage({ type: 'error', text: data.message || '결재 요청 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    } finally {
      setApprovalSubmitting(false);
    }
  };

  // ============================================================
  // Transfer Tab Logic
  // ============================================================
  const handleAddTransfer = async () => {
    if (!newTransfer.transfer_date || !newTransfer.transfer_amount) return;
    setAddingTransfer(true);
    try {
      const token = TokenManager.getToken();
      const res = await fetch('/api/installation-closing/transfers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTransfer, transfer_amount: Number(newTransfer.transfer_amount), payment_month: month }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: '송금 기록이 등록되었습니다.' });
        setShowAddTransfer(false);
        setNewTransfer({ transfer_date: '', transfer_amount: '', bank_reference: '', notes: '' });
        fetchTransferData();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch {
      setMessage({ type: 'error', text: '등록 실패' });
    } finally {
      setAddingTransfer(false);
    }
  };

  const toggleTransferExpand = async (transferId: string) => {
    if (expandedTransferId === transferId) {
      setExpandedTransferId(null);
      return;
    }
    setExpandedTransferId(transferId);
    setMatchLoading(true);
    try {
      const token = TokenManager.getToken();
      const res = await fetch(`/api/installation-closing/transfers/${transferId}/payments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setTransferPayments(data.data);
    } catch { /* ignore */ } finally {
      setMatchLoading(false);
    }
  };

  const handleReconcile = async (transferId: string, paymentIds: string[]) => {
    if (paymentIds.length === 0) return;
    try {
      const token = TokenManager.getToken();
      const res = await fetch(`/api/installation-closing/transfers/${transferId}/reconcile`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_ids: paymentIds }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        if (data.warning) setMessage({ type: 'error', text: data.warning });
        fetchTransferData();
        toggleTransferExpand(transferId); // refresh detail
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch {
      setMessage({ type: 'error', text: '대사 처리 실패' });
    }
  };

  // ============================================================
  // Excel Download
  // ============================================================
  const downloadExcel = async (
    sheetName: string,
    fileName: string,
    columns: { header: string; key: string; width: number }[],
    rows: Record<string, any>[],
    currencyKeys: string[]
  ) => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns;

    // 헤더 스타일
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF4472C4' } } };
    });

    // 금액 컬럼 인덱스 (1-based)
    const currencyColIndices = currencyKeys.map(k => columns.findIndex(c => c.key === k) + 1).filter(i => i > 0);

    rows.forEach(rowData => {
      const row = sheet.addRow(rowData);
      currencyColIndices.forEach(colIdx => {
        const cell = row.getCell(colIdx);
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right' };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExcelDownload = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}`;
    downloadExcel('예측마감', `예측마감_${dateStr}.xlsx`, [
      { header: '사업장명', key: 'business_name', width: 24 },
      { header: '업무유형', key: 'task_type_label', width: 10 },
      { header: '업무단계', key: 'task_status_label', width: 14 },
      { header: '기본설치비', key: 'base_installation_cost', width: 16 },
      { header: '추가설치비', key: 'extra_installation_cost', width: 16 },
      { header: '합계', key: 'total_forecast_amount', width: 16 },
      { header: '상태', key: 'status', width: 10 },
    ], businesses.map(b => ({
      business_name: b.business_name,
      task_type_label: b.task_type_label || '',
      task_status_label: b.task_status_label || '',
      base_installation_cost: b.base_installation_cost,
      extra_installation_cost: b.extra_installation_cost,
      total_forecast_amount: b.total_forecast_amount,
      status: b.is_paid ? '완료' : '대기',
    })), ['base_installation_cost', 'extra_installation_cost', 'total_forecast_amount']);
  };

  const handleFinalExcelDownload = () => {
    downloadExcel('본마감', `본마감_${month}.xlsx`, [
      { header: '사업장명', key: 'business_name', width: 24 },
      { header: '설치일', key: 'installation_date', width: 14 },
      { header: '기본설치비', key: 'base_cost', width: 16 },
      { header: '추가설치비', key: 'extra_cost', width: 16 },
      { header: '합계', key: 'final_total', width: 16 },
      { header: '예측지급액', key: 'forecast_total', width: 16 },
      { header: '차액', key: 'diff_total', width: 16 },
      { header: '상태', key: 'status', width: 12 },
    ], finalBusinesses.map(b => ({
      business_name: b.business_name,
      installation_date: b.installation_date,
      base_cost: b.diff_details.find(d => d.category === 'base_installation')?.final_amount || 0,
      extra_cost: b.diff_details.find(d => d.category === 'extra_installation')?.final_amount || 0,
      final_total: b.final_total,
      forecast_total: b.forecast_total,
      diff_total: b.diff_total,
      status: b.final_status === 'paid' ? '정산완료' : b.diff_total !== 0 && b.forecast_total > 0 ? '차액발생' : '대기',
    })), ['base_cost', 'extra_cost', 'final_total', 'forecast_total', 'diff_total']);
  };

  const handleTransferExcelDownload = () => {
    downloadExcel('은결정산', `은결정산_${month}.xlsx`, [
      { header: '송금일', key: 'transfer_date', width: 14 },
      { header: '송금금액', key: 'transfer_amount', width: 16 },
      { header: '매칭금액', key: 'matched_amount', width: 16 },
      { header: '상태', key: 'status', width: 12 },
      { header: '매칭건수', key: 'matched_count', width: 10 },
    ], transfers.map((t: any) => ({
      transfer_date: t.transfer_date,
      transfer_amount: Number(t.transfer_amount),
      matched_amount: Number(t.matched_amount),
      status: t.status === 'reconciled' ? '대사완료' : '미완료',
      matched_count: t.matched_count,
    })), ['transfer_amount', 'matched_amount']);
  };

  // ============================================================
  // Render
  // ============================================================
  const tabs = [
    { key: 'forecast' as const, label: '예측마감', icon: Calculator },
    { key: 'final' as const, label: '본마감', icon: CheckCircle2 },
    { key: 'transfer' as const, label: '은결 정산', icon: Banknote },
    { key: 'history' as const, label: '마감 이력', icon: History },
  ];

  return (
    <AdminLayout
      title="설치비 마감"
      description="예측마감/본마감 처리 및 은결 정산 관리"
    >
      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 월 선택 (본마감/은결 정산 탭에서만 표시) */}
      {activeTab !== 'forecast' && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMonth(m => shiftMonth(m, -1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 min-w-[120px] text-center">
              {getMonthLabel(month)}
            </h2>
            <button
              onClick={() => setMonth(m => shiftMonth(m, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      )}

      {/* 예측마감 탭 */}
      {activeTab === 'forecast' && (
        <>
          {/* 통계 카드 */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                icon={Building2}
                label="대상"
                value={`${stats.total_count}건`}
                color="blue"
              />
              <StatCard
                icon={CheckCircle2}
                label="완료"
                value={`${stats.paid_count}건`}
                color="green"
              />
              <StatCard
                icon={Clock}
                label="미처리"
                value={`${stats.pending_count}건`}
                color="yellow"
              />
              <StatCard
                icon={Banknote}
                label="총액"
                value={`${formatCurrency(stats.total_amount)}원`}
                color="purple"
              />
            </div>
          )}

          {/* 메시지 */}
          {message && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {message.text}
            </div>
          )}

          {/* 액션 바 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allPendingSelected}
                  onChange={toggleSelectAll}
                  disabled={pendingBusinesses.length === 0}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                전체선택 ({pendingBusinesses.length}건)
              </label>
              <button
                onClick={() => setShowApprovalModal('forecast')}
                disabled={selectedIds.size === 0}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                결재 요청 ({selectedIds.size}건)
              </button>
            </div>
            <button
              onClick={handleExcelDownload}
              disabled={businesses.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              엑셀
            </button>
          </div>

          {/* 테이블 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-10 px-3 py-3"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사업장명</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">업무유형</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">업무단계</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">기본설치비</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">추가설치비</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">합계</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                          데이터를 불러오는 중...
                        </div>
                      </td>
                    </tr>
                  ) : businesses.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">
                        <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        예측마감 대상 사업장이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {businesses.map(biz => (
                        <tr
                          key={biz.id}
                          className={`hover:bg-gray-50 transition-colors ${biz.is_paid ? 'bg-green-50/30' : ''}`}
                        >
                          <td className="px-3 py-3 text-center">
                            {biz.is_paid ? (
                              <span className="text-green-500">-</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(biz.id)}
                                onChange={() => toggleSelect(biz.id)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{biz.business_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-center">{biz.task_type_label || '-'}</td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
                                {biz.task_status_label || '-'}
                              </span>
                              {biz.task_status_label === '제품 발주' && biz.order_date && (
                                <span className="text-[11px] text-gray-400">
                                  {biz.order_date.substring(2)}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                            {formatCurrency(biz.base_installation_cost)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                            {biz.extra_installation_cost > 0 ? formatCurrency(biz.extra_installation_cost) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right tabular-nums">
                            {formatCurrency(biz.is_paid ? biz.paid_amount : biz.total_forecast_amount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {biz.is_paid
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">완료</span>
                              : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">대기</span>
                            }
                          </td>
                        </tr>
                      ))}
                      {/* 합계행 */}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-3"></td>
                        <td className="px-4 py-3 text-sm text-gray-700">합계</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                          {formatCurrency(businesses.reduce((s, b) => s + b.base_installation_cost, 0))}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                          {formatCurrency(businesses.reduce((s, b) => s + b.extra_installation_cost, 0))}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                          {formatCurrency(businesses.reduce((s, b) => s + b.total_forecast_amount, 0))}
                        </td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 본마감 탭 */}
      {activeTab === 'final' && (
        <>
          {/* 통계 카드 */}
          {finalStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <StatCard icon={Building2} label="대상" value={`${finalStats.total_count}건`} color="blue" />
              <StatCard icon={Banknote} label="총액" value={`${formatCurrency(finalStats.total_final_amount || 0)}원`} color="purple" />
              <StatCard icon={CheckCircle2} label="완료" value={`${finalStats.final_completed}건`} color="green" />
              <StatCard icon={Clock} label="미처리" value={`${finalStats.final_pending}건`} color="yellow" />
              <StatCard
                icon={ArrowUpDown}
                label="차액 발생"
                value={`${finalStats.has_diff}건`}
                color={finalStats.has_diff > 0 ? 'purple' : 'blue'}
              />
            </div>
          )}

          {/* 메시지 */}
          {message && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {message.text}
            </div>
          )}

          {/* 액션 바 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pendingFinalBiz.length > 0 && pendingFinalBiz.every(b => finalSelectedIds.has(b.id))}
                  onChange={toggleFinalSelectAll}
                  disabled={pendingFinalBiz.length === 0}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                전체선택 ({pendingFinalBiz.length}건)
              </label>
              <button
                onClick={() => setShowApprovalModal('final')}
                disabled={finalSelectedIds.size === 0}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                결재 요청 ({finalSelectedIds.size}건)
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <Filter className="w-4 h-4" />
                <input
                  type="checkbox"
                  checked={diffOnlyFilter}
                  onChange={(e) => setDiffOnlyFilter(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                차액있는 건만
              </label>
              <button
                onClick={handleFinalExcelDownload}
                disabled={finalBusinesses.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                엑셀
              </button>
            </div>
          </div>

          {/* 테이블 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-10 px-3 py-3"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사업장명</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">설치일</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">기본설치비</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">추가설치비</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">합계</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">예측지급</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">차액</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {finalLoading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                          데이터를 불러오는 중...
                        </div>
                      </td>
                    </tr>
                  ) : filteredFinalBiz.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500">
                        <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        {month}에 본마감 대상이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    <>
                    {filteredFinalBiz.map(biz => {
                      const isPaid = biz.final_status === 'paid';
                      const baseAmt = biz.diff_details.find(d => d.category === 'base_installation')?.final_amount || 0;
                      const extraAmt = biz.diff_details.find(d => d.category === 'extra_installation')?.final_amount || 0;
                      return (
                        <tr
                          key={biz.id}
                          className={`hover:bg-gray-50 transition-colors cursor-pointer ${isPaid ? 'bg-green-50/30' : ''}`}
                          onClick={() => setDiffDetailBiz(biz)}
                        >
                          <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {isPaid ? (
                              <span className="text-green-500">-</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={finalSelectedIds.has(biz.id)}
                                onChange={() => toggleFinalSelect(biz.id)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{biz.business_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-center">{formatDate(biz.installation_date)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">{formatCurrency(baseAmt)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                            {extraAmt > 0 ? formatCurrency(extraAmt) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right tabular-nums">{formatCurrency(biz.final_total)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums">
                            {biz.forecast_total > 0 ? formatCurrency(biz.forecast_total) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right tabular-nums font-semibold ${
                            biz.forecast_total === 0 ? 'text-gray-400' :
                            biz.diff_total > 0 ? 'text-red-600' : biz.diff_total < 0 ? 'text-blue-600' : 'text-gray-400'
                          }`}>
                            {biz.forecast_total === 0 ? '-' : biz.diff_total === 0 ? '0' : `${biz.diff_total > 0 ? '+' : ''}${formatCurrency(biz.diff_total)}`}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isPaid ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">정산완료</span>
                            ) : biz.diff_total !== 0 && biz.forecast_total > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">차액발생</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">대기</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* 합계행 */}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-3"></td>
                      <td className="px-4 py-3 text-sm text-gray-700">합계</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                        {formatCurrency(filteredFinalBiz.reduce((s, b) => s + (b.diff_details.find(d => d.category === 'base_installation')?.final_amount || 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                        {formatCurrency(filteredFinalBiz.reduce((s, b) => s + (b.diff_details.find(d => d.category === 'extra_installation')?.final_amount || 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                        {formatCurrency(filteredFinalBiz.reduce((s, b) => s + b.final_total, 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums">
                        {formatCurrency(filteredFinalBiz.reduce((s, b) => s + b.forecast_total, 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold">
                        {(() => {
                          const totalDiff = filteredFinalBiz.reduce((s, b) => s + b.diff_total, 0);
                          const totalForecast = filteredFinalBiz.reduce((s, b) => s + b.forecast_total, 0);
                          if (totalForecast === 0) return <span className="text-gray-400">-</span>;
                          return <span className={totalDiff > 0 ? 'text-red-600' : totalDiff < 0 ? 'text-blue-600' : 'text-gray-400'}>
                            {totalDiff === 0 ? '0' : `${totalDiff > 0 ? '+' : ''}${formatCurrency(totalDiff)}`}
                          </span>;
                        })()}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {/* 은결 정산 탭 */}
      {activeTab === 'transfer' && (
        <>
          {/* 월 요약 카드 */}
          {transferSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard icon={Banknote} label="송금액" value={`${formatCurrency(transferSummary.transfer_total)}원`} color="blue" />
              <StatCard icon={CheckCircle2} label="매칭 금액" value={`${formatCurrency(Number(transferSummary.total_matched))}원`} color="green" />
              <StatCard icon={AlertTriangle} label="미매칭" value={`${formatCurrency(Number(transferSummary.total_unmatched))}원`} color={Number(transferSummary.total_unmatched) > 0 ? 'yellow' : 'green'} />
              <StatCard icon={Building2} label="지급 건수" value={`${transferSummary.total_paid_count}건`} color="purple" />
            </div>
          )}

          {message && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {message.text}
            </div>
          )}

          {/* 액션 바 */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-700">은결 송금 기록</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTransferExcelDownload}
                disabled={transfers.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                엑셀
              </button>
              <button
                onClick={() => setShowAddTransfer(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                + 송금 기록 추가
              </button>
            </div>
          </div>

          {/* 송금 기록 테이블 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">송금일</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">송금 금액</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">매칭 금액</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">매칭 건수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transferLoading ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>불러오는 중...
                      </div>
                    </td></tr>
                  ) : transfers.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                      <Banknote className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      {month}에 송금 기록이 없습니다.
                    </td></tr>
                  ) : transfers.map((t: any) => {
                    const isExpanded = expandedTransferId === t.id;
                    const matchedAmt = Number(t.matched_amount);
                    const transferAmt = Number(t.transfer_amount);
                    const isReconciled = t.status === 'reconciled';
                    return (
                      <React.Fragment key={t.id}>
                        <tr
                          className={`hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : ''}`}
                          onClick={() => toggleTransferExpand(t.id)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">{t.transfer_date}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right tabular-nums">{formatCurrency(transferAmt)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">{formatCurrency(matchedAmt)}</td>
                          <td className="px-4 py-3 text-center">
                            {isReconciled ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">대사완료</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                {matchedAmt > 0 ? '부분매칭' : '미매칭'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-center">{t.matched_count}건</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} className="px-4 py-4 bg-gray-50">
                              {matchLoading ? (
                                <div className="text-center text-sm text-gray-500 py-4">상세 로딩 중...</div>
                              ) : (
                                <TransferPaymentDetail
                                  matched={transferPayments.matched}
                                  unmatched={transferPayments.unmatched}
                                  transferId={t.id}
                                  onReconcile={handleReconcile}
                                  formatCurrency={formatCurrency}
                                />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 송금 등록 모달 */}
      {showAddTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddTransfer(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">은결 송금 기록 추가</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">송금일 *</label>
                <input
                  type="date"
                  value={newTransfer.transfer_date}
                  onChange={(e) => setNewTransfer(p => ({ ...p, transfer_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">송금 금액 (원) *</label>
                <input
                  type="number"
                  value={newTransfer.transfer_amount}
                  onChange={(e) => setNewTransfer(p => ({ ...p, transfer_amount: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <input
                  type="text"
                  value={newTransfer.notes}
                  onChange={(e) => setNewTransfer(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddTransfer(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                취소
              </button>
              <button
                onClick={handleAddTransfer}
                disabled={addingTransfer || !newTransfer.transfer_date || !newTransfer.transfer_amount}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {addingTransfer ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 마감 이력 탭 */}
      {activeTab === 'history' && (
        <>
          {/* 요약 카드 */}
          {historySummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard icon={Calculator} label="예측마감" value={`${historySummary.forecast_count}건 / ${formatCurrency(historySummary.forecast_amount)}원`} color="blue" />
              <StatCard icon={CheckCircle2} label="본마감" value={`${historySummary.final_count}건 / ${formatCurrency(historySummary.final_amount)}원`} color="green" />
              <StatCard icon={ArrowUpDown} label="차액정산" value={`${historySummary.adjustment_count}건 / ${formatCurrency(historySummary.adjustment_amount)}원`} color="purple" />
              <StatCard icon={AlertTriangle} label="취소/환수" value={`${historySummary.cancelled_count}건`} color="yellow" />
            </div>
          )}

          {/* 필터 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {(['all', 'forecast', 'final'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setHistoryType(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    historyType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t === 'all' ? '전체' : t === 'forecast' ? '예측마감' : '본마감'}
                </button>
              ))}
            </div>
          </div>

          {/* 이력 테이블 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사업장명</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">유형</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">항목</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">금액</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">처리일</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">처리자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {historyLoading ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>불러오는 중...
                      </div>
                    </td></tr>
                  ) : historyRecords.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                      <History className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      {month}에 마감 이력이 없습니다.
                    </td></tr>
                  ) : historyRecords.map((r: any) => (
                    <tr key={r.id} className={`hover:bg-gray-50 ${r.status === 'cancelled' ? 'opacity-50 line-through' : ''}`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.business_name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.payment_type === 'forecast' ? 'bg-blue-100 text-blue-800' :
                          r.payment_type === 'final' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {r.payment_type === 'forecast' ? '예측' : r.payment_type === 'final' ? '본마감' : '차액'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 text-center">
                        {r.payment_category === 'base_installation' ? '기본설치비' :
                         r.payment_category === 'additional_construction' ? '추가공사비' : '추가설치비'}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right tabular-nums font-medium ${
                        Number(r.actual_amount) < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {formatCurrency(Number(r.actual_amount))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'paid' ? 'bg-green-100 text-green-800' :
                          r.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          r.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {r.status === 'paid' ? '지급완료' : r.status === 'pending' ? '대기' :
                           r.status === 'cancelled' ? '취소' : r.status === 'deducted' ? '차감' : r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 text-center">
                        {r.payment_date || r.created_at?.substring(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.created_by_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 결재 요청 모달 */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowApprovalModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {showApprovalModal === 'forecast' ? '예측마감' : '본마감'} 결재 요청
            </h3>
            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">대상 건수</span>
                <span className="font-medium">
                  {showApprovalModal === 'forecast' ? selectedIds.size : finalSelectedIds.size}건
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">총 금액</span>
                <span className="font-semibold text-blue-600">
                  {formatCurrency(
                    showApprovalModal === 'forecast'
                      ? businesses.filter(b => selectedIds.has(b.id)).reduce((s, b) => s + b.total_forecast_amount, 0)
                      : finalBusinesses.filter(b => finalSelectedIds.has(b.id)).reduce((s, b) => s + b.final_total, 0)
                  )}원
                </span>
              </div>
              <hr className="border-gray-200" />
              <div className="mt-1">
                <p className="text-xs font-medium text-gray-500 mb-3">결재 라인</p>
                <ApproverSelector
                  teamLeaderId={approvalTeamLeaderId}
                  executiveId={approvalExecutiveId}
                  ceoId={approvalCeoId}
                  onTeamLeaderChange={setApprovalTeamLeaderId}
                  onExecutiveChange={setApprovalExecutiveId}
                  onCeoChange={setApprovalCeoId}
                  requesterRole={(user as any)?.approval_role}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowApprovalModal(null); setApprovalTeamLeaderId(''); setApprovalExecutiveId(''); setApprovalCeoId(''); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleApprovalSubmit(showApprovalModal)}
                disabled={!approvalCeoId || approvalSubmitting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {approvalSubmitting ? '처리 중...' : '결재 요청'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 차액 상세 모달 */}
      {diffDetailBiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDiffDetailBiz(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{diffDetailBiz.business_name} - 차액 상세</h3>
              <button onClick={() => setDiffDetailBiz(null)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">항목</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">예측지급</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">본마감</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">차액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {diffDetailBiz.diff_details.map(d => (
                    <tr key={d.category}>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{d.label}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-600 text-right tabular-nums">{formatCurrency(d.forecast_amount)}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-900 text-right tabular-nums">{formatCurrency(d.final_amount)}</td>
                      <td className={`px-4 py-2.5 text-sm text-right tabular-nums font-semibold ${
                        d.diff > 0 ? 'text-red-600' : d.diff < 0 ? 'text-blue-600' : 'text-gray-400'
                      }`}>
                        {d.diff === 0 ? '0' : `${d.diff > 0 ? '+' : ''}${formatCurrency(d.diff)}`}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-2.5 text-sm text-gray-900">합계</td>
                    <td className="px-4 py-2.5 text-sm text-gray-900 text-right tabular-nums">{formatCurrency(diffDetailBiz.forecast_total)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-900 text-right tabular-nums">{formatCurrency(diffDetailBiz.final_total)}</td>
                    <td className={`px-4 py-2.5 text-sm text-right tabular-nums font-bold ${
                      diffDetailBiz.diff_total > 0 ? 'text-red-600' : diffDetailBiz.diff_total < 0 ? 'text-blue-600' : 'text-gray-400'
                    }`}>
                      {diffDetailBiz.diff_total === 0 ? '0' : `${diffDetailBiz.diff_total > 0 ? '+' : ''}${formatCurrency(diffDetailBiz.diff_total)}`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {diffDetailBiz.diff_total !== 0 && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${
                diffDetailBiz.diff_total > 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
              }`}>
                {diffDetailBiz.diff_total > 0
                  ? `→ 추가 지급 필요: ${formatCurrency(diffDetailBiz.diff_total)}원`
                  : `→ 과지급: ${formatCurrency(Math.abs(diffDetailBiz.diff_total))}원 (차기 월 차감)`}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setDiffDetailBiz(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// ============================================================
// Sub Components
// ============================================================
function StatCard({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: string;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  base_installation: '기본설치비',
  additional_construction: '추가공사비',
  extra_installation: '추가설치비',
};

const TYPE_LABELS: Record<string, string> = {
  forecast: '예측',
  final: '본마감',
  adjustment: '차액',
};

function TransferPaymentDetail({ matched, unmatched, transferId, onReconcile, formatCurrency }: {
  matched: any[];
  unmatched: any[];
  transferId: string;
  onReconcile: (transferId: string, paymentIds: string[]) => void;
  formatCurrency: (v: number) => string;
}) {
  const [selectedUnmatched, setSelectedUnmatched] = React.useState<Set<string>>(new Set());

  const toggleUnmatched = (id: string) => {
    const next = new Set(selectedUnmatched);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUnmatched(next);
  };

  return (
    <div className="space-y-4">
      {/* 매칭된 건 */}
      <div>
        <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase">매칭된 건 ({matched.length})</h4>
        {matched.length === 0 ? (
          <p className="text-xs text-gray-400">매칭된 건이 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {matched.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <span className="font-medium text-gray-900">{p.business_name}</span>
                  <span className="text-gray-500">{TYPE_LABELS[p.payment_type]}/{CATEGORY_LABELS[p.payment_category]}</span>
                </div>
                <span className="tabular-nums font-medium">{formatCurrency(Number(p.actual_amount))}원</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 미매칭 건 (매칭 가능) */}
      {unmatched.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-600 uppercase">미매칭 건 ({unmatched.length})</h4>
            <button
              onClick={() => onReconcile(transferId, Array.from(selectedUnmatched))}
              disabled={selectedUnmatched.size === 0}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              선택건 매칭 ({selectedUnmatched.size})
            </button>
          </div>
          <div className="space-y-1">
            {unmatched.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedUnmatched.has(p.id)}
                    onChange={() => toggleUnmatched(p.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  <span className="font-medium text-gray-900">{p.business_name}</span>
                  <span className="text-gray-500">{TYPE_LABELS[p.payment_type]}/{CATEGORY_LABELS[p.payment_category]}</span>
                </div>
                <span className="tabular-nums font-medium">{formatCurrency(Number(p.actual_amount))}원</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
