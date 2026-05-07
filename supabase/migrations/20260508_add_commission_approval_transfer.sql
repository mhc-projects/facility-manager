-- ============================================================
-- 영업비 마감 전자결재 + 송금 기록 기능
-- 작성일: 2026-05-08
-- ============================================================

-- 1. commission_payments status에 pending_approval 추가
ALTER TABLE commission_payments
  DROP CONSTRAINT IF EXISTS commission_payments_status_check;

ALTER TABLE commission_payments
  ADD CONSTRAINT commission_payments_status_check
    CHECK (status IN (
      'eligible',
      'pending_approval',
      'approved',
      'paid',
      'on_hold',
      'cancelled'
    ));

-- 2. commission_payments에 FK 컬럼 추가
ALTER TABLE commission_payments
  ADD COLUMN IF NOT EXISTS approval_document_id UUID REFERENCES approval_documents(id),
  ADD COLUMN IF NOT EXISTS transfer_id         UUID;  -- commission_transfers 생성 후 FK 추가

CREATE INDEX IF NOT EXISTS idx_cp_approval_doc ON commission_payments(approval_document_id);


-- 3. commission_transfers 테이블 (영업점별 실제 송금 기록)
CREATE TABLE IF NOT EXISTS commission_transfers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_office     TEXT NOT NULL,
  transfer_date    DATE NOT NULL,
  transfer_amount  NUMERIC(12,0) NOT NULL,
  bank_reference   VARCHAR(100),
  payment_month    VARCHAR(7) CHECK (payment_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'recorded'
                     CHECK (status IN ('recorded', 'reconciled')),
  created_by       UUID REFERENCES employees(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ct_office ON commission_transfers(sales_office);
CREATE INDEX IF NOT EXISTS idx_ct_date   ON commission_transfers(transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_ct_month  ON commission_transfers(payment_month);

COMMENT ON TABLE commission_transfers IS '영업점별 영업비 실제 송금 기록';

-- transfer_id FK 추가 (commission_transfers 생성 후)
ALTER TABLE commission_payments
  ADD CONSTRAINT fk_cp_transfer
    FOREIGN KEY (transfer_id) REFERENCES commission_transfers(id);

CREATE INDEX IF NOT EXISTS idx_cp_transfer ON commission_payments(transfer_id);


-- 4. approval_documents.document_type 에 commission_closing 추가
ALTER TABLE approval_documents
  DROP CONSTRAINT IF EXISTS approval_documents_document_type_check;

ALTER TABLE approval_documents
  ADD CONSTRAINT approval_documents_document_type_check
    CHECK (document_type IN (
      'expense_claim',
      'purchase_request',
      'leave_request',
      'business_proposal',
      'overtime_log',
      'installation_closing',
      'commission_closing'
    ));


-- 5. updated_at 트리거
CREATE OR REPLACE FUNCTION update_commission_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_commission_transfers_updated_at ON commission_transfers;
CREATE TRIGGER trigger_commission_transfers_updated_at
  BEFORE UPDATE ON commission_transfers
  FOR EACH ROW EXECUTE FUNCTION update_commission_transfers_updated_at();


-- 6. RLS
ALTER TABLE commission_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_commission_transfers" ON commission_transfers
  FOR ALL USING (true) WITH CHECK (true);
