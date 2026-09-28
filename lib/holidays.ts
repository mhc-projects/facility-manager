// 한국 공휴일 목록을 연도별로 조회·동기화하는 서버 유틸 (/api/holidays, 휴가원 연도별 휴가일 분할, 공휴일 동기화 cron에서 공유)
import { queryAll, transaction } from '@/lib/supabase-direct';

export interface HolidayEntry {
  date: string   // YYYY-MM-DD
  name: string
}

type PublicHolidaySource = 'kasi' | 'google' | 'nager';

// 서버 메모리 캐시 (연도별) — DB 동기화 결과가 늦게 반영되지 않도록 1시간만 유지
const cache = new Map<number, { entries: HolidayEntry[]; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

// ── 한국천문연구원 특일 정보 (공공데이터포털) ──
// 정부 공식 공휴일 데이터. 임시공휴일·대체공휴일·선거일이 지정되면 반영된다.
// DATA_GO_KR_SERVICE_KEY에는 공공데이터포털의 '디코딩' 키를 넣는다 (URLSearchParams가 인코딩하므로 인코딩 키를 넣으면 이중 인코딩됨)
const KASI_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

// 특일 정보 응답에서 공휴일(isHoliday=Y)만 뽑는다.
// items는 해당 월에 공휴일이 없으면 빈 문자열, 1건이면 item이 배열이 아닌 객체로 온다
export function parseKasiResponse(json: any): HolidayEntry[] {
  const header = json?.response?.header;
  if (header?.resultCode !== '00') {
    throw new Error(`특일 정보 API 오류: ${header?.resultCode} ${header?.resultMsg}`);
  }
  const items = json?.response?.body?.items;
  const raw = items && typeof items === 'object' ? items.item : null;
  const list: any[] = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  return list
    .filter(it => it.isHoliday === 'Y')
    .map(it => {
      const s = String(it.locdate);
      return { date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, name: String(it.dateName) };
    });
}

async function fetchFromKasi(year: number, serviceKey: string): Promise<HolidayEntry[]> {
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const perMonth = await Promise.all(months.map(async solMonth => {
    const params = new URLSearchParams({ serviceKey, solYear: String(year), solMonth, _type: 'json', numOfRows: '50' });
    const res = await fetch(`${KASI_URL}?${params}`);
    const text = await res.text();
    if (!res.ok) throw new Error(`특일 정보 API ${res.status}: ${text.slice(0, 200)}`);
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      // 키 오류 등은 _type=json이어도 XML로 응답한다
      throw new Error(`특일 정보 API 비정상 응답: ${text.slice(0, 200)}`);
    }
    return parseKasiResponse(json);
  }));
  return perMonth.flat();
}

// ── Google Calendar 한국 공휴일 캘린더 ──
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

async function fetchFromGoogleCalendar(year: number, apiKey: string): Promise<HolidayEntry[]> {
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
    .map(item => ({ date: item.start?.date ?? item.start?.dateTime?.slice(0, 10) ?? '', name: item.summary }))
    .filter(h => h.date);
}

// ── nager.at — 최후 대체용 (대체공휴일은 자체 계산, 임시공휴일·선거일은 누락될 수 있음) ──
const SUBSTITUTE_ELIGIBLE = ['새해', '설날', '3·1절', '삼일절', '어린이날', '부처님', '광복절', '추석', '개천절', '한글날', '크리스마스'];

