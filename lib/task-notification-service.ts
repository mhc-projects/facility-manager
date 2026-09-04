// Task Notification Service
// 업무 할당 및 변경 시 알림 관리

import { supabaseAdmin } from '@/lib/supabase';

export interface TaskAssignee {
  id: string;
  name: string;
  email: string;
  position?: string;
}

// 2026-09-04: create/update_task_assignment_notifications RPC 래퍼 2개를 제거했다 — JSONB 파라미터에
// JSON.stringify 문자열을 넘겨(jsonb 스칼라 문자열) 22023으로 한 번도 성공한 적이 없었고, 2026-03
// 보안 마이그레이션의 search_path='' 때문에 함수가 테이블도 못 찾는 상태였다. 알림 생성은
// app/api/facility-tasks/route.ts의 createTaskNotifications(직접 INSERT)로 일원화했다.
// DB의 두 함수 자체는 남아 있지만 호출부가 없다.

/**
 * 사용자의 담당 업무 알림 조회
 */
export async function getUserTaskNotifications(
  userId: string,
  options: {
    unreadOnly?: boolean;
    limit?: number;
    includeExpired?: boolean;
  } = {}
) {
  try {
    const { unreadOnly = false, limit = 50, includeExpired = false } = options;

    let query = supabaseAdmin
      .from('task_notifications')
      .select(`
        id,
        user_id,
        user_name,
        task_id,
        business_name,
        message,
        notification_type,
        priority,
        metadata,
        is_read,
        read_at,
        created_at,
        expires_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // 읽지 않은 알림만
    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    // 만료된 알림 제외
    if (!includeExpired) {
      query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error('❌ [TASK-NOTIFICATION] 사용자 알림 조회 오류:', error);
      return { success: false, notifications: [], error: error.message };
    }

    return {
      success: true,
      notifications: notifications || [],
      count: notifications?.length || 0
    };

  } catch (error: any) {
    console.error('❌ [TASK-NOTIFICATION] 사용자 알림 조회 서비스 오류:', error);
    return {
      success: false,
      notifications: [],
      error: error.message
    };
  }
}

/**
 * 알림 읽음 처리
 */
export async function markTaskNotificationAsRead(notificationId: string, userId: string) {
  try {
    const { error } = await supabaseAdmin
      .from('task_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('user_id', userId); // 보안: 본인 알림만 처리 가능

    if (error) {
      console.error('❌ [TASK-NOTIFICATION] 알림 읽음 처리 오류:', error);
      return { success: false, error: error.message };
    }

    return { success: true };

  } catch (error: any) {
    console.error('❌ [TASK-NOTIFICATION] 알림 읽음 처리 서비스 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 사용자의 읽지 않은 알림 개수 조회
 */
export async function getUserUnreadNotificationCount(userId: string) {
  try {
    const { count, error } = await supabaseAdmin
      .from('task_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_read', false)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

    if (error) {
      console.error('❌ [TASK-NOTIFICATION] 읽지 않은 알림 개수 조회 오류:', error);
      return { success: false, count: 0, error: error.message };
    }

    return { success: true, count: count || 0 };

  } catch (error: any) {
    console.error('❌ [TASK-NOTIFICATION] 읽지 않은 알림 개수 서비스 오류:', error);
    return { success: false, count: 0, error: error.message };
  }
}