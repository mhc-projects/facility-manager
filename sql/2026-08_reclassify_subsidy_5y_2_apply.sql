-- sql/2026-08_reclassify_subsidy_5y_2_apply.sql
--
-- 2단계: 실제 반영 (이 파일은 데이터를 변경하고 즉시 COMMIT합니다)
-- 반드시 1_preview.sql을 먼저 실행해서 결과를 확인한 뒤에 이 파일을 실행하세요.
-- 이 파일 하나를 통째로 "실행"(Run) 하면 백업 생성 → 자동 이관 → 검증 → COMMIT까지 한 번에 끝납니다.
-- (이전 버전은 COMMIT을 사람이 나중에 따로 누르게 만들었는데, Supabase SQL 에디터가 그 방식을
--  지원하지 않아 트랜잭션이 저장되지 않고 사라졌습니다. 이번 버전은 그 문제를 없앴습니다.)
--
-- 실행 후 아래 마지막 결과(검증 쿼리)에서 remaining_active_self_advance 값이 1_preview.sql에서 본
-- "D: CONFLICT_MANUAL_REVIEW" 건수와 정확히 같은지 확인하세요. 다르면 저에게 바로 알려주세요
-- (백업 테이블 invoice_records_backup_20260800_subsidy5y로 되돌릴 수 있습니다).

BEGIN;

-- STEP 1. 백업
CREATE TABLE IF NOT EXISTS invoice_records_backup_20260800_subsidy5y AS
SELECT ir.*
FROM invoice_records ir
JOIN business_info b ON b.id = ir.business_id
WHERE b.is_deleted = false AND b.progress_status = '보조금(5년경과)';

-- STEP 2. [규칙 A] subsidy_1st 원본이 아예 없는 경우 → self_advance를 subsidy_1st로 개명
UPDATE invoice_records ir
SET invoice_stage = 'subsidy_1st', updated_at = NOW()
FROM business_info b
WHERE ir.business_id = b.id
  AND b.is_deleted = false
  AND b.progress_status = '보조금(5년경과)'
  AND ir.invoice_stage = 'self_advance'
  AND ir.record_type = 'original'
  AND ir.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM invoice_records ir2
    WHERE ir2.business_id = ir.business_id
      AND ir2.invoice_stage = 'subsidy_1st'
      AND ir2.record_type = 'original'
      AND ir2.is_active = true
  );

-- STEP 3. [규칙 C] subsidy_1st가 빈 껍데기이고 self_advance에 실제 데이터가 있는 경우
--   (a) 빈 subsidy_1st 비활성화
UPDATE invoice_records ir
SET is_active = false, updated_at = NOW()
FROM business_info b
WHERE ir.business_id = b.id
  AND b.is_deleted = false
  AND b.progress_status = '보조금(5년경과)'
  AND ir.invoice_stage = 'subsidy_1st'
  AND ir.record_type = 'original'
  AND ir.is_active = true
  AND COALESCE(ir.total_amount, 0) = 0
  AND COALESCE(ir.payment_amount, 0) = 0
  AND ir.issue_date IS NULL
  AND ir.payment_date IS NULL
  AND EXISTS (
    SELECT 1 FROM invoice_records ir2
    WHERE ir2.business_id = ir.business_id
      AND ir2.invoice_stage = 'self_advance'
      AND ir2.record_type = 'original'
      AND ir2.is_active = true
      AND NOT (
        COALESCE(ir2.total_amount, 0) = 0 AND COALESCE(ir2.payment_amount, 0) = 0
        AND ir2.issue_date IS NULL AND ir2.payment_date IS NULL
      )
  );

--   (b) 빈 subsidy_1st를 치웠으니 이제 self_advance를 subsidy_1st로 개명 (STEP 2와 동일 조건)
UPDATE invoice_records ir
SET invoice_stage = 'subsidy_1st', updated_at = NOW()
FROM business_info b
WHERE ir.business_id = b.id
  AND b.is_deleted = false
  AND b.progress_status = '보조금(5년경과)'
  AND ir.invoice_stage = 'self_advance'
  AND ir.record_type = 'original'
  AND ir.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM invoice_records ir2
    WHERE ir2.business_id = ir.business_id
      AND ir2.invoice_stage = 'subsidy_1st'
      AND ir2.record_type = 'original'
      AND ir2.is_active = true
  );

-- STEP 4. [규칙 B] 이미 subsidy_1st가 있고 self_advance가 완전히 빈 레코드인 경우 → self_advance 비활성화
UPDATE invoice_records ir
SET is_active = false, updated_at = NOW()
FROM business_info b
WHERE ir.business_id = b.id
  AND b.is_deleted = false
  AND b.progress_status = '보조금(5년경과)'
  AND ir.invoice_stage = 'self_advance'
  AND ir.record_type = 'original'
  AND ir.is_active = true
  AND COALESCE(ir.total_amount, 0) = 0
  AND COALESCE(ir.payment_amount, 0) = 0
  AND ir.issue_date IS NULL
  AND ir.payment_date IS NULL
  AND EXISTS (
    SELECT 1 FROM invoice_records ir2
    WHERE ir2.business_id = ir.business_id
      AND ir2.invoice_stage = 'subsidy_1st'
      AND ir2.record_type = 'original'
      AND ir2.is_active = true
  );

-- STEP 5. 검증 (이 결과가 마지막에 표시됩니다)
SELECT
  (SELECT count(*) FROM invoice_records ir JOIN business_info b ON b.id = ir.business_id
    WHERE b.is_deleted = false AND b.progress_status = '보조금(5년경과)'
      AND ir.invoice_stage = 'self_advance' AND ir.record_type = 'original' AND ir.is_active = true
  ) AS remaining_active_self_advance,   -- 1_preview.sql의 CONFLICT_MANUAL_REVIEW 건수와 같아야 정상
  (SELECT count(*) FROM invoice_records ir JOIN business_info b ON b.id = ir.business_id
    WHERE b.is_deleted = false AND b.progress_status = '보조금(5년경과)'
      AND ir.invoice_stage = 'subsidy_1st' AND ir.record_type = 'original' AND ir.is_active = true
  ) AS active_subsidy_1st;

COMMIT;
