-- 매출비용 조정 항목 컬럼 추가
-- Description: revenue_adjustments 컬럼 - 미수금 계산 시 매출 조정 반영
-- amount 필드는 공급가액(부가세 별도) 기준, 계산 시 ×1.1 적용

ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS revenue_adjustments JSONB DEFAULT '[]'::jsonb;

-- 기존 NULL 값 빈 배열로 초기화
UPDATE business_info
SET revenue_adjustments = '[]'::jsonb
WHERE revenue_adjustments IS NULL;

-- GIN 인덱스 (조정 항목이 있는 사업장 검색용)
CREATE INDEX IF NOT EXISTS idx_business_info_revenue_adjustments
ON business_info USING gin(revenue_adjustments)
WHERE revenue_adjustments != '[]'::jsonb;

COMMENT ON COLUMN business_info.revenue_adjustments IS
  '매출비용 조정 배열: [{reason: string, amount: number}]. amount는 공급가액(부가세별도), 양수=매출증가, 음수=매출감소. 미수금 계산 시 ×1.1 적용';

-- 검증 쿼리
DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_info'
    AND column_name = 'revenue_adjustments'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE '✅ revenue_adjustments 컬럼 추가 완료';
  ELSE
    RAISE WARNING '❌ revenue_adjustments 컬럼 추가 실패';
  END IF;
END $$;
