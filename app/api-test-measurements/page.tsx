'use client';

import React, { useState, useEffect } from 'react';

type Method = 'POST' | 'GET';

const DEFAULT_POST_BODY = {
  business_name: '한국가로수보호(주)',
  device: {
    serial_number: 'NEONIC-PM-0001',
    device_type: 'power_meter',
    device_name: '네오닉 전력량계 1호기',
    manufacturer: '네오닉',
    installation_location: '배전반 1',
  },
  readings: [
    {
      measured_at: new Date().toISOString(),
      measurement_type: 'active_energy_kwh',
      measured_value: 1234.56,
      unit: 'kWh',
    },
  ],
};

export default function MeasurementsApiTestPage() {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [method, setMethod] = useState<Method>('POST');

  const [postBody, setPostBody] = useState(JSON.stringify(DEFAULT_POST_BODY, null, 2));

  // GET 쿼리 파라미터
  const [businessName, setBusinessName] = useState('한국가로수보호(주)');
  const [businessManagementCode, setBusinessManagementCode] = useState('');
  const [deviceSerialNumber, setDeviceSerialNumber] = useState('NEONIC-PM-0001');
  const [measurementType, setMeasurementType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState('100');

  const [result, setResult] = useState<{ status: number; body: unknown } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const getQueryString = () => {
    const params = new URLSearchParams();
    if (businessName.trim()) params.set('business_name', businessName.trim());
    if (businessManagementCode.trim()) params.set('business_management_code', businessManagementCode.trim());
    if (deviceSerialNumber.trim()) params.set('device_serial_number', deviceSerialNumber.trim());
    if (measurementType.trim()) params.set('measurement_type', measurementType.trim());
    if (from.trim()) params.set('from', from.trim());
    if (to.trim()) params.set('to', to.trim());
    if (limit.trim()) params.set('limit', limit.trim());
    return params.toString();
  };

  const getEndpoint = () => {
    const base = baseUrl || 'https://...';
    if (method === 'GET') {
      const qs = getQueryString();
      return `${base}/api/external/measurements${qs ? `?${qs}` : ''}`;
    }
    return `${base}/api/external/measurements`;
  };

  const getMethodColor = () => (method === 'POST' ? 'text-green-600' : 'text-blue-600');

  const handleSend = async () => {
    if (!apiKey.trim()) {
      setResult({ status: 0, body: { error: 'API 키를 입력해주세요.' } });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const options: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
      };
      if (method === 'POST') options.body = postBody;

      const res = await fetch(getEndpoint(), options);
      const body = await res.json().catch(() => ({}));
      setResult({ status: res.status, body });
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
          <h1 className="text-2xl font-bold text-gray-900">측정 데이터 외부 API 테스트</h1>
          <p className="mt-1 text-sm text-gray-500">
            API 키를 사용해 계측 장비(네오닉 전력량계 등)의 측정 데이터를 전송(POST)하고 조회(GET)할 수 있습니다.
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
              placeholder="nk_xxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 요청 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">요청</h2>

          {/* 메서드 선택 */}
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'POST', label: 'POST', desc: '측정 데이터 전송', active: 'bg-green-600 border-green-600' },
              { key: 'GET', label: 'GET', desc: '측정 데이터 조회', active: 'bg-blue-600 border-blue-600' },
            ] as const).map(({ key, label, desc, active }) => (
              <button
                key={key}
                onClick={() => setMethod(key)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors flex flex-col items-center leading-tight ${
                  method === key ? `${active} text-white` : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span>{label}</span>
                <span className={`font-normal text-[10px] ${method === key ? 'text-white/80' : 'text-gray-400'}`}>{desc}</span>
              </button>
            ))}
          </div>

          {/* 엔드포인트 미리보기 */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-xs font-mono overflow-x-auto">
            <span className={`font-bold flex-shrink-0 ${getMethodColor()}`}>{method}</span>
            <span className="text-gray-600 break-all">{getEndpoint()}</span>
          </div>

          {/* POST Body */}
          {method === 'POST' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Request Body (JSON)</label>
              <textarea
                value={postBody}
                onChange={e => setPostBody(e.target.value)}
                rows={14}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>
          )}

          {/* GET 쿼리 파라미터 */}
          {method === 'GET' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">business_name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">business_management_code</label>
                  <input
                    type="text"
                    value={businessManagementCode}
                    onChange={e => setBusinessManagementCode(e.target.value)}
                    placeholder="business_name 대신 사용 가능"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">device_serial_number (선택)</label>
                  <input
                    type="text"
                    value={deviceSerialNumber}
                    onChange={e => setDeviceSerialNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">measurement_type (선택)</label>
                  <input
                    type="text"
                    value={measurementType}
                    onChange={e => setMeasurementType(e.target.value)}
                    placeholder="active_energy_kwh"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">from (선택, ISO8601)</label>
                  <input
                    type="text"
                    value={from}
                    onChange={e => setFrom(e.target.value)}
                    placeholder="2026-08-25T00:00:00Z"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">to (선택, ISO8601)</label>
                  <input
                    type="text"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    placeholder="2026-08-25T23:59:59Z"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">limit (기본 100, 최대 1000)</label>
                  <input
                    type="number"
                    value={limit}
                    onChange={e => setLimit(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

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
          </div>
        )}

        {/* 필드 가이드 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <h2 className="text-sm font-semibold text-gray-700">필드 가이드</h2>

          {/* POST Body */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">측정 데이터 전송 (POST) — Body</p>
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
                    ['business_name', '✓*', '사업장명'],
                    ['business_management_code', '✓*', '사업장 관리코드 (사업장명 대신 사용)'],
                    ['device.serial_number', '✓', '장비 식별자 — 이 값 기준으로 장비를 재사용(upsert)함'],
                    ['device.device_type', '', "기본값 'power_meter'"],
                    ['device.device_name / manufacturer / installation_location', '', '값이 오면 갱신, 안 오면 기존 값 유지'],
                    ['readings', '✓', '측정값 배열 (최소 1개)'],
                    ['readings[].measurement_type', '✓', "예: active_energy_kwh, active_power_kw, voltage, current"],
                    ['readings[].measured_value', '✓', '측정값(숫자)'],
                    ['readings[].unit', '✓', "단위 (예: kWh, kW, V, A)"],
                    ['readings[].measured_at', '', '측정 시각 ISO8601 (생략 시 서버 수신 시각)'],
                    ['readings[].data_quality', '', "기본값 'normal'"],
                    ['readings[].environmental_conditions', '', '자유 형식 JSON (부가 정보)'],
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

          {/* GET 쿼리 파라미터 */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">측정 데이터 조회 (GET) — 쿼리 파라미터</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">파라미터</th>
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">필수</th>
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">설명</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['business_name', '✓*', '사업장명'],
                    ['business_management_code', '✓*', '사업장 관리코드 (사업장명 대신 사용)'],
                    ['device_serial_number', '', '특정 장비로 필터링'],
                    ['measurement_type', '', '특정 측정 종류로 필터링'],
                    ['from / to', '', '측정 시각 범위 필터 (ISO8601)'],
                    ['limit', '', '기본 100, 최대 1000'],
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
            <p className="text-xs text-gray-400 mt-1">✓* 둘 중 하나 필수. 전송용 API 키 그대로 사용 가능(같은 경로).</p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          외부 API 테스트 페이지 — 측정 데이터 (네오닉 전력량계 연동)
        </p>
      </div>
    </div>
  );
}
