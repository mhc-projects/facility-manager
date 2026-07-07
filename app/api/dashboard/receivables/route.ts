import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { queryAll } from '@/lib/supabase-direct'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  determineAggregationLevel,
  getAggregationKey,
  generateAggregationKeys,
  type AggregationLevel
} from '@/lib/dashboard-utils'

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

    // 날짜 범위 필터 (기간 지정 모드에서만 적용)
    if (startDate && endDate) {
      queryParts.push(`AND installation_date >= $${paramIndex++}`);
      params.push(startDate);
      queryParts.push(`AND installation_date <= $${paramIndex++}`);
      params.push(endDate);
    }

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

    // 3. 미수금 집계
    filteredBusinesses.forEach(business => {
      if (!business.installation_date) return;

      const installDate = new Date(business.installation_date);
      const aggregationKey = getAggregationKey(installDate, aggregationLevel);

      if (aggregationData.has(aggregationKey)) {
        const current = aggregationData.get(aggregationKey);
        const progressStatus = business.progress_status || '';
        const normalizedCategory = progressStatus.trim();

        // 진행구분에 따라 미수금 계산 로직 다름
        if (normalizedCategory === '보조금' || normalizedCategory === '보조금 동시진행') {
          // 보조금: 1차 + 2차 + 추가공사비
          const invoice1st = business.invoice_1st_amount || 0;
          const payment1st = business.payment_1st_amount || 0;
          const receivable1st = invoice1st - payment1st;

          const invoice2nd = business.invoice_2nd_amount || 0;
          const payment2nd = business.payment_2nd_amount || 0;
          const receivable2nd = invoice2nd - payment2nd;

          // 추가공사비는 계산서가 발행된 경우에만 미수금 계산
          const hasAdditionalInvoice = business.invoice_additional_date;
          const receivableAdditional = hasAdditionalInvoice
            ? (business.additional_cost || 0) - (business.payment_additional_amount || 0)
            : 0;

          const totalReceivables = receivable1st + receivable2nd + receivableAdditional;
          const totalPayments = payment1st + payment2nd + (hasAdditionalInvoice ? (business.payment_additional_amount || 0) : 0);

          current.outstanding += totalReceivables;
          current.collected += totalPayments;
        } else if (normalizedCategory === '자비' || normalizedCategory === '대리점' || normalizedCategory === 'AS') {
          // 자비: 선금 + 잔금
          const invoiceAdvance = business.invoice_advance_amount || 0;
          const paymentAdvance = business.payment_advance_amount || 0;
          const receivableAdvance = invoiceAdvance - paymentAdvance;

          const invoiceBalance = business.invoice_balance_amount || 0;
          const paymentBalance = business.payment_balance_amount || 0;
          const receivableBalance = invoiceBalance - paymentBalance;

          const totalReceivables = receivableAdvance + receivableBalance;
          const totalPayments = paymentAdvance + paymentBalance;

          current.outstanding += totalReceivables;
          current.collected += totalPayments;
        }
      }
    });

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
    const totalOutstanding = dataArray.reduce((sum, d) => sum + d.outstanding, 0);
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
