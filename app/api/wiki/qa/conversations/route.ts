// app/api/wiki/qa/conversations/route.ts
// 블루온AI 대화 목록 조회 (로그인 계정 소유 대화만)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyToken } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '') ||
    request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];
  const tokenPayload = authToken ? verifyToken(authToken) : null;
  if (!tokenPayload) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }
  const employeeId = tokenPayload.userId || tokenPayload.id;

  const { data, error } = await supabaseAdmin
    .from('qa_conversations')
    .select('id, domain, title, created_at, updated_at')
    .eq('created_by', employeeId)
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[QA] conversations list error:', error);
    return NextResponse.json({ error: '대화 목록 조회 실패' }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}
