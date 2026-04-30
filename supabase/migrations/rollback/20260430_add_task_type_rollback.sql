-- ROLLBACK: task_type 컬럼 제거
-- 실행 전 확인: 이 롤백을 적용하면 AdminDataContext의 getStagesByTaskType 이
-- 이름 기반 추론(deriveCategoryType fallback)으로 자동 전환됨

ALTER TABLE progress_categories
  DROP CONSTRAINT IF EXISTS progress_categories_task_type_check;

ALTER TABLE progress_categories
  DROP COLUMN IF EXISTS task_type;
