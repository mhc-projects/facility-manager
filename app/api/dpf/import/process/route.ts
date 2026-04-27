// app/api/dpf/import/process/route.ts
// 스테이징 → dpf_vehicles 본 테이블 처리 (벌크 UPSERT via RPC)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel 함수 최대 실행 시간 60초

export async function POST(request: NextRequest) {
  try {
    const { batchId } = await request.json();

    if (!batchId) {
      return NextResponse.json({ error: 'batchId가 필요합니다' }, { status: 400 });
    }

    // 스테이징 행 수 확인
    const { count } = await supabaseAdmin
      .from('dpf_import_staging')
      .select('id', { count: 'exact', head: true })
      .eq('import_batch_id', batchId)
      .eq('status', 'pending');

    if (!count) {
      return NextResponse.json({ error: '처리할 데이터가 없습니다' }, { status: 400 });
    }

    // 벌크 UPSERT PostgreSQL 함수 호출
    const { data, error } = await supabaseAdmin
      .rpc('process_dpf_staging', { p_batch_id: batchId });

    if (error) {
      console.error('[DPF Process] rpc error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data?.[0] ?? { processed_count: 0, error_count: 0 };

    // 에러 행 조회
    const { data: errorRows } = await supabaseAdmin
      .from('dpf_import_staging')
      .select('row_index, vin, error_message')
      .eq('import_batch_id', batchId)
      .eq('status', 'error')
      .limit(100);

    return NextResponse.json({
      success: true,
      processedCount: result.processed_count,
      errorCount: result.error_count,
      errors: (errorRows ?? []).map((r: { row_index: number; vin: string; error_message: string }) => ({
        rowIndex: r.row_index,
        vin: r.vin,
        message: r.error_message,
      })),
    });
  } catch (err) {
    console.error('[DPF Process] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
