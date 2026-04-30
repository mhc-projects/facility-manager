-- facility_tasks.status CHECK 제약 완화
-- 배경: 관리자설정에서 동적으로 생성한 단계(custom_* 키 등)를 저장할 수 없는 문제 수정.
-- 단계 유효성 검증은 이제 task_stages 테이블에서 담당하므로 하드코딩 목록 제약은 불필요.
-- 빈 문자열 및 100자 초과만 차단.

BEGIN;

ALTER TABLE facility_tasks DROP CONSTRAINT IF EXISTS facility_tasks_status_check;

ALTER TABLE facility_tasks
  ADD CONSTRAINT facility_tasks_status_check
  CHECK (TRIM(status) <> '' AND LENGTH(status) <= 100);

COMMIT;
