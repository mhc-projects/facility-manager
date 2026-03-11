'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Receipt, Search, X, ChevronDown, Wrench, User, Package, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { TokenManager } from '@/lib/api-client';
import AsRecordModal from './components/AsRecordModal';
import AsStatusBadge from './components/AsStatusBadge';
import PaidStatusBadge from './components/PaidStatusBadge';
import Link from 'next/link';
import AdminLayout from '@/components/ui/AdminLayout';
import AsExcelUpload from './components/AsExcelUpload';

export interface AsRecord {
  id: string;
  business_id: string | null;
  business_name: string;
  business_name_raw: string | null;
  business_management_code: number | null;
  delivery_date: string | null;
  address: string | null;
  manager_name: string | null;
  manager_contact: string | null;
  site_address: string | null;
  site_manager: string | null;
  site_contact: string | null;
  receipt_date: string | null;
  work_date: string | null;
  receipt_content: string | null;
  work_content: string | null;
  outlet_description: string | null;
  as_manager_name: string | null;
  as_manager_contact: string | null;
  as_manager_affiliation: string | null;
  is_paid_override: boolean | null;
  is_paid: boolean | null;
  status: string;
  progress_notes: ProgressNote[];
  material_count: number;
  total_material_cost: number;
  dispatch_count: number;
  dispatch_cost_price_id: string | null;
  dispatch_revenue_price_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgressNote {
  id: string;
  timestamp: string;
  author: string;
  content: string;
  status_at_time: string;
}

const STATUS_OPTIONS = [
  { value: 'completed',      label: '진행완료', color: 'bg-green-500' },
  { value: 'scheduled',      label: '진행예정', color: 'bg-red-400' },
  { value: 'finished',       label: '완료',     color: 'bg-yellow-500' },
  { value: 'on_hold',        label: '보류',     color: 'bg-red-700' },
  { value: 'site_check',     label: '현장확인', color: 'bg-purple-700' },
  { value: 'installation',   label: '포설',     color: 'bg-green-700' },
  { value: 'completion_fix', label: '준공보완', color: 'bg-purple-400' },
  { value: 'modem_check',    label: '모뎀확인', color: 'bg-yellow-800' },
];

const PAID_OPTIONS = [
  { value: 'all',     label: '전체' },
  { value: 'free',    label: '무상' },
  { value: 'paid',    label: '유상' },
  { value: 'unknown', label: '미확인' },
];

export default function AsManagementPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AsRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [businessName, setBusinessName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [workDateFrom, setWorkDateFrom] = useState('');
  const [workDateTo, setWorkDateTo] = useState('');
  const [paidStatus, setPaidStatus] = useState('all');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AsRecord | null>(null);

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (businessName) params.set('business_name', businessName);
    if (managerName) params.set('manager_name', managerName);
    if (workDateFrom) params.set('work_date_from', workDateFrom);
    if (workDateTo) params.set('work_date_to', workDateTo);
    if (paidStatus !== 'all') params.set('paid_status', paidStatus);
    if (selectedStatuses.length > 0) params.set('status', selectedStatuses.join(','));
    params.set('limit', '200');
    return params.toString();
  }, [businessName, managerName, workDateFrom, workDateTo, paidStatus, selectedStatuses]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQueryString();
      const token = TokenManager.getToken();
      const res = await fetch(`/api/as-records?${qs}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setRecords(json.data);
        setTotal(json.total);
      }
    } catch (e) {
      console.error('AS 건 목록 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [buildQueryString]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleAddNew = () => { setEditingRecord(null); setModalOpen(true); };
  const handleEdit = (record: AsRecord) => { setEditingRecord(record); setModalOpen(true); };

  const handleDelete = async (record: AsRecord) => {
    if (!confirm(`"${record.business_name}" AS 건을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/as-records/${record.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${TokenManager.getToken()}` },
      });
      const json = await res.json();
      if (json.success) await fetchRecords();
      else alert(json.error || '삭제 실패');
    } catch (e) {
      console.error('삭제 실패:', e);
    }
  };

  const handleModalSave = () => { setModalOpen(false); fetchRecords(); };

  const toggleStatus = (val: string) => {
    setSelectedStatuses(prev =>
      prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]
    );
  };

  const resetFilters = () => {
    setBusinessName('');
    setManagerName('');
    setWorkDateFrom('');
    setWorkDateTo('');
    setPaidStatus('all');
    setSelectedStatuses([]);
  };

  const getLastProgressNote = (notes: ProgressNote[]) => {
    if (!notes || notes.length === 0) return null;
    return notes[notes.length - 1];
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return dateStr.slice(0, 10);
  };

  const hasActiveFilters = businessName || managerName || workDateFrom || workDateTo
    || paidStatus !== 'all' || selectedStatuses.length > 0;

  const actions = (
    <div className="flex items-center gap-2">
      <Link
        href="/admin/as-management/revenue"
        className="flex items-center gap-1 px-2.5 py-1.5 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-md hover:bg-emerald-100 hover:border-emerald-300 text-xs font-medium transition-colors"
      >
        <TrendingUp className="w-3 h-3" />
        매출관리
      </Link>
      <Link
        href="/admin/as-management/price-list"
        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 hover:border-gray-300 text-xs font-medium transition-colors"
      >
        <Receipt className="w-3 h-3" />
        단가표
      </Link>
      <AsExcelUpload onComplete={fetchRecords} />
      <button
        onClick={handleAddNew}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium transition-colors"
      >
        <Plus className="w-3 h-3" />
        AS 등록
      </button>
    </div>
  );

  return (
    <AdminLayout title="AS 관리" description="AS 접수·진행 현황 및 단가표 관리" actions={actions}>
      <div className="flex flex-col gap-4">

        {/* ── 필터 카드 ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">

            {/* 사업장 검색 */}
            <div className="relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="사업장 검색"
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-all"
              />
            </div>

            {/* 구분선 */}
            <div className="h-6 w-px bg-gray-200 hidden sm:block" />

            {/* AS 담당자 검색 */}
            <div className="relative flex-shrink-0">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={managerName}
                onChange={e => setManagerName(e.target.value)}
                placeholder="AS 담당자"
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-all"
              />
            </div>

            {/* 구분선 */}
            <div className="h-6 w-px bg-gray-200 hidden sm:block" />

            {/* 작업일 범위 */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-xs font-medium text-gray-500 whitespace-nowrap">작업일</span>
              <input
                type="date"
                value={workDateFrom}
                onChange={e => setWorkDateFrom(e.target.value)}
                className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
              />
              <span className="text-gray-300 font-light">—</span>
              <input
                type="date"
                value={workDateTo}
                onChange={e => setWorkDateTo(e.target.value)}
                className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
              />
            </div>

            {/* 구분선 */}
            <div className="h-6 w-px bg-gray-200 hidden sm:block" />

            {/* 유상/무상 세그먼트 */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
              {PAID_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPaidStatus(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    paidStatus === opt.value
                      ? 'bg-white text-blue-600 shadow-sm font-semibold'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 상태 드롭다운 */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-all ${
                  selectedStatuses.length > 0
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-white hover:border-gray-300'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="font-medium">상태</span>
                {selectedStatuses.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                    {selectedStatuses.length}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showStatusDropdown && (
                <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-2 min-w-40">
                  {STATUS_OPTIONS.map(opt => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2.5 px-2.5 py-2 hover:bg-gray-50 rounded-lg cursor-pointer text-sm transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                      <span className="flex-1 text-gray-700">{opt.label}</span>
                      <input
                        type="checkbox"
                        checked={selectedStatuses.includes(opt.value)}
                        onChange={() => toggleStatus(opt.value)}
                        className="rounded accent-blue-600"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 오른쪽 끝: 건수 + 초기화 */}
            <div className="flex items-center gap-2 ml-auto">
              {hasActiveFilters ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-xs text-blue-400 font-medium">필터 결과</span>
                  <span className="text-sm font-bold text-blue-600">{total.toLocaleString()}건</span>
                </div>
              ) : (
                <span className="text-xs text-gray-400">
                  전체 <span className="font-semibold text-gray-500">{total.toLocaleString()}건</span>
                </span>
              )}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  초기화
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── 테이블 카드 ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">불러오는 중...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                <Wrench className="w-8 h-8 text-gray-400" />
              </div>
              <div className="text-center">
                <p className="text-gray-700 font-medium">등록된 AS 건이 없습니다</p>
                <p className="text-sm text-gray-400 mt-1">
                  {hasActiveFilters ? '필터 조건을 변경하거나 초기화해보세요.' : '첫 번째 AS 건을 등록해보세요.'}
                </p>
              </div>
              {!hasActiveFilters && (
                <button
                  onClick={handleAddNew}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors mt-1"
                >
                  <Plus className="w-4 h-4" />
                  AS 등록하기
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[14%]">사업장</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[7%]">접수일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[7%]">작업일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[18%]">접수내용</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[8%]">배출구</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[9%]">AS 담당자</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[7%]">비용</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[8%]">자재</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[8%]">상태</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">최근 메모</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.map(record => {
                    const lastNote = getLastProgressNote(record.progress_notes);
                    return (
                      <tr
                        key={record.id}
                        className="hover:bg-blue-50/30 cursor-pointer transition-colors group"
                        onClick={() => handleEdit(record)}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {record.business_management_code && (
                              <span className="flex-shrink-0 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded tabular-nums">
                                {record.business_management_code}
                              </span>
                            )}
                            <div className="font-semibold text-gray-900 truncate max-w-[140px] text-sm" title={record.business_name}>
                              {record.business_name}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {record.business_id ? (
                              <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-medium">
                                블루온 사업장
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded font-medium">
                                타업체 사업장
                              </span>
                            )}
                            {record.address && (
                              <span className="text-[10px] text-gray-400 truncate max-w-[120px]" title={record.address}>
                                {record.address}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-gray-600 text-xs tabular-nums">
                            {formatDate(record.receipt_date) || <span className="text-gray-300">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-gray-600 text-xs tabular-nums">
                            {formatDate(record.work_date) || <span className="text-gray-300">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-gray-700 text-xs line-clamp-2 max-w-[200px] leading-relaxed" title={record.receipt_content || ''}>
                            {record.receipt_content || <span className="text-gray-300">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-gray-600 text-xs truncate max-w-[90px]" title={record.outlet_description || ''}>
                            {record.outlet_description || <span className="text-gray-300">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-gray-700 text-sm truncate max-w-[100px] font-medium" title={record.as_manager_name || ''}>
                            {record.as_manager_name || <span className="text-gray-300 font-normal">—</span>}
                          </div>
                          {record.as_manager_affiliation && (
                            <div className="text-xs text-gray-400 truncate max-w-[100px]">{record.as_manager_affiliation}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <PaidStatusBadge isPaid={record.is_paid} override={record.is_paid_override} />
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {record.material_count > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-md font-medium border border-orange-100 whitespace-nowrap">
                                <Package className="w-3 h-3" />
                                {record.material_count}종
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <AsStatusBadge status={record.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          {lastNote ? (
                            <div className="text-xs text-gray-500 line-clamp-1 max-w-[180px] leading-relaxed" title={lastNote.content}>
                              {lastNote.content}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(record); }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                            title="삭제"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* AS 등록/수정 모달 */}
      {modalOpen && (
        <AsRecordModal
          record={editingRecord}
          onClose={() => setModalOpen(false)}
          onSave={handleModalSave}
          currentUser={user}
        />
      )}

      {/* 상태 드롭다운 닫기 오버레이 */}
      {showStatusDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowStatusDropdown(false)}
        />
      )}
    </AdminLayout>
  );
}
