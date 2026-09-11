'use client';

// 접수현황(AS/크리닝)과 물류관리(부품전달/요소수) 화면이 공유하는 본문 — mode로 분류 우주/필터 슬롯/요약 타일/테이블 컬럼만 분기한다
import { useState, useEffect, useCallback, useRef } from 'react';
import DpfServiceRecordTable from '@/components/dpf/DpfServiceRecordTable';
import { CATEGORY_OPTIONS, LOGISTICS_CATEGORIES } from '@/components/dpf/ServiceRecordFormModal';
import { DpfServiceRecordWithVehicle, DpfServiceRecordStats } from '@/types/dpf';
import { Search, SlidersHorizontal, X } from 'lucide-react';

interface SearchResult {
  records: DpfServiceRecordWithVehicle[];
  total: number;
  page: number;
  pageSize: number;
}

const EMPTY_STATS: DpfServiceRecordStats = {
  clean_pending: 0, clean_completed: 0, as_pending: 0, as_completed: 0, cs_total: 0,
  urea_pending: 0, urea_completed: 0, parts_pending: 0, parts_completed: 0,
};

const LOGISTICS_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter(o => LOGISTICS_CATEGORIES.includes(o.value));
const LOGISTICS_UNIVERSE = LOGISTICS_CATEGORIES.join(',');

interface Props {
  mode: 'reception' | 'logistics';
}

