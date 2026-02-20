// app/api/businesses/[id]/memos/[memoId]/route.ts - 개별 메모 관리 API
import { NextRequest } from 'next/server';
import { createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import {
  updateBusinessMemo,
  deleteBusinessMemo
} from '@/lib/supabase-business';
import { verifyToken } from '@/utils/auth';
import { AuditLogger } from '@/utils/AuditLogger';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// PUT /api/businesses/[id]/memos/[memoId] - 메모 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; memoId: string } }
) {
  try {
    // 인증 확인
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];

    if (!token) {
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const tokenPayload = await verifyToken(token);
    if (!tokenPayload) {
      return createErrorResponse('유효하지 않은 토큰입니다', 401);
    }

    const { memoId } = params;
    const updateData = await request.json();

    const memo = await updateBusinessMemo(memoId, {
      title: updateData.title,
      content: updateData.content,
      updated_by: tokenPayload.name || 'Unknown'
    });

    return createSuccessResponse({
      memo: memo,
      message: '메모가 성공적으로 업데이트되었습니다'
    });

  } catch (error) {
    console.error('❌ [MEMO-UPDATE] 업데이트 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '메모 업데이트에 실패했습니다',
      500
    );
  }
}

// DELETE /api/businesses/[id]/memos/[memoId] - 메모 삭제 (권한 검증 강화)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; memoId: string } }
) {
  try {
    // 인증 확인
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];

    if (!token) {
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const tokenPayload = await verifyToken(token);
    if (!tokenPayload) {
      return createErrorResponse('유효하지 않은 토큰입니다', 401);
    }

    const userPermission = tokenPayload.permission_level || 1;
    const { memoId } = params;

    // 🆕 메모 조회하여 타입 확인
    const { getSupabaseAdmin } = await import('@/lib/supabase');
    const supabase = getSupabaseAdmin();

    const { data: memo, error: fetchError } = await supabase
      .from('business_memos')
      .select('*')
      .eq('id', memoId)
      .single();

    if (fetchError || !memo) {
      return createErrorResponse('메모를 찾을 수 없습니다', 404);
    }

    // 🆕 자동 메모는 권한 4만 삭제 가능
    const isAutoMemo = memo.title.startsWith('[자동]');
    if (isAutoMemo && userPermission < 4) {
      // 🆕 감사 로그 기록 (권한 부족 시도)
      AuditLogger.logAutoMemoDeleteAttempted({
        userName: tokenPayload.name || 'Unknown',
        userPermission,
        businessId: memo.business_id,
        memoId,
        memoTitle: memo.title
      });

      return createErrorResponse(
        '자동 생성된 메모는 슈퍼 관리자(권한 4)만 삭제할 수 있습니다.',
        403
      );
    }

    // 🆕 admin/revenue 페이지 접근자는 모두 권한 3 이상이므로
    // 일반/업무 메모는 권한 3 이상만 삭제 가능
    if (!isAutoMemo && userPermission < 3) {
      return createErrorResponse(
        'admin/revenue 페이지의 메모는 관리자(권한 3) 이상만 삭제할 수 있습니다.',
        403
      );
    }

    // 삭제 실행
    await deleteBusinessMemo(memoId);

    // 🆕 감사 로그 기록 (자동 메모 삭제 시)
    if (isAutoMemo) {
      AuditLogger.logAutoMemoDeleted({
        userName: tokenPayload.name || 'Unknown',
        userPermission,
        businessId: memo.business_id,
        memoId,
        memoTitle: memo.title,
        memoContent: memo.content
      });
    }

    return createSuccessResponse({
      message: '메모가 성공적으로 삭제되었습니다'
    });

  } catch (error) {
    console.error('❌ [MEMO-DELETE] 삭제 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '메모 삭제에 실패했습니다',
      500
    );
  }
}