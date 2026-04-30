// app/api/wiki/nodes/route.ts
// 게시된 wiki_nodes 전체 조회 (트리 빌드용) — supabaseAdmin으로 RLS 우회
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain'); // 선택적 도메인 필터

    let query = supabaseAdmin
      .from('wiki_nodes')
      .select('id, parent_id, node_type, sort_order, title, slug, tags, is_published')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('[Wiki Nodes] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let nodes = data ?? [];

    // 도메인 필터: 루트 노드 기준으로 필터 (하위 노드는 parent 따라감)
    if (domain) {
      const domainRootIds = new Set(
        nodes
          .filter(n => !n.parent_id && Array.isArray(n.tags) && n.tags.includes(domain))
          .map(n => n.id)
      );
      nodes = nodes.filter(n => {
        if (!n.parent_id) return domainRootIds.has(n.id);
        // 부모가 해당 도메인이거나 자신이 해당 도메인 태그를 가지면 포함
        return Array.isArray(n.tags) && n.tags.includes(domain);
      });
    }

    return NextResponse.json({ nodes });
  } catch (err) {
    console.error('[Wiki Nodes] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
