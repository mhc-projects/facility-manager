// app/api/dpf/import/route.ts
// 엑셀 청크 데이터를 dpf_import_staging 테이블에 저장
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ImportChunkBody {
  batchId: string;
  rows: Record<string, unknown>[];
  chunkIndex: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportChunkBody = await request.json();
    const { batchId, rows, chunkIndex } = body;

    if (!batchId || !rows?.length) {
      return NextResponse.json({ error: 'batchId와 rows가 필요합니다' }, { status: 400 });
    }

    // 관리자 권한 확인
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const staging = rows.map((row, i) => ({
      import_batch_id: batchId,
      row_index: chunkIndex * 1000 + i,
      raw_data: row,
      vin: row['vin'] ? String(row['vin']) : null,
      status: 'pending' as const,
    }));

    const { error } = await supabaseAdmin
      .from('dpf_import_staging')
      .insert(staging);

    if (error) {
      console.error('[DPF Import] staging insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, inserted: staging.length });
  } catch (err) {
    console.error('[DPF Import] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
