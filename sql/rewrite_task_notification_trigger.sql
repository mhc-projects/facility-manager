-- 업무 담당자 알림(task_notifications)을 facility_tasks 트리거가 만들도록 트리거 함수를 다시 쓴다 (2026-10-05 운영 적용)
--
-- 왜 다시 썼나 — 예전 본문은 search_path 만 고쳐서는 살릴 수 없었다.
--   1) notifications INSERT 가 없는 컬럼(created_by_id, is_system_notification)을 쓰고 NOT NULL 인 notification_tier 를 빼먹어
--      한 번도 성공한 적이 없다(EXCEPTION 이 삼켜서 드러나지 않았다).
--   2) 단계 이름을 옛 상태값(customer_contact …)으로 CASE 매핑했다. 지금 단계는 task_stages 표가 기준이다.
--   3) UPDATE 는 상태 변경만 다뤘다. 담당자 추가·제외는 다루지 않았다.
--
-- 지금 본문이 하는 일 — 2026-09-04부터 앱(app/api/facility-tasks/route.ts 의 createTaskNotifications)이 직접 넣던 것과 같다.
--   INSERT            : 담당자마다 '배정' 알림
--   UPDATE 상태 변경  : 현재 담당자마다 '상태 변경' 알림 (단계 이름은 그 사업장 진행구분의 task_stages.stage_label, 수정자 이름 포함)
--                       앱은 고정 이름표(lib/task-status-utils.ts 의 TASK_STATUS_KR)를 써서 활성 업무 678건 중 211건의 단계가
--                       칸반과 다른 이름이거나 custom_… 키 그대로 나갔다. 여기서는 칸반과 같은 이름이 나간다.
--   UPDATE 담당자 변경: 새로 들어온 담당자에게 '배정' 알림, 빠진 담당자의 이 업무 알림은 만료(expires_at = now())
--
-- 하지 않는 일
--   - 전체 알림(notifications 표)은 만들지 않는다. 예전 코드도 만든 적이 없고, 만들려면 대상(tier)을 정해야 한다
--     (company 로 넣으면 상태 변경마다 전 직원에게 간다).
--   - DELETE 는 알리지 않는다.
--
-- 건너뛰기 — 한꺼번에 많은 업무를 쓰는 작업은 같은 트랜잭션에서 SET LOCAL app.skip_task_notify = 'true' 를 먼저 실행한다
--   (스냅샷 복원 app/api/admin/restore-snapshot, 일괄 등록 app/api/admin/tasks/bulk-upload).
--
-- 실패했을 때 — 알림 때문에 업무 저장이 막히면 안 되므로 오류는 삼키되, 조용히 묻히지 않게 error_logs 에 남긴다
--   (tag = 'task-notify-trigger'. 운영 에러 일일 보고가 이 표를 읽는다).
--
-- 끄는 방법 — ALTER TABLE public.facility_tasks DISABLE TRIGGER facility_task_changes_trigger;
--   (끄면 알림이 전혀 안 생긴다. 앱의 직접 INSERT 를 되살리는 커밋 되돌리기와 같이 해야 한다)

