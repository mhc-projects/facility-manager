-- AS 건 테이블에 출고일 직접 입력 컬럼 추가
-- 사업장 미연결(business_name_raw) 또는 business_info에 delivery_date가 없는 경우 사용
-- 유상/무상 자동 계산 우선순위: is_paid_override > delivery_date_override > business_info.delivery_date

ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS delivery_date_override DATE DEFAULT NULL;

COMMENT ON COLUMN as_records.delivery_date_override IS '출고일 직접 입력 (사업장 미연결 또는 사업장 출고일 미등록 시 사용). 유무상 계산 기준: is_paid_override > delivery_date_override > business_info.delivery_date';
