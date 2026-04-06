-- 부착지원신청서 신청일, 작성일 컬럼 추가
ALTER TABLE business_info
  ADD COLUMN IF NOT EXISTS attachment_support_application_date DATE,
  ADD COLUMN IF NOT EXISTS attachment_support_writing_date DATE;

COMMENT ON COLUMN business_info.attachment_support_application_date IS '부착지원신청서 신청일';
COMMENT ON COLUMN business_info.attachment_support_writing_date IS '부착지원신청서 작성일';
