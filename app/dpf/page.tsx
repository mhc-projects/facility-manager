'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/ui/AdminLayout';
import DpfVehicleTable from '@/components/dpf/DpfVehicleTable';
import { DpfVehicle } from '@/types/dpf';
import { Truck, BookOpen, Upload, X } from 'lucide-react';

interface SearchResult {
  vehicles: DpfVehicle[];
  total: number;
  page: number;
  pageSize: number;
}

type Vendor = 'all' | 'fujino' | 'mz';

const VENDOR_TABS: { key: Vendor; label: string }[] = [
  { key: 'all',    label: '전체' },
  { key: 'fujino', label: '후지노' },
  { key: 'mz',     label: '엠즈' },
];

export default function DpfPage() {
  const [query, setQuery] = useState('');
  const [localGov, setLocalGov] = useState('');
  const [vendor, setVendor] = useState<Vendor>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult>({ vehicles: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string, gov: string, v: Vendor, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        local_government: gov,
        page: String(p),
        pageSize: '20',
      });
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

  // 검색어/지자체 변경 시 debounce 300ms
  const triggerSearch = useCallback((q: string, gov: string, v: Vendor, p: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q, gov, v, p), 300);
  }, [search]);

  useEffect(() => {
    triggerSearch(query, localGov, vendor, page);
  }, [query, localGov, vendor, page, triggerSearch]);

  // 벤더 탭 변경 시 페이지 리셋
  function handleVendorChange(v: Vendor) {
    setVendor(v);
    setPage(1);
  }

  function handleQueryChange(v: string) {
    setQuery(v);
    setPage(1);
  }

  function handleLocalGovChange(v: string) {
    setLocalGov(v);
    setPage(1);
  }

  function clearAll() {
    setQuery('');
    setLocalGov('');
    setPage(1);
  }

  const hasFilter = query || localGov;

  const actions = (
    <div className="flex gap-2">
      <Link href="/dpf/wiki"
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
        <BookOpen className="w-4 h-4" /> 업무 지침
      </Link>
      <Link href="/dpf/import"
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
        <Upload className="w-4 h-4" /> 데이터 임포트
      </Link>
    </div>
  );

  return (
    <AdminLayout title="DPF 차량 관리" description="매연저감장치 부착 차량 조회 및 서식 출력" actions={actions}>
      {/* 통계 요약 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{result.total.toLocaleString()}</div>
            <div className="text-xs text-gray-500">
              {vendor === 'all' ? '전체 등록 차량' : vendor === 'fujino' ? '후지노 차량' : '엠즈 차량'}
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">14</div>
            <div className="text-xs text-gray-500">공식 서식</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
            <span className="text-purple-600 font-bold text-sm">AI</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">업무 지침 Q&A</div>
            <div className="text-xs text-gray-500">AI 질문 검색 가능</div>
          </div>
        </div>
      </div>

      {/* 벤더 탭 */}
      <div className="flex border-b border-gray-200 mb-4">
        {VENDOR_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleVendorChange(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              vendor === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 검색 + 필터 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4 space-y-2">
        {/* 통합 검색 */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="차대번호, 차량번호, 소유자명, 연락처, 장치시리얼번호 검색..."
            className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          {query && (
            <button onClick={() => handleQueryChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 접수지자체 필터 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">접수지자체</label>
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={localGov}
              onChange={e => handleLocalGovChange(e.target.value)}
              placeholder="예: 서울특별시, 경기도..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
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
              className="text-xs text-gray-400 hover:text-gray-600 underline whitespace-nowrap">
              전체 초기화
            </button>
          )}
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
    </AdminLayout>
  );
}
