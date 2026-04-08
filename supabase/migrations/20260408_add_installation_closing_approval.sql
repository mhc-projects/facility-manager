-- 전자결재 문서번호 생성 함수에 설치비 마감 타입 추가
-- 기존 generate_document_number 함수의 CASE 구문에 installation_closing → ICL 추가

CREATE OR REPLACE FUNCTION generate_document_number(p_type VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_code VARCHAR(3);
  v_date VARCHAR(8);
  v_seq INT;
  v_number VARCHAR(80);
BEGIN
  v_code := CASE p_type
    WHEN 'expense_claim' THEN 'EXP'
    WHEN 'purchase_request' THEN 'PUR'
    WHEN 'leave_request' THEN 'LVE'
    WHEN 'business_proposal' THEN 'PRO'
    WHEN 'overtime_log' THEN 'OVT'
    WHEN 'installation_closing' THEN 'ICL'
    ELSE 'ETC'
  END;

  v_date := TO_CHAR(NOW(), 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(document_number FROM LENGTH('BLUEON-' || v_code || '-' || v_date || '-') + 1) AS INT)
  ), 0) + 1
  INTO v_seq
  FROM approval_documents
  WHERE document_number LIKE 'BLUEON-' || v_code || '-' || v_date || '-%';

  v_number := 'BLUEON-' || v_code || '-' || v_date || '-' || LPAD(v_seq::TEXT, 3, '0');

  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_document_number IS '전자결재 문서번호 자동 생성 (ICL: 설치비 마감 추가)';
