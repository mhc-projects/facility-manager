// app/api/notifications/route.ts - 실시간 알림 API (업무 담당자 알림 포함)
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { sendWebPushToUser, sendWebPushToUsers } from '@/lib/send-push';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// 기존 사용자 알림 타입
export interface UserNotification {
  id: string;
  user_id: string;
  type: 'task_assigned' | 'task_completed' | 'task_updated' | 'system_notice';
  title: string;
  message: string;
  related_task_id?: string;
  related_user_id?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  expires_at: string;

  // 조인된 정보
  related_task?: {
    id: string;
    title: string;
    business_name: string;
    status: string;
  };
  related_user?: {
    id: string;
    name: string;
    email: string;
  };
}

// 업무 담당자 알림 타입
export interface TaskNotification {
  id: string;
  user_id: string;
  user_name?: string;
  task_id: string;
  business_name: string;
  message: string;
  notification_type: 'delay' | 'risk' | 'status_change' | 'assignment' | 'completion';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  is_read: boolean;
  read_at?: string;
  created_at: string;
  expires_at?: string;
}

// JWT 토큰에서 사용자 정보 추출하는 헬퍼 함수
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

async function getUserFromToken(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);

    // JWT 토큰 형식 검증
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.warn('⚠️ [NOTIFICATIONS] JWT 토큰 형식이 잘못됨:', tokenParts.length, 'parts');
      return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    console.log('🔍 [AUTH] JWT 디코딩 성공:', {
      userId: decoded.userId || decoded.id,
      hasExpiry: !!decoded.exp
    });

    // 사용자 정보 조회 - 직접 PostgreSQL 연결 사용
    const user = await queryOne(
      'SELECT id, name, email, permission_level, department FROM employees WHERE id = $1 AND is_active = true LIMIT 1',
      [decoded.userId || decoded.id]
    );

    if (!user) {
      console.error('❌ [AUTH] 사용자 조회 실패:', {
        error: 'User not found or inactive',
        userId: decoded.userId || decoded.id,
        hasUser: false
      });
      return null;
    }

    return user;
  } catch (error) {
    console.warn('⚠️ [AUTH] JWT 토큰 검증 실패:', error);
    return null;
  }
}

