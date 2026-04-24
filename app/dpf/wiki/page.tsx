'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/ui/AdminLayout';
import WikiNodeTree from '@/components/wiki/WikiNodeTree';
import { WikiNode } from '@/types/dpf';
import { Search, MessageSquare, Settings, BookOpen, File } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function WikiPage() {
  const [nodes, setNodes] = useState<WikiNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiNode[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadTree();
  }, []);

  async function loadTree() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('wiki_nodes')
        .select('id, parent_id, node_type, sort_order, title, slug, tags, is_published')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });

      if (!data) return;

      // 트리 구조로 변환
      const map = new Map<string, WikiNode>();
      data.forEach(n => map.set(n.id, { ...n, children: [] }));
      const roots: WikiNode[] = [];
      data.forEach(n => {
        if (n.parent_id && map.has(n.parent_id)) {
          map.get(n.parent_id)!.children!.push(map.get(n.id)!);
        } else if (!n.parent_id) {
          roots.push(map.get(n.id)!);
        }
      });
      setNodes(roots);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/wiki/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.results ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const actions = (
    <div className="flex gap-2">
      <Link href="/dpf/wiki/qa"
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
        <MessageSquare className="w-4 h-4" /> AI Q&A
      </Link>
      <Link href="/dpf/wiki/admin"
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
        <Settings className="w-4 h-4" /> 관리
      </Link>
    </div>
  );

  return (
    <AdminLayout title="DPF 업무 지침" description="운행차 배출가스 저감사업 업무처리지침 Wiki" actions={actions}>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 좌측: 목차 트리 */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            {/* 검색 */}
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="지침 검색..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg
                             focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 트리 또는 검색 결과 */}
            <div className="p-2 max-h-96 lg:max-h-[calc(100vh-280px)] overflow-y-auto">
              {searchQuery && searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map(r => (
                    <Link key={r.id} href={`/dpf/wiki/${r.slug}`}
                      className="block px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 hover:text-blue-600">
                      {r.title}
                    </Link>
                  ))}
                </div>
              ) : searching ? (
                <div className="text-center py-4 text-xs text-gray-400">검색 중...</div>
              ) : loading ? (
                <div className="text-center py-4 text-xs text-gray-400">로딩 중...</div>
              ) : nodes.length > 0 ? (
                <WikiNodeTree nodes={nodes} />
              ) : (
                <div className="text-center py-8 text-sm text-gray-400">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Wiki 데이터가 없습니다.</p>
                  <p className="text-xs mt-1">관리자에서 지침서를 업로드하세요.</p>
                </div>
              )}
            </div>
          </div>

          {/* 서식 목록 바로가기 */}
          <div className="mt-3 bg-white border border-gray-200 rounded-xl shadow-sm p-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">공식 서식</div>
            <Link href="/dpf/wiki/forms"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700">
              <File className="w-4 h-4 text-gray-400" />
              서식 14종 목록
            </Link>
          </div>
        </div>

        {/* 우측: 콘텐츠 영역 */}
        <div className="lg:col-span-3">
          {/* 서식 빠른 접근 */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
            <h2 className="font-semibold text-gray-800 mb-3">자주 쓰는 서식</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { code: 'annex_2', name: 'DPF 부착 확인서', key: true },
                { code: 'annex_3', name: '보조금 청구서 + 위임장', key: true },
                { code: 'annex_6', name: '저공해조치 신청서', key: true },
                { code: 'annex_7', name: '품질 확인서', key: true },
                { code: 'annex_1', name: '국고보조금 교부신청서', key: false },
                { code: 'annex_4', name: '예산집행 실적보고서', key: false },
              ].map(f => (
                <Link key={f.code} href={`/dpf/wiki/forms/${f.code}`}
                  className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors text-sm group">
                  <File className="w-4 h-4 text-gray-400 group-hover:text-blue-500 shrink-0" />
                  <span className="text-gray-700 group-hover:text-blue-700 truncate">{f.name}</span>
                  {f.key && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-yellow-400" title="핵심 서식" />}
                </Link>
              ))}
            </div>
          </div>

          {/* 주요 업무 안내 */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-4">주요 업무 안내 (2026년 지침)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { title: '보조금 지급 기한', content: '청구서 접수 후 1개월 이내', icon: '📅' },
                { title: '청구 마감일', content: '12월 24일까지', icon: '⏰' },
                { title: 'DPF 보증기간', content: '3년', icon: '🛡️' },
                { title: '의무운행기간', content: '튜닝검사일로부터 2년', icon: '🚛' },
                { title: '클리닝 주기', content: '연 1회 또는 10만km마다', icon: '🔧' },
                { title: '저공해조치 기한', content: '안내 후 2개월 이내', icon: '📋' },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-xl">{item.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{item.title}</div>
                    <div className="text-sm text-gray-600 mt-0.5">{item.content}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
              <p className="text-xs text-gray-500">더 자세한 내용은 AI Q&A에서 질문하세요.</p>
              <Link href="/dpf/wiki/qa"
                className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium">
                <MessageSquare className="w-3.5 h-3.5" /> AI에게 질문하기
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
