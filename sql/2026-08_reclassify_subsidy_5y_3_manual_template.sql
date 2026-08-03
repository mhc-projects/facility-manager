-- sql/2026-08_reclassify_subsidy_5y_3_manual_template.sql
--
-- 3단계: 2_apply.sql이 자동으로 처리하지 못한 "D: CONFLICT_MANUAL_REVIEW" 사업장을 사람이 직접 정리.
-- self_advance(자비)와 subsidy_1st(보조금) 양쪽에 실제 금액/입금 데이터가 모두 있어서, 어느 쪽이
-- 맞는 데이터인지 코드가 판단할 수 없는 경우다. 회계 담당자에게 실제 입금 내역(통장)을 대조해
-- 확인받은 뒤에 진행할 것.
--
-- 아래는 조사 시점(2026-08) 기준 유일한 대상이었던 '고양경일에너지(주)' 예시다.
-- 2_apply.sql 실행 후 나온 remaining_active_self_advance 건수가 1건보다 크면, 아래 쿼리로 대상을
-- 다시 조회해서 사업장마다 이 템플릿을 복사해 사업장명만 바꿔 실행할 것 (한 번에 하나씩, 결과 확인하며).

-- 현재 미처리 대상 조회
SELECT b.business_name,
  s.total_amount AS self_advance_amount, s.payment_amount AS self_advance_paid,
  s.issue_date AS self_issue_date, s.payment_date AS self_payment_date,
  u.total_amount AS subsidy_1st_amount, u.payment_amount AS subsidy_1st_paid,
  u.issue_date AS subsidy_issue_date, u.payment_date AS subsidy_payment_date
FROM business_info b
JOIN invoice_records s ON s.business_id = b.id AND s.invoice_stage = 'self_advance' AND s.record_type = 'original' AND s.is_active = true
JOIN invoice_records u ON u.business_id = b.id AND u.invoice_stage = 'subsidy_1st' AND u.record_type = 'original' AND u.is_active = true
WHERE b.is_deleted = false AND b.progress_status = '보조금(5년경과)';

-- ========================================
-- 아래 템플릿: 위 조회 결과를 보고 "self_advance 쪽 입금 기록이 맞다"고 확인된 경우에만 사용.
-- (반대로 subsidy_1st 쪽이 맞다면 이 템플릿을 쓰지 말고 저에게 알려주세요 - 다른 방향의 SQL이 필요합니다.)
-- <사업장명> 부분을 실제 사업장명으로 바꾼 뒤, 맨 앞의 -- 를 지우고 실행하세요.
-- ========================================

-- BEGIN;
--
-- UPDATE invoice_records
-- SET payment_amount = (
--       SELECT payment_amount FROM invoice_records
--       WHERE business_id = (SELECT id FROM business_info WHERE business_name = '<사업장명>')
--         AND invoice_stage = 'self_advance' AND record_type = 'original' AND is_active = true
--     ),
--     payment_date = (
--       SELECT payment_date FROM invoice_records
--       WHERE business_id = (SELECT id FROM business_info WHERE business_name = '<사업장명>')
--         AND invoice_stage = 'self_advance' AND record_type = 'original' AND is_active = true
--     ),
--     updated_at = NOW()
-- WHERE business_id = (SELECT id FROM business_info WHERE business_name = '<사업장명>')
--   AND invoice_stage = 'subsidy_1st' AND record_type = 'original' AND is_active = true;
--
-- UPDATE invoice_records
-- SET is_active = false, updated_at = NOW()
-- WHERE business_id = (SELECT id FROM business_info WHERE business_name = '<사업장명>')
--   AND invoice_stage = 'self_advance' AND record_type = 'original' AND is_active = true;
--
-- COMMIT;

-- 예시(고양경일에너지(주), 조사 시점 데이터 기준 - 실행 전 위 조회 쿼리로 최신 값 다시 확인할 것):
-- self_advance: 4,510,000원 발행 / 2,050,000원 입금 (2026-06-17)
-- subsidy_1st : 4,510,000원 발행(동일) / 0원 입금
-- → 실제로는 2,050,000원이 입금됐는데 기록이 잘못된 쪽(self_advance)에 남아있던 것으로 보임.
