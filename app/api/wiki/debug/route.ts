// 임시 진단 엔드포인트 - wiki_chunks 상태 및 유사도 점수 확인
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embedding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const question = 'DPF warranty';

  // 1. wiki_chunks 개수 + 샘플 (임베딩 차원 확인용)
  const { count } = await supabaseAdmin
    .from('wiki_chunks')
    .select('*', { count: 'exact', head: true });

  const { data: sample } = await supabaseAdmin
    .from('wiki_chunks')
    .select('id, node_id, chunk_index, token_count')
    .limit(3);

  // 2. wiki_nodes 개수 (is_published 별)
  const { data: nodeStats } = await supabaseAdmin
    .from('wiki_nodes')
    .select('is_published, id');

  const published = nodeStats?.filter(n => n.is_published).length ?? 0;
  const unpublished = nodeStats?.filter(n => !n.is_published).length ?? 0;

  // 3. 임베딩 생성
  let embedding: number[] | null = null;
  let embedError = '';
  try {
    embedding = await getEmbedding(question, 'query');
  } catch (e) {
    embedError = String(e);
  }

  if (!embedding) {
    return NextResponse.json({ count, embedError });
  }

  // 4a. supabaseAdmin.rpc() 호출
  const { data: results, error: searchError } = await supabaseAdmin.rpc('search_wiki_chunks', {
    query_embedding: `[${embedding.join(',')}]`,
    match_count: 10,
    similarity_threshold: -1,
  });

  // 4b. 직접 fetch로 PostgREST 호출 (supabaseAdmin 클라이언트 우회)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const directRes = await fetch(`${supabaseUrl}/rest/v1/rpc/search_wiki_chunks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
    },
    body: JSON.stringify({
      query_embedding: `[${embedding.join(',')}]`,
      match_count: 5,
      similarity_threshold: -1,
    }),
  });
  const directResult = await directRes.json();

  // 5. SQL로 직접 청크 + 노드 JOIN 확인
  const { data: joinCheck, error: joinError } = await supabaseAdmin
    .from('wiki_chunks')
    .select('id, node_id, wiki_nodes!inner(id, title, is_published)')
    .limit(3);

  return NextResponse.json({
    chunk_count: count,
    nodes: { published, unpublished },
    embed_dim: embedding.length,
    sample_chunks: sample,
    rpc_error: searchError?.message ?? null,
    rpc_results_count: results?.length ?? 0,
    direct_fetch_status: directRes.status,
    direct_fetch_count: Array.isArray(directResult) ? directResult.length : 0,
    direct_fetch_sample: Array.isArray(directResult)
      ? directResult.slice(0, 2).map((r: { node_title: string; similarity: number }) => ({
          node_title: r.node_title,
          similarity: Number(r.similarity).toFixed(4),
        }))
      : directResult,
    join_check: joinCheck ?? joinError?.message,
  });
}
