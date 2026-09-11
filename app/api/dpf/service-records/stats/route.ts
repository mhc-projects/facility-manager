// DPF 접수현황 요약 바 집계 — 저장 카운터 없이 매 요청 시 계산
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// cancelled(취소)는 대기/완료 어느 쪽에도 포함하지 않고 집계에서 제외한다(설계 §9 결정)
async function countByCategoryStatus(category: string, status?: string) {
  let q = supabaseAdmin
    .from('dpf_service_records')
    .select('id, dpf_vehicles!inner(id)', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('dpf_vehicles.is_deleted', false)
    .eq('category', category);
  if (status) q = q.eq('status', status);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const [cleanPending, cleanCompleted, asPending, asCompleted, csTotal] = await Promise.all([
      countByCategoryStatus('clean', 'in_progress'),
      countByCategoryStatus('clean', 'completed'),
      countByCategoryStatus('as', 'in_progress'),
      countByCategoryStatus('as', 'completed'),
      countByCategoryStatus('cs'), // 상태 구분 없이 전체
    ]);

    return NextResponse.json({
      clean_pending: cleanPending,
      clean_completed: cleanCompleted,
      as_pending: asPending,
      as_completed: asCompleted,
      cs_total: csTotal,
    });
  } catch (err) {
    console.error('[DPF Service Records Stats] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
