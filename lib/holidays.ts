// 한국 공휴일 목록을 연도별로 조회·캐시하는 서버 유틸 (/api/holidays, 휴가원 연도별 휴가일 분할에서 공유)
// 서버 메모리 캐시 (연도별, 서버 재시작 전까지 유지)
const cache = new Map<number, { dates: string[]; fetchedAt: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

const KR_CALENDAR_ID = 'ko.south_korea#holiday@group.v.calendar.google.com';

// Google Calendar는 각 일정 description 첫 줄에 '공휴일'/'기념일'을 표시한다 — 이 값으로 공휴일만 거른다.
// (이름 목록으로 거르던 방식은 제헌절이 2026년 공휴일로 재지정된 뒤에도 제외해 버리는 문제가 있었음)
// description이 없는 경우에만 아래 기념일 이름 목록으로 대신 거른다
const EXCLUDED_OBSERVANCES = ['식목일', '어버이날', '스승의날', '크리스마스 이브', '섣달 그믐날', '국군의날'];

function isGooglePublicHoliday(item: { summary: string; description?: string }): boolean {
  if (item.description) return item.description.trim().startsWith('공휴일');
  return !EXCLUDED_OBSERVANCES.some(excl => item.summary?.includes(excl));
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Google Calendar API로 공휴일 조회 (대체공휴일·선거일 포함)
async function fetchFromGoogleCalendar(year: number, apiKey: string): Promise<string[]> {
  const params = new URLSearchParams({
    key: apiKey,
    timeMin: `${year}-01-01T00:00:00Z`,
    timeMax: `${year}-12-31T23:59:59Z`,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(KR_CALENDAR_ID)}/events?${params}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Calendar API ${res.status}`);

  const data = await res.json();
  return (data.items as Array<{ summary: string; description?: string; start: { date?: string; dateTime?: string } }> || [])
    .filter(isGooglePublicHoliday)
    .map(item => item.start?.date ?? item.start?.dateTime?.slice(0, 10) ?? '')
    .filter(Boolean)
    .sort();
}

// nager.at fallback — 대체공휴일 자동 계산 포함
const SUBSTITUTE_ELIGIBLE = ['새해', '설날', '3·1절', '삼일절', '어린이날', '부처님', '광복절', '추석', '개천절', '한글날', '크리스마스'];

async function fetchFromNager(year: number): Promise<string[]> {
  const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/KR`);
  if (!res.ok) throw new Error(`nager.at ${res.status}`);
  const data: Array<{ date: string; localName: string }> = await res.json();

  const base = new Set(data.map(h => h.date));

  for (const h of data.filter(h => SUBSTITUTE_ELIGIBLE.some(n => h.localName.includes(n))).sort((a, b) => a.date.localeCompare(b.date))) {
    const [y, m, d] = h.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    if (dow !== 0 && !(dow === 6 && year >= 2023)) continue;
    let sub = new Date(y, m - 1, d + 1);
    while (sub.getDay() === 0 || sub.getDay() === 6 || base.has(dateToStr(sub))) sub.setDate(sub.getDate() + 1);
    base.add(dateToStr(sub));
  }

  return [...base].sort();
}

/**
 * 연도별 공휴일(YYYY-MM-DD) 목록. 서버 메모리에 7일 캐시한다.
 * Google Calendar API 키가 있으면 우선 사용하고, 실패하거나 키가 없으면 nager.at을 쓴다.
 */
export async function getKoreanHolidays(year: number): Promise<{ dates: string[]; cacheHit: boolean }> {
  const cached = cache.get(year);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { dates: cached.dates, cacheHit: true };
  }

  let dates: string[];
  let source: string;

  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (apiKey) {
    try {
      dates = await fetchFromGoogleCalendar(year, apiKey);
      source = 'google-calendar';
    } catch (err) {
      console.warn(`[공휴일] Google Calendar 실패, nager.at fallback:`, err);
      dates = await fetchFromNager(year);
      source = 'nager.at-fallback';
    }
  } else {
    dates = await fetchFromNager(year);
    source = 'nager.at';
  }

  cache.set(year, { dates, fetchedAt: Date.now() });
  console.log(`✅ [공휴일] ${year}년 ${dates.length}개 (${source})`);

  return { dates, cacheHit: false };
}
