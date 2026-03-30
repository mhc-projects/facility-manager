-- Migration: task_type을 business_info.progress_status에서 파생하도록 변경
-- 목적: 사업장 진행구분과 업무타입의 단일 진실 공급원(Single Source of Truth) 확립
-- 방법B: facility_tasks_with_business View에서 task_type을 progress_status JOIN으로 실시간 파생

-- ============================================================
-- Step 1: facility_tasks_with_business View 재정의
--         task_type을 business_info.progress_status에서 파생
-- CREATE OR REPLACE는 컬럼 타입 변경 불가 → DROP 후 재생성
-- ============================================================

DROP VIEW IF EXISTS facility_tasks_with_business;

CREATE VIEW facility_tasks_with_business AS
SELECT
  t.id,
  t.created_at,
  t.updated_at,
  t.title,
  t.description,
  t.business_name,
  t.business_id,
  -- task_type: business_info.progress_status에서 실시간 파생
  -- facility_tasks.task_type 컬럼은 더 이상 사용하지 않음
  CASE
    WHEN b.progress_status ILIKE '%보조금%'  THEN 'subsidy'    -- 보조금, 보조금 동시진행, 보조금 추가승인
    WHEN b.progress_status ILIKE '%자비%'    THEN 'self'
    WHEN b.progress_status = 'AS'            THEN 'as'
    WHEN b.progress_status ILIKE '%외주%'    THEN 'outsourcing' -- 외주설치
    WHEN b.progress_status ILIKE '%대리점%'  THEN 'dealer'
    WHEN b.progress_status IN ('진행불가', '확인필요') THEN 'etc'
    ELSE 'etc'
  END::varchar(20) AS task_type,
  -- 원본 progress_status도 노출 (참고용)
  b.progress_status,
  t.status,
  t.priority,
  t.assignee,
  t.assignees,
  t.primary_assignee_id,
  t.assignee_updated_at,
  t.start_date,
  t.due_date,
  t.completed_at,
  t.notes,
  t.created_by,
  t.created_by_name,
  t.last_modified_by,
  t.last_modified_by_name,
  t.is_active,
  t.is_deleted,
  -- business_info에서 JOIN
  b.address,
  b.manager_name,
  b.manager_contact,
  b.local_government,
  b.construction_report_submitted_at AS construction_report_date,
  -- 생성자/수정자 정보
  creator.name  AS created_by_user_name,
  creator.email AS created_by_user_email,
  creator.permission_level AS created_by_permission_level,
  modifier.name  AS last_modified_by_user_name,
  modifier.email AS last_modified_by_user_email,
  modifier.permission_level AS last_modified_by_permission_level
FROM facility_tasks t
LEFT JOIN business_info b
  ON t.business_id = b.id
  -- business_id가 없는 레거시 레코드는 business_name으로 fallback
  OR (t.business_id IS NULL AND t.business_name = b.business_name)
LEFT JOIN employees creator  ON t.created_by      = creator.id
LEFT JOIN employees modifier ON t.last_modified_by = modifier.id
WHERE t.is_active = true AND t.is_deleted = false;

-- ============================================================
-- Step 2: task_type 필터 지원을 위한 인덱스 (progress_status 기반)
-- ============================================================

-- business_info.progress_status 인덱스 (없는 경우 생성)
CREATE INDEX IF NOT EXISTS idx_business_info_progress_status
  ON business_info (progress_status)
  WHERE is_active = true AND is_deleted = false;

-- ============================================================
-- Step 3: facility_tasks.task_type 컬럼 NOT NULL 제약 제거
--         View에서 파생하므로 INSERT 시 값 불필요
-- ============================================================

-- NOT NULL + CHECK 제약 제거, DEFAULT 유지 (레거시 호환성)
ALTER TABLE facility_tasks
  ALTER COLUMN task_type DROP NOT NULL,
  ALTER COLUMN task_type SET DEFAULT 'etc';

-- CHECK 제약 조건 이름 확인 후 DROP (이름이 다를 수 있음)
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'facility_tasks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%task_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE facility_tasks DROP CONSTRAINT ' || quote_ident(constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  END IF;
END $$;

COMMENT ON COLUMN facility_tasks.task_type IS
  '[DEPRECATED] business_info.progress_status에서 파생됨. 이 컬럼에 직접 쓰지 말 것. facility_tasks_with_business View의 task_type을 사용할 것.';

COMMENT ON VIEW facility_tasks_with_business IS
  'task_type은 business_info.progress_status에서 실시간 파생됨. 사업장 진행구분 변경 시 업무타입 자동 반영.';
