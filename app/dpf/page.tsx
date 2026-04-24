'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/ui/AdminLayout';
import DpfSearchBar from '@/components/dpf/DpfSearchBar';
import DpfVehicleTable from '@/components/dpf/DpfVehicleTable';
import { DpfVehicle } from '@/types/dpf';
import { Truck, BookOpen, Upload } from 'lucide-react';

interface SearchResult {
  vehicles: DpfVehicle[];
  total: number;
  page: number;
  pageSize: number;
}

export default function DpfPage() {
  const [query, setQuery] = useState('');
  const [localGov, setLocalGov] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult>({ vehicles: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string, gov: string, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, local_government: gov, page: String(p), pageSize: '20' });
      const res = await fetch(`/api/dpf/search?${params}`);
      if (!res.ok) throw new Error('검색 실패');
      setResult(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { search(query, localGov, page); }, [query, localGov, page, search]);

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
            <div className="text-xs text-gray-500">등록 차량</div>
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

      {/* 검색 + 필터 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4 space-y-3">
        <DpfSearchBar onSearch={(q) => { setQuery(q); setPage(1); }} initialQuery={query} />
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 whitespace-nowrap">접수지자체</label>
          <input
            type="text"
            value={localGov}
            onChange={(e) => { setLocalGov(e.target.value); setPage(1); }}
            placeholder="예: 서울특별시, 경기도..."
            className="flex-1 max-w-xs px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {(query || localGov) && (
            <button onClick={() => { setQuery(''); setLocalGov(''); setPage(1); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline">
              필터 초기화
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
