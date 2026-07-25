import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth/middleware';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// 댓글 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError } = await verifyAuth(request);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: authError || '인증이 필요합니다.' }, { status: 401 });
    }

    const commentId = params.id;
    const body = await request.json();
    const { content } = body;

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

    // 댓글 존재 및 권한 확인
    const { data: comment, error: commentError } = await supabaseAdmin
      .from('task_comments')
      .select('id, user_id, task_id, content')
      .eq('id', commentId)
      .eq('is_deleted', false)
      .single();

    if (commentError || !comment) {
      return NextResponse.json(
        { success: false, error: '댓글을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 작성자만 수정 가능
    if (comment.user_id !== user.userId) {
      return NextResponse.json(
        { success: false, error: '자신의 댓글만 수정할 수 있습니다.' },
        { status: 403 }
      );
    }

    // 댓글 수정
    const { data: updatedComment, error: updateError } = await supabaseAdmin
      .from('task_comments')
      .update({
        content: content.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', commentId)
      .select(`
        *,
        user:employees!user_id(name, position, profile_image_url)
      `)
      .single();

    if (updateError) {
      console.error('댓글 수정 실패:', updateError);
      return NextResponse.json(
        { success: false, error: '댓글 수정에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 기존 멘션 삭제 후 새로운 멘션 처리
    await supabaseAdmin
      .from('mentions')
      .delete()
      .eq('comment_id', commentId);

    const mentions = extractMentions(content);
    if (mentions.length > 0) {
      await processMentions(commentId, mentions, user.userId);
    }

    // 활동 로그 기록
    await supabaseAdmin
      .from('activity_logs')
      .insert({
        user_id: user.userId,
        action: 'comment_updated',
        entity_type: 'task',
        entity_id: comment.task_id,
        comment_id: commentId,
        details: {
          old_content: comment.content.substring(0, 100),
          new_content: content.substring(0, 100)
        }
      });

    return NextResponse.json({
      success: true,
      data: updatedComment
    });

  } catch (error) {
    console.error('댓글 수정 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 댓글 삭제 (소프트 삭제)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError } = await verifyAuth(request);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: authError || '인증이 필요합니다.' }, { status: 401 });
    }

    const commentId = params.id;

    // 댓글 존재 및 권한 확인
    const { data: comment, error: commentError } = await supabaseAdmin
      .from('task_comments')
      .select('id, user_id, task_id, content')
      .eq('id', commentId)
      .eq('is_deleted', false)
      .single();

    if (commentError || !comment) {
      return NextResponse.json(
        { success: false, error: '댓글을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 작성자 또는 관리자만 삭제 가능
    if (comment.user_id !== user.userId && user.permissionLevel < 2) {
      return NextResponse.json(
        { success: false, error: '댓글을 삭제할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 소프트 삭제
    const { error: deleteError } = await supabaseAdmin
      .from('task_comments')
      .update({
        is_deleted: true,
        content: '[삭제된 댓글]',
        updated_at: new Date().toISOString()
      })
      .eq('id', commentId);

    if (deleteError) {
      console.error('댓글 삭제 실패:', deleteError);
      return NextResponse.json(
        { success: false, error: '댓글 삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 관련 멘션 삭제
    await supabaseAdmin
      .from('mentions')
      .delete()
      .eq('comment_id', commentId);

    // 활동 로그 기록
    await supabaseAdmin
      .from('activity_logs')
      .insert({
        user_id: user.userId,
        action: 'comment_deleted',
        entity_type: 'task',
        entity_id: comment.task_id,
        comment_id: commentId,
        details: {
          deleted_content: comment.content.substring(0, 100)
        }
      });

    return NextResponse.json({
      success: true,
      message: '댓글이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('댓글 삭제 오류:', error);
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
    // 멘션된 사용자들 찾기
    const { data: mentionedUsers, error } = await supabaseAdmin
      .from('employees')
      .select('id, name, email')
      .or(mentions.map(mention => `name.ilike.%${mention}%,email.ilike.%${mention}%`).join(','))
      .neq('id', mentioningUserId);

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