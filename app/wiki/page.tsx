'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/ui/AdminLayout';
import WikiNodeTree from '@/components/wiki/WikiNodeTree';
import { WikiNode } from '@/types/dpf';
import { Search, MessageSquare, Settings, BookOpen, File, Wifi, Truck, Upload } from 'lucide-react';

type DomainFilter = 'all' | 'dpf' | 'iot';

const DPF_FORMS = [
  { code: 'annex_2', name: 'DPF 부착 확인서', key: true },
  { code: 'annex_3', name: '보조금 청구서 + 위임장', key: true },
  { code: 'annex_6', name: '저공해조치 신청서', key: true },
  { code: 'annex_7', name: '품질 확인서', key: true },
];

const DPF_QUICK_INFO = [
  { title: '보조금 지급 기한', content: '청구서 접수 후 1개월 이내', icon: '📅' },
  { title: '청구 마감일', content: '12월 24일까지', icon: '⏰' },
  { title: 'DPF 보증기간', content: '3년', icon: '🛡️' },
  { title: '의무운행기간', content: '튜닝검사일로부터 2년', icon: '🚛' },
  { title: '클리닝 주기', content: '연 1회 또는 10만km마다', icon: '🔧' },
  { title: '저공해조치 기한', content: '안내 후 2개월 이내', icon: '📋' },
];

const IOT_QUICK_INFO = [
  { title: 'Gateway 점검', content: '월 1회 이상 정기 점검', icon: '📡' },
  { title: '배출 기준 초과', content: '즉시 보고 및 원인 조치', icon: '⚠️' },
  { title: '데이터 전송 주기', content: '실시간 (이상 시 알람)', icon: '📶' },
  { title: '측정기기 보정', content: '연 1회 공인기관 교정', icon: '🔬' },
];

