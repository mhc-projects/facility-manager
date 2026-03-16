'use client';

import React, { useState, useEffect } from 'react';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scheduled:      { label: '진행예정', color: 'bg-red-400 text-white' },
  site_check:     { label: '현장확인', color: 'bg-purple-700 text-white' },
  installation:   { label: '포설',     color: 'bg-green-700 text-white' },
  completion_fix: { label: '준공보완', color: 'bg-purple-400 text-white' },
  modem_check:    { label: '모뎀확인', color: 'bg-yellow-700 text-white' },
  on_hold:        { label: '보류',     color: 'bg-red-700 text-white' },
  finished:       { label: '완료',     color: 'bg-yellow-500 text-white' },
  completed:      { label: '진행완료', color: 'bg-green-500 text-white' },
};

const VALID_STATUSES = Object.keys(STATUS_LABELS);

interface PriceItem {
  id: string;
  category: string | null;
  item_name: string;
  unit_price: number;
  unit: string;
}

const DEFAULT_POST_BODY = {
  business_name_raw: '에코센스',
  receipt_date: new Date().toISOString().slice(0, 10),
  work_date: new Date().toISOString().slice(0, 10),
  receipt_content: 'API 연동 테스트 접수',
  as_manager_name: '홍길동',
  status: 'scheduled',
};

const DEFAULT_PATCH_BODY = {
  status: 'completed',
  work_content: '작업 완료 처리',
};

type Method = 'POST' | 'GET' | 'PATCH' | 'DELETE' | 'POST_MATERIAL';

