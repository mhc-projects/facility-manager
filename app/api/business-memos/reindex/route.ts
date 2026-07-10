// app/api/business-memos/reindex/route.ts
// 임베딩이 없는 사업장 메모를 배치로 찾아 임베딩 생성 (기존 데이터 백필 / 관리자 전용)
import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/supabase-direct';
import { upsertMemoEmbedding } from '@/lib/memo-embedding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { limit } = await request.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(limit ?? 500, 1), 1000);

    const rows = await queryAll(
      `SELECT bm.id, bm.title, bm.content
       FROM business_memos bm
       LEFT JOIN memo_embeddings me ON me.memo_id = bm.id
       WHERE bm.is_active = true AND bm.is_deleted = false AND me.memo_id IS NULL
       ORDER BY bm.created_at
       LIMIT $1`,
      [batchSize]
    );

    let indexed = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        await upsertMemoEmbedding(row.id, row.title, row.content);
        indexed++;
      } catch (err) {
        console.error(`[MEMO-REINDEX] memo ${row.id} failed:`, err);
        errors++;
      }
      // API 속도 제한 방지
      await new Promise(r => setTimeout(r, 50));
    }

    const remainingRow = await queryOne(
      `SELECT count(*)::int AS remaining
       FROM business_memos bm
       LEFT JOIN memo_embeddings me ON me.memo_id = bm.id
       WHERE bm.is_active = true AND bm.is_deleted = false AND me.memo_id IS NULL`
    );

    return NextResponse.json({
      success: true,
      indexed,
      errors,
      remaining: remainingRow?.remaining ?? 0,
    });
  } catch (err) {
    console.error('[MEMO-REINDEX] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
