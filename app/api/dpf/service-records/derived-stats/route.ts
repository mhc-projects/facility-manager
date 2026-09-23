// 부착현황(/dpf) 목록 파생 컬럼용 — 차량 ID 목록을 받아 접수/처리 이력을 배치로 집계
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';
import { DpfVehicleDerivedStats } from '@/types/dpf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ServiceRecordRow {
  vehicle_id: string;
  category: string;
  categories: string[] | null;
  status: string;
  reception_date: string | null;
  processed_at: string | null;
  completed_at: string | null;
}

interface InstallationRow {
  vehicle_id: string;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const ids = (searchParams.get('vehicle_ids') ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 100);

    const result: Record<string, DpfVehicleDerivedStats> = {};
    for (const id of ids) {
      result[id] = { last_reception_date: null, last_processed_date: null, clean_count: 0, as_count: 0, removal_count: 0 };
    }
    if (ids.length === 0) return NextResponse.json(result);

    const [recordsRes, installationsRes] = await Promise.all([
      supabaseAdmin
        .from('dpf_service_records')
        .select('vehicle_id, category, categories, status, reception_date, processed_at, completed_at')
        .in('vehicle_id', ids)
        .eq('is_deleted', false),
      supabaseAdmin
        .from('dpf_device_installations')
        .select('vehicle_id')
        .in('vehicle_id', ids)
        .eq('action_type', 'remove'),
    ]);

    if (recordsRes.error) throw recordsRes.error;
    if (installationsRes.error) throw installationsRes.error;

    for (const row of (recordsRes.data ?? []) as ServiceRecordRow[]) {
      const stat = result[row.vehicle_id];
      if (!stat) continue;
      if (row.reception_date && (!stat.last_reception_date || row.reception_date > stat.last_reception_date)) {
        stat.last_reception_date = row.reception_date;
      }
      const processedDate = row.completed_at ?? row.processed_at;
      if (processedDate && (!stat.last_processed_date || processedDate > stat.last_processed_date)) {
        stat.last_processed_date = processedDate;
      }
      if (row.status !== 'cancelled') {
        // 한 건에 여러 분류가 있으면 크리닝·AS 양쪽에 1씩(정기+경과 크리닝이 같이 있어도 크리닝은 1회)
        const cats = row.categories?.length ? row.categories : [row.category];
        if (cats.includes('clean') || cats.includes('clean_elapsed')) stat.clean_count += 1;
        if (cats.includes('as')) stat.as_count += 1;
      }
    }

    for (const row of (installationsRes.data ?? []) as InstallationRow[]) {
      const stat = result[row.vehicle_id];
      if (!stat) continue;
      stat.removal_count += 1;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[DPF Vehicle Derived Stats] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
