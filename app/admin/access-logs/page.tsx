'use client';

// 접속 감사 로그 페이지 (권한 레벨 4 전용)
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/ui/AdminLayout';
import { Shield, Search, Download, RefreshCw, Monitor, User, MapPin, Clock, Filter, X, Wifi, Building2, Smartphone } from 'lucide-react';
import { TokenManager } from '@/lib/api-client';

interface IpInfo {
  ip: string;
  country: string;
  countryCode: string;
  regionName: string;
  city: string;
  isp: string;
  org: string;
  mobile: boolean;
  hosting: boolean;
  status: 'success' | 'fail';
}

interface AccessLog {
  id: string;
  user_id: string;
  email: string;
  name: string;
  ip_address: string;
  path: string;
  method: string;
  user_agent: string;
  created_at: string;
}

function parseDevice(ua: string): string {
  if (!ua) return '알 수 없음';
  if (/mobile|android|iphone|ipad/i.test(ua)) return '모바일';
  return '데스크톱';
}

function parseBrowser(ua: string): string {
  if (!ua) return '알 수 없음';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  return '기타';
}

function formatKST(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function AccessLogsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterIp, setFilterIp] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [ipInfoMap, setIpInfoMap] = useState<Record<string, IpInfo>>({});
  const [selectedIp, setSelectedIp] = useState<string | null>(null);

  // 권한 4 미만이면 차단
  useEffect(() => {
    if (user && (user.permission_level ?? 0) < 4) {
      router.replace('/admin');
    }
  }, [user, router]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const token = TokenManager.getToken();
      const params = new URLSearchParams({ limit: '500' });
      if (filterIp) params.set('ip', filterIp);
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);

      params.set('_t', String(Date.now())); // 캐시 무효화
      const res = await fetch(`/api/access-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      const fetchedLogs: AccessLog[] = data.logs ?? [];
      setLogs(fetchedLogs);

      // 고유 IP 위치 일괄 조회 (백그라운드)
      const uniqueIps = [...new Set(fetchedLogs.map((l) => l.ip_address))].filter(Boolean);
      if (uniqueIps.length > 0) {
        fetch('/api/internal/ip-location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ips: uniqueIps }),
        })
          .then((r) => r.json())
          .then((d) => setIpInfoMap((prev) => ({ ...prev, ...d.results })))
          .catch(() => {});
      }
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filterIp, filterFrom, filterTo]);

  useEffect(() => {
    if (user && (user.permission_level ?? 0) >= 4) {
      fetchLogs();
    }
  }, [user, fetchLogs]);

  function exportCsv() {
    const header = '이름,이메일,IP주소,경로,기기,브라우저,접속시간\n';
    const rows = logs
      .map(
        (l) =>
          `"${l.name}","${l.email}","${l.ip_address}","${l.path}","${parseDevice(l.user_agent)}","${parseBrowser(l.user_agent)}","${formatKST(l.created_at)}"`
      )
      .join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `접속로그_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 같은 IP에서 여러 계정이 접속한 경우
  const suspiciousIps = new Set(
    Object.entries(
      logs.reduce<Record<string, Set<string>>>((acc, l) => {
        if (!acc[l.ip_address]) acc[l.ip_address] = new Set();
        acc[l.ip_address].add(l.email);
        return acc;
      }, {})
    )
      .filter(([, emails]) => emails.size > 1)
      .map(([ip]) => ip)
  );

  // 같은 계정이 여러 IP에서 접속한 경우
  const emailIpMap = logs.reduce<Record<string, Set<string>>>((acc, l) => {
    if (!acc[l.email]) acc[l.email] = new Set();
    acc[l.email].add(l.ip_address);
    return acc;
  }, {});
  const suspiciousEmails = new Set(
    Object.entries(emailIpMap)
      .filter(([, ips]) => ips.size > 1)
      .map(([email]) => email)
  );

  if (!user || (user.permission_level ?? 0) < 4) return null;

  const selectedInfo = selectedIp ? ipInfoMap[selectedIp] : null;

  return (
    <AdminLayout>
      {/* IP 위치 팝업 */}
      {selectedIp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setSelectedIp(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-80 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-gray-800">{selectedIp}</span>
              <button onClick={() => setSelectedIp(null)}>
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {!selectedInfo ? (
              <p className="text-sm text-gray-400">위치 조회 중...</p>
            ) : selectedInfo.status === 'fail' ? (
              <p className="text-sm text-gray-400">위치 정보를 가져올 수 없습니다.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-700">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>
                    {selectedInfo.country !== 'South Korea'
                      ? `🌐 ${selectedInfo.country} · ${selectedInfo.city}`
                      : `🇰🇷 ${selectedInfo.regionName} · ${selectedInfo.city}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <Wifi className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{selectedInfo.isp}</span>
                </div>
                {selectedInfo.org && selectedInfo.org !== selectedInfo.isp && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>{selectedInfo.org}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  {selectedInfo.mobile && (
                    <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      <Smartphone className="w-3 h-3" /> 모바일
                    </span>
                  )}
                  {selectedInfo.hosting && (
                    <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
                      ⚠️ VPN / 데이터센터
                    </span>
                  )}
                  {!selectedInfo.mobile && !selectedInfo.hosting && (
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                      일반 유선 접속
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-red-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">접속 감사 로그</h1>
              <p className="text-sm text-gray-500">모든 사용자의 접속 IP 및 페이지 이력 (슈퍼관리자 전용)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4" />
              새로고침
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              CSV 내보내기
            </button>
          </div>
        </div>

        {/* 이상 징후 경고 */}
        {(suspiciousIps.size > 0 || suspiciousEmails.size > 0) && (
          <div className="space-y-2">
            {suspiciousIps.size > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-4">
                <p className="text-sm font-medium text-red-800">
                  🔴 동일 IP · 다중 계정 접속 감지: {Array.from(suspiciousIps).join(', ')}
                </p>
              </div>
            )}
            {suspiciousEmails.size > 0 && (
              <div className="bg-orange-50 border border-orange-300 rounded-lg p-4">
                <p className="text-sm font-medium text-orange-800">
                  🟠 동일 계정 · 다중 IP 접속 감지:{' '}
                  {Array.from(suspiciousEmails).map((email) => (
                    <span key={email} className="mr-2">
                      {email} ({Array.from(emailIpMap[email]).join(', ')})
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 필터 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">필터</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">IP 주소</label>
              <input
                type="text"
                value={filterIp}
                onChange={(e) => setFilterIp(e.target.value)}
                placeholder="192.168.1.1"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">시작일</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">종료일</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchLogs}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-gray-800 rounded-md hover:bg-gray-700"
              >
                <Search className="w-3.5 h-3.5" />
                검색
              </button>
            </div>
          </div>
        </div>

        {/* 통계 요약 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <User className="w-4 h-4" />
              <span className="text-xs">총 접속 건수</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{logs.length.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <MapPin className="w-4 h-4" />
              <span className="text-xs">고유 IP 수</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {new Set(logs.map((l) => l.ip_address)).size}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Monitor className="w-4 h-4" />
              <span className="text-xs">접속 계정 수</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {new Set(logs.map((l) => l.email)).size}
            </p>
          </div>
        </div>

        {/* 로그 테이블 */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              로딩 중...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Clock className="w-5 h-5 mr-2" />
              접속 기록이 없습니다
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">이름 / 이메일</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">IP 주소</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">접속 경로</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">기기 / 브라우저</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">접속 시간 (KST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className={
                        suspiciousIps.has(log.ip_address)
                          ? 'bg-red-50 hover:bg-red-100'
                          : suspiciousEmails.has(log.email)
                          ? 'bg-orange-50 hover:bg-orange-100'
                          : 'hover:bg-gray-50'
                      }
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{log.name || '(이름 없음)'}</p>
                        <p className="text-xs text-gray-500">{log.email}</p>
                        {suspiciousEmails.has(log.email) && (
                          <p className="text-xs text-orange-600 mt-0.5">
                            {emailIpMap[log.email].size}개 IP에서 접속
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedIp(log.ip_address)}
                          className={`font-mono text-xs px-2 py-0.5 rounded hover:opacity-75 transition-opacity ${
                            suspiciousIps.has(log.ip_address)
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                          title="클릭하면 위치 정보 표시"
                        >
                          {log.ip_address}
                        </button>
                        {ipInfoMap[log.ip_address]?.status === 'success' && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {ipInfoMap[log.ip_address].countryCode !== 'KR'
                              ? `🌐 ${ipInfoMap[log.ip_address].country}`
                              : `🇰🇷 ${ipInfoMap[log.ip_address].city || ipInfoMap[log.ip_address].regionName}`}
                            {ipInfoMap[log.ip_address].hosting && ' · ⚠️VPN'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600 font-mono">{log.path}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600">{parseDevice(log.user_agent)}</p>
                        <p className="text-xs text-gray-400">{parseBrowser(log.user_agent)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {formatKST(log.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
