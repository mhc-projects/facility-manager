-- ================================================================
-- business_info 계산서 데이터 → invoice_records 마이그레이션
-- ================================================================
-- 실행 방법: Supabase SQL Editor에 붙여넣고 실행
-- 안전: 이미 invoice_records에 레코드가 있는 사업장은 건너뜀
-- ================================================================

DO $$
DECLARE
  v_count_inserted INTEGER := 0;
  v_count_skipped  INTEGER := 0;
  v_count_total    INTEGER := 0;
  rec RECORD;
BEGIN

  -- ────────────────────────────────────────────────────────────────
  -- 1) 보조금 사업장: 1차, 2차, 추가공사비
  -- ────────────────────────────────────────────────────────────────
  FOR rec IN
    SELECT
      id,
      business_name,
      progress_status,
      invoice_1st_date,    invoice_1st_amount,    payment_1st_date,    payment_1st_amount,
      invoice_2nd_date,    invoice_2nd_amount,    payment_2nd_date,    payment_2nd_amount,
      invoice_additional_date, additional_cost,   payment_additional_date, payment_additional_amount
    FROM business_info
    WHERE progress_status IN ('보조금', '보조금 동시진행', '보조금 추가승인')
  LOOP
    v_count_total := v_count_total + 1;

    -- ── 1차 계산서 ──────────────────────────────────────────────
    -- 발행일이 있거나 금액이 있는 경우 마이그레이션 (발행일 기준 우선)
    IF (rec.invoice_1st_date IS NOT NULL OR (rec.invoice_1st_amount IS NOT NULL AND rec.invoice_1st_amount > 0))
       AND NOT EXISTS (
         SELECT 1 FROM invoice_records
         WHERE business_id = rec.id AND invoice_stage = 'subsidy_1st' AND record_type = 'original'
       )
    THEN
      DECLARE
        v_supply INTEGER;
        v_tax    INTEGER;
        v_total  INTEGER := rec.invoice_1st_amount;
      BEGIN
        v_supply := ROUND(v_total / 1.1);
        v_tax    := v_total - v_supply;
        INSERT INTO invoice_records (
          business_id, invoice_stage, record_type,
          issue_date, supply_amount, tax_amount, total_amount,
          payment_date, payment_amount
        ) VALUES (
          rec.id, 'subsidy_1st', 'original',
          rec.invoice_1st_date, v_supply, v_tax, v_total,
          rec.payment_1st_date, COALESCE(rec.payment_1st_amount, 0)
        );
        v_count_inserted := v_count_inserted + 1;
      END;
    ELSE
      IF EXISTS (
        SELECT 1 FROM invoice_records
        WHERE business_id = rec.id AND invoice_stage = 'subsidy_1st' AND record_type = 'original'
      ) THEN
        v_count_skipped := v_count_skipped + 1;
      END IF;
    END IF;

    -- ── 2차 계산서 ──────────────────────────────────────────────
    -- 발행일이 있거나 금액이 있는 경우 마이그레이션 (발행일 기준 우선)
    IF (rec.invoice_2nd_date IS NOT NULL OR (rec.invoice_2nd_amount IS NOT NULL AND rec.invoice_2nd_amount > 0))
       AND NOT EXISTS (
         SELECT 1 FROM invoice_records
         WHERE business_id = rec.id AND invoice_stage = 'subsidy_2nd' AND record_type = 'original'
       )
    THEN
      DECLARE
        v_supply INTEGER;
        v_tax    INTEGER;
        v_total  INTEGER := rec.invoice_2nd_amount;
      BEGIN
        v_supply := ROUND(v_total / 1.1);
        v_tax    := v_total - v_supply;
        INSERT INTO invoice_records (
          business_id, invoice_stage, record_type,
          issue_date, supply_amount, tax_amount, total_amount,
          payment_date, payment_amount
        ) VALUES (
          rec.id, 'subsidy_2nd', 'original',
          rec.invoice_2nd_date, v_supply, v_tax, v_total,
          rec.payment_2nd_date, COALESCE(rec.payment_2nd_amount, 0)
        );
        v_count_inserted := v_count_inserted + 1;
      END;
    ELSE
      IF EXISTS (
        SELECT 1 FROM invoice_records
        WHERE business_id = rec.id AND invoice_stage = 'subsidy_2nd' AND record_type = 'original'
      ) THEN
        v_count_skipped := v_count_skipped + 1;
      END IF;
    END IF;

    -- ── 추가공사비 계산서 ────────────────────────────────────────
    -- 추가공사비는 invoice_additional_date가 있거나 additional_cost > 0인 경우
    IF (rec.invoice_additional_date IS NOT NULL OR (rec.additional_cost IS NOT NULL AND rec.additional_cost > 0))
       AND NOT EXISTS (
         SELECT 1 FROM invoice_records
         WHERE business_id = rec.id AND invoice_stage = 'subsidy_additional' AND record_type = 'original'
       )
    THEN
      DECLARE
        v_additional_cost INTEGER := COALESCE(rec.additional_cost, 0);
        v_total           INTEGER := ROUND(v_additional_cost * 1.1);
        v_supply          INTEGER;
        v_tax             INTEGER;
      BEGIN
        -- additional_cost 자체가 공급가액 (DB에 부가세 제외 금액으로 저장됨)
        v_supply := v_additional_cost;
        v_tax    := v_total - v_supply;
        INSERT INTO invoice_records (
          business_id, invoice_stage, record_type,
          issue_date, supply_amount, tax_amount, total_amount,
          payment_date, payment_amount
        ) VALUES (
          rec.id, 'subsidy_additional', 'original',
          rec.invoice_additional_date, v_supply, v_tax, v_total,
          rec.payment_additional_date, COALESCE(rec.payment_additional_amount, 0)
        );
        v_count_inserted := v_count_inserted + 1;
      END;
    END IF;

  END LOOP;

  -- ────────────────────────────────────────────────────────────────
  -- 2) 자비 사업장: 선금, 잔금
  -- ────────────────────────────────────────────────────────────────
  FOR rec IN
    SELECT
      id,
      business_name,
      progress_status,
      invoice_advance_date, invoice_advance_amount, payment_advance_date, payment_advance_amount,
      invoice_balance_date, invoice_balance_amount, payment_balance_date, payment_balance_amount
    FROM business_info
    WHERE progress_status NOT IN ('보조금', '보조금 동시진행', '보조금 추가승인')
  LOOP
    v_count_total := v_count_total + 1;

    -- ── 선금 계산서 ──────────────────────────────────────────────
    -- 발행일이 있거나 금액이 있는 경우 마이그레이션
    IF (rec.invoice_advance_date IS NOT NULL OR (rec.invoice_advance_amount IS NOT NULL AND rec.invoice_advance_amount > 0))
       AND NOT EXISTS (
         SELECT 1 FROM invoice_records
         WHERE business_id = rec.id AND invoice_stage = 'self_advance' AND record_type = 'original'
       )
    THEN
      DECLARE
        v_supply INTEGER;
        v_tax    INTEGER;
        v_total  INTEGER := rec.invoice_advance_amount;
      BEGIN
        v_supply := ROUND(v_total / 1.1);
        v_tax    := v_total - v_supply;
        INSERT INTO invoice_records (
          business_id, invoice_stage, record_type,
          issue_date, supply_amount, tax_amount, total_amount,
          payment_date, payment_amount
        ) VALUES (
          rec.id, 'self_advance', 'original',
          rec.invoice_advance_date, v_supply, v_tax, v_total,
          rec.payment_advance_date, COALESCE(rec.payment_advance_amount, 0)
        );
        v_count_inserted := v_count_inserted + 1;
      END;
    ELSE
      IF EXISTS (
        SELECT 1 FROM invoice_records
        WHERE business_id = rec.id AND invoice_stage = 'self_advance' AND record_type = 'original'
      ) THEN
        v_count_skipped := v_count_skipped + 1;
      END IF;
    END IF;

    -- ── 잔금 계산서 ──────────────────────────────────────────────
    IF (rec.invoice_balance_amount IS NOT NULL AND rec.invoice_balance_amount > 0)
       AND NOT EXISTS (
         SELECT 1 FROM invoice_records
         WHERE business_id = rec.id AND invoice_stage = 'self_balance' AND record_type = 'original'
       )
    THEN
      DECLARE
        v_supply INTEGER;
        v_tax    INTEGER;
        v_total  INTEGER := rec.invoice_balance_amount;
      BEGIN
        v_supply := ROUND(v_total / 1.1);
        v_tax    := v_total - v_supply;
        INSERT INTO invoice_records (
          business_id, invoice_stage, record_type,
          issue_date, supply_amount, tax_amount, total_amount,
          payment_date, payment_amount
        ) VALUES (
          rec.id, 'self_balance', 'original',
          rec.invoice_balance_date, v_supply, v_tax, v_total,
          rec.payment_balance_date, COALESCE(rec.payment_balance_amount, 0)
        );
        v_count_inserted := v_count_inserted + 1;
      END;
    ELSE
      IF EXISTS (
        SELECT 1 FROM invoice_records
        WHERE business_id = rec.id AND invoice_stage = 'self_balance' AND record_type = 'original'
      ) THEN
        v_count_skipped := v_count_skipped + 1;
      END IF;
    END IF;

  END LOOP;

  -- ────────────────────────────────────────────────────────────────
  -- 결과 출력
  -- ────────────────────────────────────────────────────────────────
  RAISE NOTICE '====================================================';
  RAISE NOTICE '마이그레이션 완료';
  RAISE NOTICE '  처리한 사업장 수 : %', v_count_total;
  RAISE NOTICE '  삽입된 레코드 수 : %', v_count_inserted;
  RAISE NOTICE '  건너뛴 레코드 수 (기존 존재): %', v_count_skipped;
  RAISE NOTICE '====================================================';

END $$;

-- ────────────────────────────────────────────────────────────────
-- 검증: 마이그레이션 결과 확인
-- ────────────────────────────────────────────────────────────────
SELECT
  invoice_stage,
  COUNT(*) AS record_count,
  SUM(total_amount) AS total_invoice_amount,
  SUM(payment_amount) AS total_payment_amount,
  SUM(total_amount - payment_amount) AS total_receivable
FROM invoice_records
WHERE record_type = 'original'
GROUP BY invoice_stage
ORDER BY invoice_stage;
