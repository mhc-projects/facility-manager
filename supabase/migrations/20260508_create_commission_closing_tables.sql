-- ============================================================
-- 영업비 마감 시스템 - 테이블, View, 트리거 생성
-- 작성일: 2026-05-08
-- ============================================================

-- 1. 전역 트리거 설정 (singleton)
CREATE TABLE IF NOT EXISTS commission_closing_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 진행유형별 기본 트리거
  self_trigger        TEXT NOT NULL DEFAULT 'installation_complete'
    CHECK (self_trigger IN ('installation_complete', 'manual')),

  subsidy_trigger     TEXT NOT NULL DEFAULT 'subsidy_fully_paid'
    CHECK (subsidy_trigger IN ('subsidy_fully_paid', 'subsidy_1st_payment', 'manual')),

  -- 보조금 완납 판정 기준
  subsidy_paid_basis  TEXT NOT NULL DEFAULT 'last_invoice_paid'
    CHECK (subsidy_paid_basis IN (
      'last_invoice_paid',   -- 마지막 보조금 계산서에 입금일 기준
      'all_invoices_paid',   -- 모든 보조금 계산서 입금 완료
      'manual'               -- 관리자 수동 지정
    )),

  updated_by          UUID REFERENCES employees(id),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 초기 기본값 1행
INSERT INTO commission_closing_config (self_trigger, subsidy_trigger, subsidy_paid_basis)
VALUES ('installation_complete', 'subsidy_fully_paid', 'last_invoice_paid')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE commission_closing_config IS '영업비 마감 전역 트리거 설정 (singleton)';


-- 2. 영업비 지급 이력 테이블
CREATE TABLE IF NOT EXISTS commission_payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID NOT NULL REFERENCES business_info(id) ON DELETE RESTRICT,

  -- 지급 시점 스냅샷 (이후 사업장 변경 대비)
  sales_office       TEXT NOT NULL,
  payment_month      VARCHAR(7) NOT NULL
    CHECK (payment_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  progress_type      TEXT NOT NULL
    CHECK (progress_type IN ('self','subsidy','subsidy_parallel','subsidy_extra','dealer','outsourcing','etc')),

  -- 영업비 금액
  calculated_amount  NUMERIC(12,0) NOT NULL DEFAULT 0,
  actual_amount      NUMERIC(12,0) NOT NULL DEFAULT 0,

  -- 상태 머신
  status             TEXT NOT NULL DEFAULT 'eligible'
    CHECK (status IN (
      'eligible',    -- 지급 가능 (트리거 충족 + 미수금 없음)
      'on_hold',     -- 보류 (미수금 발생 또는 수동 보류)
      'approved',    -- 승인 완료
      'paid',        -- 지급 완료
      'cancelled'    -- 취소
    )),

  -- 보류 정보
  hold_reason        TEXT CHECK (hold_reason IN ('receivable', 'manual')),
  hold_note          TEXT,
  receivable_amount  NUMERIC(12,0),  -- 미수금액

  -- 트리거 정보
  trigger_type       TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('installation_complete', 'subsidy_fully_paid', 'manual')),
  triggered_at       TIMESTAMPTZ,

  -- 지급 정보
  payment_date       DATE,
  payment_note       TEXT,

  -- 계산 스냅샷 (지급 시점 수수료율/수량 보존)
  snapshot_data      JSONB,

  -- 감사
  created_by         UUID REFERENCES employees(id),
  approved_by        UUID REFERENCES employees(id),
  approved_at        TIMESTAMPTZ,
  paid_by            UUID REFERENCES employees(id),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_cp_business      ON commission_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_cp_month         ON commission_payments(payment_month);
CREATE INDEX IF NOT EXISTS idx_cp_status        ON commission_payments(status);
CREATE INDEX IF NOT EXISTS idx_cp_office        ON commission_payments(sales_office);
CREATE INDEX IF NOT EXISTS idx_cp_month_status  ON commission_payments(payment_month, status);
CREATE INDEX IF NOT EXISTS idx_cp_created       ON commission_payments(created_at DESC);

COMMENT ON TABLE commission_payments IS '영업비 지급 이력 (eligible→approved→paid 상태 머신)';
COMMENT ON COLUMN commission_payments.progress_type IS 'self:자비, subsidy:보조금, subsidy_parallel:보조금동시, subsidy_extra:추가승인, dealer:대리점, outsourcing:외주, etc:기타';
COMMENT ON COLUMN commission_payments.status IS 'eligible:지급가능, on_hold:보류(미수금), approved:승인, paid:지급완료, cancelled:취소';
COMMENT ON COLUMN commission_payments.hold_reason IS 'receivable:미수금보류, manual:수동보류';
COMMENT ON COLUMN commission_payments.snapshot_data IS '계산 시점 수수료율·장비수량·매출금액 스냅샷';


