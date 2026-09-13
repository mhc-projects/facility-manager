// DPF AS/크리닝/물류 접수현황 통합 목록 — /api/dpf/search 패턴을 그대로 따름
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATEGORIES = ['as', 'clean', 'cs', 'parts_delivery', 'urea', 'engine_replace'];
// 크린어스 관찰(§2.2/§2.5): 접수일/처리일/기사처리일/완료일/등록일 중 하나를 날짜range 필터 기준으로 선택
const DATE_FIELDS = ['reception_date', 'processed_at', 'technician_processed_at', 'completed_at', 'created_at'];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() ?? '';
    const categories = (searchParams.get('category') ?? '')
      .split(',')
      .map(c => c.trim())
      .filter(c => CATEGORIES.includes(c));
    const status = searchParams.get('status')?.trim() ?? '';
    const localGov = searchParams.get('local_government')?.trim() ?? '';
    const serviceBranch = searchParams.get('service_branch')?.trim() ?? '';
    const billingStatus = searchParams.get('billing_status')?.trim() ?? '';
    const costType = searchParams.get('cost_type')?.trim() ?? '';
    const courier = searchParams.get('courier')?.trim() ?? '';
    const dateFrom = searchParams.get('date_from')?.trim() ?? '';
    const dateTo = searchParams.get('date_to')?.trim() ?? '';
    const dateFieldParam = searchParams.get('date_field')?.trim() ?? '';
    const dateField = DATE_FIELDS.includes(dateFieldParam) ? dateFieldParam : 'reception_date';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') ?? '20'));
    const offset = (page - 1) * pageSize;

    let dbQuery = supabaseAdmin
      .from('dpf_service_records')
      .select('*, dpf_vehicles!inner(vin, plate_number, owner_name, vehicle_name, local_government)', { count: 'exact' })
      .eq('is_deleted', false)
      .eq('dpf_vehicles.is_deleted', false);

    if (query) {
      // PostgREST or() 구문은 %가 아니라 *를 와일드카드로 쓴다(%는 로직 트리 파싱 에러)
      dbQuery = dbQuery.or(
        `plate_number.ilike.*${query}*,vin.ilike.*${query}*,owner_name.ilike.*${query}*`,
        { foreignTable: 'dpf_vehicles' }
      );
    }
    if (categories.length > 0) dbQuery = dbQuery.in('category', categories);
    if (status) dbQuery = dbQuery.eq('status', status);
    if (localGov) dbQuery = dbQuery.ilike('local_government', `%${localGov}%`);
    if (serviceBranch) dbQuery = dbQuery.ilike('service_branch', `%${serviceBranch}%`);
    if (billingStatus) dbQuery = dbQuery.eq('billing_status', billingStatus);
    if (costType) dbQuery = dbQuery.eq('cost_type', costType);
    if (courier) dbQuery = dbQuery.ilike('courier', `%${courier}%`);
    // created_at만 timestamptz라 date 컬럼과 같은 날짜 문자열로 비교하면 UTC 자정 기준으로 잘려
    // KST 기준 그날 생성된 행이 빠진다 — KST 오프셋을 명시해 하루 전체를 커버한다.
    if (dateField === 'created_at') {
      if (dateFrom) dbQuery = dbQuery.gte(dateField, `${dateFrom}T00:00:00+09:00`);
      if (dateTo) dbQuery = dbQuery.lte(dateField, `${dateTo}T23:59:59.999+09:00`);
    } else {
      if (dateFrom) dbQuery = dbQuery.gte(dateField, dateFrom);
      if (dateTo) dbQuery = dbQuery.lte(dateField, dateTo);
    }

    let orderedQuery = dbQuery.order(dateField, { ascending: false, nullsFirst: false });
    if (dateField !== 'created_at') {
      orderedQuery = orderedQuery.order('created_at', { ascending: false });
    }
    const { data, error, count } = await orderedQuery
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('[DPF Service Records Search] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      records: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[DPF Service Records Search] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