export default function WikiPage() {
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all');
  const [allNodes, setAllNodes] = useState<WikiNode[]>([]);
  const [filteredNodes, setFilteredNodes] = useState<WikiNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasDpf, setHasDpf] = useState(false);
  const [hasIot, setHasIot] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiNode[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadNodes();
  }, []);

  async function loadNodes() {
    setLoading(true);
    try {
      const res = await fetch('/api/wiki/nodes');
      if (!res.ok) throw new Error('failed');
      const { nodes } = await res.json();

      const flat: WikiNode[] = nodes ?? [];
      setHasDpf(flat.some((n: WikiNode) => Array.isArray(n.tags) && n.tags.includes('dpf')));
      setHasIot(flat.some((n: WikiNode) => Array.isArray(n.tags) && n.tags.includes('iot')));

      setAllNodes(flat);
      setFilteredNodes(buildTree(flat));
    } catch {
      setAllNodes([]);
      setFilteredNodes([]);
    } finally {
      setLoading(false);
    }
  }

  function buildTree(flat: WikiNode[], domain?: string): WikiNode[] {
    let nodes = flat;
    if (domain && domain !== 'all') {
      // 해당 도메인 태그를 가진 노드만 포함
      const domainIds = new Set(
        flat.filter(n => Array.isArray(n.tags) && n.tags.includes(domain)).map(n => n.id)
      );
      nodes = flat.filter(n => domainIds.has(n.id) || (n.parent_id && domainIds.has(n.parent_id)));
    }

    const map = new Map<string, WikiNode>();
    nodes.forEach(n => map.set(n.id, { ...n, children: [] }));
    const roots: WikiNode[] = [];
    nodes.forEach(n => {
      if (n.parent_id && map.has(n.parent_id)) {
        map.get(n.parent_id)!.children!.push(map.get(n.id)!);
      } else if (!n.parent_id) {
        roots.push(map.get(n.id)!);
      }
    });
    return roots;
  }

  function handleDomainFilter(d: DomainFilter) {
    setDomainFilter(d);
    setSearchQuery('');
    setSearchResults([]);
    setFilteredNodes(buildTree(allNodes, d === 'all' ? undefined : d));
  }

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: searchQuery });
        if (domainFilter !== 'all') params.set('domain', domainFilter);
        const res = await fetch(`/api/wiki/search?${params}`);
        const data = await res.json();
        setSearchResults(data.results ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, domainFilter]);

  const actions = (
    <Link href="/wiki/admin"
      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
      <Settings className="w-4 h-4" /> 관리
    </Link>
  );

  const showIot = domainFilter !== 'dpf';
  const showDpf = domainFilter !== 'iot';

  return (
    <AdminLayout title="업무지침" description="DPF·IoT 방지시설 업무처리지침" actions={actions}>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* 좌측: 목차 트리 */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            {/* 도메인 탭 */}
            <div className="p-2 border-b border-gray-100 flex gap-1">
              {([
                { value: 'all', label: '전체' },
                { value: 'dpf', label: 'DPF' },
                { value: 'iot', label: 'IoT' },
              ] as { value: DomainFilter; label: string }[]).map(tab => (
                <button
                  key={tab.value}
                  onClick={() => handleDomainFilter(tab.value)}
                  className={`flex-1 py-1 text-xs rounded-md font-medium transition-colors ${
                    domainFilter === tab.value
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 검색 */}
            <div className="p-2 border-b border-gray-100">
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

            {/* 트리 or 검색결과 */}
            <div className="p-2 max-h-96 lg:max-h-[calc(100vh-320px)] overflow-y-auto">
              {searching ? (
                <div className="text-center py-4 text-xs text-gray-400">검색 중...</div>
              ) : searchQuery && searchResults.length > 0 ? (
                <div className="space-y-0.5">
                  {searchResults.map(r => (
                    <Link key={r.id} href={`/wiki/${r.slug}`}
                      className="block px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 hover:text-blue-600">
                      {r.title}
                    </Link>
                  ))}
                </div>
              ) : searchQuery && !searching ? (
                <div className="text-center py-4 text-xs text-gray-400">검색 결과 없음</div>
              ) : loading ? (
                <div className="text-center py-4 text-xs text-gray-400">로딩 중...</div>
              ) : filteredNodes.length > 0 ? (
                <WikiNodeTree nodes={filteredNodes} />
              ) : (
                <div className="text-center py-6 text-sm text-gray-400">
                  <BookOpen className="w-7 h-7 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">업로드된 지침이 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          {/* DPF 서식 바로가기 */}
          {showDpf && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3">
              <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" /> DPF 공식 서식
              </div>
              <Link href="/wiki/forms"
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700">
                <File className="w-4 h-4 text-gray-400" />
                서식 14종 목록
              </Link>
            </div>
          )}
        </div>

        {/* 우측: 콘텐츠 */}
        <div className="lg:col-span-3 space-y-4">

          {/* AI Q&A 배너 */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-800 text-sm">
                업무지침 AI Q&A
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                DPF·IoT 지침 내용과 회사 공지사항을 AI가 통합 검색하여 답변합니다
              </div>
            </div>
            <Link href="/wiki/qa"
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors shrink-0">
              <MessageSquare className="w-4 h-4" /> AI에게 질문
            </Link>
          </div>

          {/* DPF 섹션 */}
          {showDpf && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-600" />
                  <h2 className="font-semibold text-blue-800 text-sm">DPF — 운행차 배출가스 저감사업</h2>
                </div>
                <Link href="/wiki/forms"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  서식 전체보기 →
                </Link>
              </div>

              <div className="p-5">
                {/* 자주 쓰는 서식 */}
                <div className="mb-4">
                  <div className="text-xs font-semibold text-gray-500 mb-2">자주 쓰는 서식</div>
                  <div className="grid grid-cols-2 gap-2">
                    {DPF_FORMS.map(f => (
                      <Link key={f.code} href={`/wiki/forms/${f.code}`}
                        className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors text-sm group">
                        <File className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 shrink-0" />
                        <span className="text-gray-700 group-hover:text-blue-700 truncate text-xs">{f.name}</span>
                        {f.key && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                      </Link>
                    ))}
                  </div>
                </div>

                {/* 주요 업무 안내 */}
                <div className="text-xs font-semibold text-gray-500 mb-2">주요 기준 (2026년 지침)</div>
                {hasDpf ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {DPF_QUICK_INFO.map(item => (
                      <div key={item.title} className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg">
                        <span className="text-base leading-none mt-0.5">{item.icon}</span>
                        <div>
                          <div className="text-xs font-medium text-gray-800">{item.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{item.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                    <Upload className="w-4 h-4 shrink-0" />
                    <span>DPF 지침서를 업로드하면 AI가 자동으로 내용을 분석합니다.</span>
                    <Link href="/wiki/admin" className="ml-auto text-xs font-medium text-yellow-700 hover:text-yellow-900 whitespace-nowrap">
                      업로드 →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* IoT 섹션 */}
          {showIot && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-green-50 border-b border-green-100 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-green-600" />
                <h2 className="font-semibold text-green-800 text-sm">IoT — 방지시설 모니터링</h2>
              </div>

              <div className="p-5">
                {hasIot ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {IOT_QUICK_INFO.map(item => (
                      <div key={item.title} className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg">
                        <span className="text-base leading-none mt-0.5">{item.icon}</span>
                        <div>
                          <div className="text-xs font-medium text-gray-800">{item.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{item.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* IoT 지침 미등록 안내 */}
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                      <Upload className="w-4 h-4 shrink-0" />
                      <span>IoT 방지시설 운영지침을 업로드하면 AI Q&A에서 활용됩니다.</span>
                      <Link href="/wiki/admin" className="ml-auto text-xs font-medium text-green-700 hover:text-green-900 whitespace-nowrap">
                        업로드 →
                      </Link>
                    </div>
                    {/* 사전 안내 카드 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {IOT_QUICK_INFO.map(item => (
                        <div key={item.title} className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg opacity-60">
                          <span className="text-base leading-none mt-0.5">{item.icon}</span>
                          <div>
                            <div className="text-xs font-medium text-gray-600">{item.title}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{item.content}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
