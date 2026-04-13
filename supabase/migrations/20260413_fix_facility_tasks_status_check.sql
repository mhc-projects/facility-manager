-- Migration: facility_tasks_status_check 제약 누락 값 추가 + task_status_history.task_type 확장
--
-- 배경:
--   칸반보드에서 '보조금지급신청서' 카드를 '보조금 입금 대기' 컬럼으로 이동 시
--   500 Internal Server Error 발생. 원인은 facility_tasks_status_check 제약에
--   'subsidy_payment_pending' 값이 누락되어 UPDATE 거부.
--
--   이전 마이그레이션(20260330_add_subsidy_payment_pending_status.sql)이 "VARCHAR이므로
--   스키마 변경 불필요"로 판단했으나, 실제로는 CHECK 제약이 존재하여 오판이었음.
--
-- 수정 내용:
--   1. facility_tasks.status CHECK 제약에 'subsidy_payment_pending',
--      'self_completion_document' 2개 값 추가
--   2. task_status_history.task_type CHECK 제약을 'self'/'subsidy'만 허용 →
--      'self'/'subsidy'/'as'/'dealer'/'outsourcing'/'etc' 6종 전체 허용으로 확장
--      (2차 장애 예방: 현재는 route.ts try/catch가 에러를 삼키고 있으나
--       AS/대리점/외주/기타 타입의 상태 이력이 기록되지 않고 있음)
--
-- 롤백: 이 파일 하단 주석의 ROLLBACK 섹션 참고

BEGIN;

-- ─── 1. facility_tasks.status CHECK 제약 재생성 ──────────────────────────────

ALTER TABLE facility_tasks DROP CONSTRAINT IF EXISTS facility_tasks_status_check;

ALTER TABLE facility_tasks
ADD CONSTRAINT facility_tasks_status_check
CHECK (status IN (
  -- 확인필요 (각 타입별)
  'self_needs_check', 'subsidy_needs_check', 'as_needs_check',
  'dealer_needs_check', 'outsourcing_needs_check', 'etc_needs_check',

  -- 자비(self) 단계
  'self_customer_contact', 'self_site_inspection', 'self_quotation',
  'self_progress_confirm',
  'self_contract', 'self_deposit_confirm', 'self_product_order',
  'self_product_shipment', 'self_installation_schedule', 'self_installation',
  'self_completion_document',      -- 신규 추가 (lib/task-steps.ts:59)
  'self_balance_payment', 'self_document_complete',

  -- 보조금(subsidy) 단계
  'subsidy_customer_contact', 'subsidy_site_inspection', 'subsidy_quotation',
  'subsidy_progress_confirm',
  'subsidy_contract', 'subsidy_document_preparation', 'subsidy_application_submit',
  'subsidy_approval_pending', 'subsidy_approved', 'subsidy_rejected',
  'subsidy_document_supplement', 'subsidy_pre_construction_inspection',
  'subsidy_pre_construction_supplement_1st', 'subsidy_pre_construction_supplement_2nd',
  'subsidy_construction_report_submit', 'subsidy_product_order', 'subsidy_product_shipment',
  'subsidy_installation_schedule', 'subsidy_installation',
  'subsidy_pre_completion_document_submit', 'subsidy_completion_inspection',
  'subsidy_completion_supplement_1st', 'subsidy_completion_supplement_2nd',
  'subsidy_completion_supplement_3rd', 'subsidy_final_document_submit',
  'subsidy_payment_pending',        -- 신규 추가 (칸반 500 에러 직접 원인)
  'subsidy_payment',

  -- AS 단계
  'as_customer_contact', 'as_site_inspection', 'as_quotation',
  'as_progress_confirm',
  'as_contract', 'as_part_order', 'as_completed',

  -- 대리점(dealer) 단계
  'dealer_order_received', 'dealer_invoice_issued',
  'dealer_payment_confirmed', 'dealer_product_ordered',

  -- 외주설치(outsourcing) 단계
  'outsourcing_order', 'outsourcing_schedule',
  'outsourcing_in_progress', 'outsourcing_completed',

  -- 기타
  'etc_status',

  -- 레거시 호환성 유지 (구버전 prefix 없는 status)
  'pending', 'customer_contact', 'site_inspection', 'quotation', 'contract',
  'deposit_confirm', 'product_order', 'product_shipment', 'installation_schedule',
  'installation', 'balance_payment', 'document_complete',
  'application_submit', 'document_supplement', 'document_preparation',
  'pre_construction_inspection', 'pre_construction_supplement',
  'pre_construction_supplement_1st', 'pre_construction_supplement_2nd',
  'construction_report_submit', 'completion_inspection', 'completion_supplement',
  'completion_supplement_1st', 'completion_supplement_2nd', 'completion_supplement_3rd',
  'pre_completion_document_submit', 'final_document_submit',
  'approval_pending', 'approved', 'rejected'
));

-- ─── 2. task_status_history.task_type CHECK 제약 확장 ────────────────────────

ALTER TABLE task_status_history DROP CONSTRAINT IF EXISTS task_status_history_task_type_check;

ALTER TABLE task_status_history
ADD CONSTRAINT task_status_history_task_type_check
CHECK (task_type IN ('self', 'subsidy', 'as', 'dealer', 'outsourcing', 'etc'));

COMMIT;

-- ─── 검증 쿼리 (적용 후 실행) ────────────────────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname IN ('facility_tasks_status_check', 'task_status_history_task_type_check');

-- ─── ROLLBACK (문제 발생 시) ─────────────────────────────────────────────────
-- 주의: 롤백 전 새 상태값으로 저장된 행이 없는지 확인 필요
--   SELECT COUNT(*) FROM facility_tasks
--   WHERE status IN ('subsidy_payment_pending', 'self_completion_document');
--   SELECT COUNT(*) FROM task_status_history
--   WHERE task_type IN ('as', 'dealer', 'outsourcing', 'etc');
--
-- BEGIN;
-- ALTER TABLE facility_tasks DROP CONSTRAINT facility_tasks_status_check;
-- -- (이전 제약 복구는 database/add-progress-confirm-status.sql 참고)
-- ALTER TABLE task_status_history DROP CONSTRAINT task_status_history_task_type_check;
-- ALTER TABLE task_status_history
-- ADD CONSTRAINT task_status_history_task_type_check
-- CHECK (task_type IN ('self', 'subsidy'));
-- COMMIT;
