-- 접수일 컬럼 추가 마이그레이션
-- 사업장 정보의 프로젝트 관리 섹션에 접수일(receipt_date) 필드 추가

ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS receipt_date DATE;

COMMENT ON COLUMN business_info.receipt_date IS '접수일 - 사업장 접수 날짜';
