// app/api/wiki/reindex/route.ts
// Wiki 전체 또는 특정 노드의 임베딩 재생성 (관리자 전용)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getEmbedding, splitIntoChunks } from '@/lib/embedding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 임베딩은 시간이 걸릴 수 있으므로 최대 실행시간 설정
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { nodeId } = await request.json().catch(() => ({}));

    // 재인덱싱할 노드 조회 (parent title 포함)
    let query = supabaseAdmin
      .from('wiki_nodes')
      .select('id, title, content_md, parent_id')
      .eq('is_published', true);

    if (nodeId) {
      query = query.eq('id', nodeId);
    }

    const { data: nodes, error: nodesError } = await query;
    if (nodesError) return NextResponse.json({ error: nodesError.message }, { status: 500 });
    if (!nodes?.length) return NextResponse.json({ success: true, indexed: 0, errors: 0, nodeCount: 0 });

    // parent title 조회용 맵
    const nodeMap = new Map(nodes.map(n => [n.id, n.title]));

    let indexed = 0;
    let errors = 0;

    for (const node of nodes) {
      if (!node.content_md) continue;

      const parentTitle = node.parent_id ? nodeMap.get(node.parent_id) : null;
      const contextPrefix = parentTitle ? `[${parentTitle} > ${node.title}]\n\n` : `[${node.title}]\n\n`;
      const fullText = `${contextPrefix}${node.title}\n\n${node.content_md}`;
      const chunks = splitIntoChunks(fullText);

      // 기존 청크 삭제
      await supabaseAdmin.from('wiki_chunks').delete().eq('node_id', node.id);

      for (let i = 0; i < chunks.length; i++) {
        try {
          const embedding = await getEmbedding(chunks[i], 'passage');
          await supabaseAdmin.from('wiki_chunks').insert({
            node_id: node.id,
            chunk_index: i,
            chunk_text: chunks[i],
            embedding,
            token_count: chunks[i].length,
          });
          indexed++;
        } catch (err) {
          console.error(`[Reindex] chunk ${i} of node ${node.id} failed:`, err);
          errors++;
        }

        // API 속도 제한 방지 (1초 딜레이)
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return NextResponse.json({ success: true, indexed, errors, nodeCount: nodes.length });
  } catch (err) {
    console.error('[Reindex] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
