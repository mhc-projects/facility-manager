// app/api/wiki/search/route.ts
// 전문검색(tsvector) + 선택적 벡터검색 병합
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() ?? '';
    const nodeType = searchParams.get('type') ?? '';

    if (!query) {
      return NextResponse.json({ results: [] });
    }

    let dbQuery = supabaseAdmin
      .from('wiki_nodes')
      .select('id, title, slug, node_type, content_md, tags, parent_id')
      .eq('is_published', true)
      .or(`title.ilike.%${query}%,content_md.ilike.%${query}%`);

    if (nodeType) {
      dbQuery = dbQuery.eq('node_type', nodeType);
    }

    const { data, error } = await dbQuery
      .order('sort_order', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[Wiki Search] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 검색어 하이라이트를 위한 컨텍스트 추출
    const results = (data ?? []).map((node: {
      id: string;
      title: string;
      slug: string | null;
      node_type: string;
      content_md: string | null;
      tags: string[] | null;
      parent_id: string | null;
    }) => {
      const content = node.content_md ?? '';
      const idx = content.toLowerCase().indexOf(query.toLowerCase());
      const excerpt = idx >= 0
        ? content.slice(Math.max(0, idx - 60), idx + 200)
        : content.slice(0, 200);

      return {
        id: node.id,
        title: node.title,
        slug: node.slug,
        node_type: node.node_type,
        excerpt: excerpt.replace(/\n/g, ' ').trim(),
        tags: node.tags,
      };
    });

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[Wiki Search] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
