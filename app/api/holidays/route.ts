import { NextRequest, NextResponse } from 'next/server';

// 서버 메모리 캐시 (연도별, 서버 재시작 전까지 유지)
const cache = new Map<number, { dates: string[]; fetchedAt: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 대체공휴일 대상 공휴일명 (현충일 제외)
const SUBSTITUTE_ELIGIBLE = [
  '새해', '설날', '3·1절', '어린이날', '부처님', '광복절', '추석', '개천절', '한글날', '크리스마스',
];

async function fetchKRHolidaysFromNager(year: number): Promise<string[]> {
  const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/KR`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`nager.at HTTP ${res.status}`);
  const data: Array<{ date: string; localName: string }> = await res.json();

  const base = new Set(data.map(h => h.date));

  // 대체공휴일 계산: 일요일 또는 토요일(2023년~) 공휴일 → 다음 평일
  const sorted = data
    .filter(h => SUBSTITUTE_ELIGIBLE.some(n => h.localName.includes(n)))
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const h of sorted) {
    const [y, m, d] = h.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay(); // 0=일, 6=토

    const needsSub = dow === 0 || (dow === 6 && year >= 2023);
    if (!needsSub) continue;

    let sub = new Date(y, m - 1, d + 1);
    while (sub.getDay() === 0 || sub.getDay() === 6 || base.has(dateToStr(sub))) {
      sub.setDate(sub.getDate() + 1);
    }
    base.add(dateToStr(sub));
  }

  return [...base].sort();
}

export async function GET(request: NextRequest) {
  const yearParam = request.nextUrl.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  if (isNaN(year) || year < 2020 || year > 2035) {
    return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 });
  }

  // 캐시 히트
  const cached = cache.get(year);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.dates, {
      headers: { 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'HIT' },
    });
  }

  try {
    const dates = await fetchKRHolidaysFromNager(year);
    cache.set(year, { dates, fetchedAt: Date.now() });
    console.log(`✅ [공휴일] ${year}년 ${dates.length}개 공휴일 로드 (대체공휴일 포함)`);
    return NextResponse.json(dates, {
      headers: { 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    console.error('[공휴일 API] nager.at 오류:', err);
    return NextResponse.json({ error: '공휴일 데이터를 가져오는 데 실패했습니다.' }, { status: 502 });
  }
}
