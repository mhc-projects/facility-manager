-- Phase 1: 다중 담당자 업무 할당 알림 시스템 구현 (UUID 타입 호환 버전)
-- user_id와 task_id가 UUID 타입인 경우와 VARCHAR 타입인 경우 모두 지원

-- 1. facility_tasks 테이블에 assignees 컬럼 추가
ALTER TABLE facility_tasks
ADD COLUMN IF NOT EXISTS assignees JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS assignee_count INTEGER DEFAULT 0;

-- 2. assignee_count 자동 계산 함수
CREATE OR REPLACE FUNCTION calculate_assignee_count()
RETURNS TRIGGER AS $$
BEGIN
    -- assignees JSONB 배열의 길이 계산
    NEW.assignee_count = COALESCE(jsonb_array_length(NEW.assignees), 0);

    -- 기존 assignee 필드가 있고 assignees가 비어있다면 호환성 유지
    IF NEW.assignee_count = 0 AND NEW.assignee IS NOT NULL AND NEW.assignee != '' THEN
        NEW.assignee_count = 1;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. assignee_count 자동 업데이트 트리거
DROP TRIGGER IF EXISTS trigger_calculate_assignee_count ON facility_tasks;
CREATE TRIGGER trigger_calculate_assignee_count
    BEFORE INSERT OR UPDATE ON facility_tasks
    FOR EACH ROW
    EXECUTE FUNCTION calculate_assignee_count();

