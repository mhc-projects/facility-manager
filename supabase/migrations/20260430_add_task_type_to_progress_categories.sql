-- UP: progress_categories 테이블에 task_type 컬럼 추가
-- task_type: facility_tasks.task_type 과 1:1 대응하는 업무 분류 코드
-- 이전에는 카테고리 이름 문자열로 task_type 을 추론(하드코딩)했으나,
-- 이 컬럼을 통해 DB에서 직접 관리하도록 개선

ALTER TABLE progress_categories
  ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) NOT NULL DEFAULT 'etc';

-- 기존 데이터 backfill: 이름 기반 추론과 동일한 규칙 적용
UPDATE progress_categories SET task_type =
  CASE
    WHEN name LIKE '%보조금%' THEN 'subsidy'
    WHEN name LIKE '%자비%'   THEN 'self'
    WHEN name = 'AS'          THEN 'as'
    WHEN name LIKE '%외주%'   THEN 'outsourcing'
    WHEN name LIKE '%대리점%' THEN 'dealer'
    ELSE 'etc'
  END;

-- 유효값 제약 (facility_tasks.task_type 의 허용값과 동일)
ALTER TABLE progress_categories
  ADD CONSTRAINT progress_categories_task_type_check
  CHECK (task_type IN ('self', 'subsidy', 'as', 'dealer', 'outsourcing', 'etc'));

-- 롤백 방법 (필요 시 아래 스크립트를 실행):
-- 롤백 파일: supabase/migrations/rollback/20260430_add_task_type_rollback.sql
