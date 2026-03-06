-- 매입비용 조정 항목 추가
-- revenue_adjustments와 동일한 구조: JSONB 배열 [{ reason: string, amount: number }]
-- amount는 공급가액 기준 (부가세 미포함)

ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS purchase_adjustments JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN business_info.purchase_adjustments IS '매입비용 조정 항목 배열 [{reason: string, amount: number}], amount는 공급가액 기준';
