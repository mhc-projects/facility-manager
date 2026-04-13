/**
 * 나이스페이 거래내역 조회 API (테스트용)
 *
 * 목적: 텔레페이 결제 내역 조회 가능 여부 및 응답 구조 확인
 *
 * 사용법:
 *   GET /api/nicepay/transactions?startDate=20260301&endDate=20260331
 *   GET /api/nicepay/transactions?startDate=20260301&endDate=20260331&raw=true  (원시 응답 전체)
 *
 * 환경변수 필요:
 *   NICEPAY_SHOP_ID  - 나이스페이 상점ID (MID)
 *   NICEPAY_SHOP_KEY - 나이스페이 상점KEY
 *
 * TODO(보안): 현재 이 라우트는 인증 없이 결제 거래 내역을 조회할 수 있습니다.
 *   활성화 전에 반드시 JWT 인증 + 관리자 권한 체크(permissionLevel >= 3)를 추가하세요.
 *   참고: app/api/admin/monthly-closing/route.ts 의 권한 체크 패턴을 따르세요.
 */

import { NextResponse } from 'next/server';

const NICEPAY_API_BASE = 'https://api.nicepay.co.kr';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('startDate'); // YYYYMMDD
  const endDate = searchParams.get('endDate');     // YYYYMMDD
  const showRaw = searchParams.get('raw') === 'true';
  const page = searchParams.get('page') ?? '1';
  const limit = searchParams.get('limit') ?? '100';

  // --- 환경변수 확인 ---
  const shopId  = process.env.NICEPAY_SHOP_ID;
  const shopKey = process.env.NICEPAY_SHOP_KEY;

  if (!shopId || !shopKey) {
    return NextResponse.json(
      {
        error: '나이스페이 환경변수 미설정',
        missing: [
          !shopId  && 'NICEPAY_SHOP_ID',
          !shopKey && 'NICEPAY_SHOP_KEY',
        ].filter(Boolean),
        hint: '.env.local에 NICEPAY_SHOP_ID, NICEPAY_SHOP_KEY를 추가하세요.',
      },
      { status: 500 }
    );
  }

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'startDate, endDate 파라미터 필요 (형식: YYYYMMDD)' },
      { status: 400 }
    );
  }

  // --- Basic Auth ---
  const credentials = Buffer.from(`${shopId}:${shopKey}`).toString('base64');

  try {
    // 나이스페이 거래내역 조회 (목록 조회 - 정산내역 기준)
    // 실제 엔드포인트/파라미터는 나이스페이 API 문서 버전마다 다를 수 있음
    // 아래는 v1 기준 - 응답을 보고 조정 필요
    const url = new URL(`${NICEPAY_API_BASE}/v1/payments`);
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('endDate', endDate);
    url.searchParams.set('pageNo', page);
    url.searchParams.set('rowPerPage', limit);
    // 상태 필터: 승인건만 (취소 제외)
    url.searchParams.set('paymentType', 'PAYMENT'); // 또는 생략해서 전체 확인

    console.log('[nicepay] 요청 URL:', url.toString());

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      // 타임아웃: 10초
      signal: AbortSignal.timeout(10_000),
    });

    const responseText = await res.text();
    let data: unknown;

    try {
      data = JSON.parse(responseText);
    } catch {
      // JSON 파싱 실패 - 원시 텍스트 반환 (오류 메시지 확인용)
      return NextResponse.json({
        error: 'JSON 파싱 실패 - 나이스페이 응답이 JSON이 아님',
        httpStatus: res.status,
        rawResponse: responseText.slice(0, 2000), // 앞 2000자만
        hint: '서브 MID 구조이거나 API 엔드포인트가 다를 수 있음',
      }, { status: 502 });
    }

    if (!res.ok) {
      return NextResponse.json({
        error: '나이스페이 API 오류',
        httpStatus: res.status,
        nicepayResponse: data,
      }, { status: 502 });
    }

    // raw=true면 전체 응답 그대로 반환 (구조 파악용)
    if (showRaw) {
      return NextResponse.json({ raw: data, httpStatus: res.status });
    }

    // --- 응답 구조 분석 (어떤 필드가 있는지 확인) ---
    const parsed = data as Record<string, unknown>;
    const items: Record<string, unknown>[] = (
      (parsed.list ?? parsed.data ?? parsed.transactions ?? parsed.payList ?? []) as Record<string, unknown>[]
    );

    return NextResponse.json({
      summary: {
        httpStatus: res.status,
        totalCount: parsed.totalCount ?? parsed.total ?? items.length,
        pageNo: parsed.pageNo ?? page,
        itemCount: items.length,
      },
      // 첫 번째 항목 필드명 목록 (구조 파악용)
      firstItemFields: items[0] ? Object.keys(items[0]) : [],
      // 첫 번째 항목 샘플 (값 확인용)
      firstItemSample: items[0] ?? null,
      // 전체 응답 최상위 키 목록
      responseTopKeys: Object.keys(parsed),
      // 전체 목록 (raw=true 없이도 볼 수 있도록)
      items,
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      error: '나이스페이 API 호출 실패',
      detail: errorMessage,
      hint: errorMessage.includes('timeout')
        ? 'API 서버 응답 없음 - 상점ID/KEY 확인 또는 서브 MID 이슈'
        : '네트워크 오류',
    }, { status: 502 });
  }
}
