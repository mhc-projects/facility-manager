-- 온라인 접수일 컬럼 추가
ALTER TABLE business_info
  ADD COLUMN IF NOT EXISTS online_receipt_date DATE;
