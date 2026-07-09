import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { queryAll } from '@/lib/supabase-direct'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  determineAggregationLevel,
  generateAggregationKeys,
  getBucketEndDate,
  getCurrentTimeKey,
  type AggregationLevel
} from '@/lib/dashboard-utils'
import {
  calculateContractAmount,
  buildRecordsMap,
  computeBusinessReceivableNow,
  computeBusinessReceivableAsOf,
} from '@/lib/receivables-engine'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;

    // 기간 파라미터 (3가지 모드)
    const months = searchParams.get('months') ? parseInt(searchParams.get('months')!) : null;
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD 또는 YYYY-MM 형식
    const endDate = searchParams.get('endDate');     // YYYY-MM-DD 또는 YYYY-MM 형식
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : null;

    // 필터 파라미터
    const office = searchParams.get('office'); // 지역 필터 (주소에서 추출)
    const manufacturer = searchParams.get('manufacturer');
    const salesOffice = searchParams.get('salesOffice');
    const progressStatus = searchParams.get('progressStatus'); // 진행구분 필터

    console.log('💰 [Dashboard Receivables API] Request params:', { months, startDate, endDate, year, office, manufacturer, salesOffice, progressStatus });

    // 1. 사업장 조회 (설치 완료된 사업장만) - 직접 PostgreSQL 연결 사용
    const queryParts: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    queryParts.push('SELECT * FROM business_info WHERE is_active = true AND is_deleted = false AND installation_date IS NOT NULL');

    // 날짜 범위는 여기서 모집단을 자르지 않는다 — 각 시점(버킷)의 "총 미수금 잔액"을 재구성하려면
    // 조회 기간보다 먼저 설치된 사업장도 전부 필요하다 (installation_date <= 버킷 종료일 기준으로
    // 아래 3번 단계에서 개별적으로 걸러낸다). 조회 기간은 어떤 버킷들을 보여줄지만 결정한다.

    // 필터 적용
    if (manufacturer) {
      queryParts.push(`AND manufacturer = $${paramIndex++}`);
      params.push(manufacturer);
    }
    if (salesOffice) {
      queryParts.push(`AND sales_office = $${paramIndex++}`);
      params.push(salesOffice);
    }
    if (progressStatus) {
      queryParts.push(`AND progress_status = $${paramIndex++}`);
      params.push(progressStatus);
    }

    const finalQuery = queryParts.join(' ');
    console.log('💰 [Dashboard Receivables API] Executing PostgreSQL query with', params.length, 'parameters');

    const businesses = await queryAll(finalQuery, params);

    console.log('💰 [Dashboard Receivables API] Total businesses (before region filter):', businesses.length);

    // 지역 필터링 (주소에서 지역 추출 - 사업장 관리와 동일)
    let filteredBusinesses = businesses || [];
    if (office) {
      filteredBusinesses = filteredBusinesses.filter(business => {
        const address = business.address || '';
        if (!address) return false;

        // 주소에서 지역 추출
        const regionMatch = address.match(/^(.*?시|.*?도|.*?군)/);
        const region = regionMatch ? regionMatch[1] : '';
        return region === office;
      });
    }

    console.log('💰 [Dashboard Receivables API] Total businesses (after filters):', filteredBusinesses.length);

    // 2. 집계 단위 결정 및 데이터 맵 초기화
    let aggregationLevel: AggregationLevel = 'monthly'; // 기본값
    const aggregationData: Map<string, any> = new Map();

    if (year) {
      // 연도별 모드: 월별 집계 (기존 로직 유지)
      aggregationLevel = 'monthly';
      for (let month = 1; month <= 12; month++) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        aggregationData.set(monthKey, {
          month: monthKey,
          outstanding: 0,
          collected: 0,
          collectionRate: 0,
          prevMonthChange: 0
        });
      }
    } else if (startDate && endDate) {
      // 기간 지정 모드: 집계 단위 자동 결정
      aggregationLevel = determineAggregationLevel(startDate, endDate);
      console.log('📊 [Dashboard Receivables API] Aggregation level:', aggregationLevel);

      // 집계 키 생성
      const keys = generateAggregationKeys(startDate, endDate, aggregationLevel);
      keys.forEach(key => {
        aggregationData.set(key, {
          month: key, // 호환성을 위해 'month' 키 유지
          outstanding: 0,
          collected: 0,
          collectionRate: 0,
          prevMonthChange: 0
        });
      });
    } else {
      // 최근 N개월 모드: 월별 집계 (기존 로직 유지)
      aggregationLevel = 'monthly';
      const monthsToShow = months || 12;
      for (let i = 0; i < monthsToShow; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        aggregationData.set(monthKey, {
          month: monthKey,
          outstanding: 0,
          collected: 0,
          collectionRate: 0,
          prevMonthChange: 0
        });
      }
    }

    // 3. 미수금 집계 — 각 버킷을 "그 시점까지의 전체 미수금 잔액" 스냅샷으로 재구성한다
    //    (매출관리/주간 브리핑과 동일한 lib/receivables-engine 공식을 asOfDate로 반복 적용).
    //    버킷별로 사업장을 나누는 게 아니라, 매 버킷마다 그 시점에 이미 설치된 모든 사업장을 다시 합산하므로
    //    "미수금"이 시간이 지나며 오르내리는 진짜 총액 추이가 된다.
    const businessIds = filteredBusinesses.map((b: any) => b.id);
    const idPlaceholders = businessIds.map((_: any, i: number) => `$${i + 1}`).join(', ');
    const [pricingRows, recordsRows] = await Promise.all([
      queryAll(`SELECT equipment_type, official_price FROM government_pricing WHERE is_active = true`),
      businessIds.length
        ? queryAll(
            `SELECT id, business_id, invoice_stage, record_type, parent_record_id,
                    issue_date, total_amount, supply_amount, payment_date, payment_amount, is_active
             FROM invoice_records
             WHERE business_id IN (${idPlaceholders}) AND is_active = TRUE
             ORDER BY business_id, invoice_stage, record_type, created_at ASC`,
            businessIds
          )
        : Promise.resolve([]),
    ]);

    const officialPrices: Record<string, number> = {};
    for (const row of pricingRows || []) {
      officialPrices[row.equipment_type] = Number(row.official_price) || 0;
    }
    const recordsMap = buildRecordsMap(businessIds, recordsRows);

    // contract_amount는 asOf와 무관하게 항상 현재 설비/고시가 기준 (과거 시점의 설비수량 변경까지는
    // 추적하지 않는 근사치 — lib/receivables-engine의 기존 설계와 동일)
    const businessesWithContract = filteredBusinesses.map((b: any) => ({
      ...b,
      contract_amount: calculateContractAmount(b, officialPrices),
    }));

    const currentBucketKey = getCurrentTimeKey(aggregationLevel);

    for (const [bucketKey, bucketData] of aggregationData.entries()) {
      const asOfDate = getBucketEndDate(bucketKey, aggregationLevel);
      // 오늘이 속한 버킷은 asOf 게이팅 없이 "지금" 공식을 써서 매출관리/주간 브리핑과 값이 정확히 맞도록 한다.
      // (invoice_records에 issue_date/payment_date가 비어있는 행이 있으면 asOf 게이팅이 실제보다 과도하게
      //  미수금을 부풀릴 수 있음 — 과거 버킷에서는 감내하는 근사치지만, "오늘" 버킷은 정확해야 함)
      const isCurrentBucket = bucketKey === currentBucketKey;

      for (const business of businessesWithContract) {
        if (!business.installation_date || business.installation_date > asOfDate) continue; // 그 시점엔 아직 설치 전

        const stages = recordsMap.get(business.id) || {
          subsidy_1st: [], subsidy_2nd: [], subsidy_additional: [],
          self_advance: [], self_balance: [], extra: [],
        };
        const { receivable, payment } = isCurrentBucket
          ? computeBusinessReceivableNow(business, stages)
          : computeBusinessReceivableAsOf(business, stages, asOfDate);
        bucketData.outstanding += receivable;
        bucketData.collected += payment;
      }
    }

    // 4. 회수율 및 전월 대비 계산
    const sortedMonths = Array.from(aggregationData.keys()).sort();
    let prevOutstanding = 0;

    sortedMonths.forEach((monthKey, index) => {
      const data = aggregationData.get(monthKey);
      const total = data.outstanding + data.collected;

      // 회수율 계산
      if (total > 0) {
        data.collectionRate = (data.collected / total) * 100;
      }

      // 전월 대비 증감률
      if (index > 0 && prevOutstanding !== 0) {
        data.prevMonthChange = ((data.outstanding - prevOutstanding) / Math.abs(prevOutstanding)) * 100;
      }

      prevOutstanding = data.outstanding;
    });

    // 5. 요약 정보 계산
    // 연도별/기간지정 모드는 오래된 것부터, 최근 모드는 최신부터
    const dataArray = (year || (startDate && endDate))
      ? Array.from(aggregationData.values()) // 연도별/기간지정: 순방향 (1월→12월)
      : Array.from(aggregationData.values()).reverse(); // 최근 모드: 역방향 (최신→과거)
    // outstanding은 이제 "그 시점 기준 총 잔액"이라 버킷끼리 더하면 안 된다(잔액을 여러 시점에서 합산하는
    // 건 무의미) — 조회 기간 내 가장 최근 시점의 잔액을 총 미수금으로 사용한다.
    const latestKey = sortedMonths[sortedMonths.length - 1];
    const totalOutstanding = latestKey ? aggregationData.get(latestKey).outstanding : 0;
    const validCollectionRates = dataArray.filter(d => d.collectionRate > 0);
    const avgCollectionRate = validCollectionRates.length > 0
      ? validCollectionRates.reduce((sum, d) => sum + d.collectionRate, 0) / validCollectionRates.length
      : 0;

    console.log('💰 [Dashboard Receivables API] Summary:', {
      businesses: filteredBusinesses.length,
      totalOutstanding: Math.round(totalOutstanding),
      avgCollectionRate: Math.round(avgCollectionRate * 100) / 100
    });

    return NextResponse.json({
      success: true,
      data: dataArray,
      summary: {
        totalOutstanding: Math.round(totalOutstanding),
        avgCollectionRate: Math.round(avgCollectionRate * 100) / 100
      }
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Receivables API Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        data: [],
        summary: {
          totalOutstanding: 0,
          avgCollectionRate: 0
        }
      },
      { status: 500 }
    );
  }
}