async function fetchFromNager(year: number): Promise<HolidayEntry[]> {
  const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/KR`);
  if (!res.ok) throw new Error(`nager.at ${res.status}`);
  const data: Array<{ date: string; localName: string }> = await res.json();

  const entries: HolidayEntry[] = data.map(h => ({ date: h.date, name: h.localName }));
  const base = new Set(data.map(h => h.date));

  for (const h of data.filter(h => SUBSTITUTE_ELIGIBLE.some(n => h.localName.includes(n))).sort((a, b) => a.date.localeCompare(b.date))) {
    const [y, m, d] = h.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    if (dow !== 0 && !(dow === 6 && year >= 2023)) continue;
    let sub = new Date(y, m - 1, d + 1);
    while (sub.getDay() === 0 || sub.getDay() === 6 || base.has(dateToStr(sub))) sub.setDate(sub.getDate() + 1);
    base.add(dateToStr(sub));
    entries.push({ date: dateToStr(sub), name: `대체공휴일(${h.localName})` });
  }

  return entries;
}

/**
 * 외부 출처에서 공휴일을 받아온다: 특일 정보(키 있을 때) → Google Calendar(키 있을 때) → nager.at(allowNager일 때).
 * 빈 결과는 실패로 보고 다음 출처로 넘어간다 (예: 특일 정보는 다음 해 자료가 늦게 공개됨).
 */
async function fetchPublicHolidays(year: number, allowNager: boolean): Promise<{ entries: HolidayEntry[]; source: PublicHolidaySource }> {
  // 인코딩된 키(%xx 포함)를 넣어도 동작하도록 디코딩해서 쓴다 — URLSearchParams가 다시 인코딩함
  const rawKasiKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  const kasiKey = rawKasiKey && rawKasiKey.includes('%') ? decodeURIComponent(rawKasiKey) : rawKasiKey;
  if (kasiKey) {
    try {
      const entries = await fetchFromKasi(year, kasiKey);
      if (entries.length > 0) return { entries, source: 'kasi' };
      console.warn(`[공휴일] 특일 정보 ${year}년 결과 없음, 다음 출처로 대체`);
    } catch (err) {
      console.warn(`[공휴일] 특일 정보 ${year}년 조회 실패, 다음 출처로 대체:`, err);
    }
  }

  const googleKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (googleKey) {
    try {
      const entries = await fetchFromGoogleCalendar(year, googleKey);
      if (entries.length > 0) return { entries, source: 'google' };
      console.warn(`[공휴일] Google Calendar ${year}년 결과 없음`);
    } catch (err) {
      console.warn(`[공휴일] Google Calendar ${year}년 조회 실패:`, err);
    }
  }

  if (!allowNager) throw new Error(`${year}년 공휴일을 특일 정보·Google Calendar에서 받지 못함`);
  return { entries: await fetchFromNager(year), source: 'nager' };
}

/**
 * 연도별 공휴일(날짜+이름) 목록.
 * public_holidays 테이블에 그 해 공공 공휴일이 동기화돼 있으면 DB를 쓰고, 없거나 테이블 조회가 실패하면
 * 외부 출처에서 직접 받아온다. 회사 지정 휴무일(source='company')은 항상 합친다.
 */
export async function getKoreanHolidayEntries(year: number): Promise<{ entries: HolidayEntry[]; cacheHit: boolean }> {
  const cached = cache.get(year);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { entries: cached.entries, cacheHit: true };
  }

  let publicEntries: HolidayEntry[] = [];
  let companyEntries: HolidayEntry[] = [];
  let source = 'db';
  try {
    const rows = await queryAll(
      `SELECT holiday_date::TEXT AS date, name, source FROM public_holidays
       WHERE holiday_date BETWEEN $1::DATE AND $2::DATE
       ORDER BY holiday_date`,
      [`${year}-01-01`, `${year}-12-31`]
    );
    publicEntries = rows.filter((r: any) => r.source !== 'company').map((r: any) => ({ date: r.date, name: r.name }));
    companyEntries = rows.filter((r: any) => r.source === 'company').map((r: any) => ({ date: r.date, name: r.name }));
  } catch (err: any) {
    console.warn(`[공휴일] public_holidays 조회 실패, 외부 출처로 대체: ${err.message}`);
  }

  if (publicEntries.length === 0) {
    const fetched = await fetchPublicHolidays(year, true);
    publicEntries = fetched.entries;
    source = fetched.source;
  }

  const entries = [...publicEntries, ...companyEntries].sort((a, b) => a.date.localeCompare(b.date));
  cache.set(year, { entries, fetchedAt: Date.now() });
  console.log(`✅ [공휴일] ${year}년 ${entries.length}건 (${source})`);

  return { entries, cacheHit: false };
}

// 연도별 공휴일 날짜(YYYY-MM-DD, 중복 제거) 목록 — 근무일 계산용
export async function getKoreanHolidays(year: number): Promise<{ dates: string[]; cacheHit: boolean }> {
  const { entries, cacheHit } = await getKoreanHolidayEntries(year);
  return { dates: [...new Set(entries.map(e => e.date))].sort(), cacheHit };
}

/**
 * 해당 연도 공공 공휴일을 외부 출처에서 받아 public_holidays에 갈아끼운다 (회사 휴무일은 유지).
 * 받아오기에 실패하거나 결과가 비면 기존 행을 지우지 않고 예외를 던진다.
 */
export async function syncHolidays(year: number): Promise<{ year: number; source: PublicHolidaySource; count: number }> {
  const { entries, source } = await fetchPublicHolidays(year, false);
  if (entries.length === 0) throw new Error(`${year}년 공휴일 결과가 비어 있어 동기화하지 않음`);

  await transaction(async (client) => {
    await client.query(
      `DELETE FROM public_holidays
       WHERE holiday_date BETWEEN $1::DATE AND $2::DATE AND source <> 'company'`,
      [`${year}-01-01`, `${year}-12-31`]
    );
    await client.query(
      `INSERT INTO public_holidays (holiday_date, name, source)
       SELECT d, n, $3 FROM unnest($1::DATE[], $2::TEXT[]) AS t(d, n)
       ON CONFLICT (holiday_date, name, source) DO NOTHING`,
      [entries.map(e => e.date), entries.map(e => e.name), source]
    );
  });

  cache.delete(year);
  return { year, source, count: entries.length };
}
