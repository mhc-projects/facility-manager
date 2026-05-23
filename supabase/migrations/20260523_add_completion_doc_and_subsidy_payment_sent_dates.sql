-- 준공도서 발송일, 보조금지급신청서 발송일 컬럼 추가
ALTER TABLE business_info
  ADD COLUMN IF NOT EXISTS completion_doc_sent_date DATE,
  ADD COLUMN IF NOT EXISTS subsidy_payment_application_sent_date DATE;

COMMENT ON COLUMN business_info.completion_doc_sent_date IS '준공도서 발송일';
COMMENT ON COLUMN business_info.subsidy_payment_application_sent_date IS '보조금지급신청서 발송일';
