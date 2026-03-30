-- Migration: 보조금 업무단계에 '보조금 입금 대기' 상태 추가
-- 목적: subsidy_payment(보조금 입금) 단계 전에 subsidy_payment_pending(보조금 입금 대기) 단계 삽입
--
-- 참고: facility_tasks.status 컬럼은 VARCHAR(50) 타입이며 별도 enum 타입 없음.
--       신규 상태값을 사용하는 데 스키마 변경이 필요하지 않습니다.
--       이 마이그레이션은 문서 목적으로만 존재하며, 실제로 실행할 SQL이 없습니다.

-- 아래는 기존에 잘못 작성된 구문입니다 (task_status enum이 존재하지 않아 오류 발생):
-- ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'subsidy_payment_pending' BEFORE 'subsidy_payment';

-- facility_tasks.status 컬럼은 VARCHAR(50)이므로 'subsidy_payment_pending' 값을 바로 사용할 수 있습니다.
-- 프론트엔드 코드(lib/task-steps.ts, app/admin/tasks/types.ts)에 단계 정의가 추가되어 있습니다.
SELECT 'subsidy_payment_pending status is available as VARCHAR(50) - no schema change required' AS migration_note;
