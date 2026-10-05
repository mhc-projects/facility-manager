CREATE OR REPLACE FUNCTION public.create_task_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    -- INSERT 시
    IF TG_OP = 'INSERT' THEN
        INSERT INTO task_history (task_id, action, new_value, changed_by, details)
        VALUES (
            NEW.id,
            'created',
            '업무가 생성되었습니다',
            NEW.created_by,
            json_build_object(
                'title', NEW.title,
                'assigned_to', NEW.assigned_to,
                'priority', NEW.priority,
                'due_date', NEW.due_date
            )
        );
        RETURN NEW;
    END IF;

    -- UPDATE 시 상태 변경 추적
    IF TG_OP = 'UPDATE' THEN
        -- 상태 변경
        IF OLD.status_id != NEW.status_id THEN
            INSERT INTO task_history (task_id, action, field_name, old_value, new_value, changed_by)
            VALUES (
                NEW.id,
                'status_changed',
                'status_id',
                (SELECT name FROM task_statuses WHERE id = OLD.status_id),
                (SELECT name FROM task_statuses WHERE id = NEW.status_id),
                NEW.updated_by
            );
        END IF;

        -- 담당자 변경
        IF OLD.assigned_to != NEW.assigned_to THEN
            INSERT INTO task_history (task_id, action, field_name, old_value, new_value, changed_by)
            VALUES (
                NEW.id,
                'assigned',
                'assigned_to',
                (SELECT name FROM employees WHERE id = OLD.assigned_to),
                (SELECT name FROM employees WHERE id = NEW.assigned_to),
                NEW.updated_by
            );
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_task_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

