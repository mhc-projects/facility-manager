import { NextRequest, NextResponse } from 'next/server';

/**
 * 대한민국 공휴일 API
 * Google Calendar API를 통해 한국 공휴일 데이터를 가져옴
 * 서버 메모리 캐싱으로 불필요한 API 호출 최소화
 */

interface Holiday {
  date: string;      // YYYY-MM-DD
  name: string;      // 공휴일명
  isHoliday: boolean;
}

// 서버 메모리 캐시 (월별 캐싱)
const cache = new Map<string, { data: Holiday[]; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

const KR_HOLIDAY_CALENDAR_ID = 'ko.south_korea#holiday@group.v.calendar.google.com';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');
  const month = searchParams.get('month'); // 1-12

  if (!year || !month) {
    return NextResponse.json({ success: false, error: 'year, month 파라미터가 필요합니다.' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Google Calendar API 키가 설정되지 않았습니다.' }, { status: 500 });
  }

  const cacheKey = `${year}-${month}`;
  const cached = cache.get(cacheKey);

  // 캐시 히트: 24시간 이내 데이터 반환
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, data: cached.data, cached: true });
  }

  try {
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    // 해당 월의 시작/끝 (ISO 8601)
    const timeMin = new Date(yearNum, monthNum - 1, 1).toISOString();
    const timeMax = new Date(yearNum, monthNum, 0, 23, 59, 59).toISOString();

    const params = new URLSearchParams({
      key: apiKey,
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(KR_HOLIDAY_CALENDAR_ID)}/events?${params.toString()}`;

    const response = await fetch(calendarUrl, {
      headers: { 'Accept': 'application/json' },
      // Next.js 캐시 비활성화 (서버 메모리 캐시로 직접 관리)
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[공휴일 API] Google Calendar 오류:', response.status, errorText);
      return NextResponse.json(
        { success: false, error: `Google Calendar API 오류: ${response.status}` },
        { status: response.status }
      );
    }

    const googleData = await response.json();
    const holidays: Holiday[] = (googleData.items || []).map((item: any) => {
      // Google Calendar 공휴일은 종일 이벤트 (date 필드 사용)
      const date = item.start?.date || item.start?.dateTime?.substring(0, 10) || '';
      return {
        date,
        name: item.summary || '공휴일',
        isHoliday: true,
      };
    });

    // 캐시 저장
    cache.set(cacheKey, { data: holidays, fetchedAt: Date.now() });

    console.log(`✅ [공휴일] ${year}년 ${month}월 공휴일 ${holidays.length}개 로드`);

    return NextResponse.json({ success: true, data: holidays, cached: false });
  } catch (err) {
    console.error('[공휴일 API] 오류:', err);
    return NextResponse.json(
      { success: false, error: '공휴일 데이터를 가져오는 데 실패했습니다.' },
      { status: 500 }
    );
  }
}
