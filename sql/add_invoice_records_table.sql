-- ================================================================
-- invoice_records: 계산서 발행 상세 및 수정이력 통합 관리 테이블
-- 기존 business_info 컬럼과 병행 운영 (하위 호환 유지)
-- ================================================================

CREATE TABLE IF NOT EXISTS invoice_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID NOT NULL REFERENCES business_info(id) ON DELETE CASCADE,

  -- 계산서 단계 구분
  -- 고정 단계: 'subsidy_1st' | 'subsidy_2nd' | 'subsidy_additional'
  --            'self_advance' | 'self_balance'
  -- 추가 계산서: 'extra'
  invoice_stage      VARCHAR(50) NOT NULL,

  -- 추가 계산서 전용 제목 (invoice_stage = 'extra' 시 사용)
  extra_title        VARCHAR(200),

  -- 발행 구분: 원본 / 수정 / 취소
  record_type        VARCHAR(20) NOT NULL DEFAULT 'original'
                     CHECK (record_type IN ('original', 'revised', 'cancelled')),

  -- 수정발행 연결: 수정 대상 원본 레코드 ID
  parent_record_id   UUID REFERENCES invoice_records(id) ON DELETE SET NULL,
  revised_reason     VARCHAR(500),

  -- 계산서 발행 정보
  issue_date         DATE,
  invoice_number     VARCHAR(100),          -- 계산서 번호 (국세청 승인번호 등)
  supply_amount      INTEGER NOT NULL DEFAULT 0,  -- 공급가액 (부가세 제외)
  tax_amount         INTEGER NOT NULL DEFAULT 0,  -- 세액
  total_amount       INTEGER NOT NULL DEFAULT 0,  -- 합계 (= supply + tax)

  -- 입금 정보
  payment_date       DATE,
  payment_amount     INTEGER NOT NULL DEFAULT 0,
  payment_memo       VARCHAR(500),

  -- 소프트 삭제 및 메타
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_invoice_records_business
  ON invoice_records(business_id);

CREATE INDEX IF NOT EXISTS idx_invoice_records_stage
  ON invoice_records(business_id, invoice_stage);

CREATE INDEX IF NOT EXISTS idx_invoice_records_parent
  ON invoice_records(parent_record_id)
  WHERE parent_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_records_active
  ON invoice_records(business_id, is_active)
  WHERE is_active = TRUE;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_invoice_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_records_updated_at ON invoice_records;
CREATE TRIGGER trg_invoice_records_updated_at
  BEFORE UPDATE ON invoice_records
  FOR EACH ROW EXECUTE FUNCTION update_invoice_records_updated_at();

-- 컬럼 코멘트
COMMENT ON TABLE invoice_records IS '계산서 발행 상세 및 수정이력 관리';
COMMENT ON COLUMN invoice_records.invoice_stage IS '계산서 단계: subsidy_1st | subsidy_2nd | subsidy_additional | self_advance | self_balance | extra';
COMMENT ON COLUMN invoice_records.extra_title IS 'invoice_stage=extra 시 사용자 지정 계산서 제목';
COMMENT ON COLUMN invoice_records.record_type IS '발행 구분: original(일반) | revised(수정) | cancelled(취소)';
COMMENT ON COLUMN invoice_records.parent_record_id IS '수정발행 시 원본 레코드 ID';
COMMENT ON COLUMN invoice_records.revised_reason IS '수정발행 사유';
COMMENT ON COLUMN invoice_records.supply_amount IS '공급가액 (부가세 제외)';
COMMENT ON COLUMN invoice_records.tax_amount IS '세액 (부가세, 일반적으로 공급가액의 10%)';
COMMENT ON COLUMN invoice_records.total_amount IS '합계금액 (공급가액 + 세액)';
COMMENT ON COLUMN invoice_records.payment_memo IS '입금 메모 (분납, 특이사항 등)';
