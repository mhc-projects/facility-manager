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

    console.log('🔧 [Dashboard Installations API] Request params:', { months, startDate, endDate, year, office, manufacturer, salesOffice, progressStatus });

    // 1. 모든 사업장 조회 (설치 날짜 여부와 관계없이) - 직접 PostgreSQL 연결 사용
    const queryParts: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    queryParts.push('SELECT * FROM business_info WHERE is_active = true AND is_deleted = false');

    // 날짜 범위 필터 (기간 지정 모드에서만 적용)
    if (startDate && endDate) {
      queryParts.push(`AND installation_date IS NOT NULL`);
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
    console.log('🔧 [Dashboard Installations API] Executing PostgreSQL query with', params.length, 'parameters');

    const businesses = await queryAll(finalQuery, params);

    console.log('🔧 [Dashboard Installations API] Total businesses (before region filter):', businesses.length);

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

    console.log('🔧 [Dashboard Installations API] Total businesses (after filters):', filteredBusinesses.length);

    // 2. 월별 데이터 집계 맵 초기화
    let aggregationLevel: AggregationLevel = 'monthly'; // 기본값
    const aggregationData: Map<string, any> = new Map();

    if (year) {
      // 연도별 모드: 월별 집계 (기존 로직 유지)
      aggregationLevel = 'monthly';
      for (let month = 1; month <= 12; month++) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        aggregationData.set(monthKey, {
          month: monthKey,
          waiting: 0,
          inProgress: 0,
          completed: 0,
          total: 0,
          completionRate: 0,
          prevMonthChange: 0
        });
      }
    } else if (startDate && endDate) {
      // 기간 지정 모드: 집계 단위 자동 결정
      aggregationLevel = determineAggregationLevel(startDate, endDate);
      console.log('📊 [Dashboard Installations API] Aggregation level:', aggregationLevel);

      // 집계 키 생성
      const keys = generateAggregationKeys(startDate, endDate, aggregationLevel);
      keys.forEach(key => {
        aggregationData.set(key, {
          month: key, // 호환성을 위해 'month' 키 유지
          waiting: 0,
          inProgress: 0,
          completed: 0,
          total: 0,
          completionRate: 0,
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
          waiting: 0,
          inProgress: 0,
          completed: 0,
          total: 0,
          completionRate: 0,
          prevMonthChange: 0
        });
      }
    }

    // 3. 설치 현황 집계
    filteredBusinesses.forEach(business => {
      const projectYear = business.project_year;
      if (!projectYear) return; // 사업 진행 연도가 없으면 스킵

      // 사업장의 집계 키 결정 (설치일이 있으면 설치일, 없으면 프로젝트 연도의 1월로 가정)
      let aggregationKey: string;
      if (business.installation_date) {
        const installDate = new Date(business.installation_date);
        aggregationKey = getAggregationKey(installDate, aggregationLevel);
      } else {
        // 설치일이 없으면 프로젝트 연도의 1월로 가정
        const fallbackDate = new Date(`${projectYear}-01-01`);
        aggregationKey = getAggregationKey(fallbackDate, aggregationLevel);
      }

      if (!aggregationData.has(aggregationKey)) {
        // 집계 기간 밖이면 스킵
        return;
      }

      const current = aggregationData.get(aggregationKey);
      current.total += 1;

      // 설치 진행 상태 판단
      // 진행구분에 따라 완료 조건이 다름:
      // - 보조금: 준공실사 필요 -> completion_survey_date 있어야 완료
      // - 자비/대리점/AS: 준공실사 불필요 -> installation_date만 있으면 완료

      const progressStatus = business.progress_status || '';
      const isSelfFunded = ['자비', '대리점', 'AS'].includes(progressStatus.trim());

      // 1. 완료 판단
      if (isSelfFunded) {
        // 자비/대리점/AS: 설치일만 있으면 완료
        if (business.installation_date) {
          current.completed += 1;
        } else {
          current.waiting += 1;
        }
      } else {
        // 보조금: 준공실사일이 있어야 완료
        // completion_survey_date는 Date 객체 또는 null일 수 있으므로 null 체크만 수행
        if (business.completion_survey_date) {
          current.completed += 1;
        } else if (business.installation_date) {
          current.inProgress += 1;
        } else {
          current.waiting += 1;
        }
      }
    });

    // 4. 완료율 및 전월 대비 계산
    const sortedMonths = Array.from(aggregationData.keys()).sort();
    let prevTotal = 0;

    sortedMonths.forEach((monthKey, index) => {
      const data = aggregationData.get(monthKey);

      // 완료율 계산
      if (data.total > 0) {
        data.completionRate = (data.completed / data.total) * 100;
      }

      // 전월 대비 증감률
      if (index > 0 && prevTotal !== 0) {
        data.prevMonthChange = ((data.total - prevTotal) / Math.abs(prevTotal)) * 100;
      }

      prevTotal = data.total;
    });

    // 5. 요약 정보 계산
    // 연도별/기간지정 모드는 오래된 것부터, 최근 모드는 최신부터
    const dataArray = (year || (startDate && endDate))
      ? Array.from(aggregationData.values()) // 연도별/기간지정: 순방향 (1월→12월)
      : Array.from(aggregationData.values()).reverse(); // 최근 모드: 역방향 (최신→과거)
    const totalInstallations = dataArray.reduce((sum, d) => sum + d.total, 0);
    const validCompletionRates = dataArray.filter(d => d.total > 0);

    // 월평균 설치: 실제 집계된 월 수로 나누기 (months가 null일 수 있음)
    const monthCount = months || dataArray.length || 1; // 0으로 나누기 방지
    const avgMonthlyInstallations = Math.round((totalInstallations / monthCount) * 100) / 100;
    const avgCompletionRate = validCompletionRates.length > 0
      ? validCompletionRates.reduce((sum, d) => sum + d.completionRate, 0) / validCompletionRates.length
      : 0;

    console.log('🔧 [Dashboard Installations API] Summary:', {
      businesses: filteredBusinesses.length,
      avgMonthlyInstallations,
      avgCompletionRate: Math.round(avgCompletionRate * 100) / 100,
      totalInstallations
    });

    return NextResponse.json({
      success: true,
      data: dataArray,
      summary: {
        avgMonthlyInstallations,
        avgCompletionRate: Math.round(avgCompletionRate * 100) / 100,
        totalInstallations
      }
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Installations API Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        data: [],
        summary: {
          avgMonthlyInstallations: 0,
          avgCompletionRate: 0,
          totalInstallations: 0
        }
      },
      { status: 500 }
    );
  }
}
