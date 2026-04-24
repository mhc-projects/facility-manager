// app/api/dpf/search/route.ts
// 차량 검색: VIN, 번호판, 소유자명, 시리얼번호
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() ?? '';
    const localGov = searchParams.get('local_government')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') ?? '20'));
    const offset = (page - 1) * pageSize;

    let dbQuery = supabaseAdmin
      .from('dpf_vehicles')
      .select('id, vin, plate_number, vehicle_name, owner_name, owner_address, owner_contact, local_government, device_serial, installation_date, is_active, created_at', { count: 'exact' })
      .eq('is_deleted', false)
      .eq('is_active', true);

    if (query) {
      // VIN, 번호판, 소유자명, 시리얼번호 중 하나라도 일치
      dbQuery = dbQuery.or(
        `vin.ilike.%${query}%,plate_number.ilike.%${query}%,owner_name.ilike.%${query}%,device_serial.ilike.%${query}%`
      );
    }

    if (localGov) {
      dbQuery = dbQuery.ilike('local_government', `%${localGov}%`);
    }

    const { data, error, count } = await dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('[DPF Search] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      vehicles: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[DPF Search] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
