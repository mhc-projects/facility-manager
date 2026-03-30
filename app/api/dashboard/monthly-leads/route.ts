import { NextRequest, NextResponse } from 'next/server'
import { queryAll } from '@/lib/supabase-direct'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // 기간 파라미터 (3가지 모드)
    const months = searchParams.get('months') ? parseInt(searchParams.get('months')!) : null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : null;

    // 필터 파라미터
    const office = searchParams.get('office'); // 지역 필터
    const salesOffice = searchParams.get('salesOffice');
    const progressStatus = searchParams.get('progressStatus');

    console.log('📊 [Dashboard Monthly Leads API] Request params:', { months, startDate, endDate, year, office, salesOffice, progressStatus });

    // 기간 범위 계산
    let dateStart: string;
    let dateEnd: string;

    if (startDate && endDate) {
      dateStart = startDate;
      dateEnd = endDate;
    } else if (year) {
      dateStart = `${year}-01-01`;
      dateEnd = `${year}-12-31`;
    } else {
      const monthsToShow = months || 12;
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const start = new Date(now.getFullYear(), now.getMonth() - monthsToShow + 1, 1);
      dateStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
      dateEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    }

    // 쿼리 구성
    const queryParts: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    queryParts.push('SELECT id, business_name, sales_office, receipt_date, address FROM business_info WHERE is_active = true AND is_deleted = false AND receipt_date IS NOT NULL');

    queryParts.push(`AND receipt_date >= $${paramIndex++}`);
    params.push(dateStart);
    queryParts.push(`AND receipt_date <= $${paramIndex++}`);
    params.push(dateEnd);

    if (salesOffice) {
      queryParts.push(`AND sales_office = $${paramIndex++}`);
      params.push(salesOffice);
    }
    if (progressStatus) {
      queryParts.push(`AND progress_status = $${paramIndex++}`);
      params.push(progressStatus);
    }

    queryParts.push('ORDER BY receipt_date ASC');

    const finalQuery = queryParts.join(' ');
    const businesses = await queryAll(finalQuery, params);

    // 지역 필터링
    let filteredBusinesses = businesses || [];
    if (office) {
      filteredBusinesses = filteredBusinesses.filter((b: any) => {
        const address = b.address || '';
        if (!address) return false;
        const regionMatch = address.match(/^(.*?시|.*?도|.*?군)/);
        const region = regionMatch ? regionMatch[1] : '';
        return region === office;
      });
    }

    console.log('📊 [Dashboard Monthly Leads API] Filtered businesses:', filteredBusinesses.length);

    // 월별 집계 맵 초기화
    const aggregationData: Map<string, { total: number; byOffice: Record<string, number>; businessesByOffice: Record<string, Array<{ id: string; business_name: string; receipt_date: string; progress_status: string | null }>> }> = new Map();

    if (year) {
      for (let m = 1; m <= 12; m++) {
        const key = `${year}-${String(m).padStart(2, '0')}`;
        aggregationData.set(key, { total: 0, byOffice: {}, businessesByOffice: {} });
      }
    } else if (startDate && endDate) {
      // 기간 내 모든 월 초기화
      const start = new Date(dateStart);
      const end = new Date(dateEnd);
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        aggregationData.set(key, { total: 0, byOffice: {}, businessesByOffice: {} });
        current.setMonth(current.getMonth() + 1);
      }
    } else {
      const monthsToShow = months || 12;
      const now = new Date();
      for (let i = 0; i < monthsToShow; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        aggregationData.set(key, { total: 0, byOffice: {}, businessesByOffice: {} });
      }
    }

    // 미지정 사업장 목록
    const unassignedBusinesses: { id: string; business_name: string; receipt_date: string }[] = [];

    // 영업점 집합 (미지정 포함)
    const officeSet = new Set<string>();

    // 집계
    filteredBusinesses.forEach((b: any) => {
      const receiptDate = b.receipt_date;
      if (!receiptDate) return;

      const d = new Date(receiptDate);
      if (isNaN(d.getTime())) return;

      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!aggregationData.has(monthKey)) return; // 집계 기간 밖

      const officeName = (b.sales_office && b.sales_office.trim()) ? b.sales_office.trim() : '미지정';
      officeSet.add(officeName);

      const current = aggregationData.get(monthKey)!;
      current.total += 1;
      current.byOffice[officeName] = (current.byOffice[officeName] || 0) + 1;

      // 영업점별 사업장 목록 수집
      if (!current.businessesByOffice[officeName]) {
        current.businessesByOffice[officeName] = [];
      }
      current.businessesByOffice[officeName].push({
        id: b.id,
        business_name: b.business_name || '이름 없음',
        receipt_date: typeof receiptDate === 'string' ? receiptDate.slice(0, 10) : d.toISOString().slice(0, 10),
        progress_status: b.progress_status || null
      });

      if (officeName === '미지정') {
        unassignedBusinesses.push({
          id: b.id,
          business_name: b.business_name || '이름 없음',
          receipt_date: typeof receiptDate === 'string' ? receiptDate.slice(0, 10) : d.toISOString().slice(0, 10)
        });
      }
    });

    // 정렬 및 배열 변환
    const sortedKeys = Array.from(aggregationData.keys()).sort();
    const dataArray = sortedKeys.map(key => ({
      month: key,
      total: aggregationData.get(key)!.total,
      byOffice: aggregationData.get(key)!.byOffice,
      businessesByOffice: aggregationData.get(key)!.businessesByOffice
    }));

    const finalData = dataArray;

    // 요약
    const totalLeads = finalData.reduce((sum, d) => sum + d.total, 0);
    const nonEmptyMonths = finalData.filter(d => d.total > 0).length;
    const avgMonthly = nonEmptyMonths > 0 ? Math.round((totalLeads / (months || finalData.length)) * 10) / 10 : 0;

    // 영업점 목록 — 미지정을 마지막으로 정렬
    const offices = Array.from(officeSet).sort((a, b) => {
      if (a === '미지정') return 1;
      if (b === '미지정') return -1;
      return a.localeCompare(b, 'ko');
    });

    console.log('📊 [Dashboard Monthly Leads API] Summary:', { totalLeads, avgMonthly, offices: offices.length, unassigned: unassignedBusinesses.length });

    return NextResponse.json({
      success: true,
      data: finalData,
      summary: {
        totalLeads,
        avgMonthly,
        offices,
        unassigned: unassignedBusinesses
      }
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Monthly Leads API Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        data: [],
        summary: {
          totalLeads: 0,
          avgMonthly: 0,
          offices: [],
          unassigned: []
        }
      },
      { status: 500 }
    );
  }
}
