// app/api/wiki/qa/conversations/[id]/route.ts
// 블루온AI 대화 상세 조회(메시지 포함) 및 삭제
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyToken } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getEmployeeId(request: NextRequest): string | null {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '') ||
    request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];
  const tokenPayload = authToken ? verifyToken(authToken) : null;
  if (!tokenPayload) return null;
  return tokenPayload.userId || tokenPayload.id;
}

async function getOwnedConversation(id: string, employeeId: string) {
  const { data } = await supabaseAdmin
    .from('qa_conversations')
    .select('id, domain, title, created_at, updated_at, created_by, is_deleted')
    .eq('id', id)
    .single();
  if (!data || data.is_deleted || data.created_by !== employeeId) return null;
  return data;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const employeeId = getEmployeeId(request);
  if (!employeeId) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const conversation = await getOwnedConversation(params.id, employeeId);
  if (!conversation) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다' }, { status: 404 });
  }

  const { data: messages, error: msgError } = await supabaseAdmin
    .from('qa_messages')
    .select('id, role, content, sources, created_at')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  if (msgError) {
    console.error('[QA] conversation messages error:', msgError);
    return NextResponse.json({ error: '대화 조회 실패' }, { status: 500 });
  }

  const { created_by: _createdBy, is_deleted: _isDeleted, ...conversationPublic } = conversation;
  return NextResponse.json({ conversation: conversationPublic, messages: messages ?? [] });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const employeeId = getEmployeeId(request);
  if (!employeeId) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const conversation = await getOwnedConversation(params.id, employeeId);
  if (!conversation) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다' }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from('qa_conversations')
    .update({ is_deleted: true })
    .eq('id', params.id);

  if (error) {
    console.error('[QA] conversation delete error:', error);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
