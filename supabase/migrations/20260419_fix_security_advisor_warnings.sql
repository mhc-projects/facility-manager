-- Security Advisor WARN 항목 수정
-- 1. function_search_path_mutable: update_updated_at_column, generate_document_number
-- 2. rls_policy_always_true: 여러 테이블의 USING(true) 정책을 인증 사용자로 제한
-- 3. public_bucket_allows_listing: facility-files 스토리지 목록 조회 제한

-- ────────────────────────────────────────────
-- 1. Function search_path 고정
-- ────────────────────────────────────────────

-- update_updated_at_column: SET search_path = '' 추가
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- generate_document_number: SET search_path = '' 추가 + 테이블명 public. 접두사
CREATE OR REPLACE FUNCTION public.generate_document_number(p_type VARCHAR)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_code   VARCHAR(3);
  v_date   VARCHAR(8);
  v_seq    INT;
  v_number VARCHAR(80);
BEGIN
  v_code := CASE p_type
    WHEN 'expense_claim'       THEN 'EXP'
    WHEN 'purchase_request'    THEN 'PUR'
    WHEN 'leave_request'       THEN 'LVE'
    WHEN 'business_proposal'   THEN 'PRO'
    WHEN 'overtime_log'        THEN 'OVT'
    WHEN 'installation_closing' THEN 'ICL'
    ELSE 'ETC'
  END;

  v_date := TO_CHAR(NOW(), 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(document_number FROM LENGTH('BLUEON-' || v_code || '-' || v_date || '-') + 1) AS INT)
  ), 0) + 1
  INTO v_seq
  FROM public.approval_documents
  WHERE document_number LIKE 'BLUEON-' || v_code || '-' || v_date || '-%';

  v_number := 'BLUEON-' || v_code || '-' || v_date || '-' || LPAD(v_seq::TEXT, 3, '0');

  RETURN v_number;
END;
$$;

-- ────────────────────────────────────────────
-- 2. RLS 정책: USING(true) → 인증 사용자로 제한
-- ────────────────────────────────────────────

-- installation_payments: 로그인 사용자만 접근
DROP POLICY IF EXISTS "service_role_all_installation_payments" ON public.installation_payments;
CREATE POLICY "authenticated_all_installation_payments" ON public.installation_payments
  FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- eungyeol_transfers: 로그인 사용자만 접근
DROP POLICY IF EXISTS "service_role_all_eungyeol_transfers" ON public.eungyeol_transfers;
CREATE POLICY "authenticated_all_eungyeol_transfers" ON public.eungyeol_transfers
  FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- closing_records: 로그인 사용자만 접근
DROP POLICY IF EXISTS "service_role_all_closing_records" ON public.closing_records;
CREATE POLICY "authenticated_all_closing_records" ON public.closing_records
  FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- business_photo_categories: 로그인 사용자만 접근
DROP POLICY IF EXISTS "Allow all access to business_photo_categories" ON public.business_photo_categories;
CREATE POLICY "authenticated_all_business_photo_categories" ON public.business_photo_categories
  FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- manufacturers: 읽기는 모두, 쓰기는 관리자(permission_level >= 3)만
DROP POLICY IF EXISTS "manufacturers_insert_admin" ON public.manufacturers;
DROP POLICY IF EXISTS "manufacturers_update_admin" ON public.manufacturers;
DROP POLICY IF EXISTS "manufacturers_delete_admin" ON public.manufacturers;

CREATE POLICY "manufacturers_insert_admin" ON public.manufacturers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = auth.uid()
        AND permission_level >= 3
        AND is_active = true
    )
  );

CREATE POLICY "manufacturers_update_admin" ON public.manufacturers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = auth.uid()
        AND permission_level >= 3
        AND is_active = true
    )
  );

CREATE POLICY "manufacturers_delete_admin" ON public.manufacturers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = auth.uid()
        AND permission_level >= 3
        AND is_active = true
    )
  );

-- ────────────────────────────────────────────
-- 3. facility-files 스토리지: 목록 조회를 인증 사용자로 제한
--    (공개 URL 직접 접근은 버킷 public 설정으로 유지됨)
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow public read from facility-files" ON storage.objects;

CREATE POLICY "Allow authenticated read from facility-files" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'facility-files' AND auth.role() = 'authenticated');
