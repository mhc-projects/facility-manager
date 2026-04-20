-- Migration: 자비 업무단계에 설치완료(준공서작성필요) / 준공서류 작성완료(입금안내) 추가
--
-- 변경 내용:
--   설치완료 → 준공서류 작성필요 사이에 'self_installation_doc_needed' 추가
--   준공서류 작성필요 → 잔금 입금 사이에 'self_completion_doc_done' 추가

BEGIN;

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
  'self_installation_doc_needed',   -- 신규: 설치완료(준공서작성필요)
  'self_completion_document',
  'self_completion_doc_done',       -- 신규: 준공서류 작성완료(입금안내)
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
  'subsidy_payment_pending',
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

  -- 레거시 호환성 유지
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

COMMIT;
