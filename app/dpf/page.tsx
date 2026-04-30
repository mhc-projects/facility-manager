'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/ui/AdminLayout';
import DpfVehicleTable from '@/components/dpf/DpfVehicleTable';
import VehicleFormModal from '@/components/dpf/VehicleFormModal';
import { DpfVehicle } from '@/types/dpf';
import { Truck, FileText, Upload, X, Plus, Search, SlidersHorizontal } from 'lucide-react';

interface SearchResult {
  vehicles: DpfVehicle[];
  total: number;
  page: number;
  pageSize: number;
}

type Vendor = 'all' | 'fujino' | 'mz';

export default function DpfPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [localGov, setLocalGov] = useState('');
  const [vendor, setVendor] = useState<Vendor>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult>({ vehicles: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string, gov: string, v: Vendor, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, local_government: gov, page: String(p), pageSize: '20' });
      if (v !== 'all') params.set('vendor', v);
      const res = await fetch(`/api/dpf/search?${params}`);
      if (!res.ok) throw new Error('검색 실패');
      setResult(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerSearch = useCallback((q: string, gov: string, v: Vendor, p: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q, gov, v, p), 300);
  }, [search]);

  useEffect(() => {
    triggerSearch(query, localGov, vendor, page);
  }, [query, localGov, vendor, page, triggerSearch]);

  function handleVendorChange(v: Vendor) { setVendor(v); setPage(1); }
  function handleQueryChange(v: string) { setQuery(v); setPage(1); }
  function handleLocalGovChange(v: string) { setLocalGov(v); setPage(1); }
  function clearAll() { setQuery(''); setLocalGov(''); setPage(1); }

  const hasFilter = query || localGov;
  const activeFilterCount = (query ? 1 : 0) + (localGov ? 1 : 0);

  return (
    <AdminLayout
      title="DPF 차량 관리"
      description="매연저감장치 부착 차량 조회 및 서식 출력"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/dpf/import"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-150"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">데이터 임포트</span>
          </Link>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-all duration-150 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>신규 등록</span>
          </button>
        </div>
      }
    >
      {/* 통계 요약 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl p-4 text-white shadow-md shadow-blue-200">
          <div className="relative z-10">
            <div className="text-3xl font-bold tabular-nums tracking-tight">
              {loading ? '—' : result.total.toLocaleString()}
            </div>
            <div className="text-blue-100 text-xs mt-0.5 font-medium">
              {vendor === 'all' ? '전체 등록 차량' : vendor === 'fujino' ? '후지노 차량' : '엠즈 차량'}
            </div>
          </div>
          <Truck className="absolute right-3 bottom-3 w-12 h-12 text-blue-400/40" />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
            <FileText className="w-4.5 h-4.5 text-emerald-600" style={{ width: '18px', height: '18px' }} />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">14</div>
            <div className="text-xs text-gray-500 font-medium">공식 서식</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-9 h-9 bg-violet-50 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-violet-600 font-bold text-xs">AI</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900 leading-tight">업무 지침</div>
            <div className="text-xs text-gray-500">Q&A 검색 가능</div>
          </div>
        </div>
      </div>

      {/* 검색 + 필터 + 탭 통합 컨트롤 바 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
        {/* 검색 행 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="차대번호, 차량번호, 소유자명, 연락처, 장치시리얼번호..."
            className="flex-1 py-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none"
          />
          {query && (
            <button
              onClick={() => { handleQueryChange(''); searchRef.current?.focus(); }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="w-px h-4 bg-gray-200" />
          <button
            onClick={() => setShowFilter(f => !f)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150 ${
              showFilter || localGov
                ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            필터
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* 확장 필터 */}
        {showFilter && (
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500 whitespace-nowrap w-20">접수 지자체</label>
              <div className="relative flex-1 max-w-xs">
                <input
                  type="text"
                  value={localGov}
                  onChange={e => handleLocalGovChange(e.target.value)}
                  placeholder="예: 서울특별시, 경기도..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                />
                {localGov && (
                  <button onClick={() => handleLocalGovChange('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {hasFilter && (
                <button onClick={clearAll}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap">
                  전체 초기화
                </button>
              )}
            </div>
          </div>
        )}

        {/* 벤더 탭 */}
        <div className="flex items-center gap-1 px-3 py-2">
          {(['all', 'fujino', 'mz'] as Vendor[]).map((v, i) => {
            const labels = ['전체', '후지노 (FJ)', '엠즈 (MZ)'];
            const colors = [
              vendor === 'all' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
              vendor === 'fujino' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
              vendor === 'mz' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
            ];
            return (
              <button
                key={v}
                onClick={() => handleVendorChange(v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${colors[i]}`}
              >
                {labels[i]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 차량 테이블 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <DpfVehicleTable
          vehicles={result.vehicles}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          onPageChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          loading={loading}
        />
      </div>

      <VehicleFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(vin) => {
          setShowCreateModal(false);
          router.push(`/dpf/${encodeURIComponent(vin)}`);
        }}
      />
    </AdminLayout>
  );
}
