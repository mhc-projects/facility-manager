-- SQL: Supabase Realtime 트리거 설정
-- 사용법: Supabase SQL Editor에서 실행

-- ============================================================================
-- 1. Realtime Publication 생성 (테이블별 실시간 이벤트 활성화)
-- ============================================================================

-- 기존 publication 삭제 (있는 경우)
DROP PUBLICATION IF EXISTS facility_realtime;

-- 새 publication 생성
CREATE PUBLICATION facility_realtime FOR
  TABLE notifications,
  TABLE task_notifications,
  TABLE facility_tasks,
  TABLE business_info,
  TABLE uploaded_files;

-- Supabase Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE task_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE facility_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE business_info;
ALTER PUBLICATION supabase_realtime ADD TABLE uploaded_files;

-- ============================================================================
-- 2. 알림 자동 생성 트리거 함수
-- ============================================================================

-- 시설 업무 변경 시 자동 알림 생성 함수
CREATE OR REPLACE FUNCTION notify_facility_task_changes()
RETURNS TRIGGER AS $$
DECLARE
  notification_message TEXT;
  old_status_label TEXT;
  new_status_label TEXT;
  assignee_ids TEXT[];
  assignee_id TEXT;
BEGIN
  -- 상태 레이블 매핑
  SELECT CASE OLD.status
    WHEN 'customer_contact' THEN '고객연락'
    WHEN 'site_inspection' THEN '현장조사'
    WHEN 'quotation' THEN '견적'
    WHEN 'contract' THEN '계약'
    WHEN 'deposit_confirm' THEN '계약금확인'
    WHEN 'product_order' THEN '제품주문'
    WHEN 'product_shipment' THEN '제품출하'
    WHEN 'installation_schedule' THEN '설치예정'
    WHEN 'installation' THEN '설치'
    WHEN 'balance_payment' THEN '잔금결제'
    WHEN 'document_complete' THEN '서류완료'
    WHEN 'subsidy_payment' THEN '보조금지급'
    WHEN 'on_hold' THEN '보류'
    WHEN 'completed' THEN '완료'
    WHEN 'cancelled' THEN '취소'
    ELSE COALESCE(OLD.status, '알 수 없음')
  END INTO old_status_label;

  SELECT CASE NEW.status
    WHEN 'customer_contact' THEN '고객연락'
    WHEN 'site_inspection' THEN '현장조사'
    WHEN 'quotation' THEN '견적'
    WHEN 'contract' THEN '계약'
    WHEN 'deposit_confirm' THEN '계약금확인'
    WHEN 'product_order' THEN '제품주문'
    WHEN 'product_shipment' THEN '제품출하'
    WHEN 'installation_schedule' THEN '설치예정'
    WHEN 'installation' THEN '설치'
    WHEN 'balance_payment' THEN '잔금결제'
    WHEN 'document_complete' THEN '서류완료'
    WHEN 'subsidy_payment' THEN '보조금지급'
    WHEN 'on_hold' THEN '보류'
    WHEN 'completed' THEN '완료'
    WHEN 'cancelled' THEN '취소'
    ELSE COALESCE(NEW.status, '알 수 없음')
  END INTO new_status_label;

  -- 담당자 ID 추출 (assignees JSON 배열에서)
  IF NEW.assignees IS NOT NULL THEN
    SELECT ARRAY(
      SELECT jsonb_extract_path_text(value, 'id')
      FROM jsonb_array_elements(NEW.assignees)
      WHERE jsonb_extract_path_text(value, 'id') IS NOT NULL
        AND jsonb_extract_path_text(value, 'id') != ''
    ) INTO assignee_ids;
  END IF;

  -- INSERT 이벤트 (새 업무 생성)
  IF TG_OP = 'INSERT' THEN
    -- 전역 알림 생성
    INSERT INTO notifications (
      title, message, category, priority,
      related_resource_type, related_resource_id, related_url,
      metadata, created_by_id, created_by_name, is_system_notification
    ) VALUES (
      '새 시설 업무 등록',
      format('"%s" 업무가 새로 등록되었습니다. (%s)',
        NEW.title, NEW.business_name),
      'task_created',
      CASE NEW.priority
        WHEN 'high' THEN 'high'::notification_priority
        ELSE 'medium'::notification_priority
      END,
      'facility_task', NEW.id::text,
      format('/admin/tasks?task=%s', NEW.id),
      jsonb_build_object(
        'task_type', NEW.task_type,
        'business_name', NEW.business_name,
        'status', NEW.status,
        'created_by', NEW.created_by_name
      ),
      NEW.created_by, NEW.created_by_name, false
    );

    -- 담당자별 개별 알림 생성
    IF assignee_ids IS NOT NULL THEN
      FOREACH assignee_id IN ARRAY assignee_ids
      LOOP
        INSERT INTO task_notifications (
          user_id, task_id, business_name, message,
          notification_type, priority, metadata
        ) VALUES (
          assignee_id, NEW.id::text, NEW.business_name,
          format('"%s" 업무가 담당자로 배정되었습니다. (%s)',
            NEW.title, NEW.business_name),
          'assignment',
          CASE NEW.priority WHEN 'high' THEN 'high' ELSE 'normal' END,
          jsonb_build_object(
            'task_type', NEW.task_type,
            'assigned_by', NEW.created_by_name,
            'task_id', NEW.id
          )
        );
      END LOOP;
    END IF;

    -- PostgreSQL NOTIFY 발송 (추가 실시간 보장)
    PERFORM pg_notify('facility_task_created',
      jsonb_build_object(
        'task_id', NEW.id,
        'title', NEW.title,
        'business_name', NEW.business_name,
        'created_by', NEW.created_by_name
      )::text
    );

    RETURN NEW;
  END IF;

  -- UPDATE 이벤트 (업무 수정)
  IF TG_OP = 'UPDATE' THEN
    -- 상태 변경 감지
    IF OLD.status != NEW.status THEN
      -- 전역 알림 생성
      INSERT INTO notifications (
        title, message, category, priority,
        related_resource_type, related_resource_id, related_url,
        metadata, created_by_id, created_by_name, is_system_notification
      ) VALUES (
        '시설 업무 상태 변경',
        format('"%s" 업무 상태가 %s에서 %s로 변경되었습니다. (%s)',
          NEW.title, old_status_label, new_status_label, NEW.business_name),
        'task_status_changed',
        CASE NEW.priority
          WHEN 'high' THEN 'high'::notification_priority
          ELSE 'medium'::notification_priority
        END,
        'facility_task', NEW.id::text,
        format('/admin/tasks?task=%s', NEW.id),
        jsonb_build_object(
          'old_status', OLD.status,
          'new_status', NEW.status,
          'task_type', NEW.task_type,
          'business_name', NEW.business_name,
          'modified_by', NEW.last_modified_by_name
        ),
        NEW.last_modified_by, NEW.last_modified_by_name, false
      );

      -- 담당자들에게 상태 변경 알림
      IF assignee_ids IS NOT NULL THEN
        FOREACH assignee_id IN ARRAY assignee_ids
        LOOP
          INSERT INTO task_notifications (
            user_id, task_id, business_name, message,
            notification_type, priority, metadata
          ) VALUES (
            assignee_id, NEW.id::text, NEW.business_name,
            format('"%s" 업무 상태가 %s에서 %s로 변경되었습니다. (%s)',
              NEW.title, old_status_label, new_status_label, NEW.business_name),
            'status_change',
            CASE NEW.priority WHEN 'high' THEN 'high' ELSE 'normal' END,
            jsonb_build_object(
              'old_status', OLD.status,
              'new_status', NEW.status,
              'modified_by', NEW.last_modified_by_name,
              'task_id', NEW.id
            )
          );
        END LOOP;
      END IF;

      -- PostgreSQL NOTIFY 발송
      PERFORM pg_notify('facility_task_updated',
        jsonb_build_object(
          'task_id', NEW.id,
          'title', NEW.title,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'business_name', NEW.business_name,
          'modified_by', NEW.last_modified_by_name
        )::text
      );
    END IF;

    -- 담당자 변경 감지
    IF COALESCE(OLD.assignees::text, '') != COALESCE(NEW.assignees::text, '') THEN
      -- 전역 알림 생성
      INSERT INTO notifications (
        title, message, category, priority,
        related_resource_type, related_resource_id, related_url,
        metadata, created_by_id, created_by_name, is_system_notification
      ) VALUES (
        '시설 업무 담당자 변경',
        format('"%s" 업무의 담당자가 변경되었습니다. (%s)',
          NEW.title, NEW.business_name),
        'task_assigned',
        'medium'::notification_priority,
        'facility_task', NEW.id::text,
        format('/admin/tasks?task=%s', NEW.id),
        jsonb_build_object(
          'task_type', NEW.task_type,
          'business_name', NEW.business_name,
          'old_assignees', OLD.assignees,
          'new_assignees', NEW.assignees,
          'modified_by', NEW.last_modified_by_name
        ),
        NEW.last_modified_by, NEW.last_modified_by_name, false
      );

      -- 새 담당자들에게 배정 알림
      IF assignee_ids IS NOT NULL THEN
        FOREACH assignee_id IN ARRAY assignee_ids
        LOOP
          INSERT INTO task_notifications (
            user_id, task_id, business_name, message,
            notification_type, priority, metadata
          ) VALUES (
            assignee_id, NEW.id::text, NEW.business_name,
            format('"%s" 업무가 담당자로 새로 배정되었습니다. (%s)',
              NEW.title, NEW.business_name),
            'assignment',
            CASE NEW.priority WHEN 'high' THEN 'high' ELSE 'normal' END,
            jsonb_build_object(
              'assigned_by', NEW.last_modified_by_name,
              'task_type', NEW.task_type,
              'task_id', NEW.id
            )
          );
        END LOOP;
      END IF;

      -- PostgreSQL NOTIFY 발송
      PERFORM pg_notify('facility_task_assignee_changed',
        jsonb_build_object(
          'task_id', NEW.id,
          'title', NEW.title,
          'business_name', NEW.business_name,
          'new_assignees', NEW.assignees,
          'modified_by', NEW.last_modified_by_name
        )::text
      );
    END IF;

    RETURN NEW;
  END IF;

  -- DELETE 이벤트 (업무 삭제/비활성화)
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_deleted = true) THEN
    -- 전역 알림 생성
    INSERT INTO notifications (
      title, message, category, priority,
      related_resource_type, related_resource_id,
      metadata, created_by_id, created_by_name, is_system_notification
    ) VALUES (
      '시설 업무 삭제',
      format('"%s" 업무가 삭제되었습니다. (%s)',
        COALESCE(OLD.title, NEW.title), COALESCE(OLD.business_name, NEW.business_name)),
      'task_completed',
      'low'::notification_priority,
      'facility_task', COALESCE(OLD.id, NEW.id)::text,
      jsonb_build_object(
        'task_type', COALESCE(OLD.task_type, NEW.task_type),
        'business_name', COALESCE(OLD.business_name, NEW.business_name),
        'deleted_by', COALESCE(NEW.last_modified_by_name, 'System')
      ),
      COALESCE(NEW.last_modified_by, OLD.created_by),
      COALESCE(NEW.last_modified_by_name, 'System'), false
    );

    -- PostgreSQL NOTIFY 발송
    PERFORM pg_notify('facility_task_deleted',
      jsonb_build_object(
        'task_id', COALESCE(OLD.id, NEW.id),
        'title', COALESCE(OLD.title, NEW.title),
        'business_name', COALESCE(OLD.business_name, NEW.business_name),
        'deleted_by', COALESCE(NEW.last_modified_by_name, 'System')
      )::text
    );

    RETURN COALESCE(OLD, NEW);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. 트리거 생성 및 연결