-- 4. 업무 할당 알림 생성 함수 (UUID/VARCHAR 모두 지원)
CREATE OR REPLACE FUNCTION create_task_assignment_notifications(
    p_task_id UUID,
    p_assignees JSONB,
    p_business_name TEXT,
    p_task_title TEXT,
    p_task_type TEXT,
    p_task_priority TEXT,
    p_assigned_by TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    assignee JSONB;
    assignee_id TEXT;
    assignee_name TEXT;
    notification_count INTEGER := 0;
    expires_date TIMESTAMPTZ;
BEGIN
    -- 만료일 설정 (30일 후)
    expires_date := NOW() + INTERVAL '30 days';

    -- assignees 배열을 순회하며 각 담당자에게 알림 생성
    FOR assignee IN SELECT jsonb_array_elements(p_assignees)
    LOOP
        assignee_id := assignee->>'id';
        assignee_name := assignee->>'name';

        -- 담당자별 알림 생성 (user_id를 TEXT로 변환하여 저장)
        INSERT INTO task_notifications (
            user_id,
            user_name,
            task_id,
            business_name,
            message,
            notification_type,
            priority,
            metadata,
            is_read,
            created_at,
            expires_at
        ) VALUES (
            assignee_id,  -- TEXT로 저장
            assignee_name,
            p_task_id::TEXT,  -- UUID를 TEXT로 변환
            p_business_name,
            FORMAT('"%s" 업무가 담당자로 배정되었습니다. (%s)', p_task_title, p_business_name),
            'assignment',
            CASE
                WHEN p_task_priority = 'high' THEN 'high'
                WHEN p_task_priority = 'low' THEN 'low'
                ELSE 'normal'
            END,
            jsonb_build_object(
                'task_id', p_task_id::TEXT,
                'task_type', p_task_type,
                'assigned_by', COALESCE(p_assigned_by, 'system'),
                'assignment_date', NOW()
            ),
            false,
            NOW(),
            expires_date
        );

        notification_count := notification_count + 1;
    END LOOP;

    RETURN notification_count;
END;
$$ LANGUAGE plpgsql;

-- 5. 업무 할당 변경 시 알림 업데이트 함수 (UUID/VARCHAR 모두 지원)
CREATE OR REPLACE FUNCTION update_task_assignment_notifications(
    p_task_id UUID,
    p_old_assignees JSONB,
    p_new_assignees JSONB,
    p_business_name TEXT,
    p_task_title TEXT,
    p_task_type TEXT,
    p_task_priority TEXT,
    p_assigned_by TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    old_assignee JSONB;
    new_assignee JSONB;
    old_assignee_ids TEXT[];
    new_assignee_ids TEXT[];
    removed_count INTEGER := 0;
    added_count INTEGER := 0;
    updated_count INTEGER := 0;
    current_timestamp_var TIMESTAMPTZ;
    expires_date TIMESTAMPTZ;
    task_id_text TEXT;
BEGIN
    current_timestamp_var := NOW();
    expires_date := current_timestamp_var + INTERVAL '30 days';
    task_id_text := p_task_id::TEXT;  -- UUID를 TEXT로 변환

    -- 기존 담당자 ID 추출
    SELECT array_agg(value->>'id') INTO old_assignee_ids
    FROM jsonb_array_elements(p_old_assignees);

    -- 새 담당자 ID 추출
    SELECT array_agg(value->>'id') INTO new_assignee_ids
    FROM jsonb_array_elements(p_new_assignees);

    -- 제거된 담당자들의 알림 만료 처리 (삭제하지 않고 만료)
    -- ✅ FIX: user_id와 task_id를 TEXT로 비교
    UPDATE task_notifications
    SET
        expires_at = current_timestamp_var,
        message = message || ' (담당자 변경됨)',
        metadata = metadata || jsonb_build_object('reassigned_at', current_timestamp_var)
    WHERE task_id = task_id_text  -- TEXT 비교
    AND user_id = ANY(COALESCE(old_assignee_ids, ARRAY[]::TEXT[]))
    AND user_id != ALL(COALESCE(new_assignee_ids, ARRAY[]::TEXT[]))
    AND expires_at > current_timestamp_var;

    GET DIAGNOSTICS removed_count = ROW_COUNT;

    -- 기존 담당자이면서 계속 담당하는 사람들의 알림 업데이트
    UPDATE task_notifications
    SET
        message = FORMAT('"%s" 업무가 담당자로 재배정되었습니다. (%s)', p_task_title, p_business_name),
        metadata = metadata || jsonb_build_object(
            'reassigned_at', current_timestamp_var,
            'reassigned_by', COALESCE(p_assigned_by, 'system')
        ),
        updated_at = current_timestamp_var
    WHERE task_id = task_id_text  -- TEXT 비교
    AND user_id = ANY(COALESCE(new_assignee_ids, ARRAY[]::TEXT[]))
    AND user_id = ANY(COALESCE(old_assignee_ids, ARRAY[]::TEXT[]))
    AND expires_at > current_timestamp_var;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- 새로 추가된 담당자들에게 알림 생성
    FOR new_assignee IN SELECT jsonb_array_elements(p_new_assignees)
    LOOP
        IF NOT (COALESCE(old_assignee_ids, ARRAY[]::TEXT[]) @> ARRAY[new_assignee->>'id']) THEN
            INSERT INTO task_notifications (
                user_id,
                user_name,
                task_id,
                business_name,
                message,
                notification_type,
                priority,
                metadata,
                is_read,
                created_at,
                expires_at
            ) VALUES (
                new_assignee->>'id',  -- TEXT로 저장
                new_assignee->>'name',
                task_id_text,  -- TEXT로 저장
                p_business_name,
                FORMAT('"%s" 업무가 새 담당자로 배정되었습니다. (%s)', p_task_title, p_business_name),
                'assignment',
                CASE
                    WHEN p_task_priority = 'high' THEN 'high'
                    WHEN p_task_priority = 'low' THEN 'low'
                    ELSE 'normal'
                END,
                jsonb_build_object(
                    'task_id', task_id_text,
                    'task_type', p_task_type,
                    'assigned_by', COALESCE(p_assigned_by, 'system'),
                    'assignment_date', current_timestamp_var,
                    'new_assignee', true
                ),
                false,
                current_timestamp_var,
                expires_date
            );

            added_count := added_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'removed_notifications', removed_count,
        'updated_notifications', updated_count,
        'added_notifications', added_count,
        'total_changes', removed_count + updated_count + added_count
    );
END;
$$ LANGUAGE plpgsql;

-- 6. metadata 컬럼이 없는 경우 추가
ALTER TABLE task_notifications
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 7. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_task_notifications_user_task ON task_notifications(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_task_notifications_user_unread ON task_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_notifications_expires ON task_notifications(expires_at) WHERE expires_at IS NOT NULL;

-- 완료 메시지
DO $$
BEGIN
    RAISE NOTICE '✅ 다중 담당자 알림 시스템이 성공적으로 설정되었습니다.';
    RAISE NOTICE '   - assignees 컬럼 추가 완료';
    RAISE NOTICE '   - create_task_assignment_notifications() 함수 생성 완료';
    RAISE NOTICE '   - update_task_assignment_notifications() 함수 생성 완료';
    RAISE NOTICE '   - 인덱스 최적화 완료';
END $$;
