import { NextRequest, NextResponse } from 'next/server';
import { getKoreanHolidays, getKoreanHolidayEntries } from '@/lib/holidays';

export async function GET(request: NextRequest) {
  const yearParam = request.nextUrl.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  if (isNaN(year) || year < 2020 || year > 2035) {
    return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 });
  }

  // month가 있으면 일정관리 캘린더(CalendarBoard)용: 그 달 공휴일을 이름과 함께 반환
  // (같은 날 공휴일이 둘이면 이름을 합친다, 예: 어린이날 · 부처님오신날)
  const monthParam = request.nextUrl.searchParams.get('month');
  if (monthParam) {
    const month = parseInt(monthParam);
    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ success: false, error: '유효하지 않은 월입니다.' }, { status: 400 });
    }
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const { entries } = await getKoreanHolidayEntries(year);
    const byDate = new Map<string, string[]>();
    for (const e of entries.filter(e => e.date.startsWith(prefix))) {
      byDate.set(e.date, [...(byDate.get(e.date) ?? []), e.name]);
    }
    const data = [...byDate].map(([date, names]) => ({ date, name: names.join(' · '), isHoliday: true }));
    return NextResponse.json({ success: true, data });
  }

  // month가 없으면 휴가원 작성 화면용: 그 해 공휴일 날짜 배열
  const { dates, cacheHit } = await getKoreanHolidays(year);

  return NextResponse.json(dates, {
    headers: { 'Cache-Control': 'public, max-age=86400', 'X-Cache': cacheHit ? 'HIT' : 'MISS' },
  });
}