-- ============================================================================

-- 기존 트리거 삭제 (있는 경우)
DROP TRIGGER IF EXISTS facility_task_changes_trigger ON facility_tasks;

-- 새 트리거 생성
CREATE TRIGGER facility_task_changes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON facility_tasks
  FOR EACH ROW EXECUTE FUNCTION notify_facility_task_changes();

-- ============================================================================
-- 4. 알림 정리 함수 (최적화)
-- ============================================================================

-- 만료된 알림 자동 정리 함수 (개선된 버전)
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS TABLE(deleted_notifications INTEGER, deleted_task_notifications INTEGER) AS $$
DECLARE
  notif_count INTEGER;
  task_notif_count INTEGER;
BEGIN
  -- 만료된 전역 알림 삭제
  DELETE FROM notifications WHERE expires_at < NOW();
  GET DIAGNOSTICS notif_count = ROW_COUNT;

  -- 만료된 업무 알림 삭제
  DELETE FROM task_notifications WHERE expires_at < NOW();
  GET DIAGNOSTICS task_notif_count = ROW_COUNT;

  -- 정리 완료 알림 생성 (많이 삭제된 경우만)
  IF notif_count + task_notif_count > 100 THEN
    INSERT INTO notifications (
      title, message, category, priority,
      is_system_notification, created_by_name
    ) VALUES (
      '알림 정리 완료',
      format('만료된 알림 %s개가 자동으로 정리되었습니다. (전역: %s개, 업무: %s개)',
        notif_count + task_notif_count, notif_count, task_notif_count),
      'system_maintenance',
      'low',
      true,
      'System'
    );
  END IF;

  RETURN QUERY SELECT notif_count, task_notif_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. RLS (Row Level Security) 정책 업데이트
