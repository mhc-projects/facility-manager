// 공휴일을 외부 출처(특일 정보 → Google Calendar)에서 받아 public_holidays 테이블에 동기화하는 Cron Job
import { NextRequest, NextResponse } from 'next/server';
import { syncHolidays } from '@/lib/holidays';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 올해와 내년을 동기화한다 (연말에 내년 휴가를 미리 쓰는 경우 대비)
export async function GET(request: NextRequest) {
  // CRON_SECRET이 없으면 거부 (미설정 시 누구나 호출 가능해지는 것을 막기 위해 fail closed)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentYear = new Date().getFullYear();
  const results = await Promise.all([currentYear, currentYear + 1].map(year =>
    syncHolidays(year)
      .then(r => ({ ...r, ok: true as const }))
      .catch((err: any) => {
        console.error(`❌ [CRON] ${year}년 공휴일 동기화 실패:`, err);
        return { year, ok: false as const, error: err.message as string };
      })
  ));

  console.log('🗓️ [CRON] 공휴일 동기화 결과:', JSON.stringify(results));
  const allOk = results.every(r => r.ok);
  return NextResponse.json({ success: allOk, results }, { status: allOk ? 200 : 500 });
}
