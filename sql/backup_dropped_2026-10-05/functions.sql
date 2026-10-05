CREATE OR REPLACE FUNCTION public.advance_task_to_next_step(task_id uuid, completion_notes text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, message text, new_status character varying)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
  DECLARE
    current_status VARCHAR(50);
    next_status VARCHAR(50);
    task_type VARCHAR(20);
  BEGIN
    SELECT t.status, t.task_type INTO current_status, task_type
    FROM facility_tasks t
    WHERE t.id = task_id AND t.is_active = true AND t.is_deleted = false;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, '업무를 찾을 수 없습니다.', NULL::VARCHAR(50);
      RETURN;
    END IF;

    next_status := CASE
      WHEN task_type = 'self' THEN
        CASE current_status
          WHEN 'customer_contact' THEN 'site_inspection'
          WHEN 'site_inspection' THEN 'quotation'
          WHEN 'quotation' THEN 'contract'
          WHEN 'contract' THEN 'deposit_confirm'
          WHEN 'deposit_confirm' THEN 'product_order'
          WHEN 'product_order' THEN 'product_shipment'
          WHEN 'product_shipment' THEN 'installation_schedule'
          WHEN 'installation_schedule' THEN 'installation'
          WHEN 'installation' THEN 'balance_payment'
          WHEN 'balance_payment' THEN 'document_complete'
          ELSE NULL
        END
      WHEN task_type = 'subsidy' THEN
        CASE current_status
          WHEN 'customer_contact' THEN 'site_inspection'
          WHEN 'site_inspection' THEN 'quotation'
          WHEN 'quotation' THEN 'application_submit'
          WHEN 'application_submit' THEN 'approval_pending'
          WHEN 'approval_pending' THEN 'approved'
          WHEN 'approved' THEN 'document_supplement'
          WHEN 'rejected' THEN NULL
          WHEN 'document_supplement' THEN 'pre_construction_inspection'
          WHEN 'pre_construction_inspection' THEN 'pre_construction_supplement_1st'
          WHEN 'pre_construction_supplement_1st' THEN 'pre_construction_supplement_2nd'
          WHEN 'pre_construction_supplement_2nd' THEN 'product_order'
          WHEN 'product_order' THEN 'product_shipment'
          WHEN 'product_shipment' THEN 'installation_schedule'
          WHEN 'installation_schedule' THEN 'installation'
          WHEN 'installation' THEN 'completion_inspection'
          WHEN 'completion_inspection' THEN 'completion_supplement_1st'
          WHEN 'completion_supplement_1st' THEN 'completion_supplement_2nd'
          WHEN 'completion_supplement_2nd' THEN 'completion_supplement_3rd'
          WHEN 'completion_supplement_3rd' THEN 'final_document_submit'
          WHEN 'final_document_submit' THEN 'subsidy_payment'
          ELSE NULL
        END
    END;

    IF next_status IS NULL THEN
      RETURN QUERY SELECT false, '다음 단계가 없거나 이미 완료된 업무입니다.', current_status;
      RETURN;
    END IF;

    UPDATE facility_tasks
    SET
      status = next_status,
      supplement_completed_at = CASE
        WHEN current_status LIKE '%supplement%' THEN now()
        ELSE supplement_completed_at
      END,
      step_started_at = now(),
      notes = COALESCE(notes || E'\n\n', '') ||
              '【' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '】 ' ||
              current_status || ' → ' || next_status ||
              COALESCE(E'\n메모: ' || completion_notes, ''),
      updated_at = now()
    WHERE id = task_id;

    RETURN QUERY SELECT true, '다음 단계로 이동되었습니다.', next_status;
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.cleanup_delay_scheduler_logs()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM delay_scheduler_logs
  WHERE execution_started_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_delay_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- 만료된 알림 삭제
  DELETE FROM delay_notifications
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    user_deleted_count INTEGER;
    task_deleted_count INTEGER;
    total_deleted INTEGER;
BEGIN
    -- 만료된 사용자 알림 삭제
    DELETE FROM user_notifications
    WHERE expires_at < NOW();

    GET DIAGNOSTICS user_deleted_count = ROW_COUNT;

    -- 만료된 업무 알림 삭제 (expires_at이 NULL이 아닌 경우만)
    DELETE FROM task_notifications
    WHERE expires_at IS NOT NULL AND expires_at < NOW();

    GET DIAGNOSTICS task_deleted_count = ROW_COUNT;

    total_deleted := user_deleted_count + task_deleted_count;

    RAISE NOTICE '만료된 알림 정리 완료: 사용자 알림 %개, 업무 알림 %개, 총 %개',
                 user_deleted_count, task_deleted_count, total_deleted;

    RETURN total_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_delay_notification_as_read(notification_id bigint, user_id uuid, user_name character varying)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- 읽음 기록 추가
  INSERT INTO delay_notification_reads (notification_id, user_id, user_name)
  VALUES (notification_id, user_id, user_name)
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  -- 알림 상태 업데이트
  UPDATE delay_notifications
  SET is_read = TRUE,
      read_at = NOW()
  WHERE id = notification_id
    AND assignee_id = user_id
    AND is_read = FALSE;

  RETURN TRUE;
END;
$function$
;