-- ============================================================================

-- notifications 테이블 RLS 활성화
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 알림을 볼 수 있도록 정책 설정
DROP POLICY IF EXISTS "Enable read access for all users" ON notifications;
CREATE POLICY "Enable read access for all users" ON notifications
  FOR SELECT USING (true);

-- task_notifications 테이블 RLS 활성화
ALTER TABLE task_notifications ENABLE ROW LEVEL SECURITY;

-- 사용자 본인의 알림만 조회 가능
DROP POLICY IF EXISTS "Users can view own notifications" ON task_notifications;
CREATE POLICY "Users can view own notifications" ON task_notifications
  FOR SELECT USING (true); -- 임시로 모든 사용자 접근 허용

-- facility_tasks 테이블 RLS 확인
ALTER TABLE facility_tasks ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 시설 업무를 볼 수 있도록 (기존 정책 유지)
DROP POLICY IF EXISTS "Enable read access for all users" ON facility_tasks;
CREATE POLICY "Enable read access for all users" ON facility_tasks
  FOR SELECT USING (true);

-- ============================================================================
-- 6. 인덱스 최적화 (성능 개선)
-- ============================================================================

-- 알림 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_notifications_created_at_desc ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON notifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_category_priority ON notifications(category, priority);

-- 업무 알림 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_task_notifications_user_created ON task_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_notifications_task_user ON task_notifications(task_id, user_id);
CREATE INDEX IF NOT EXISTS idx_task_notifications_read_status ON task_notifications(is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_task_notifications_expires_at ON task_notifications(expires_at);

-- 시설 업무 테이블 인덱스 (기존 확인)
CREATE INDEX IF NOT EXISTS idx_facility_tasks_updated_at_desc ON facility_tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_facility_tasks_assignees_gin ON facility_tasks USING gin(assignees);

-- ============================================================================
-- 7. 설정 완료 알림
-- ============================================================================

-- 하드코딩된 시스템 알림 비활성화 (반복 생성 방지)
/*
INSERT INTO notifications (
  title, message, category, priority,
  is_system_notification, created_by_name, metadata
) VALUES (
  'Supabase Realtime 시스템 활성화',
  'WebSocket에서 Supabase Realtime으로 전환이 완료되었습니다. 실시간 알림과 폴링 폴백이 활성화되었습니다.',
  'system_update',
  'medium',
  true,
  'System',
  jsonb_build_object(
    'migration_completed', true,
    'realtime_enabled', true,
    'polling_fallback', true,
    'trigger_functions', true
  )
);
*/

-- 설정 요약 출력
SELECT 'Supabase Realtime 설정 완료' as status,
       'notifications, task_notifications, facility_tasks 테이블에 Realtime 활성화' as realtime_tables,
       'facility_task_changes_trigger 트리거 생성 완료' as triggers,
       'RLS 정책 및 인덱스 최적화 완료' as optimization;