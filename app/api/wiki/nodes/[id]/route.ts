// app/api/wiki/nodes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data, error } = await supabaseAdmin
      .from('wiki_nodes')
      .select('*, children:wiki_nodes(id, title, slug, node_type, sort_order, is_published)')
      .eq('id', params.id)
      .eq('is_published', true)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '노드를 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[Wiki Node] GET error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  let decoded: { permission_level?: number };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { permission_level?: number };
  } catch {
    return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });
  }

  if ((decoded.permission_level ?? 0) < 4) {
    return NextResponse.json({ error: '권한이 없습니다 (레벨 4 필요)' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const allowedFields = ['title', 'content_md', 'tags', 'is_published', 'sort_order', 'metadata'];
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (field in body) update[field] = body[field];
    }

    const { data, error } = await supabaseAdmin
      .from('wiki_nodes')
      .update(update)
      .eq('id', params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Wiki Node] PATCH error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
