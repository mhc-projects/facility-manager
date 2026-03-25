-- Migration: 보안 경고(WARN) 47개 해소
-- Created: 2026-03-25
--
-- 유형 1: function_search_path_mutable (4개)
--   함수에 SET search_path = '' 추가
--   → search_path 인젝션 공격 방어
--
-- 유형 2: rls_policy_always_true (43개)
--   기존 USING (true) 정책 삭제 후 서버 전용 정책으로 교체
--   → 이 프로젝트는 service_role 키로만 접근하므로 앱 동작 영향 없음

-- ============================================================
-- PART 1: Function Search Path Fix (4 functions)
-- ============================================================

-- 1-1. update_approval_documents_updated_at
CREATE OR REPLACE FUNCTION public.update_approval_documents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1-2. generate_document_number
CREATE OR REPLACE FUNCTION public.generate_document_number(p_type CHARACTER VARYING)
RETURNS CHARACTER VARYING
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_type_code VARCHAR(5);
  v_date      VARCHAR(8);
  v_seq       INT;
  v_seq_str   VARCHAR(3);
  v_prefix    VARCHAR(20);
BEGIN
  -- 유형 코드 매핑
  v_type_code := CASE p_type
    WHEN 'expense_claim'     THEN 'EXP'
    WHEN 'purchase_request'  THEN 'PUR'
    WHEN 'leave_request'     THEN 'LVE'
    WHEN 'business_proposal' THEN 'PRO'
    WHEN 'overtime_log'      THEN 'OVT'
    ELSE 'ETC'
  END;

  v_date   := TO_CHAR(NOW(), 'YYYYMMDD');
  v_prefix := 'BLUEON-' || v_type_code || '-' || v_date || '-';

  -- 당일 해당 유형 문서 시퀀스 최대값 + 1
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(document_number FROM LENGTH(v_prefix) + 1) AS INT)),
    0
  ) + 1
  INTO v_seq
  FROM public.approval_documents
  WHERE document_number LIKE v_prefix || '%';

  v_seq_str := LPAD(v_seq::TEXT, 3, '0');

  RETURN v_prefix || v_seq_str;
END;
$$;

