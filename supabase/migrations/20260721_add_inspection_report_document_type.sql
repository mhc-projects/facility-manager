-- 검수보고서 document_type 추가
-- approval_documents 체크 제약에 'inspection_report' 값 추가 + 문서번호 코드(INS) 등록

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
      'commission_closing',
      'business_trip_report',
      'inspection_report'
    ));

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
    WHEN 'expense_claim'        THEN 'EXP'
    WHEN 'purchase_request'     THEN 'PUR'
    WHEN 'leave_request'        THEN 'LVE'
    WHEN 'business_proposal'    THEN 'PRO'
    WHEN 'overtime_log'         THEN 'OVT'
    WHEN 'installation_closing' THEN 'ICL'
    WHEN 'inspection_report'    THEN 'INS'
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

COMMENT ON FUNCTION generate_document_number IS 'BLUEON-{TYPE}-YYYYMMDD-{SEQ3} 형식 문서번호 생성 (INS: 검수보고서 추가)';