CREATE OR REPLACE FUNCTION public.notify_facility_task_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_new_ids text[] := ARRAY[]::text[];
  v_old_ids text[] := ARRAY[]::text[];
  v_priority text;
  v_category_id bigint;
  v_old_label text;
  v_new_label text;
  v_suffix text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- 스냅샷 복원·일괄 등록처럼 알림을 내면 안 되는 작업
  IF current_setting('app.skip_task_notify', true) = 'true' THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF jsonb_typeof(NEW.assignees) = 'array' THEN
      SELECT COALESCE(array_agg(DISTINCT e->>'id'), ARRAY[]::text[]) INTO v_new_ids
      FROM jsonb_array_elements(NEW.assignees) e
      WHERE COALESCE(e->>'id', '') <> '';
    END IF;

    v_priority := CASE NEW.priority WHEN 'urgent' THEN 'urgent' WHEN 'high' THEN 'high' ELSE 'normal' END;

    IF TG_OP = 'INSERT' THEN
      INSERT INTO task_notifications (user_id, task_id, business_name, message, notification_type, priority)
      SELECT uid, NEW.id::text, NEW.business_name,
             format('%s의 새 업무 "%s"이 담당자로 배정되었습니다.', NEW.business_name, NEW.title),
             'assignment', v_priority
      FROM unnest(v_new_ids) AS uid;
      RETURN NEW;
    END IF;

    -- 여기부터 UPDATE
    IF jsonb_typeof(OLD.assignees) = 'array' THEN
      SELECT COALESCE(array_agg(DISTINCT e->>'id'), ARRAY[]::text[]) INTO v_old_ids
      FROM jsonb_array_elements(OLD.assignees) e
      WHERE COALESCE(e->>'id', '') <> '';
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status AND cardinality(v_new_ids) > 0 THEN
      -- 같은 stage_key 가 진행구분마다 다른 이름을 가질 수 있어 그 사업장의 진행구분에서 먼저 찾는다
      SELECT pc.id INTO v_category_id
      FROM business_info b
      JOIN progress_categories pc ON pc.name = b.progress_status
      WHERE b.id = NEW.business_id
      LIMIT 1;

      v_old_label := COALESCE(
        (SELECT s.stage_label FROM task_stages s WHERE s.stage_key = OLD.status AND s.progress_category_id = v_category_id LIMIT 1),
        (SELECT s.stage_label FROM task_stages s WHERE s.stage_key = OLD.status ORDER BY s.is_active DESC, s.sort_order, s.id LIMIT 1),
        OLD.status);
      v_new_label := COALESCE(
        (SELECT s.stage_label FROM task_stages s WHERE s.stage_key = NEW.status AND s.progress_category_id = v_category_id LIMIT 1),
        (SELECT s.stage_label FROM task_stages s WHERE s.stage_key = NEW.status ORDER BY s.is_active DESC, s.sort_order, s.id LIMIT 1),
        NEW.status);

      -- 칸반 단계 이름 앞의 진행구분 머리표([자비] 등)는 알림 문구에서 뗀다(한 사업장 얘기라 군더더기)
      v_old_label := regexp_replace(v_old_label, '^\[[^\]]*\]\s*', '');
      v_new_label := regexp_replace(v_new_label, '^\[[^\]]*\]\s*', '');

      v_suffix := CASE
        WHEN COALESCE(NEW.last_modified_by_name, '') <> '' THEN format('(%s님이 수정)', NEW.last_modified_by_name)
        ELSE format('(%s)', NEW.business_name)
      END;

      INSERT INTO task_notifications (user_id, task_id, business_name, message, notification_type, priority)
      SELECT uid, NEW.id::text, NEW.business_name,
             format('"%s" 업무 상태가 %s에서 %s로 변경되었습니다. %s', NEW.business_name, v_old_label, v_new_label, v_suffix),
             'status_change', v_priority
      FROM unnest(v_new_ids) AS uid;
    END IF;

    IF NOT (v_new_ids <@ v_old_ids AND v_old_ids <@ v_new_ids) THEN
      -- 새로 들어온 담당자
      INSERT INTO task_notifications (user_id, task_id, business_name, message, notification_type, priority)
      SELECT uid, NEW.id::text, NEW.business_name,
             format('%s의 새 업무 "%s"이 담당자로 배정되었습니다.', NEW.business_name, NEW.title),
             'assignment', v_priority
      FROM unnest(v_new_ids) AS uid
      WHERE uid <> ALL (v_old_ids);

      -- 빠진 담당자의 이 업무 알림은 만료한다(알림 조회가 expires_at 을 거른다)
      UPDATE task_notifications
      SET expires_at = now(), updated_at = now()
      WHERE task_id = NEW.id::text
        AND user_id = ANY (v_old_ids)
        AND user_id <> ALL (v_new_ids)
        AND (expires_at IS NULL OR expires_at > now());
    END IF;

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO error_logs (tag, message)
      VALUES ('task-notify-trigger', format('업무 알림 트리거 실패 (%s, task %s): %s', TG_OP, NEW.id, SQLERRM));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_facility_task_changes failed for task %: %', NEW.id, SQLERRM;
    END;
  END;

  RETURN NEW;
END;
$function$;

-- 주의: 이 함수의 search_path 를 다시 비우지 말 것. 끄려면 위의 DISABLE TRIGGER 를 쓴다.