export default function DpfServiceListView({ mode }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [localGov, setLocalGov] = useState('');
  const [serviceBranch, setServiceBranch] = useState('');
  const [courier, setCourier] = useState('');
  const [costType, setCostType] = useState('');
  const [billingStatus, setBillingStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult>({ records: [], total: 0, page: 1, pageSize: 20 });
  const [stats, setStats] = useState<DpfServiceRecordStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (
    q: string, cat: string, st: string, gov: string, branch: string, cour: string, cost: string,
    billing: string, from: string, to: string, p: number,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, page: String(p), pageSize: '20' });
      // 로직스틱스 모드는 "전체"도 부품전달/요소수 우주 안이어야 한다 — 빈 값으로 보내면 API가 6개 카테고리 전부를 돌려준다
      const effectiveCategory = mode === 'logistics' ? (cat || LOGISTICS_UNIVERSE) : cat;
      if (effectiveCategory) params.set('category', effectiveCategory);
      if (st) params.set('status', st);
      if (gov) params.set('local_government', gov);
      if (mode === 'reception' && branch) params.set('service_branch', branch);
      if (mode === 'logistics' && cour) params.set('courier', cour);
      if (mode === 'logistics' && cost) params.set('cost_type', cost);
      if (billing) params.set('billing_status', billing);
      if (from) params.set('date_from', from);
      if (to) params.set('date_to', to);
      const res = await fetch(`/api/dpf/service-records?${params}`);
      if (!res.ok) throw new Error('검색 실패');
      setResult(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const triggerSearch = useCallback((
    q: string, cat: string, st: string, gov: string, branch: string, cour: string, cost: string,
    billing: string, from: string, to: string, p: number,
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q, cat, st, gov, branch, cour, cost, billing, from, to, p), 300);
  }, [search]);

  useEffect(() => {
    triggerSearch(query, category, status, localGov, serviceBranch, courier, costType, billingStatus, dateFrom, dateTo, page);
  }, [query, category, status, localGov, serviceBranch, courier, costType, billingStatus, dateFrom, dateTo, page, triggerSearch]);

  useEffect(() => {
    // 이 화면엔 등록 버튼이 없어 로컬 변이로 통계가 바뀔 일이 없다 — 마운트 시 1회면 충분(2단계 사후검토에서 지적된
    // [result.total] 의존성 문제를 여기서 함께 수정)
    fetch('/api/dpf/service-records/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  function handleQueryChange(v: string) { setQuery(v); setPage(1); }
  function handleCategoryChange(v: string) { setCategory(v); setPage(1); }
  function handleStatusChange(v: string) { setStatus(v); setPage(1); }
  function handleLocalGovChange(v: string) { setLocalGov(v); setPage(1); }
  function handleServiceBranchChange(v: string) { setServiceBranch(v); setPage(1); }
  function handleCourierChange(v: string) { setCourier(v); setPage(1); }
  function handleCostTypeChange(v: string) { setCostType(v); setPage(1); }
  function handleBillingStatusChange(v: string) { setBillingStatus(v); setPage(1); }
  function handleDateFromChange(v: string) { setDateFrom(v); setPage(1); }
  function handleDateToChange(v: string) { setDateTo(v); setPage(1); }
  function clearAll() {
    setQuery(''); setCategory(''); setStatus(''); setLocalGov(''); setServiceBranch('');
    setCourier(''); setCostType(''); setBillingStatus(''); setDateFrom(''); setDateTo(''); setPage(1);
  }

  const hasFilter = category || status || localGov || serviceBranch || courier || costType || billingStatus || dateFrom || dateTo;
  const activeFilterCount = [category, status, localGov, serviceBranch, courier, costType, billingStatus, dateFrom || dateTo]
    .filter(Boolean).length;

  const summaryTiles = mode === 'logistics'
    ? [
        { label: '요소수대기', value: stats.urea_pending, color: 'text-amber-600' },
        { label: '요소수완료', value: stats.urea_completed, color: 'text-emerald-600' },
        { label: '부품전달대기', value: stats.parts_pending, color: 'text-amber-600' },
        { label: '부품전달완료', value: stats.parts_completed, color: 'text-emerald-600' },
      ]
    : [
        { label: '크리닝대기', value: stats.clean_pending, color: 'text-amber-600' },
        { label: '크리닝완료', value: stats.clean_completed, color: 'text-emerald-600' },
        { label: 'AS대기', value: stats.as_pending, color: 'text-amber-600' },
        { label: 'AS완료', value: stats.as_completed, color: 'text-emerald-600' },
        { label: '상담종료', value: stats.cs_total, color: 'text-gray-600' },
      ];
  const categoryOptions = mode === 'logistics' ? LOGISTICS_CATEGORY_OPTIONS : CATEGORY_OPTIONS;

  return (
    <>
      {/* 요약 바 */}
      <div className={`grid grid-cols-2 ${mode === 'logistics' ? 'sm:grid-cols-4' : 'sm:grid-cols-5'} gap-3 mb-5`}>
        {summaryTiles.map(tile => (
          <div key={tile.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className={`text-2xl font-bold tabular-nums ${tile.color}`}>{tile.value.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-0.5 font-medium">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* 검색 + 필터 바 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="차량번호, 차대번호, 계약자명 검색..."
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
              showFilter || hasFilter
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

        {showFilter && (
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-gray-500 w-16">분류</label>
              <select
                value={category}
                onChange={e => handleCategoryChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <label className="text-xs font-medium text-gray-500 w-16 ml-2">상태</label>
              <select
                value={status}
                onChange={e => handleStatusChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                <option value="in_progress">진행중</option>
                <option value="completed">완료</option>
                <option value="cancelled">취소</option>
              </select>

              <label className="text-xs font-medium text-gray-500 w-16 ml-2">청구상태</label>
              <select
                value={billingStatus}
                onChange={e => handleBillingStatusChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                <option value="none">청구 전</option>
                <option value="billed">청구완료</option>
                <option value="unbillable_reception">지급불가(접수)</option>
                <option value="unbillable_completion">지급불가(완료)</option>
                <option value="held">보류</option>
              </select>

              {mode === 'logistics' && (
                <>
                  <label className="text-xs font-medium text-gray-500 w-16 ml-2">비용</label>
                  <select
                    value={costType}
                    onChange={e => handleCostTypeChange(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">전체</option>
                    <option value="paid">유상</option>
                    <option value="free">무상</option>
                    <option value="mixed">유무상</option>
                  </select>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-gray-500 w-16">지자체</label>
              <input
                type="text"
                value={localGov}
                onChange={e => handleLocalGovChange(e.target.value)}
                placeholder="예: 울산광역시"
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {mode === 'reception' ? (
                <>
                  <label className="text-xs font-medium text-gray-500 w-16 ml-2">처리점</label>
                  <input
                    type="text"
                    value={serviceBranch}
                    onChange={e => handleServiceBranchChange(e.target.value)}
                    placeholder="예: 창원모터스"
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </>
              ) : (
                <>
                  <label className="text-xs font-medium text-gray-500 w-16 ml-2">택배사</label>
                  <input
                    type="text"
                    value={courier}
                    onChange={e => handleCourierChange(e.target.value)}
                    placeholder="예: 경동화물"
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </>
              )}

              <label className="text-xs font-medium text-gray-500 ml-2">접수일</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => handleDateFromChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400 text-xs">~</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => handleDateToChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {hasFilter && (
                <button onClick={clearAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-2">
                  전체 초기화
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <DpfServiceRecordTable
          records={result.records}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          onPageChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          loading={loading}
          variant={mode}
        />
      </div>
    </>
  );
}
