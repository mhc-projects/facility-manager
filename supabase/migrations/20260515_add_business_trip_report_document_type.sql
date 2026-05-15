-- 출장보고서 document_type 추가
-- approval_documents 체크 제약에 'business_trip_report' 값 추가

ALTER TABLE approval_documents
  DROP CONSTRAINT IF EXISTS approval_documents_document_type_check;

ALTER TABLE approval_documents
  ADD CONSTRAINT approval_documents_document_type_check
    CHECK (document_type IN (
      'expense_claim',
      'purchase_request',
      'leave_request',
      'business_proposal',
      'overtime_log',
      'installation_closing',
      'commission_closing',
      'business_trip_report'
    ));
