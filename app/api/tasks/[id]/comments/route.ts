import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth/middleware';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// 댓글 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError } = await verifyAuth(request);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: authError }, { status: 401 });
    }

    const taskId = params.id;

    // 댓글 목록 조회 (대댓글 포함, 계층 구조)
    const { data: comments, error } = await supabaseAdmin
      .from('task_comments_with_users')
      .select(`
        *,
        replies:task_comments_with_users!parent_id(*)
      `)
      .eq('task_id', taskId)
      .is('parent_id', null) // 최상위 댓글만
      .order('created_at', { ascending: true });

    if (error) {
      console.error('댓글 조회 실패:', error);
      return NextResponse.json(
        { success: false, error: '댓글을 불러오는데 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: comments || []
    });

  } catch (error) {
    console.error('댓글 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 댓글 생성
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError } = await verifyAuth(request);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: authError }, { status: 401 });
    }

    const taskId = params.id;
    const body = await request.json();
    const { content, parent_id } = body;

    // 입력 유효성 검사
    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '댓글 내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    if (content.length > 2000) {
      return NextResponse.json(
        { success: false, error: '댓글은 2000자를 초과할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 업무 존재 확인
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .select('id, title')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { success: false, error: '업무를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 부모 댓글 확인 (대댓글인 경우)
    if (parent_id) {
      const { data: parentComment, error: parentError } = await supabaseAdmin
        .from('task_comments')
        .select('id, task_id')
        .eq('id', parent_id)
        .eq('task_id', taskId)
        .single();

      if (parentError || !parentComment) {
        return NextResponse.json(
          { success: false, error: '부모 댓글을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
    }

    // 댓글 생성
    const { data: comment, error: insertError } = await supabaseAdmin
      .from('task_comments')
      .insert({
        task_id: taskId,
        user_id: user.userId,
        content: content.trim(),
        parent_id: parent_id || null
      })
      .select(`
        *,
        user:employees!user_id(name, position, profile_image_url)
      `)
      .single();

    if (insertError) {
      console.error('댓글 생성 실패:', insertError);
      return NextResponse.json(
        { success: false, error: '댓글 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 멘션 처리
    const mentions = extractMentions(content);
    if (mentions.length > 0) {
      await processMentions(comment.id, mentions, user.userId);
    }

    // 업무 관찰자로 자동 추가
    await supabaseAdmin
      .from('task_watchers')
      .insert({
        task_id: taskId,
        user_id: user.userId
      })
      .select()
      .single(); // 이미 존재하면 무시

    return NextResponse.json({
      success: true,
      data: comment
    });

  } catch (error) {
    console.error('댓글 생성 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 멘션 추출 함수
function extractMentions(content: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_가-힣]+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const username = match[1];
    if (!mentions.includes(username)) {
      mentions.push(username);
    }
  }

  return mentions;
}

// 멘션 처리 함수
async function processMentions(commentId: string, mentions: string[], mentioningUserId: string) {
  try {
    // 멘션된 사용자들 찾기 (이름 또는 이메일로)
    const { data: mentionedUsers, error } = await supabaseAdmin
      .from('employees')
      .select('id, name, email')
      .or(mentions.map(mention => `name.ilike.%${mention}%,email.ilike.%${mention}%`).join(','))
      .neq('id', mentioningUserId); // 자신은 제외

    if (error || !mentionedUsers) {
      console.error('멘션된 사용자 조회 실패:', error);
      return;
    }

    // 멘션 레코드 생성
    const mentionInserts = mentionedUsers.map(user => ({
      comment_id: commentId,
      mentioned_user_id: user.id,
      mentioning_user_id: mentioningUserId
    }));

    if (mentionInserts.length > 0) {
      await supabaseAdmin
        .from('mentions')
        .insert(mentionInserts);
    }

  } catch (error) {
    console.error('멘션 처리 실패:', error);
  }
}