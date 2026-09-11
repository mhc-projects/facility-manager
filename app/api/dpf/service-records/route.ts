// DPF AS/크리닝/물류 접수현황 통합 목록 — /api/dpf/search 패턴을 그대로 따름
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATEGORIES = ['as', 'clean', 'cs', 'parts_delivery', 'urea', 'engine_replace'];

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
    const dateFrom = searchParams.get('date_from')?.trim() ?? '';
    const dateTo = searchParams.get('date_to')?.trim() ?? '';
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
    if (dateFrom) dbQuery = dbQuery.gte('reception_date', dateFrom);
    if (dateTo) dbQuery = dbQuery.lte('reception_date', dateTo);

    const { data, error, count } = await dbQuery
      .order('reception_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
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
