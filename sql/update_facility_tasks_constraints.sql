-- facility_tasks 테이블 제약 조건 업데이트
-- 목적: dealer, outsourcing, as, etc 업무 타입 및 단계 추가 지원
-- 작성일: 2026-02-02

-- 1. 기존 제약 조건 삭제
ALTER TABLE facility_tasks DROP CONSTRAINT IF EXISTS facility_tasks_task_type_check;
ALTER TABLE facility_tasks DROP CONSTRAINT IF EXISTS facility_tasks_status_check;

-- 2. 새로운 task_type 제약 조건 추가
ALTER TABLE facility_tasks ADD CONSTRAINT facility_tasks_task_type_check
  CHECK (task_type IN ('self', 'subsidy', 'dealer', 'outsourcing', 'as', 'etc'));

-- 3. 새로운 status 제약 조건 추가 (모든 타입의 단계 포함)
ALTER TABLE facility_tasks ADD CONSTRAINT facility_tasks_status_check
  CHECK (status IN (
    -- 공통 단계
    'pending',
    'site_survey',
    'customer_contact',
    'site_inspection',
    'quotation',
    'contract',

    -- 확인필요 단계 (각 업무 타입별)
    'self_needs_check',
    'subsidy_needs_check',
    'as_needs_check',
    'dealer_needs_check',
    'outsourcing_needs_check',
    'etc_needs_check',

    -- 자비 전용 단계
    'deposit_confirm',
    'product_order',
    'product_shipment',
    'installation_schedule',
    'installation',
    'balance_payment',
    'document_complete',

    -- 보조금 전용 단계
    'approval_pending',
    'approved',
    'rejected',
    'application_submit',
    'document_supplement',
    'document_preparation',
    'pre_construction_inspection',
    'pre_construction_supplement_1st',
    'pre_construction_supplement_2nd',
    'construction_report_submit',
    'pre_completion_document_submit',
    'completion_inspection',
    'completion_supplement_1st',
    'completion_supplement_2nd',
    'completion_supplement_3rd',
    'final_document_submit',
    'subsidy_payment',

    -- AS 전용 단계
    'as_customer_contact',
    'as_site_inspection',
    'as_quotation',
    'as_contract',
    'as_part_order',
    'as_completed',

    -- 대리점 전용 단계
    'dealer_order_received',
    'dealer_invoice_issued',
    'dealer_payment_confirmed',
    'dealer_product_ordered',

    -- 외주설치 전용 단계
    'outsourcing_order',
    'outsourcing_schedule',
    'outsourcing_in_progress',
    'outsourcing_completed',

    -- 기타 단계
    'etc_status'
  ));

-- 4. 테이블 주석 업데이트
COMMENT ON COLUMN facility_tasks.task_type IS '업무 타입: self(자비), subsidy(보조금), dealer(대리점), outsourcing(외주설치), as(AS), etc(기타)';
COMMENT ON COLUMN facility_tasks.status IS '업무 진행 단계 - 각 업무 타입별 워크플로우 단계';

-- 5. 기존 데이터 검증 (선택사항)
-- 현재 테이블의 task_type과 status 값이 새 제약 조건을 위반하는지 확인
SELECT
  task_type,
  status,
  COUNT(*) as count
FROM facility_tasks
WHERE
  task_type NOT IN ('self', 'subsidy', 'dealer', 'outsourcing', 'as', 'etc')
  OR status NOT IN (
    'pending', 'site_survey', 'customer_contact', 'site_inspection', 'quotation', 'contract',
    'self_needs_check', 'subsidy_needs_check', 'as_needs_check', 'dealer_needs_check', 'outsourcing_needs_check', 'etc_needs_check',
    'deposit_confirm', 'product_order', 'product_shipment', 'installation_schedule', 'installation', 'balance_payment', 'document_complete',
    'approval_pending', 'approved', 'rejected', 'application_submit', 'document_supplement', 'document_preparation',
    'pre_construction_inspection', 'pre_construction_supplement_1st', 'pre_construction_supplement_2nd', 'construction_report_submit',
    'pre_completion_document_submit', 'completion_inspection', 'completion_supplement_1st', 'completion_supplement_2nd', 'completion_supplement_3rd',
    'final_document_submit', 'subsidy_payment',
    'as_customer_contact', 'as_site_inspection', 'as_quotation', 'as_contract', 'as_part_order', 'as_completed',
    'dealer_order_received', 'dealer_invoice_issued', 'dealer_payment_confirmed', 'dealer_product_ordered',
    'outsourcing_order', 'outsourcing_schedule', 'outsourcing_in_progress', 'outsourcing_completed',
    'etc_status'
  )
GROUP BY task_type, status;

-- 6. 업무 타입 매핑 변환 (필요한 경우)
-- 예: 'self' 타입인데 보조금 전용 status를 가진 데이터가 있다면 수정
-- UPDATE facility_tasks
-- SET task_type = 'subsidy'
-- WHERE task_type = 'self' AND status IN ('application_submit', 'document_supplement', 'subsidy_payment');

-- 7. 제약 조건 적용 확인
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'facility_tasks'::regclass
  AND conname LIKE '%_check';