export default function ApiTestPage() {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [method, setMethod] = useState<Method>('POST');
  const prevMethodRef = React.useRef<Method>('POST');

  const switchMethod = (next: Method) => {
    prevMethodRef.current = method;
    setMethod(next);
    if (next === 'POST_MATERIAL' && !priceListFetchedRef.current) {
      // POST_MATERIAL로 전환 시 단가표 자동 로드 (silent: API 키 없으면 조용히 실패)
      setTimeout(() => fetchPriceList(true), 0);
    }
  };

  const [recordId, setRecordId] = useState('');
  const [postBody, setPostBody] = useState(JSON.stringify(DEFAULT_POST_BODY, null, 2));
  const [patchBody, setPatchBody] = useState(JSON.stringify(DEFAULT_PATCH_BODY, null, 2));
  const [result, setResult] = useState<{ status: number; body: unknown } | null>(null);
  const [loading, setLoading] = useState(false);

  // 자재 관련 상태 (price_list_id + quantity만)
  const [priceList, setPriceList] = useState<PriceItem[]>([]);
  const [priceListLoading, setPriceListLoading] = useState(false);
  const [priceListError, setPriceListError] = useState('');
  const [selectedPriceItem, setSelectedPriceItem] = useState<PriceItem | null>(null);
  const [materialQuantity, setMaterialQuantity] = useState(1);
  const priceListFetchedRef = React.useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const fetchPriceList = async (silent = false) => {
    if (!apiKey.trim()) {
      if (!silent) setPriceListError('먼저 API 키를 입력해주세요.');
      return;
    }
    setPriceListLoading(true);
    setPriceListError('');
    try {
      const res = await fetch(`${baseUrl}/api/as-price-list?price_type=cost`, {
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
      });
      const data = await res.json();
      if (data.success) {
        setPriceList(data.data);
        priceListFetchedRef.current = true;
      } else {
        setPriceListError(data.error || '단가표 조회 실패');
      }
    } catch (e: any) {
      setPriceListError(e.message);
    } finally {
      setPriceListLoading(false);
    }
  };

  const getEndpoint = () => {
    const base = baseUrl || 'https://...';
    const id = recordId || '{id}';
    if (method === 'POST') return `${base}/api/external/as-records`;
    if (method === 'POST_MATERIAL') return `${base}/api/as-records/${id}/materials`;
    return `${base}/api/external/as-records/${id}`;
  };

  const getMethodLabel = () => method === 'POST_MATERIAL' ? 'POST' : method;
  const getMethodColor = () => {
    if (method === 'POST' || method === 'POST_MATERIAL') return 'text-green-600';
    if (method === 'GET') return 'text-blue-600';
    if (method === 'PATCH') return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleSend = async () => {
    if (!apiKey.trim()) {
      setResult({ status: 0, body: { error: 'API 키를 입력해주세요.' } });
      return;
    }
    if (method !== 'POST' && !recordId.trim()) {
      setResult({ status: 0, body: { error: 'Record ID를 입력해주세요.' } });
      return;
    }
    if (method === 'POST_MATERIAL' && !selectedPriceItem) {
      setResult({ status: 0, body: { error: '단가표에서 자재를 선택해주세요.' } });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const options: RequestInit = {
        method: getMethodLabel(),
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
      };

      if (method === 'POST') options.body = postBody;
      else if (method === 'PATCH') options.body = patchBody;
      else if (method === 'POST_MATERIAL') {
        options.body = JSON.stringify({
          price_list_id: selectedPriceItem!.id,
          quantity: materialQuantity,
        });
      }

      const res = await fetch(getEndpoint(), options);
      const body = await res.json().catch(() => ({}));
      setResult({ status: res.status, body });

      if (method === 'POST' && res.status === 201 && (body as any)?.data?.id) {
        setRecordId((body as any).data.id);
      }
    } catch (e: any) {
      setResult({ status: 0, body: { error: e.message } });
    } finally {
      setLoading(false);
    }
  };

  const isSuccess = result && result.status >= 200 && result.status < 300;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* 헤더 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AS 외부 API 테스트</h1>
          <p className="mt-1 text-sm text-gray-500">
            API 키를 사용해 AS 데이터를 생성·조회·수정·삭제하고 자재를 등록할 수 있습니다.
          </p>
        </div>

        {/* 연결 설정 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">연결 설정</h2>
          <div>
            <label className="block text-xs text-gray-500 mb-1">서버 URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://facility.blueon-iot.com"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">API 키</label>
            <input
              type="text"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="ek_xxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 요청 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">요청</h2>

          {/* 메서드 선택 */}
          <div>
            <p className="text-xs text-gray-400 mb-2">순서: POST(AS 생성) → PATCH·GET·자재 추가 → DELETE</p>
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'POST',          label: 'POST',   desc: 'AS 생성',   active: 'bg-green-600 border-green-600' },
                { key: 'GET',           label: 'GET',    desc: 'AS 조회',   active: 'bg-blue-600 border-blue-600' },
                { key: 'PATCH',         label: 'PATCH',  desc: 'AS 수정',   active: 'bg-yellow-500 border-yellow-500' },
                { key: 'DELETE',        label: 'DELETE', desc: 'AS 삭제',   active: 'bg-red-600 border-red-600' },
                { key: 'POST_MATERIAL', label: 'POST',   desc: '자재 추가', active: 'bg-green-600 border-green-600' },
              ] as const).map(({ key, label, desc, active }) => (
                <button
                  key={key}
                  onClick={() => switchMethod(key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors flex flex-col items-center leading-tight ${
                    method === key ? `${active} text-white` : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`font-normal text-[10px] ${method === key ? 'text-white/80' : 'text-gray-400'}`}>{desc}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Record ID 없을 때 순서 안내 */}
          {method !== 'POST' && !recordId.trim() && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              먼저 <strong>POST(AS 생성)</strong>를 실행하면 Record ID가 자동으로 채워집니다.
            </div>
          )}

          {/* 엔드포인트 미리보기 */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-xs font-mono overflow-x-auto">
            <span className={`font-bold flex-shrink-0 ${getMethodColor()}`}>{getMethodLabel()}</span>
            <span className="text-gray-600">{getEndpoint()}</span>
          </div>

          {/* Record ID */}
          {method !== 'POST' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Record ID (AS 레코드 UUID)</label>
              <input
                type="text"
                value={recordId}
                onChange={e => setRecordId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">AS 레코드 POST 성공 시 자동으로 채워집니다.</p>
            </div>
          )}

          {/* AS POST Body */}
          {method === 'POST' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Request Body (JSON)</label>
              <textarea
                value={postBody}
                onChange={e => setPostBody(e.target.value)}
                rows={9}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>
          )}

          {/* PATCH Body */}
          {method === 'PATCH' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Request Body — 변경할 필드만 입력</label>
              <textarea
                value={patchBody}
                onChange={e => setPatchBody(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>
          )}

          {/* 자재 추가 폼 */}
          {method === 'POST_MATERIAL' && (
            <div className="space-y-3">
              {/* 단가표 불러오기 */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-500">단가표에서 자재 선택</label>
                <button
                  onClick={fetchPriceList}
                  disabled={priceListLoading}
                  className="text-xs text-blue-600 underline hover:text-blue-800 disabled:opacity-50"
                >
                  {priceListLoading ? '조회 중...' : priceList.length > 0 ? '새로고침' : '단가표 불러오기'}
                </button>
              </div>

              {priceListError && <p className="text-xs text-red-500">{priceListError}</p>}

              {priceList.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {priceList.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedPriceItem(item)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0 ${
                        selectedPriceItem?.id === item.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <span className="font-medium">
                        {item.category ? `[${item.category}] ` : ''}{item.item_name}
                      </span>
                      <span className="text-gray-400 flex-shrink-0 ml-2">
                        {item.unit_price.toLocaleString()}원/{item.unit}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {priceList.length === 0 && !priceListError && (
                <p className="text-xs text-gray-400">위 버튼을 눌러 단가표를 불러오세요.</p>
              )}

              {selectedPriceItem && (
                <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  선택: <strong>{selectedPriceItem.category ? `[${selectedPriceItem.category}] ` : ''}{selectedPriceItem.item_name}</strong>
                  {' '}— {selectedPriceItem.unit_price.toLocaleString()}원/{selectedPriceItem.unit}
                </div>
              )}

              {/* 수량 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">수량</label>
                <input
                  type="number"
                  min={1}
                  value={materialQuantity}
                  onChange={e => setMaterialQuantity(Number(e.target.value))}
                  className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 전송 Body 미리보기 */}
              {selectedPriceItem && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">전송될 Body</p>
                  <pre className="bg-gray-50 border border-gray-200 text-xs p-3 rounded-lg font-mono text-gray-700">
                    {JSON.stringify({ price_list_id: selectedPriceItem.id, quantity: materialQuantity }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {method === 'DELETE' && <p className="text-xs text-gray-400">삭제는 Body 없이 ID만으로 처리됩니다.</p>}
          {method === 'GET' && <p className="text-xs text-gray-400">조회는 Body 없이 ID만으로 처리됩니다.</p>}

          <button
            onClick={handleSend}
            disabled={loading}
            className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '요청 중...' : '전송'}
          </button>
        </div>

        {/* 응답 */}
        {result && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">응답</h2>
              <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                isSuccess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {result.status === 0 ? 'ERROR' : `HTTP ${result.status}`}
              </span>
            </div>
            <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-auto max-h-60 font-mono">
              {JSON.stringify(result.body, null, 2)}
            </pre>
            {method === 'POST' && isSuccess && (result.body as any)?.data?.id && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <p className="text-xs font-semibold text-blue-800">생성 완료 — Record ID가 자동으로 설정되었습니다</p>
                <code className="block text-xs font-mono bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  {(result.body as any).data.id}
                </code>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => switchMethod('PATCH')} className="text-xs text-blue-600 underline hover:text-blue-800">PATCH로 수정</button>
                  <button onClick={() => switchMethod('GET')} className="text-xs text-blue-600 underline hover:text-blue-800">GET으로 조회</button>
                  <button onClick={() => switchMethod('POST_MATERIAL')} className="text-xs text-blue-600 underline hover:text-blue-800">자재 추가</button>
                  <button onClick={() => switchMethod('DELETE')} className="text-xs text-red-500 underline hover:text-red-700">삭제</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 필드 가이드 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <h2 className="text-sm font-semibold text-gray-700">필드 가이드</h2>

          {/* AS 레코드 POST */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">AS 레코드 생성 (POST)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">필드</th>
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">필수</th>
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">설명</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['business_name_raw', '✓*', '사업장명'],
                    ['business_management_code', '✓*', '사업장 관리코드 (사업장명 대신 사용)'],
                    ['receipt_date', '', '접수일 (YYYY-MM-DD)'],
                    ['work_date', '', '작업일 (YYYY-MM-DD)'],
                    ['receipt_content', '', '접수 내용'],
                    ['work_content', '', '작업 내용'],
                    ['as_manager_name', '', 'AS 담당자'],
                    ['site_address', '', '현장 주소'],
                    ['site_manager', '', '현장 담당자'],
                    ['site_contact', '', '현장 연락처'],
                    ['chimney_number', '', '굴뚝 번호'],
                    ['dispatch_count', '', '출동 횟수 (기본값: 1)'],
                    ['status', '', '상태값 (기본값: scheduled)'],
                  ].map(([field, req, desc]) => (
                    <tr key={field}>
                      <td className="py-1.5 px-2 font-mono text-gray-700">{field}</td>
                      <td className="py-1.5 px-2 text-red-500 font-semibold">{req}</td>
                      <td className="py-1.5 px-2 text-gray-500">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-1">✓* 둘 중 하나 필수</p>
          </div>

          {/* AS 레코드 PATCH */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">AS 레코드 수정 (PATCH) — 변경할 필드만 포함</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">필드</th>
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">설명</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['status',           '상태값 (허용값은 아래 참고)'],
                    ['receipt_content',  '접수 내용'],
                    ['work_content',     '작업 내용'],
                    ['as_manager_name',  'AS 담당자'],
                    ['receipt_date',     '접수일 (YYYY-MM-DD)'],
                    ['work_date',        '작업일 (YYYY-MM-DD)'],
                    ['chimney_number',   '굴뚝 번호'],
                    ['dispatch_count',   '출동 횟수'],
                  ].map(([field, desc]) => (
                    <tr key={field}>
                      <td className="py-1.5 px-2 font-mono text-gray-700">{field}</td>
                      <td className="py-1.5 px-2 text-gray-500">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 자재 추가 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">사용 자재 추가 (POST_MATERIAL)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">필드</th>
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">필수</th>
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">설명</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['price_list_id', '✓', '단가표 항목 UUID (단가표 불러오기로 확인)'],
                    ['quantity', '', '수량 (기본값: 1)'],
                  ].map(([field, req, desc]) => (
                    <tr key={field}>
                      <td className="py-1.5 px-2 font-mono text-gray-700">{field}</td>
                      <td className="py-1.5 px-2 text-red-500 font-semibold">{req}</td>
                      <td className="py-1.5 px-2 text-gray-500">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* status 허용값 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">status 허용값</p>
            <div className="flex flex-wrap gap-1.5">
              {VALID_STATUSES.map(s => (
                <span key={s} className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_LABELS[s].color}`}>
                  {s} — {STATUS_LABELS[s].label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          facility.blueon-iot.com — 외부 API 테스트 페이지
        </p>
      </div>
    </div>
  );
}
