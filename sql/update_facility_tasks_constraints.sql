-- Update facility_tasks constraints to support new prefixed status codes
-- 실행 순서:
-- 1. 기존 check constraint 제거
-- 2. task_type check constraint 업데이트 (dealer, outsourcing, as, etc 추가)
-- 3. 새로운 status check constraint 추가 (모든 prefix 포함)

-- ============================================================
-- STEP 1: 기존 constraints 제거
-- ============================================================

ALTER TABLE facility_tasks DROP CONSTRAINT IF EXISTS facility_tasks_status_check;
ALTER TABLE facility_tasks DROP CONSTRAINT IF EXISTS facility_tasks_task_type_check;

-- ============================================================
-- STEP 2: task_type constraint 업데이트
-- ============================================================

ALTER TABLE facility_tasks
ADD CONSTRAINT facility_tasks_task_type_check
CHECK (task_type IN ('self', 'subsidy', 'dealer', 'outsourcing', 'as', 'etc'));

-- ============================================================
-- STEP 3: status constraint 업데이트
-- ============================================================

ALTER TABLE facility_tasks
ADD CONSTRAINT facility_tasks_status_check
CHECK (status IN (
  'pending', 'customer_contact', 'site_inspection', 'quotation', 'contract',
  'self_needs_check', 'subsidy_needs_check', 'as_needs_check', 'dealer_needs_check', 'outsourcing_needs_check', 'etc_needs_check',
  'self_customer_contact', 'self_site_inspection', 'self_quotation', 'self_contract',
  'self_deposit_confirm', 'self_product_order', 'self_product_shipment', 'self_installation_schedule', 'self_installation', 'self_balance_payment', 'self_document_complete',
  'subsidy_customer_contact', 'subsidy_site_inspection', 'subsidy_quotation', 'subsidy_contract',
  'subsidy_document_preparation', 'subsidy_application_submit', 'subsidy_approval_pending', 'subsidy_approved', 'subsidy_rejected', 'subsidy_document_supplement',
  'subsidy_pre_construction_inspection', 'subsidy_pre_construction_supplement_1st', 'subsidy_pre_construction_supplement_2nd', 'subsidy_construction_report_submit',
  'subsidy_product_order', 'subsidy_product_shipment', 'subsidy_installation_schedule', 'subsidy_installation',
  'subsidy_pre_completion_document_submit', 'subsidy_completion_inspection', 'subsidy_completion_supplement_1st', 'subsidy_completion_supplement_2nd', 'subsidy_completion_supplement_3rd',
  'subsidy_final_document_submit', 'subsidy_payment',
  'as_customer_contact', 'as_site_inspection', 'as_quotation', 'as_contract', 'as_part_order', 'as_completed',
  'dealer_order_received', 'dealer_invoice_issued', 'dealer_payment_confirmed', 'dealer_product_ordered',
  'outsourcing_order', 'outsourcing_schedule', 'outsourcing_in_progress', 'outsourcing_completed',
  'etc_status',
  'deposit_confirm', 'product_order', 'product_shipment', 'installation_schedule', 'installation', 'balance_payment', 'document_complete',
  'application_submit', 'document_supplement', 'document_preparation', 'pre_construction_inspection', 'pre_construction_supplement',
  'pre_construction_supplement_1st', 'pre_construction_supplement_2nd', 'construction_report_submit',
  'completion_inspection', 'completion_supplement', 'completion_supplement_1st', 'completion_supplement_2nd', 'completion_supplement_3rd',
  'pre_completion_document_submit', 'final_document_submit', 'approval_pending', 'approved', 'rejected'
));
