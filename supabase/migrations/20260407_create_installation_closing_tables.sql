-- ============================================================
-- 설치비 예측마감 시스템 - 테이블 및 View 생성
-- 작성일: 2026-04-07
-- ============================================================

-- 1. 은결 월별 송금 기록 테이블 (installation_payments가 참조하므로 먼저 생성)
CREATE TABLE IF NOT EXISTS eungyeol_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  transfer_date DATE NOT NULL,
  transfer_amount NUMERIC(12,0) NOT NULL,
  bank_reference VARCHAR(100),
  payment_month VARCHAR(7) NOT NULL CHECK (payment_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'transferred',
    'reconciled'
  )),

  notes TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_et_month ON eungyeol_transfers(payment_month);

COMMENT ON TABLE eungyeol_transfers IS '은결(외주 설치업체) 월별 송금 기록';
COMMENT ON COLUMN eungyeol_transfers.transfer_date IS '실제 송금일';
COMMENT ON COLUMN eungyeol_transfers.transfer_amount IS '총 송금 금액';
COMMENT ON COLUMN eungyeol_transfers.bank_reference IS '이체 참조번호/적요';
COMMENT ON COLUMN eungyeol_transfers.payment_month IS '귀속 월 (YYYY-MM)';


-- 2. 설치비 지급 이력 테이블
CREATE TABLE IF NOT EXISTS installation_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_info(id) ON DELETE RESTRICT,

  payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('forecast', 'final', 'adjustment')),

  payment_category VARCHAR(30) NOT NULL CHECK (payment_category IN (
    'base_installation',
    'additional_construction',
    'extra_installation'
  )),

  calculated_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(12,0) NOT NULL DEFAULT 0,

  snapshot_data JSONB,

  payment_month VARCHAR(7) NOT NULL CHECK (payment_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  payment_date DATE,

  transfer_id UUID REFERENCES eungyeol_transfers(id),

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'paid',
    'adjusted',
    'cancelled',
    'deducted'
  )),

  amount_diff_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index: 활성 상태만 유니크 (cancelled/deducted 제외)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_unique_active
  ON installation_payments (business_id, payment_type, payment_category, payment_month)
  WHERE status NOT IN ('cancelled', 'deducted');

CREATE INDEX IF NOT EXISTS idx_ip_business ON installation_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_ip_month_type ON installation_payments(payment_month, payment_type);
CREATE INDEX IF NOT EXISTS idx_ip_month_status ON installation_payments(payment_month, status);
CREATE INDEX IF NOT EXISTS idx_ip_business_created ON installation_payments(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_transfer ON installation_payments(transfer_id);

COMMENT ON TABLE installation_payments IS '설치비 지급 이력 (예측마감/본마감/차액정산)';
COMMENT ON COLUMN installation_payments.payment_type IS 'forecast: 예측마감, final: 본마감, adjustment: 차액정산/환수';
COMMENT ON COLUMN installation_payments.payment_category IS 'base_installation: 기본설치비, additional_construction: 추가공사비, extra_installation: 추가설치비';
COMMENT ON COLUMN installation_payments.calculated_amount IS '시스템 계산 금액 (지급 시점 스냅샷)';
COMMENT ON COLUMN installation_payments.actual_amount IS '실제 지급 금액';
COMMENT ON COLUMN installation_payments.snapshot_data IS '계산 시점 입력값 (기기별 수량/단가, 추가비용 등)';
COMMENT ON COLUMN installation_payments.payment_month IS '귀속 월 (YYYY-MM)';
COMMENT ON COLUMN installation_payments.amount_diff_reason IS '계산액과 실제 지급액이 다를 때 사유';


-- 3. 월별 마감 기록 테이블
CREATE TABLE IF NOT EXISTS closing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  closing_month VARCHAR(7) NOT NULL CHECK (closing_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  closing_type VARCHAR(20) NOT NULL CHECK (closing_type IN ('forecast', 'final')),

  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'closed',
    'reopened'
  )),

  closed_by UUID REFERENCES employees(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (closing_month, closing_type)
);

COMMENT ON TABLE closing_records IS '월별 마감 상태 관리';


-- 4. 사업장별 설치비 지급 상태 View
CREATE OR REPLACE VIEW v_business_payment_status AS
SELECT
  b.id AS business_id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'adjustment' AND ip.status = 'pending'
    ) THEN 'diff_pending'

    WHEN EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'final' AND ip.status = 'paid'
    ) AND NOT EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'adjustment' AND ip.status = 'pending'
    ) THEN 'final_completed'

    WHEN b.installation_date IS NOT NULL AND EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'forecast' AND ip.status = 'paid'
    ) AND NOT EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'final'
    ) THEN 'final_pending'

    WHEN EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'forecast' AND ip.status = 'paid'
    ) AND b.installation_date IS NULL
    THEN 'forecast_completed'

    WHEN b.order_date IS NOT NULL THEN 'forecast_pending'

    ELSE 'not_applicable'
  END AS payment_status,

  EXISTS (
    SELECT 1 FROM installation_payments ip
    WHERE ip.business_id = b.id AND ip.status IN ('cancelled', 'deducted')
  ) AS has_refund_history

FROM business_info b;

COMMENT ON VIEW v_business_payment_status IS '사업장별 설치비 지급 상태 (실시간 계산)';


-- 5. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- installation_payments
DROP TRIGGER IF EXISTS trigger_installation_payments_updated_at ON installation_payments;
CREATE TRIGGER trigger_installation_payments_updated_at
  BEFORE UPDATE ON installation_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- eungyeol_transfers
DROP TRIGGER IF EXISTS trigger_eungyeol_transfers_updated_at ON eungyeol_transfers;
CREATE TRIGGER trigger_eungyeol_transfers_updated_at
  BEFORE UPDATE ON eungyeol_transfers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- 6. RLS 정책 (Supabase)
ALTER TABLE installation_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE eungyeol_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_records ENABLE ROW LEVEL SECURITY;

-- service_role은 모든 작업 허용 (API 라우트에서 직접 PostgreSQL 사용)
CREATE POLICY "service_role_all_installation_payments" ON installation_payments
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_eungyeol_transfers" ON eungyeol_transfers
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_closing_records" ON closing_records
  FOR ALL USING (true) WITH CHECK (true);
