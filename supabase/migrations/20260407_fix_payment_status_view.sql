-- v_business_payment_status View 수정
-- 본마감이 예측마감 없이도 독립적으로 작동하도록 변경

CREATE OR REPLACE VIEW v_business_payment_status AS
SELECT
  b.id AS business_id,
  CASE
    -- 우선순위 1: 미정산 차액 존재
    WHEN EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'adjustment' AND ip.status = 'pending'
    ) THEN 'diff_pending'

    -- 우선순위 2: 본마감 완료
    WHEN EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'final' AND ip.status = 'paid'
    ) AND NOT EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'adjustment' AND ip.status = 'pending'
    ) THEN 'final_completed'

    -- 우선순위 3: 설치완료 but 본마감 미처리 (예측마감 유무 무관)
    WHEN b.installation_date IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'final' AND ip.status = 'paid'
    ) THEN 'final_pending'

    -- 우선순위 4: 예측마감 완료, 설치 대기
    WHEN EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'forecast' AND ip.status = 'paid'
    ) AND b.installation_date IS NULL
    THEN 'forecast_completed'

    -- 우선순위 5: 발주일 있지만 예측마감 미처리
    WHEN b.order_date IS NOT NULL THEN 'forecast_pending'

    -- 우선순위 6: 발주일 없음
    ELSE 'not_applicable'
  END AS payment_status,

  EXISTS (
    SELECT 1 FROM installation_payments ip
    WHERE ip.business_id = b.id AND ip.status IN ('cancelled', 'deducted')
  ) AS has_refund_history

FROM business_info b;

COMMENT ON VIEW v_business_payment_status IS '사업장별 설치비 지급 상태 (본마감 독립 작동)';
