// IP 위치 조회 API - ip-api.com 프록시 (권한 레벨 4 전용)
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/utils/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cache = new Map<string, { data: IpInfo; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6시간

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

const FIELDS = 'status,country,countryCode,regionName,city,isp,org,mobile,hosting';

export async function POST(request: NextRequest) {
  const token =
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    request.cookies.get('session_token')?.value;

  if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload || (payload.permission_level ?? 0) < 4) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 });
  }

  const { ips }: { ips: string[] } = await request.json();
  if (!Array.isArray(ips) || ips.length === 0) {
    return NextResponse.json({ results: {} });
  }

  const results: Record<string, IpInfo> = {};
  const uncached: string[] = [];

  for (const ip of ips) {
    const hit = cache.get(ip);
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      results[ip] = hit.data;
    } else {
      uncached.push(ip);
    }
  }

  if (uncached.length > 0) {
    try {
      const res = await fetch(
        `http://ip-api.com/batch?fields=${FIELDS}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(uncached.slice(0, 100)),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (res.ok) {
        const list: (IpInfo & { query: string })[] = await res.json();
        for (let i = 0; i < list.length; i++) {
          const ip = uncached[i];
          const info = { ...list[i], ip };
          results[ip] = info;
          cache.set(ip, { data: info, ts: Date.now() });
        }
      }
    } catch {
      // 외부 API 실패 시 빈 결과 반환
    }
  }

  return NextResponse.json({ results }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