-- 1-3. update_dev_work_log_updated_at
CREATE OR REPLACE FUNCTION public.update_dev_work_log_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1-4. log_data_history
-- 원본이 SECURITY DEFINER이므로 유지 (search_path만 추가)
CREATE OR REPLACE FUNCTION public.log_data_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.data_history (
      table_name, record_id, operation, old_data, new_data, created_at
    ) VALUES (
      TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD)::jsonb, NULL, NOW()
    );
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.data_history (
      table_name, record_id, operation, old_data, new_data, created_at
    ) VALUES (
      TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, NOW()
    );
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO public.data_history (
      table_name, record_id, operation, old_data, new_data, created_at
    ) VALUES (
      TG_TABLE_NAME, NEW.id, 'INSERT', NULL, row_to_json(NEW)::jsonb, NOW()
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================================
-- PART 2: RLS Policy Replacement (43 warnings across 22 tables)
-- 전략: 기존 USING(true) 정책 DROP → server-only 정책으로 교체
-- ============================================================

-- 2-1. air_permit_info
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.air_permit_info;
CREATE POLICY "air_permit_info: server only access"
  ON public.air_permit_info FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-2. approval_documents
DROP POLICY IF EXISTS "approval_documents_insert" ON public.approval_documents;
DROP POLICY IF EXISTS "approval_documents_update" ON public.approval_documents;
CREATE POLICY "approval_documents: server only write"
  ON public.approval_documents FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-3. approval_steps
DROP POLICY IF EXISTS "approval_steps_delete" ON public.approval_steps;
DROP POLICY IF EXISTS "approval_steps_insert" ON public.approval_steps;
DROP POLICY IF EXISTS "approval_steps_update" ON public.approval_steps;
CREATE POLICY "approval_steps: server only write"
  ON public.approval_steps FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-4. auto_memo_deletion_logs
DROP POLICY IF EXISTS "System can insert deletion logs" ON public.auto_memo_deletion_logs;
CREATE POLICY "auto_memo_deletion_logs: server only access"
  ON public.auto_memo_deletion_logs FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-5. business_info
DROP POLICY IF EXISTS "Enable all access" ON public.business_info;
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.business_info;
CREATE POLICY "business_info: server only access"
  ON public.business_info FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-6. business_memos
DROP POLICY IF EXISTS "Enable all access for business_memos" ON public.business_memos;
CREATE POLICY "business_memos: server only access"
  ON public.business_memos FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-7. businesses
DROP POLICY IF EXISTS "모든 작업 허용 - businesses" ON public.businesses;
CREATE POLICY "businesses: server only access"
  ON public.businesses FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-8. contract_history
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.contract_history;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.contract_history;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.contract_history;
CREATE POLICY "contract_history: server only access"
  ON public.contract_history FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-9. contract_templates
DROP POLICY IF EXISTS "Enable update access for templates" ON public.contract_templates;
CREATE POLICY "contract_templates: server only write"
  ON public.contract_templates FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-10. discharge_facilities
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.discharge_facilities;
CREATE POLICY "discharge_facilities: server only access"
  ON public.discharge_facilities FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-11. discharge_outlets
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.discharge_outlets;
CREATE POLICY "discharge_outlets: server only access"
  ON public.discharge_outlets FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-12. document_history
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.document_history;
CREATE POLICY "document_history: server only access"
  ON public.document_history FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-13. document_templates
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.document_templates;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.document_templates;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.document_templates;
CREATE POLICY "document_templates: server only access"
  ON public.document_templates FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-14. equipment_field_checks
DROP POLICY IF EXISTS "Authenticated users can create checks" ON public.equipment_field_checks;
DROP POLICY IF EXISTS "Users can update checks" ON public.equipment_field_checks;
CREATE POLICY "equipment_field_checks: server only write"
  ON public.equipment_field_checks FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-15. facilities
DROP POLICY IF EXISTS "모든 작업 허용 - facilities" ON public.facilities;
CREATE POLICY "facilities: server only access"
  ON public.facilities FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-16. invoice_records
DROP POLICY IF EXISTS "authenticated_all_invoice_records" ON public.invoice_records;
CREATE POLICY "invoice_records: server only access"
  ON public.invoice_records FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-17. miscellaneous_costs
DROP POLICY IF EXISTS "authenticated_all_miscellaneous_costs" ON public.miscellaneous_costs;
CREATE POLICY "miscellaneous_costs: server only access"
  ON public.miscellaneous_costs FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-18. monthly_closings
DROP POLICY IF EXISTS "authenticated_all_monthly_closings" ON public.monthly_closings;
CREATE POLICY "monthly_closings: server only access"
  ON public.monthly_closings FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-19. notifications
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications: server only write"
  ON public.notifications FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-20. order_management
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.order_management;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.order_management;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.order_management;
CREATE POLICY "order_management: server only access"
  ON public.order_management FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-21. prevention_facilities
DROP POLICY IF EXISTS "Enable all operations for all users" ON public.prevention_facilities;
CREATE POLICY "prevention_facilities: server only access"
  ON public.prevention_facilities FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-22. router_inventory
DROP POLICY IF EXISTS "Router inventory is manageable by authenticated users" ON public.router_inventory;
CREATE POLICY "router_inventory: server only access"
  ON public.router_inventory FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-23. sync_queue
DROP POLICY IF EXISTS "모든 작업 허용 - sync_queue" ON public.sync_queue;
CREATE POLICY "sync_queue: server only access"
  ON public.sync_queue FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 2-24. task_status_history
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.task_status_history;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.task_status_history;
CREATE POLICY "task_status_history: server only access"
  ON public.task_status_history FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
