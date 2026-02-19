-- 입금예정일 컬럼 추가 (자비 진행구분 사업장용)
ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS payment_scheduled_date DATE;

COMMENT ON COLUMN business_info.payment_scheduled_date IS '입금예정일 (자비 진행구분 사업장)';
