// app/api/wiki/nodes/route.ts
// 게시된 wiki_nodes 전체 조회 (트리 빌드용) — supabaseAdmin으로 RLS 우회
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');
    const slug = searchParams.get('slug');

    // slug 단건 조회 (wiki/[slug] 페이지용)
    if (slug) {
      const { data, error } = await supabaseAdmin
        .from('wiki_nodes')
        .select('*, children:wiki_nodes(id, title, slug, node_type, sort_order, is_published)')
        .eq('slug', slug)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: '페이지를 찾을 수 없습니다' }, { status: 404 });
      }
      return NextResponse.json({ node: data });
    }

    // 전체 트리용 목록 조회
    const { data, error } = await supabaseAdmin
      .from('wiki_nodes')
      .select('id, parent_id, node_type, sort_order, title, slug, tags, is_published')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[Wiki Nodes] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let nodes = data ?? [];

    if (domain) {
      const domainRootIds = new Set(
        nodes
          .filter(n => !n.parent_id && Array.isArray(n.tags) && n.tags.includes(domain))
          .map(n => n.id)
      );
      nodes = nodes.filter(n => {
        if (!n.parent_id) return domainRootIds.has(n.id);
        return Array.isArray(n.tags) && n.tags.includes(domain);
      });
    }

    return NextResponse.json({ nodes });
  } catch (err) {
    console.error('[Wiki Nodes] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