-- 3. closing_records에 commission 타입 추가
ALTER TABLE closing_records
  DROP CONSTRAINT IF EXISTS closing_records_closing_type_check;

ALTER TABLE closing_records
  ADD CONSTRAINT closing_records_closing_type_check
    CHECK (closing_type IN ('forecast', 'final', 'commission'));


-- 4. 영업비 지급 대상 View (트리거 조건 실시간 계산)
CREATE OR REPLACE VIEW v_commission_eligible AS
SELECT
  b.id                        AS business_id,
  b.business_name,
  b.sales_office,
  b.progress_status,
  b.installation_date,
  b.manufacturer,
  b.additional_cost,
  b.installation_extra_cost,

  -- 장비 수량 합산 (per_unit 방식 영업비 계산용)
  -- VARCHAR 컬럼을 명시적으로 INTEGER로 캐스팅
  COALESCE(b.ph_meter::INTEGER, 0)
  + COALESCE(b.differential_pressure_meter::INTEGER, 0)
  + COALESCE(b.temperature_meter::INTEGER, 0)
  + COALESCE(b.discharge_current_meter::INTEGER, 0)
  + COALESCE(b.fan_current_meter::INTEGER, 0)
  + COALESCE(b.pump_current_meter::INTEGER, 0)
  + COALESCE(b.gateway::INTEGER, 0)
  + COALESCE(b.gateway_1_2::INTEGER, 0)
  + COALESCE(b.gateway_3_4::INTEGER, 0)      AS total_unit_count,

  -- 보조금 계산서 현황
  COALESCE(inv.subsidy_billed_total,  0)      AS subsidy_billed_total,
  COALESCE(inv.subsidy_paid_total,    0)      AS subsidy_paid_total,
  inv.subsidy_last_payment_date,
  inv.subsidy_1st_paid,
  CASE
    WHEN COALESCE(inv.subsidy_billed_total, 0) > 0
     AND COALESCE(inv.subsidy_paid_total, 0) >= inv.subsidy_billed_total
    THEN true ELSE false
  END                                         AS subsidy_fully_paid,

  -- 자비 매출 현황
  COALESCE(inv.self_billed_total,  0)         AS self_billed_total,
  COALESCE(inv.self_paid_total,    0)         AS self_paid_total,

  -- 기존 commission_payments 레코드
  cp.id                                       AS commission_payment_id,
  cp.status                                   AS commission_status,
  cp.calculated_amount,
  cp.actual_amount,
  cp.hold_reason,
  cp.hold_note,
  cp.receivable_amount,
  cp.trigger_type,
  cp.triggered_at,
  cp.payment_month,
  cp.approved_at,
  cp.payment_date

FROM business_info b
LEFT JOIN (
  SELECT
    business_id,
    -- 보조금
    SUM(CASE WHEN invoice_stage IN ('subsidy_1st','subsidy_2nd') AND record_type='original'
             THEN COALESCE(total_amount, 0) ELSE 0 END)          AS subsidy_billed_total,
    SUM(CASE WHEN invoice_stage IN ('subsidy_1st','subsidy_2nd') AND record_type='original'
             THEN COALESCE(payment_amount, 0) ELSE 0 END)        AS subsidy_paid_total,
    MAX(CASE WHEN invoice_stage IN ('subsidy_1st','subsidy_2nd') AND record_type='original'
             AND payment_date IS NOT NULL THEN payment_date END)  AS subsidy_last_payment_date,
    BOOL_OR(CASE WHEN invoice_stage='subsidy_1st' AND record_type='original'
                  AND payment_date IS NOT NULL THEN true ELSE false END) AS subsidy_1st_paid,
    -- 자비
    SUM(CASE WHEN invoice_stage IN ('self_advance','self_balance') AND record_type='original'
             THEN COALESCE(total_amount, 0) ELSE 0 END)          AS self_billed_total,
    SUM(CASE WHEN invoice_stage IN ('self_advance','self_balance') AND record_type='original'
             THEN COALESCE(payment_amount, 0) ELSE 0 END)        AS self_paid_total
  FROM invoice_records
  WHERE is_active = true
  GROUP BY business_id
) inv ON inv.business_id = b.id
LEFT JOIN commission_payments cp
  ON cp.business_id = b.id
  AND cp.status NOT IN ('cancelled')
WHERE b.is_active = true
  AND b.is_deleted = false
  AND b.sales_office IS NOT NULL
  AND b.sales_office != '';

COMMENT ON VIEW v_commission_eligible IS '영업비 지급 대상 실시간 뷰 (트리거 조건 계산 포함)';


-- 5. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_commission_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_commission_payments_updated_at ON commission_payments;
CREATE TRIGGER trigger_commission_payments_updated_at
  BEFORE UPDATE ON commission_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_payments_updated_at();


-- 6. RLS 정책
ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_closing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_commission_payments" ON commission_payments
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_commission_closing_config" ON commission_closing_config
  FOR ALL USING (true) WITH CHECK (true);