// GET: 사용자 알림 목록 조회 (3-tier 지원)
export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    console.log('🚀 [NOTIFICATIONS] API 호출됨:', {
      url: request.url,
      hasAuth: !!request.headers.get('authorization')
    });

    // JWT 토큰에서 사용자 정보 추출
    const user = await getUserFromToken(request);
    if (!user) {
      console.error('❌ [NOTIFICATIONS] 사용자 인증 실패');
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const taskNotifications = searchParams.get('taskNotifications') === 'true';
    const tier = searchParams.get('tier') as 'personal' | 'team' | 'company' | 'all' || 'all';

    console.log('📢 [NOTIFICATIONS] 알림 목록 조회:', {
      userId: user.id,
      userName: user.name,
      unreadOnly,
      limit,
      taskNotifications,
      tier
    });

    // 3-tier 알림 시스템 지원
    if (tier !== 'all') {
      return await getTierSpecificNotifications(user, tier, unreadOnly, limit);
    }

    // 업무 담당자 알림 조회 - 직접 PostgreSQL 연결 사용
    if (taskNotifications) {
      try {
        // 동적 쿼리 빌드
        const queryParts: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        queryParts.push(`
          SELECT id, user_id, user_name, task_id, business_name, message,
                 notification_type, priority, is_read, read_at, created_at, expires_at
          FROM task_notifications
          WHERE user_id = $${paramIndex++}
        `);
        params.push(user.id);

        // 읽지 않은 알림만 필터링
        if (unreadOnly) {
          queryParts.push(`AND is_read = $${paramIndex++}`);
          params.push(false);
        }

        // 만료되지 않은 알림만 조회
        queryParts.push(`AND (expires_at IS NULL OR expires_at > $${paramIndex++})`);
        params.push(new Date().toISOString());

        queryParts.push(`ORDER BY created_at DESC LIMIT $${paramIndex++}`);
        params.push(limit);

        const notifications = await queryAll(queryParts.join(' '), params);

        console.log('✅ [TASK-NOTIFICATIONS] 조회 성공:', notifications?.length || 0, '개 업무 알림');

        return createSuccessResponse({
          taskNotifications: notifications || [],
          count: notifications?.length || 0,
          unreadCount: notifications?.filter(n => !n.is_read).length || 0
        });

      } catch (error: any) {
        console.error('🔴 [TASK-NOTIFICATIONS] 예외 발생:', error?.message);

        // 테이블 관련 오류인 경우 graceful degradation
        if (error?.message?.includes('relation') ||
            error?.message?.includes('does not exist') ||
            error?.message?.includes('table')) {
          console.warn('⚠️ [TASK-NOTIFICATIONS] 테이블 문제 감지 - graceful degradation 적용');
          return createSuccessResponse({
            taskNotifications: [],
            count: 0,
            unreadCount: 0,
            message: 'task_notifications 테이블 초기화가 필요합니다'
          });
        }
        throw error;
      }
    }

    // 기본 사용자 알림 조회 - 직접 PostgreSQL 연결 사용
    try {
      // 동적 쿼리 빌드
      const queryParts: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      queryParts.push(`
        SELECT
          un.id,
          un.user_id,
          un.notification_id,
          un.is_read,
          un.read_at,
          un.created_at,
          n.title,
          n.message,
          n.category,
          n.priority,
          n.notification_tier,
          n.related_resource_type,
          n.related_resource_id,
          n.related_url,
          n.expires_at,
          n.created_by_name
        FROM user_notifications un
        INNER JOIN notifications n ON un.notification_id = n.id
        WHERE un.user_id = $${paramIndex++}
      `);
      params.push(user.id);

      queryParts.push(`AND (n.expires_at IS NULL OR n.expires_at > $${paramIndex++})`);
      params.push(new Date().toISOString());

      // 관리자 전용 알림 (user_created, user_updated)은 permission_level >= 3 이상만 조회
      if ((user.permission_level ?? 1) < 3) {
        queryParts.push(`AND n.category NOT IN ('user_created', 'user_updated')`);
      }

      // 읽지 않은 알림만 조회
      if (unreadOnly) {
        queryParts.push(`AND un.is_read = $${paramIndex++}`);
        params.push(false);
      }

      queryParts.push(`ORDER BY un.created_at DESC LIMIT $${paramIndex++}`);
      params.push(limit);

      const notifications = await queryAll(queryParts.join(' '), params);

      // personal 결재 알림 (notifications.target_user_id = 현재 유저) 추가 조회
      // user_notification_reads를 LEFT JOIN해서 실제 읽음 상태 반영
      const personalNotifs = await queryAll(
        `SELECT n.id, n.title, n.message, n.category, n.priority, n.notification_tier,
                n.related_resource_type, n.related_resource_id, n.related_url,
                n.expires_at, n.created_by_name, n.target_user_id, n.created_at,
                CASE WHEN r.id IS NOT NULL THEN true ELSE false END AS is_read,
                r.read_at
         FROM notifications n
         LEFT JOIN user_notification_reads r
           ON r.notification_id = n.id AND r.user_id = $1
         WHERE n.target_user_id = $1::uuid
           AND (n.expires_at IS NULL OR n.expires_at > $2)
         ORDER BY n.created_at DESC
         LIMIT 30`,
        [user.id, new Date().toISOString()]
      );

      // user_notifications에 없는 personal 알림만 추가 (중복 제거)
      const existingNotifIds = new Set((notifications || []).map((n: any) => String(n.notification_id)));
      const newPersonal = (personalNotifs || [])
        .filter((n: any) => !existingNotifIds.has(String(n.id)))
        .map((n: any) => ({
          id: n.id,
          notification_id: n.id,
          user_id: user.id,
          is_read: n.is_read,   // user_notification_reads에서 읽어온 실제 상태
          read_at: n.read_at,
          created_at: n.created_at,
          title: n.title,
          message: n.message,
          category: n.category,
          priority: n.priority,
          notification_tier: n.notification_tier,
          related_resource_type: n.related_resource_type,
          related_resource_id: n.related_resource_id,
          related_url: n.related_url,
          expires_at: n.expires_at,
          created_by_name: n.created_by_name,
        }));

      const allNotifications = [...(notifications || []), ...newPersonal];
      allNotifications.sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      console.log('✅ [NOTIFICATIONS] 조회 성공:', allNotifications.length, '개 알림 (personal:', newPersonal.length, ')');

      return createSuccessResponse({
        notifications: allNotifications,
        count: allNotifications.length,
        unreadCount: allNotifications.filter((n: any) => !n.is_read).length
      });

    } catch (error: any) {
      console.error('🔴 [NOTIFICATIONS] 예외 발생:', error?.message);

      // 테이블 관련 오류인 경우 graceful degradation
      if (error?.message?.includes('relation') ||
          error?.message?.includes('does not exist') ||
          error?.message?.includes('table')) {
        console.warn('⚠️ [NOTIFICATIONS] 테이블 문제 감지 - graceful degradation 적용');
        return createSuccessResponse({
          notifications: [],
          count: 0,
          unreadCount: 0,
          message: 'user_notifications 테이블 초기화가 필요합니다'
        });
      }
      throw error;
    }

  } catch (error: any) {
    console.error('🔴 [NOTIFICATIONS] GET 오류:', error?.message || error);

    // 데이터베이스 연결 오류인 경우 더 자세한 정보 제공
    if (error?.message?.includes('relation') || error?.message?.includes('table')) {
      console.error('🔴 [NOTIFICATIONS] 테이블 구조 오류. 필요 테이블:', {
        user_notifications: '사용자 알림 테이블',
        task_notifications: '업무 알림 테이블',
        employees: '직원 테이블'
      });
      return createErrorResponse('알림 시스템 초기화가 필요합니다. 관리자에게 문의하세요.', 500);
    }

    return createErrorResponse('알림 조회 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// 3-tier 알림 조회 헬퍼 함수
async function getTierSpecificNotifications(user: any, tier: string, unreadOnly: boolean, limit: number) {
  let whereClause = '';
  const now = new Date().toISOString();

  switch (tier) {
    case 'personal':
      whereClause = `notification_tier = 'personal' AND target_user_id = '${user.id}'`;
      break;
    case 'team':
      const teamConditions = [];
      if (user.team_id) {
        teamConditions.push(`target_team_id = ${user.team_id}`);
      }
      if (user.department_id) {
        teamConditions.push(`target_department_id = ${user.department_id}`);
      }
      if (teamConditions.length === 0) {
        whereClause = 'FALSE'; // 팀/부서 정보가 없으면 팀 알림 없음
      } else {
        whereClause = `notification_tier = 'team' AND (${teamConditions.join(' OR ')})`;
      }
      break;
    case 'company':
      whereClause = `notification_tier = 'company'`;
      break;
  }

  let query = supabaseAdmin
    .from('notifications')
    .select(`
      id,
      title,
      message,
      category,
      priority,
      notification_tier,
      target_user_id,
      target_team_id,
      target_department_id,
      created_by,
      created_by_name,
      related_resource_type,
      related_resource_id,
      related_url,
      metadata,
      expires_at,
      created_at,
      user_notifications!inner(
        is_read,
        read_at
      )
    `)
    .eq('user_notifications.user_id', user.id)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq('user_notifications.is_read', false);
  }

  const { data: notifications, error } = await query;

  if (error) {
    console.error('🔴 [TIER-NOTIFICATIONS] 조회 오류:', error);
    throw error;
  }

  const formattedNotifications = notifications?.map(n => ({
    id: n.id,
    title: n.title,
    message: n.message,
    category: n.category,
    priority: n.priority,
    tier: n.notification_tier,
    isRead: n.user_notifications?.[0]?.is_read || false,
    readAt: n.user_notifications?.[0]?.read_at,
    createdAt: n.created_at,
    createdByName: n.created_by_name,
    relatedResourceType: n.related_resource_type,
    relatedUrl: n.related_url,
    metadata: n.metadata
  })) || [];

  console.log(`✅ [${tier.toUpperCase()}-NOTIFICATIONS] 조회 성공:`, formattedNotifications.length, '개 알림');

  return createSuccessResponse({
    notifications: formattedNotifications,
    count: formattedNotifications.length,
    unreadCount: formattedNotifications.filter(n => !n.isRead).length,
    tier
  });
}

// POST: 알림 생성 (3-tier 지원)
export const POST = withApiHandler(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const {
      title,
      message,
      category,
      priority = 'medium',
      notification_tier,
      target_user_id,
      target_team_id,
      target_department_id,
      related_resource_type,
      related_resource_id,
      related_url,
      expires_at,
      metadata,
      // 기존 호환성 필드
      user_id,
      type,
      related_task_id,
      related_user_id,
      target_permission_level
    } = body;

    // JWT 토큰에서 생성자 정보 추출
    const creator = await getUserFromToken(request);
    if (!creator) {
      return createErrorResponse('인증이 필요합니다', 401);
    }

    console.log('📢 [NOTIFICATIONS] 알림 생성:', {
      notification_tier,
      title,
      target_user_id,
      target_team_id,
      target_department_id,
      creator: creator.name
    });

    // 3-tier 알림 생성
    if (notification_tier) {
      return await createTierNotification({
        title,
        message,
        category: category || 'general',
        priority,
        notification_tier,
        target_user_id,
        target_team_id,
        target_department_id,
        created_by: creator.id,
        created_by_name: creator.name,
        related_resource_type,
        related_resource_id,
        related_url,
        expires_at,
        metadata
      });
    }

    // 기존 호환성 로직
    console.log('📢 [LEGACY-NOTIFICATIONS] 레거시 알림 생성:', { type, title, user_id, target_permission_level });

    // 시스템 공지인 경우 (여러 사용자에게)
    if (type === 'system_notice' && target_permission_level) {
      const { data: targetUsers, error: usersError } = await supabaseAdmin
        .from('employees')
        .select('id')
        .gte('permission_level', target_permission_level)
        .eq('is_active', true)
        .eq('is_deleted', false);

      if (usersError) throw usersError;

      // 여러 사용자에게 알림 생성
      const notifications = targetUsers.map(user => ({
        user_id: user.id,
        type,
        title,
        message,
        related_task_id,
        related_user_id
      }));

      const { data: createdNotifications, error: createError } = await supabaseAdmin
        .from('user_notifications')
        .insert(notifications)
        .select();

      if (createError) throw createError;

      console.log('✅ [NOTIFICATIONS] 시스템 공지 생성 성공:', createdNotifications.length, '명');

      return createSuccessResponse({
        notifications: createdNotifications,
        count: createdNotifications.length,
        message: `${createdNotifications.length}명에게 알림이 전송되었습니다`
      });
    }

    // 개별 사용자 알림 생성
    if (!user_id) {
      return createErrorResponse('사용자 ID가 필요합니다', 400);
    }

    const { data: newNotification, error } = await supabaseAdmin
      .from('user_notifications')
      .insert({
        user_id,
        type,
        title,
        message,
        related_task_id,
        related_user_id
      })
      .select()
      .single();

    if (error) {
      console.error('🔴 [NOTIFICATIONS] 생성 오류:', error);
      throw error;
    }

    console.log('✅ [NOTIFICATIONS] 생성 성공:', newNotification.id);

    return createSuccessResponse({
      notification: newNotification,
      message: '알림이 성공적으로 생성되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [NOTIFICATIONS] POST 오류:', error?.message || error);
    return createErrorResponse('알림 생성 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// 3-tier 알림 생성 헬퍼 함수
async function createTierNotification(notificationData: any) {
  const {
    title,
    message,
    category,
    priority,
    notification_tier,
    target_user_id,
    target_team_id,
    target_department_id,
    created_by,
    created_by_name,
    related_resource_type,
    related_resource_id,
    related_url,
    expires_at,
    metadata
  } = notificationData;

  // 타겟 유효성 검증
  if (notification_tier === 'personal' && !target_user_id) {
    return createErrorResponse('개인 알림에는 target_user_id가 필요합니다', 400);
  }

  if (notification_tier === 'team' && !target_team_id && !target_department_id) {
    return createErrorResponse('팀 알림에는 target_team_id 또는 target_department_id가 필요합니다', 400);
  }

  // 알림 생성
  const { data: newNotification, error: notificationError } = await supabaseAdmin
    .from('notifications')
    .insert({
      title,
      message,
      category,
      priority,
      notification_tier,
      target_user_id,
      target_team_id,
      target_department_id,
      created_by,
      created_by_name,
      related_resource_type,
      related_resource_id,
      related_url,
      expires_at,
      metadata
    })
    .select()
    .single();

  if (notificationError) {
    console.error('🔴 [TIER-NOTIFICATIONS] 생성 오류:', notificationError);
    throw notificationError;
  }

  // 대상 사용자 결정 및 user_notifications 생성은 트리거에서 자동 처리됨
  console.log('✅ [TIER-NOTIFICATIONS] 생성 성공:', newNotification.id, '- Tier:', notification_tier);

  // Web Push 발송 (비동기 - 실패해도 응답에 영향 없음)
  const pushPayload = {
    title,
    body: message,
    url: related_url,
    category,
  };

  if (notification_tier === 'personal' && target_user_id) {
    sendWebPushToUser(target_user_id, pushPayload).catch(() => {});
  } else if (notification_tier === 'team') {
    // 팀/부서 소속 사용자 조회 후 발송
    const teamQuery = target_team_id
      ? supabaseAdmin.from('employees').select('id').eq('team_id', target_team_id).eq('is_active', true)
      : supabaseAdmin.from('employees').select('id').eq('department_id', target_department_id).eq('is_active', true);
    teamQuery.then(({ data }) => {
      if (data && data.length > 0) {
        sendWebPushToUsers(data.map((u: any) => u.id), pushPayload).catch(() => {});
      }
    }).catch(() => {});
  } else if (notification_tier === 'company') {
    // 전체 활성 사용자에게 발송
    supabaseAdmin.from('employees').select('id').eq('is_active', true).eq('is_deleted', false)
      .then(({ data }) => {
        if (data && data.length > 0) {
          sendWebPushToUsers(data.map((u: any) => u.id), pushPayload).catch(() => {});
        }
      }).catch(() => {});
  }

  return createSuccessResponse({
    notification: newNotification,
    message: `${notification_tier} 알림이 성공적으로 생성되었습니다`
  });
}

// PUT: 알림 읽음 처리
export const PUT = withApiHandler(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { notification_ids, user_id, mark_all_read, is_task_notification } = body;

    console.log('📢 [NOTIFICATIONS] 읽음 처리:', { notification_ids, user_id, mark_all_read, is_task_notification });

    if (!user_id) {
      return createErrorResponse('사용자 ID가 필요합니다', 400);
    }

    const tableName = is_task_notification ? 'task_notifications' : 'user_notifications';

    let query = supabaseAdmin
      .from(tableName)
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', user_id)
      .eq('is_read', false);

    // 전체 읽음 처리
    if (mark_all_read) {
      // 조건 없이 모든 읽지 않은 알림 처리
    } else if (notification_ids && notification_ids.length > 0) {
      // 특정 알림들만 처리
      query = query.in('id', notification_ids);
    } else {
      return createErrorResponse('알림 ID 또는 전체 읽음 플래그가 필요합니다', 400);
    }

    const { data: updatedNotifications, error } = await query.select();

    if (error) {
      console.error('🔴 [NOTIFICATIONS] 읽음 처리 오류:', error);
      throw error;
    }

    console.log('✅ [NOTIFICATIONS] 읽음 처리 성공:', updatedNotifications?.length || 0, '개 알림');

    return createSuccessResponse({
      updatedCount: updatedNotifications?.length || 0,
      message: `${updatedNotifications?.length || 0}개 알림을 읽음 처리했습니다`
    });

  } catch (error: any) {
    console.error('🔴 [NOTIFICATIONS] PUT 오류:', error?.message || error);
    return createErrorResponse('알림 읽음 처리 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// DELETE: 알림 삭제
export const DELETE = withApiHandler(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('id');
    const userId = searchParams.get('userId');
    const deleteExpired = searchParams.get('deleteExpired') === 'true';

    console.log('📢 [NOTIFICATIONS] 알림 삭제:', { notificationId, userId, deleteExpired });

    if (!userId) {
      return createErrorResponse('사용자 ID가 필요합니다', 400);
    }

    // 만료된 알림 일괄 삭제
    if (deleteExpired) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      let totalDeleted = 0;

      // user_notifications에서 만료된 알림 삭제
      const { data: deletedUserNotifications, error: userError } = await supabaseAdmin
        .from('user_notifications')
        .delete()
        .eq('user_id', userId)
        .or(`expires_at.lt.${new Date().toISOString()},and(is_read.eq.true,read_at.lt.${sevenDaysAgo})`)
        .select();

      if (userError) {
        console.error('🔴 [NOTIFICATIONS] 사용자 알림 삭제 오류:', userError);
      } else {
        totalDeleted += deletedUserNotifications?.length || 0;
      }

      // task_notifications에서 만료된 알림 삭제 (테이블 존재 시에만)
      try {
        const { data: deletedTaskNotifications, error: taskError } = await supabaseAdmin
          .from('task_notifications')
          .delete()
          .eq('user_id', userId)
          .or(`expires_at.lt.${new Date().toISOString()},and(is_read.eq.true,read_at.lt.${sevenDaysAgo})`)
          .select();

        if (taskError) {
          if (taskError.message.includes('relation') || taskError.message.includes('does not exist')) {
            console.warn('⚠️ [NOTIFICATIONS] task_notifications 테이블이 존재하지 않음 - 스킵');
          } else {
            console.error('🔴 [NOTIFICATIONS] 업무 알림 삭제 오류:', taskError);
          }
        } else {
          totalDeleted += deletedTaskNotifications?.length || 0;
        }
      } catch (error: any) {
        console.warn('⚠️ [NOTIFICATIONS] task_notifications 테이블 처리 중 오류 - 스킵:', error?.message);
      }

      console.log('✅ [NOTIFICATIONS] 만료 알림 삭제 성공:', totalDeleted, '개');

      return createSuccessResponse({
        deletedCount: totalDeleted,
        message: `${totalDeleted}개 만료된 알림을 삭제했습니다`
      });
    }

    // 특정 알림 삭제
    if (!notificationId) {
      return createErrorResponse('알림 ID가 필요합니다', 400);
    }

    const { data: deletedNotification, error } = await supabaseAdmin
      .from('user_notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('🔴 [NOTIFICATIONS] 삭제 오류:', error);
      throw error;
    }

    if (!deletedNotification) {
      return createErrorResponse('알림을 찾을 수 없습니다', 404);
    }

    console.log('✅ [NOTIFICATIONS] 삭제 성공:', deletedNotification.id);

    return createSuccessResponse({
      message: '알림이 성공적으로 삭제되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [NOTIFICATIONS] DELETE 오류:', error?.message || error);
    return createErrorResponse('알림 삭제 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });