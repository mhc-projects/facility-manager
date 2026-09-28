import { NextRequest, NextResponse } from 'next/server';
import { getKoreanHolidays } from '@/lib/holidays';

export async function GET(request: NextRequest) {
  const yearParam = request.nextUrl.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  if (isNaN(year) || year < 2020 || year > 2035) {
    return NextResponse.json({ error: '유효하지 않은 연도입니다.' }, { status: 400 });
  }

  const { dates, cacheHit } = await getKoreanHolidays(year);

  return NextResponse.json(dates, {
    headers: { 'Cache-Control': 'public, max-age=86400', 'X-Cache': cacheHit ? 'HIT' : 'MISS' },
  });
}
