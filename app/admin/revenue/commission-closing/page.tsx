'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/ui/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { TokenManager } from '@/lib/api-client';
import ApproverSelector from '@/components/approvals/ApproverSelector';
import {
  HeartHandshake,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Settings,
  History,
  Building2,
  X,
  RefreshCw,
  AlertCircle,
  FileCheck,
  Clock,
  ExternalLink,
  Banknote,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Trash2,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================
interface EligibleItem {
  business_id: string;
  business_name: string;
  sales_office: string;
  progress_status: string;
  progress_type: string;
  installation_date: string | null;
  subsidy_billed_total: number;
  subsidy_paid_total: number;
  subsidy_last_payment_date: string | null;
  subsidy_fully_paid: boolean;
  self_billed_total: number;
  self_paid_total: number;
  receivable_amount: number;
  calculated_amount: number;
  actual_amount: number;
  commission_payment_id: string | null;
  commission_status: string | null;
  trigger_met: boolean;
  trigger_type: string;
  triggered_at: string | null;
  payment_month: string | null;
  hold_reason: string | null;
  hold_note: string | null;
  commission_snapshot: any;
  approval_document_id?: string | null;
}

interface SummaryGroup {
  sales_office: string;
  businesses: any[];
  total_amount: number;
  approved_count: number;
  paid_count: number;
  pending_approval_count?: number;
}

interface Config {
  self_trigger: string;
  subsidy_trigger: string;
  subsidy_paid_basis: string;
}

// ============================================================
// Helpers
// ============================================================
function formatCurrency(v: number): string {
  return new Intl.NumberFormat('ko-KR').format(v);
}

function formatDate(d: string | null): string {
  if (!d) return '-';
  return new Date(d + 'T00:00:00').toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
}

function formatDateFull(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getCurrentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${(n.getMonth() + 1).toString().padStart(2, '0')}`;
}

function getMonthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return `${y}년 ${parseInt(mo)}월`;
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

const PROGRESS_TYPE_LABELS: Record<string, string> = {
  self: '자비',
  subsidy: '보조금',
  subsidy_parallel: '보조금동시',
  subsidy_extra: '추가승인',
  dealer: '대리점',
  outsourcing: '외주',
  etc: '기타',
};

type SortField = 'business_name' | 'sales_office' | 'progress_type' | 'calculated_amount' | 'actual_amount';
type SortDir = 'asc' | 'desc';

function sortItems<T extends { business_name: string; sales_office: string; progress_type: string; calculated_amount: number; actual_amount: number }>(
  items: T[], field: SortField, dir: SortDir
): T[] {
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (field === 'calculated_amount' || field === 'actual_amount') {
      cmp = Number(a[field]) - Number(b[field]);
    } else {
      cmp = String(a[field]).localeCompare(String(b[field]), 'ko');
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function SortIcon({ field, active, dir }: { field: string; active: string; dir: SortDir }) {
  if (field !== active) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-300 inline" />;
  return dir === 'asc'
    ? <ArrowUp className="w-3 h-3 ml-1 text-blue-500 inline" />
    : <ArrowDown className="w-3 h-3 ml-1 text-blue-500 inline" />;
}

function ProgressBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    self: 'bg-blue-100 text-blue-800',
    subsidy: 'bg-green-100 text-green-800',
    subsidy_parallel: 'bg-teal-100 text-teal-800',
    subsidy_extra: 'bg-emerald-100 text-emerald-800',
    dealer: 'bg-purple-100 text-purple-800',
    outsourcing: 'bg-orange-100 text-orange-800',
    etc: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[type] ?? colors.etc}`}>
      {PROGRESS_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    eligible:          { label: '지급가능',       cls: 'bg-blue-100 text-blue-800' },
    eligible_new:      { label: '대기',            cls: 'bg-gray-100 text-gray-600' },
    pending_approval:  { label: '결재 진행 중',    cls: 'bg-yellow-100 text-yellow-800' },
    approved:          { label: '결재완료 (송금대기)', cls: 'bg-green-100 text-green-800' },
    paid:              { label: '지급완료',        cls: 'bg-gray-100 text-gray-600' },
    on_hold:           { label: '미수금 보류',     cls: 'bg-orange-100 text-orange-800' },
    cancelled:         { label: '취소',            cls: 'bg-red-100 text-red-700' },
  };
  const cfg = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ============================================================
// Main Component
// ============================================================
export default function CommissionClosingPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [month, setMonth] = useState(getCurrentMonth);
  const [activeTab, setActiveTab] = useState<'eligible' | 'summary' | 'history'>('eligible');
  const [eligibleSubTab, setEligibleSubTab] = useState<'pending' | 'ready' | 'hold'>('pending');
  const [sortField, setSortField] = useState<SortField>('business_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 지급 대상 탭
  const [eligibleItems, setEligibleItems] = useState<EligibleItem[]>([]);
  const [onHoldItems, setOnHoldItems] = useState<EligibleItem[]>([]);
  const [eligibleStats, setEligibleStats] = useState<any>(null);
  const [eligibleLoading, setEligibleLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingAmounts, setEditingAmounts] = useState<Record<string, string>>({});

  // 설정 모달
  const [config, setConfig] = useState<Config | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configDraft, setConfigDraft] = useState<Config | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // 결재 상신 모달
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalTeamLeaderId, setApprovalTeamLeaderId] = useState('');
  const [approvalExecutiveId, setApprovalExecutiveId] = useState('');
  const [approvalVicePresidentId, setApprovalVicePresidentId] = useState('');
  const [approvalCeoId, setApprovalCeoId] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [submittingApproval, setSubmittingApproval] = useState(false);

  // 영업점 집계 탭
  const [summaryGroups, setSummaryGroups] = useState<SummaryGroup[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [expandedOffices, setExpandedOffices] = useState<Set<string>>(new Set());

  // 송금 기록 모달
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetOffice, setTransferTargetOffice] = useState<string | null>(null);
  const [transferTargetIds, setTransferTargetIds] = useState<string[]>([]);
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  // 송금 이력
  const [transfers, setTransfers] = useState<any[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [expandedTransfers, setExpandedTransfers] = useState<Set<string>>(new Set());

  // 미수금 탭
  const [holdNoteEditing, setHoldNoteEditing] = useState<Record<string, string>>({});
  const [releaseConfirm, setReleaseConfirm] = useState<string | null>(null);
  const [releaseNote, setReleaseNote] = useState('');

  // 이력 탭
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [historySummary, setHistorySummary] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOffice, setHistoryOffice] = useState('');
  const [historyType, setHistoryType] = useState('');

  // ============================================================
  // Auth helper
  // ============================================================
  const authHeader = useCallback(() => {
    const token = TokenManager.getToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  // ============================================================
  // Data fetching
  // ============================================================
  const fetchEligible = useCallback(async () => {
    setEligibleLoading(true);
    try {
      const res = await fetch('/api/commission-closing/eligible', { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        setEligibleItems(data.data.eligible);
        setOnHoldItems(data.data.on_hold);
        setEligibleStats(data.data.stats);
        setConfig(data.data.config);
      } else {
        setMessage({ type: 'error', text: data.message ?? '조회 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    } finally {
      setEligibleLoading(false);
      setSelectedIds(new Set());
    }
  }, [authHeader]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/commission-closing/summary?month=${month}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        setSummaryGroups(data.data.summaries);
        setGrandTotal(data.data.grand_total);
      }
    } catch {
      setMessage({ type: 'error', text: '집계 조회 실패' });
    } finally {
      setSummaryLoading(false);
    }
  }, [month, authHeader]);

  const fetchTransfers = useCallback(async () => {
    setTransfersLoading(true);
    try {
      const res = await fetch(`/api/commission-closing/transfers?month=${month}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) setTransfers(data.data.transfers ?? []);
    } catch {
      /* silent */
    } finally {
      setTransfersLoading(false);
    }
  }, [month, authHeader]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (historyOffice) params.set('sales_office', historyOffice);
      if (historyType) params.set('progress_type', historyType);
      const res = await fetch(`/api/commission-closing/history?${params}`, { headers: authHeader() });
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
  }, [month, historyOffice, historyType, authHeader]);

  useEffect(() => { fetchEligible(); }, [fetchEligible]);

  useEffect(() => {
    if (activeTab === 'summary') { fetchSummary(); fetchTransfers(); }
  }, [activeTab, fetchSummary, fetchTransfers]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  // 서브탭별 필터링 (Actions에서 참조하므로 먼저 정의)
  const pendingItems = eligibleItems.filter(i => i.commission_status === 'eligible_new');
  const readyItems   = eligibleItems.filter(i => i.commission_status === 'eligible');

  // ============================================================
  // Actions
  // ============================================================
  const handleProcess = useCallback(async () => {
    const targets = eligibleItems.filter(i => selectedIds.has(i.business_id));
    if (!targets.length) return;
    setMessage(null);
    try {
      const businesses = targets.map(item => ({
        business_id: item.business_id,
        sales_office: item.sales_office,
        progress_type: item.progress_type,
        calculated_amount: item.calculated_amount,
        actual_amount: editingAmounts[item.business_id]
          ? parseInt(editingAmounts[item.business_id].replace(/,/g, ''))
          : item.actual_amount,
        trigger_type: item.trigger_type,
        receivable_amount: item.receivable_amount,
        snapshot_data: item.commission_snapshot,
      }));
      const res = await fetch('/api/commission-closing/process', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ businesses, payment_month: month }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchEligible();
        setEligibleSubTab('ready');
        setMessage({ type: 'success', text: `${data.data.processed}건 처리 완료. 결재 상신 대기 탭에서 확인하세요.` });
      } else {
        setMessage({ type: 'error', text: data.message ?? '처리 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    }
  }, [eligibleItems, selectedIds, editingAmounts, month, authHeader, fetchEligible]);

  const handleSubmitApproval = useCallback(async () => {
    if (!approvalCeoId) {
      setMessage({ type: 'error', text: '대표이사 결재자를 선택해주세요.' });
      return;
    }
    // 결재 상신 대기 탭의 선택된 항목에서 commission_payment_id 수집
    const ids = readyItems
      .filter(i => selectedIds.has(i.business_id) && i.commission_payment_id)
      .map(i => i.commission_payment_id!);

    if (!ids.length) {
      setMessage({ type: 'error', text: '먼저 [처리] 후 결재 상신을 진행해주세요.' });
      return;
    }

    setSubmittingApproval(true);
    setMessage(null);
    try {
      const res = await fetch('/api/commission-closing/approval', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commission_payment_ids: ids,
          payment_month: month,
          note: approvalNote,
          team_leader_id: approvalTeamLeaderId || null,
          executive_id: approvalExecutiveId || null,
          vice_president_id: approvalVicePresidentId || null,
          ceo_id: approvalCeoId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setShowApprovalModal(false);
        setApprovalNote('');
        fetchEligible();
        fetchSummary();
      } else {
        setMessage({ type: 'error', text: data.message ?? '결재 상신 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    } finally {
      setSubmittingApproval(false);
    }
  }, [
    approvalCeoId, approvalTeamLeaderId, approvalExecutiveId, approvalVicePresidentId,
    approvalNote, eligibleItems, selectedIds, month, authHeader, fetchEligible, fetchSummary,
  ]);

  const handleCreateTransfer = useCallback(async () => {
    if (!transferDate || !transferAmount || !transferTargetOffice || !transferTargetIds.length) return;
    setSubmittingTransfer(true);
    setMessage(null);
    try {
      const res = await fetch('/api/commission-closing/transfers', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sales_office: transferTargetOffice,
          transfer_date: transferDate,
          transfer_amount: parseInt(transferAmount.replace(/,/g, '')),
          bank_reference: transferRef || null,
          payment_month: month,
          notes: transferNote || null,
          commission_payment_ids: transferTargetIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setShowTransferModal(false);
        setTransferRef('');
        setTransferNote('');
        fetchSummary();
        fetchTransfers();
      } else {
        setMessage({ type: 'error', text: data.message ?? '송금 기록 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    } finally {
      setSubmittingTransfer(false);
    }
  }, [
    transferDate, transferAmount, transferTargetOffice, transferTargetIds,
    transferRef, transferNote, month, authHeader, fetchSummary, fetchTransfers,
  ]);

  const handleCancelProcess = useCallback(async () => {
    const ids = readyItems
      .filter(i => selectedIds.has(i.business_id) && i.commission_payment_id)
      .map(i => i.commission_payment_id!);
    if (!ids.length) return;
    setMessage(null);
    try {
      const res = await fetch('/api/commission-closing/cancel', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ commission_payment_ids: ids }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchEligible();
        setEligibleSubTab('pending');
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.message ?? '취소 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    }
  }, [readyItems, selectedIds, authHeader, fetchEligible]);

  const handleRelease = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/commission-closing/hold/${id}/release`, {
        method: 'PUT',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_note: releaseNote }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: '보류 해제 완료' });
        setReleaseConfirm(null);
        setReleaseNote('');
        fetchEligible();
      } else {
        setMessage({ type: 'error', text: data.message ?? '해제 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    }
  }, [authHeader, releaseNote, fetchEligible]);

  const handleSaveNote = useCallback(async (id: string) => {
    const note = holdNoteEditing[id];
    if (!note?.trim()) return;
    try {
      await fetch('/api/commission-closing/hold', {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, hold_note: note }),
      });
      setHoldNoteEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
      fetchEligible();
    } catch {
      setMessage({ type: 'error', text: '메모 저장 실패' });
    }
  }, [holdNoteEditing, authHeader, fetchEligible]);

  const handleDeleteHistory = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/commission-closing/history/${id}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: '이력이 삭제되었습니다.' });
        setDeleteConfirmId(null);
        fetchHistory();
      } else {
        setMessage({ type: 'error', text: data.message ?? '삭제 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 연결 실패' });
    }
  }, [authHeader, fetchHistory]);

  const handleSaveConfig = useCallback(async () => {
    if (!configDraft) return;
    setSavingConfig(true);
    try {
      const res = await fetch('/api/commission-closing/config', {
        method: 'PUT',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(configDraft),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        setShowConfigModal(false);
        setMessage({ type: 'success', text: '트리거 설정 저장 완료' });
        fetchEligible();
      }
    } catch {
      setMessage({ type: 'error', text: '설정 저장 실패' });
    } finally {
      setSavingConfig(false);
    }
  }, [configDraft, authHeader, fetchEligible]);

  const handleExport = useCallback(async () => {
    const token = TokenManager.getToken();
    const url = `/api/commission-closing/export?month=${month}&status=approved`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setMessage({ type: 'error', text: 'Excel 생성 실패' }); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `영업비_지급명세_${month}.xlsx`;
    a.click();
  }, [month]);

  // ============================================================
  const rawSubItems = eligibleSubTab === 'pending' ? pendingItems : eligibleSubTab === 'ready' ? readyItems : onHoldItems;
  const sortedSubItems = eligibleSubTab === 'hold' ? rawSubItems : sortItems(rawSubItems, sortField, sortDir);
  const activeSubItems = sortedSubItems;

  const allEligibleItems = [...pendingItems, ...readyItems, ...onHoldItems];
  const isGlobalSearch = searchQuery.trim().length > 0;
  const globalSearchItems = isGlobalSearch
    ? allEligibleItems.filter(i => {
        const q = searchQuery.toLowerCase();
        return (
          i.business_name.toLowerCase().includes(q) ||
          i.sales_office.toLowerCase().includes(q) ||
          (PROGRESS_TYPE_LABELS[i.progress_type] ?? i.progress_type).toLowerCase().includes(q)
        );
      })
    : [];

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // ============================================================
  // Selection helpers
  // ============================================================

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === activeSubItems.length && activeSubItems.every(i => selectedIds.has(i.business_id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeSubItems.map(i => i.business_id)));
    }
  };

  const allSelected = activeSubItems.length > 0 && activeSubItems.every(i => selectedIds.has(i.business_id));

  // 처리 대기 / 결재 상신 탭에서 선택된 수
  const selectedPendingCount = pendingItems.filter(i => selectedIds.has(i.business_id)).length;
  const processedSelectedCount = readyItems.filter(i => selectedIds.has(i.business_id)).length;

  // ============================================================
  // Permission guard
  // ============================================================
  if (!user || (user as any).permission_level < 3) {
    return (
      <AdminLayout title="영업비 마감" description="관리자 전용 페이지입니다.">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">접근 권한이 없습니다. (관리자 권한 필요)</p>
        </div>
      </AdminLayout>
    );
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <AdminLayout title="영업비 마감" description="영업점 영업비 지급 관리 및 미수금 보류 처리">
      <div className="space-y-4">

        {/* 월 선택 + 탭 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="p-1.5 rounded-md hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-lg font-semibold text-gray-800 min-w-[120px] text-center">
              {getMonthLabel(month)}
            </span>
            <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="p-1.5 rounded-md hover:bg-gray-100">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(
              [
                { key: 'eligible', label: '지급 대상',   icon: CheckCircle2 },
                { key: 'summary',  label: '영업점 집계', icon: Building2 },
                { key: 'history',  label: '지급 이력',   icon: History },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {key === 'eligible' && onHoldItems.length > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                    {onHoldItems.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 메시지 */}
        {message && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{message.text}</span>
            <button onClick={() => setMessage(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* ── 탭 1: 지급 대상 ── */}
        {activeTab === 'eligible' && (
          <div className="space-y-4">
            {/* 통계 카드 */}
            {eligibleStats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-xs text-blue-600 font-medium mb-1">처리 대기</p>
                  <p className="text-2xl font-bold text-blue-700">{pendingItems.length}건</p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                  <p className="text-xs text-indigo-600 font-medium mb-1">결재 상신 대기</p>
                  <p className="text-2xl font-bold text-indigo-700">{readyItems.length}건</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                  <p className="text-xs text-orange-600 font-medium mb-1">미수금 보류</p>
                  <p className="text-2xl font-bold text-orange-700">{eligibleStats.on_hold_count}건</p>
                </div>
              </div>
            )}

            {/* 액션 바 */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="사업장명, 영업점, 유형 검색..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {isGlobalSearch && (() => {
                  const holdInSearch = globalSearchItems.filter(i => Number(i.receivable_amount) > 0);
                  return (
                    <span className="flex items-center gap-2.5 text-sm text-gray-500 whitespace-nowrap">
                      <span>
                        <span className="font-semibold text-gray-800">{globalSearchItems.length}</span> / {allEligibleItems.length}건
                      </span>
                      <span className="text-gray-300">|</span>
                      <span>산정 <span className="font-semibold text-gray-700">₩{formatCurrency(globalSearchItems.reduce((s, i) => s + Number(i.calculated_amount), 0))}</span></span>
                      <span>실지급 <span className="font-semibold text-gray-700">₩{formatCurrency(globalSearchItems.reduce((s, i) => s + Number(i.actual_amount), 0))}</span></span>
                      {holdInSearch.length > 0 && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded text-xs font-medium">
                            ⚠️ 미수금 보류 {holdInSearch.length}건 · 영업비 ₩{formatCurrency(holdInSearch.reduce((s, i) => s + Number(i.actual_amount ?? i.calculated_amount ?? 0), 0))}
                          </span>
                        </>
                      )}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                {(eligibleSubTab === 'pending' || (isGlobalSearch && selectedPendingCount > 0)) && (
                  <button
                    onClick={handleProcess}
                    disabled={isGlobalSearch ? selectedPendingCount === 0 : selectedIds.size === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    처리 ({isGlobalSearch ? selectedPendingCount : selectedIds.size}건)
                  </button>
                )}
                {(eligibleSubTab === 'ready' || (isGlobalSearch && processedSelectedCount > 0)) && (
                  <>
                    <button
                      onClick={() => setShowApprovalModal(true)}
                      disabled={isGlobalSearch ? processedSelectedCount === 0 : selectedIds.size === 0}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <FileCheck className="w-4 h-4" />
                      결재 상신 ({isGlobalSearch ? processedSelectedCount : selectedIds.size}건)
                    </button>
                    <button
                      onClick={handleCancelProcess}
                      disabled={isGlobalSearch ? processedSelectedCount === 0 : selectedIds.size === 0}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed text-red-600 border border-red-200 text-sm font-medium rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                      처리 취소 ({isGlobalSearch ? processedSelectedCount : selectedIds.size}건)
                    </button>
                  </>
                )}
                <button onClick={fetchEligible} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => { setConfigDraft(config ? { ...config } : null); setShowConfigModal(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:bg-gray-100 border border-gray-200 text-sm font-medium rounded-lg"
              >
                <Settings className="w-4 h-4" />
                트리거 설정
              </button>
            </div>

            {/* 서브탭 */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex border-b border-gray-200 bg-gray-50">
                {(
                  [
                    { key: 'pending', label: '처리 대기',      count: pendingItems.length,  activeColor: 'border-blue-600 text-blue-700',   badgeColor: 'bg-blue-100 text-blue-700' },
                    { key: 'ready',   label: '결재 상신 대기', count: readyItems.length,    activeColor: 'border-indigo-600 text-indigo-700', badgeColor: 'bg-indigo-100 text-indigo-700' },
                    { key: 'hold',    label: '미수금 보류',    count: onHoldItems.length,   activeColor: 'border-orange-600 text-orange-700', badgeColor: 'bg-orange-100 text-orange-700' },
                  ] as const
                ).map(({ key, label, count, activeColor, badgeColor }) => (
                  <button
                    key={key}
                    onClick={() => { setEligibleSubTab(key); setSelectedIds(new Set()); setSearchQuery(''); }}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      eligibleSubTab === key ? `${activeColor} bg-white` : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${
                        eligibleSubTab === key ? badgeColor : 'bg-gray-200 text-gray-600'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {eligibleLoading ? (
                <div className="py-12 text-center text-gray-400 text-sm">로딩 중...</div>
              ) : isGlobalSearch ? (
                /* 전체 검색 결과 */
                globalSearchItems.length === 0 ? (
                  <div className="py-12 text-center">
                    <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">검색 결과가 없습니다.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
                      전체 탭에서 검색된 결과입니다. 항목을 처리하려면 해당 탭을 선택하세요.
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="w-10 px-3 py-2.5">
                            {(() => {
                              const selectable = globalSearchItems.filter(i => i.commission_status !== 'on_hold');
                              const allChk = selectable.length > 0 && selectable.every(i => selectedIds.has(i.business_id));
                              return (
                                <input type="checkbox" className="rounded" checked={allChk}
                                  onChange={() => {
                                    if (allChk) { setSelectedIds(new Set()); }
                                    else { setSelectedIds(new Set(selectable.map(i => i.business_id))); }
                                  }}
                                />
                              );
                            })()}
                          </th>
                          <th className="px-3 py-2.5 text-left text-xs text-gray-500 font-medium">사업장명</th>
                          <th className="px-3 py-2.5 text-left text-xs text-gray-500 font-medium">영업점</th>
                          <th className="px-3 py-2.5 text-left text-xs text-gray-500 font-medium">유형</th>
                          <th className="px-3 py-2.5 text-left text-xs text-gray-500 font-medium">상태</th>
                          <th className="px-3 py-2.5 text-left text-xs text-gray-500 font-medium">트리거 충족</th>
                          <th className="px-3 py-2.5 text-left text-xs text-gray-500 font-medium">미수금</th>
                          <th className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium">산정 영업비</th>
                          <th className="px-3 py-2.5 text-right text-xs text-gray-500 font-medium">실지급액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {globalSearchItems.map(item => (
                          <tr key={item.business_id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2.5">
                              {item.commission_status !== 'on_hold' ? (
                                <input type="checkbox" className="rounded"
                                  checked={selectedIds.has(item.business_id)}
                                  onChange={() => toggleSelect(item.business_id)}
                                />
                              ) : (
                                <input type="checkbox" className="rounded opacity-30 cursor-not-allowed" disabled />
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-gray-900">{item.business_name}</td>
                            <td className="px-3 py-2.5 text-gray-600">{item.sales_office}</td>
                            <td className="px-3 py-2.5"><ProgressBadge type={item.progress_type} /></td>
                            <td className="px-3 py-2.5"><StatusBadge status={item.commission_status ?? ''} /></td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs">
                              {item.progress_type === 'self'
                                ? item.installation_date ? `설치완료 ${formatDate(item.installation_date)}` : '-'
                                : item.subsidy_last_payment_date
                                  ? `보조금완납 ${formatDate(item.subsidy_last_payment_date)}`
                                  : '-'}
                            </td>
                            <td className="px-3 py-2.5">
                              {item.receivable_amount > 0 ? (
                                <div className="inline-block bg-red-50 rounded px-1.5 py-0.5">
                                  <div className="text-[10px] text-gray-500">미수금</div>
                                  <div className="font-mono font-bold text-red-600 text-xs">
                                    ₩{formatCurrency(item.receivable_amount)} ⚠️
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-700">₩{formatCurrency(item.calculated_amount)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-700">₩{formatCurrency(item.actual_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : eligibleSubTab === 'hold' ? (
                /* 미수금 보류 탭 */
                onHoldItems.length === 0 ? (
                  <div className="py-12 text-center">
                    <CheckCircle2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">보류 중인 건이 없습니다.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    <div className="px-4 py-2.5 bg-orange-50 border-b border-orange-100 text-xs text-orange-700 space-y-0.5">
                      <p>미수금 전액 입금 시까지 영업비 지급 보류. 수금 확인 후 [보류 해제]를 눌러주세요.</p>
                      <p className="text-orange-500">※ 설치 완료 후 보조금 완납 전인 건은 트리거 조건 미충족으로 이 목록에 표시되지 않습니다. 매출관리의 미수금 건수와 차이가 있을 수 있습니다.</p>
                    </div>
                    {onHoldItems.map(item => (
                      <div key={item.business_id} className="bg-white">
                        <div className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900">{item.business_name}</span>
                              <span className="text-sm text-gray-500">{item.sales_office}</span>
                              <ProgressBadge type={item.progress_type} />
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-800">
                                {item.hold_reason === 'receivable' ? '미수금 보류' : '수동 보류'}
                              </span>
                            </div>
                            {['subsidy', 'subsidy_parallel', 'subsidy_extra'].includes(item.progress_type) && (
                              <div className="flex items-center gap-3 text-sm flex-wrap">
                                <span className="text-gray-500">청구: <strong className="text-gray-700">₩{formatCurrency(item.subsidy_billed_total)}</strong></span>
                                <span className="text-gray-400">|</span>
                                <span className="text-gray-500">입금: <strong className="text-green-700">₩{formatCurrency(item.subsidy_paid_total)}</strong></span>
                                <span className="text-gray-400">|</span>
                                <span className="text-orange-600 font-semibold">미수금: ₩{formatCurrency(item.receivable_amount)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              {holdNoteEditing[item.commission_payment_id ?? ''] !== undefined ? (
                                <>
                                  <input
                                    type="text"
                                    className="border border-gray-300 rounded px-2 py-1 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="수금 진행 상황 메모..."
                                    value={holdNoteEditing[item.commission_payment_id ?? '']}
                                    onChange={e => setHoldNoteEditing(prev => ({ ...prev, [item.commission_payment_id ?? '']: e.target.value }))}
                                  />
                                  <button onClick={() => handleSaveNote(item.commission_payment_id ?? '')} className="px-2 py-1 bg-blue-600 text-white text-xs rounded">저장</button>
                                  <button onClick={() => setHoldNoteEditing(prev => { const n = { ...prev }; delete n[item.commission_payment_id ?? '']; return n; })} className="px-2 py-1 text-gray-500 text-xs">취소</button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setHoldNoteEditing(prev => ({ ...prev, [item.commission_payment_id ?? '']: item.hold_note ?? '' }))}
                                  className="text-xs text-gray-400 hover:text-blue-500"
                                >
                                  {item.hold_note ? `📝 ${item.hold_note}` : '+ 메모 추가'}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="text-xs text-gray-400">보류 영업비</p>
                              <p className="font-bold text-orange-700">₩{formatCurrency(item.calculated_amount)}</p>
                            </div>
                            {item.commission_payment_id && (
                              <button
                                onClick={() => { setReleaseConfirm(item.commission_payment_id!); setReleaseNote(''); }}
                                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg"
                              >
                                보류 해제
                              </button>
                            )}
                          </div>
                        </div>
                        {releaseConfirm === item.commission_payment_id && (
                          <div className="border-t border-orange-100 bg-orange-50 px-4 py-3 space-y-2">
                            <p className="text-sm font-medium text-orange-800">미수금이 회수되었음을 확인했습니까?</p>
                            <input
                              type="text"
                              className="border border-orange-200 bg-white rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-orange-400"
                              placeholder="회수 확인 내용 (선택)"
                              value={releaseNote}
                              onChange={e => setReleaseNote(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button onClick={() => handleRelease(item.commission_payment_id!)} className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg">확인 후 해제</button>
                              <button onClick={() => setReleaseConfirm(null)} className="px-4 py-1.5 text-gray-600 hover:bg-gray-100 text-sm rounded-lg">취소</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : activeSubItems.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">
                    {eligibleSubTab === 'pending' ? '처리 대기 중인 건이 없습니다.' : '결재 상신 대기 중인 건이 없습니다.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="w-10 px-3 py-2.5">
                          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" />
                        </th>
                        {([
                          { field: 'business_name',     label: '사업장명',   align: 'text-left'  },
                          { field: 'sales_office',      label: '영업점',     align: 'text-left'  },
                          { field: 'progress_type',     label: '유형',       align: 'text-left'  },
                          { field: null,                label: '트리거 충족', align: 'text-left'  },
                          { field: 'calculated_amount', label: '산정 영업비', align: 'text-right' },
                          { field: 'actual_amount',     label: '실지급액',   align: 'text-right' },
                        ] as const).map(({ field, label, align }) => (
                          <th
                            key={label}
                            className={`px-3 py-2.5 ${align} text-xs text-gray-500 font-medium ${field ? 'cursor-pointer select-none hover:text-gray-800' : ''}`}
                            onClick={field ? () => handleSort(field as SortField) : undefined}
                          >
                            {label}
                            {field && <SortIcon field={field} active={sortField} dir={sortDir} />}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {activeSubItems.map(item => (
                        <tr key={item.business_id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={selectedIds.has(item.business_id)} onChange={() => toggleSelect(item.business_id)} className="rounded" />
                          </td>
                          <td className="px-3 py-2.5 font-medium text-gray-900">{item.business_name}</td>
                          <td className="px-3 py-2.5 text-gray-600">{item.sales_office}</td>
                          <td className="px-3 py-2.5"><ProgressBadge type={item.progress_type} /></td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">
                            {item.progress_type === 'self'
                              ? item.installation_date ? `설치완료 ${formatDate(item.installation_date)}` : '-'
                              : item.subsidy_last_payment_date
                                ? `보조금완납 ${formatDate(item.subsidy_last_payment_date)}`
                                : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">₩{formatCurrency(item.calculated_amount)}</td>
                          <td className="px-3 py-2.5 text-right">
                            {editingAmounts[item.business_id] !== undefined ? (
                              <input
                                type="text"
                                className="w-28 text-right border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={editingAmounts[item.business_id]}
                                onChange={e => setEditingAmounts(prev => ({ ...prev, [item.business_id]: e.target.value }))}
                                onBlur={() => {
                                  const v = parseInt((editingAmounts[item.business_id] ?? '').replace(/,/g, ''));
                                  if (isNaN(v)) setEditingAmounts(prev => { const n = { ...prev }; delete n[item.business_id]; return n; });
                                }}
                              />
                            ) : (
                              <button
                                className="font-mono text-gray-700 hover:text-blue-600 hover:underline"
                                title="클릭하여 수정"
                                onClick={() => setEditingAmounts(prev => ({ ...prev, [item.business_id]: String(item.actual_amount) }))}
                              >
                                ₩{formatCurrency(item.actual_amount)}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 탭 2: 영업점 집계 ── */}
        {activeTab === 'summary' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">결재 완료 건을 영업점별로 집계합니다.</p>
              <div className="flex gap-2">
                <button onClick={handleExport} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50">
                  <Download className="w-4 h-4" />Excel
                </button>
                <button onClick={() => { fetchSummary(); fetchTransfers(); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {summaryLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm">로딩 중...</div>
            ) : (
              <>
                {/* ① 결재 진행 중 */}
                {summaryGroups.some(g => (g.pending_approval_count ?? 0) > 0) && (
                  <section>
                    <h3 className="text-sm font-semibold text-yellow-700 mb-2 flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />결재 진행 중
                    </h3>
                    <div className="space-y-2">
                      {summaryGroups.filter(g => (g.pending_approval_count ?? 0) > 0).map(group => (
                        <div key={`pa-${group.sales_office}`} className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Building2 className="w-4 h-4 text-yellow-600" />
                            <span className="font-semibold text-gray-800">{group.sales_office}</span>
                            <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">
                              결재 중 {group.pending_approval_count}건
                            </span>
                          </div>
                          <span className="text-sm text-yellow-700">결재 완료 후 송금 가능</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ② 결재 완료 / 송금 대기 */}
                {summaryGroups.some(g => g.approved_count > 0) && (
                  <section>
                    <h3 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />결재 완료 — 송금 대기
                    </h3>
                    <div className="space-y-2">
                      {summaryGroups.filter(g => g.approved_count > 0).map(group => {
                        const approvedBizes = group.businesses.filter((b: any) => b.status === 'approved');
                        const approvedTotal = approvedBizes.reduce((s: number, b: any) => s + (b.actual_amount ?? 0), 0);
                        return (
                          <div key={`ap-${group.sales_office}`} className="bg-white border border-green-200 rounded-xl overflow-hidden">
                            <div
                              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-green-50/30"
                              onClick={() => setExpandedOffices(prev => {
                                const next = new Set(prev);
                                next.has(group.sales_office) ? next.delete(group.sales_office) : next.add(group.sales_office);
                                return next;
                              })}
                            >
                              <div className="flex items-center gap-3">
                                <Building2 className="w-4 h-4 text-green-600" />
                                <span className="font-semibold text-gray-800">{group.sales_office}</span>
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                  {approvedBizes.length}건
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-gray-800">₩{formatCurrency(approvedTotal)}</span>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setTransferTargetOffice(group.sales_office);
                                    setTransferTargetIds(approvedBizes.map((b: any) => b.id));
                                    setTransferAmount(String(approvedTotal));
                                    setShowTransferModal(true);
                                  }}
                                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg"
                                >
                                  <Banknote className="w-3.5 h-3.5 inline mr-1" />
                                  송금 기록 입력
                                </button>
                                {expandedOffices.has(group.sales_office)
                                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                                  : <ChevronDown className="w-4 h-4 text-gray-400" />}
                              </div>
                            </div>
                            {expandedOffices.has(group.sales_office) && (
                              <div className="border-t border-green-100">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-green-50/50">
                                      <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">사업장명</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">유형</th>
                                      <th className="px-4 py-2 text-right text-xs text-gray-500 font-medium">지급액</th>
                                      <th className="px-4 py-2 text-center text-xs text-gray-500 font-medium">결재완료일</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-green-50">
                                    {approvedBizes.map((biz: any) => (
                                      <tr key={biz.id} className="hover:bg-green-50/30">
                                        <td className="px-4 py-2 font-medium text-gray-800">{biz.business_name}</td>
                                        <td className="px-4 py-2"><ProgressBadge type={biz.progress_type} /></td>
                                        <td className="px-4 py-2 text-right font-mono text-gray-700">₩{formatCurrency(biz.actual_amount)}</td>
                                        <td className="px-4 py-2 text-center text-xs text-gray-500">{biz.approved_at ? formatDate(biz.approved_at) : '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {summaryGroups.length === 0 && (
                  <div className="py-12 text-center">
                    <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">이번 달 결재/승인 건이 없습니다.</p>
                  </div>
                )}
              </>
            )}

            {/* ③ 송금 이력 */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-gray-500" />
                송금 이력 {transfers.length > 0 && `(${transfers.length}건)`}
              </h3>
              {transfersLoading ? (
                <div className="py-6 text-center text-gray-400 text-sm">로딩 중...</div>
              ) : transfers.length === 0 ? (
                <div className="bg-gray-50 rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-400">
                  이번 달 송금 기록이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {transfers.map((tr: any) => (
                    <div key={tr.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div
                        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandedTransfers(prev => {
                          const next = new Set(prev);
                          next.has(tr.id) ? next.delete(tr.id) : next.add(tr.id);
                          return next;
                        })}
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">
                            {formatDateFull(tr.transfer_date)}
                          </span>
                          <span className="text-gray-600">{tr.sales_office}</span>
                          {tr.bank_reference && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                              {tr.bank_reference}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">{tr.payment_count}건</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-gray-800">₩{formatCurrency(tr.transfer_amount)}</span>
                          {expandedTransfers.has(tr.id)
                            ? <ChevronUp className="w-4 h-4 text-gray-400" />
                            : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>
                      {expandedTransfers.has(tr.id) && (
                        <div className="border-t border-gray-100">
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-gray-50">
                              {(tr.businesses ?? []).map((b: any, i: number) => (
                                <tr key={i} className="hover:bg-gray-50/50">
                                  <td className="px-4 py-2 font-medium text-gray-800">{b.business_name}</td>
                                  <td className="px-4 py-2"><ProgressBadge type={b.progress_type} /></td>
                                  <td className="px-4 py-2 text-right font-mono text-gray-700">₩{formatCurrency(b.actual_amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {tr.notes && <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-50">📝 {tr.notes}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── 탭 3: 지급 이력 ── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input type="text" placeholder="영업점 필터" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-blue-500" value={historyOffice} onChange={e => setHistoryOffice(e.target.value)} />
              <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={historyType} onChange={e => setHistoryType(e.target.value)}>
                <option value="">전체 유형</option>
                {Object.entries(PROGRESS_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button onClick={fetchHistory} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">조회</button>
            </div>
            {historySummary && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
                  <p className="text-xs text-gray-500">전체</p>
                  <p className="text-xl font-bold text-gray-800">{historySummary.total_count}건</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 border border-green-100 text-center">
                  <p className="text-xs text-green-600">지급완료</p>
                  <p className="text-xl font-bold text-green-700">{historySummary.paid_count}건</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-center">
                  <p className="text-xs text-blue-600">지급 합계</p>
                  <p className="text-xl font-bold text-blue-700">₩{formatCurrency(historySummary.total_amount ?? 0)}</p>
                </div>
              </div>
            )}
            {historyLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm">로딩 중...</div>
            ) : historyRecords.length === 0 ? (
              <div className="py-12 text-center">
                <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">이력이 없습니다.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">사업장명</th>
                        <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">영업점</th>
                        <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">유형</th>
                        <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">지급액</th>
                        <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-medium">귀속월</th>
                        <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-medium">지급일</th>
                        <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-medium">상태</th>
                        <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-medium">처리자</th>
                        {(user as any).permission_level >= 4 && <th className="w-10" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {historyRecords.map(r => (
                        <tr key={r.id} className={`hover:bg-gray-50/50 ${deleteConfirmId === r.id ? 'bg-red-50' : ''}`}>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{r.business_name}</td>
                          <td className="px-4 py-2.5 text-gray-600">{r.sales_office}</td>
                          <td className="px-4 py-2.5"><ProgressBadge type={r.progress_type} /></td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-700">₩{formatCurrency(r.actual_amount ?? 0)}</td>
                          <td className="px-4 py-2.5 text-center text-gray-500">{r.payment_month ?? '-'}</td>
                          <td className="px-4 py-2.5 text-center text-gray-500">{r.payment_date ? formatDate(r.payment_date) : '-'}</td>
                          <td className="px-4 py-2.5 text-center"><StatusBadge status={r.status} /></td>
                          <td className="px-4 py-2.5 text-center text-xs text-gray-500">{r.paid_by_name ?? '-'}</td>
                          {(user as any).permission_level >= 4 && (
                            <td className="px-2 py-2.5 text-center">
                              {deleteConfirmId === r.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    onClick={() => handleDeleteHistory(r.id)}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded"
                                  >
                                    삭제
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="px-2 py-1 text-gray-500 hover:bg-gray-100 text-xs rounded"
                                  >
                                    취소
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirmId(r.id)}
                                  className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                                  title="이력 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 결재 상신 모달 ── */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-600" />
                영업비 마감 결재 상신
              </h3>
              <button onClick={() => setShowApprovalModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* 포함 건 요약 */}
              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                <p className="text-xs text-indigo-600 font-medium mb-2">포함 건 ({processedSelectedCount}건)</p>
                <div className="space-y-1">
                  {eligibleItems
                    .filter(i => selectedIds.has(i.business_id) && i.commission_payment_id && i.commission_status === 'eligible')
                    .map(i => (
                      <div key={i.business_id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{i.business_name} <span className="text-gray-400">({i.sales_office})</span></span>
                        <span className="font-mono text-gray-700">₩{formatCurrency(i.actual_amount)}</span>
                      </div>
                    ))}
                </div>
                <div className="mt-2 pt-2 border-t border-indigo-200 flex justify-between text-sm font-semibold">
                  <span className="text-indigo-700">합계</span>
                  <span className="font-mono text-indigo-700">
                    ₩{formatCurrency(
                      eligibleItems
                        .filter(i => selectedIds.has(i.business_id) && i.commission_payment_id && i.commission_status === 'eligible')
                        .reduce((s, i) => s + i.actual_amount, 0)
                    )}
                  </span>
                </div>
              </div>

              {/* 결재선 선택 */}
              <ApproverSelector
                teamLeaderId={approvalTeamLeaderId}
                executiveId={approvalExecutiveId}
                vicePresidentId={approvalVicePresidentId}
                ceoId={approvalCeoId}
                onTeamLeaderChange={setApprovalTeamLeaderId}
                onExecutiveChange={setApprovalExecutiveId}
                onVicePresidentChange={setApprovalVicePresidentId}
                onCeoChange={setApprovalCeoId}
                requesterRole={(user as any)?.role}
              />

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">비고 (선택)</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  rows={2}
                  placeholder="결재 문서 메모..."
                  value={approvalNote}
                  onChange={e => setApprovalNote(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowApprovalModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
              <button
                onClick={handleSubmitApproval}
                disabled={submittingApproval || !approvalCeoId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {submittingApproval ? '상신 중...' : '결재 상신'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 송금 기록 모달 ── */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-green-600" />
                {transferTargetOffice} 송금 기록
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* 포함 건 요약 */}
              <div className="bg-green-50 rounded-xl p-3 border border-green-100 text-sm">
                <p className="text-xs text-green-600 font-medium mb-1">포함 건 ({transferTargetIds.length}건)</p>
                <div className="flex justify-between font-semibold text-green-800">
                  <span>총 지급 예정액</span>
                  <span className="font-mono">₩{formatCurrency(parseInt(transferAmount.replace(/,/g, '') || '0'))}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">송금일 <span className="text-red-500">*</span></label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">실제 송금액 <span className="text-red-500">*</span></label>
                <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" placeholder="1,500,000" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} />
                <p className="text-xs text-gray-400">자동입력된 금액과 다를 경우 수정 가능</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">이체 참조번호</label>
                <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" placeholder="이체 번호/적요 (선택)" value={transferRef} onChange={e => setTransferRef(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">메모</label>
                <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" placeholder="(선택)" value={transferNote} onChange={e => setTransferNote(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
              <button
                onClick={handleCreateTransfer}
                disabled={submittingTransfer || !transferDate || !transferAmount}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {submittingTransfer ? '저장 중...' : '송금 기록 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 트리거 설정 모달 ── */}
      {showConfigModal && configDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-600" />
                영업비 지급 트리거 설정
              </h3>
              <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">자비 진행건 트리거</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={configDraft.self_trigger} onChange={e => setConfigDraft({ ...configDraft, self_trigger: e.target.value })}>
                  <option value="installation_complete">설치 완료 (installation_date 입력 시)</option>
                  <option value="manual">수동 지정</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">보조금 진행건 트리거</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={configDraft.subsidy_trigger} onChange={e => setConfigDraft({ ...configDraft, subsidy_trigger: e.target.value })}>
                  <option value="subsidy_fully_paid">보조금 완납 (전액 입금 기준)</option>
                  <option value="subsidy_1st_payment">보조금 1차 입금 시</option>
                  <option value="manual">수동 지정</option>
                </select>
              </div>
              {configDraft.subsidy_trigger === 'subsidy_fully_paid' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">완납 판정 기준</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={configDraft.subsidy_paid_basis} onChange={e => setConfigDraft({ ...configDraft, subsidy_paid_basis: e.target.value })}>
                    <option value="last_invoice_paid">마지막 보조금 계산서 입금일 기준</option>
                    <option value="all_invoices_paid">모든 보조금 계산서 입금 완료 기준</option>
                    <option value="manual">수동 판정</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowConfigModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
              <button onClick={handleSaveConfig} disabled={savingConfig} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                {savingConfig ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
