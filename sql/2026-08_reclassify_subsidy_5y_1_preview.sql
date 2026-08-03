-- sql/2026-08_reclassify_subsidy_5y_1_preview.sql
--
-- 1단계: 미리보기 (읽기 전용, 아무것도 바꾸지 않음)
-- 이 파일만 먼저 실행해서 결과를 확인하세요. 확인이 끝나면 2_apply.sql을 실행합니다.
--
-- action_group이 다음 중 하나로 나옵니다:
--   no_invoice_records        : 조치 불필요
--   already_subsidy           : 조치 불필요
--   A: relabel_self_to_subsidy_1st       : 2단계에서 자동 처리됨
--   B: empty_self_shell_deactivate       : 2단계에서 자동 처리됨
--   C: empty_subsidy_shell_promote_self  : 2단계에서 자동 처리됨
--   D: CONFLICT_MANUAL_REVIEW            : 자동 처리 안 됨 - 3_manual_template.sql로 사람이 직접 판단
--   UNEXPECTED_MULTIPLE_ROWS             : 이 상태가 하나라도 있으면 2_apply.sql을 실행하지 말고 먼저 알려주세요

WITH target AS (
  SELECT id, business_name
  FROM business_info
  WHERE is_deleted = false AND progress_status = '보조금(5년경과)'
),
self_row AS (
  SELECT business_id, count(*) AS n,
    (array_agg(id ORDER BY created_at ASC))[1] AS id,
    (array_agg(total_amount ORDER BY created_at ASC))[1] AS total_amount,
    (array_agg(payment_amount ORDER BY created_at ASC))[1] AS payment_amount,
    (array_agg(issue_date ORDER BY created_at ASC))[1] AS issue_date,
    (array_agg(payment_date ORDER BY created_at ASC))[1] AS payment_date
  FROM invoice_records
  WHERE invoice_stage = 'self_advance' AND record_type = 'original' AND is_active = true
  GROUP BY business_id
),
sub_row AS (
  SELECT business_id, count(*) AS n,
    (array_agg(id ORDER BY created_at ASC))[1] AS id,
    (array_agg(total_amount ORDER BY created_at ASC))[1] AS total_amount,
    (array_agg(payment_amount ORDER BY created_at ASC))[1] AS payment_amount,
    (array_agg(issue_date ORDER BY created_at ASC))[1] AS issue_date,
    (array_agg(payment_date ORDER BY created_at ASC))[1] AS payment_date
  FROM invoice_records
  WHERE invoice_stage = 'subsidy_1st' AND record_type = 'original' AND is_active = true
  GROUP BY business_id
)
SELECT
  t.business_name,
  s.n AS self_row_count, u.n AS subsidy_row_count,
  s.total_amount AS self_advance_amount, s.payment_amount AS self_advance_paid,
  u.total_amount AS subsidy_1st_amount, u.payment_amount AS subsidy_1st_paid,
  CASE
    WHEN COALESCE(s.n, 0) > 1 OR COALESCE(u.n, 0) > 1
      THEN 'UNEXPECTED_MULTIPLE_ROWS (반드시 직접 확인 후 진행)'
    WHEN s.id IS NULL AND u.id IS NULL THEN 'no_invoice_records (조치 불필요)'
    WHEN s.id IS NULL AND u.id IS NOT NULL THEN 'already_subsidy (조치 불필요)'
    WHEN s.id IS NOT NULL AND u.id IS NULL THEN 'A: relabel_self_to_subsidy_1st'
    WHEN s.id IS NOT NULL AND u.id IS NOT NULL
      AND COALESCE(s.total_amount,0) = 0 AND COALESCE(s.payment_amount,0) = 0
      AND s.issue_date IS NULL AND s.payment_date IS NULL
      THEN 'B: empty_self_shell_deactivate'
    WHEN s.id IS NOT NULL AND u.id IS NOT NULL
      AND COALESCE(u.total_amount,0) = 0 AND COALESCE(u.payment_amount,0) = 0
      AND u.issue_date IS NULL AND u.payment_date IS NULL
      THEN 'C: empty_subsidy_shell_promote_self'
    ELSE 'D: CONFLICT_MANUAL_REVIEW'
  END AS action_group
FROM target t
LEFT JOIN self_row s ON s.business_id = t.id
LEFT JOIN sub_row u ON u.business_id = t.id
ORDER BY action_group, t.business_name;
