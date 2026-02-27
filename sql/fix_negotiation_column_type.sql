-- negotiation 컬럼을 VARCHAR(255)에서 INTEGER로 변경
-- 기존 데이터: 숫자로 변환 가능한 값은 INTEGER로, 불가능한 값(텍스트)은 NULL로 처리

ALTER TABLE business_info
  ALTER COLUMN negotiation TYPE INTEGER
  USING CASE
    WHEN negotiation IS NULL OR negotiation = '' THEN NULL
    WHEN negotiation ~ '^[0-9,]+$' THEN replace(negotiation, ',', '')::INTEGER
    ELSE NULL
  END;

COMMENT ON COLUMN business_info.negotiation IS '협의사항 할인 금액 (원)';
