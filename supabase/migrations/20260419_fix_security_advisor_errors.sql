-- Security Advisor 오류 수정
-- 1. SECURITY DEFINER View → SECURITY INVOKER로 재생성
-- 2. manufacturers 테이블 RLS 활성화 확인

-- ────────────────────────────────────────────
-- 1. v_business_payment_status: security_invoker 적용
-- ────────────────────────────────────────────
DROP VIEW IF EXISTS v_business_payment_status;

CREATE VIEW v_business_payment_status
  WITH (security_invoker = true)
AS
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

    WHEN b.installation_date IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM installation_payments ip
      WHERE ip.business_id = b.id AND ip.payment_type = 'final' AND ip.status = 'paid'
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

COMMENT ON VIEW v_business_payment_status IS '사업장별 설치비 지급 상태 (본마감 독립 작동)';

-- ────────────────────────────────────────────
-- 2. facility_tasks_with_business: security_invoker 적용
-- ────────────────────────────────────────────
DROP VIEW IF EXISTS facility_tasks_with_business;

CREATE VIEW facility_tasks_with_business
  WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.created_at,
  t.updated_at,
  t.title,
  t.description,
  COALESCE(b.business_name, t.business_name) AS business_name,
  t.business_id,
  CASE
    WHEN b.progress_status ILIKE '%보조금%'  THEN 'subsidy'
    WHEN b.progress_status ILIKE '%자비%'    THEN 'self'
    WHEN b.progress_status = 'AS'            THEN 'as'
    WHEN b.progress_status ILIKE '%외주%'    THEN 'outsourcing'
    WHEN b.progress_status ILIKE '%대리점%'  THEN 'dealer'
    WHEN b.progress_status IN ('진행불가', '확인필요') THEN 'etc'
    ELSE 'etc'
  END::varchar(20) AS task_type,
  b.progress_status,
  t.status,
  t.priority,
  t.assignee,
  t.assignees,
  t.primary_assignee_id,
  t.assignee_updated_at,
  t.start_date,
  t.due_date,
  t.completed_at,
  t.notes,
  t.created_by,
  t.created_by_name,
  t.last_modified_by,
  t.last_modified_by_name,
  t.is_active,
  t.is_deleted,
  b.address,
  b.manager_name,
  b.manager_contact,
  b.local_government,
  b.construction_report_submitted_at AS construction_report_date,
  b.installation_date,
  b.order_date,
  b.attachment_completion_submitted_at,
  b.greenlink_confirmation_submitted_at,
  creator.name  AS created_by_user_name,
  creator.email AS created_by_user_email,
  creator.permission_level AS created_by_permission_level,
  modifier.name  AS last_modified_by_user_name,
  modifier.email AS last_modified_by_user_email,
  modifier.permission_level AS last_modified_by_permission_level
FROM facility_tasks t
LEFT JOIN business_info b
  ON t.business_id = b.id
  OR (t.business_id IS NULL AND t.business_name = b.business_name)
LEFT JOIN employees creator  ON t.created_by      = creator.id
LEFT JOIN employees modifier ON t.last_modified_by = modifier.id
WHERE t.is_active = true AND t.is_deleted = false;

COMMENT ON VIEW facility_tasks_with_business IS
  'task_type은 business_info.progress_status에서 실시간 파생됨. business_name은 business_info의 현재 사업장명을 우선 반영함 (동기화).';

-- ────────────────────────────────────────────
-- 3. manufacturers RLS 강제 활성화 (멱등)
-- ────────────────────────────────────────────
ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;

-- 이미 존재할 수 있으므로 DROP 후 재생성
DROP POLICY IF EXISTS "manufacturers_select_all" ON manufacturers;
DROP POLICY IF EXISTS "manufacturers_insert_admin" ON manufacturers;
DROP POLICY IF EXISTS "manufacturers_update_admin" ON manufacturers;
DROP POLICY IF EXISTS "manufacturers_delete_admin" ON manufacturers;

CREATE POLICY "manufacturers_select_all" ON manufacturers
  FOR SELECT USING (true);

CREATE POLICY "manufacturers_insert_admin" ON manufacturers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "manufacturers_update_admin" ON manufacturers
  FOR UPDATE USING (true);

CREATE POLICY "manufacturers_delete_admin" ON manufacturers
  FOR DELETE USING (true);
