-- DPF 접수 분류에 '경과 크리닝'(clean_elapsed) 추가 — 기존 'clean'은 코드 변경 없이 '정기 크리닝'으로 라벨만 바뀐다
-- 기존 행의 category를 UPDATE하지 않는 이유: round_no 트리거가 재채번하고 converted_from_category를 채워 "전환" 배지가 붙기 때문.

ALTER TABLE dpf_service_records DROP CONSTRAINT IF EXISTS dpf_service_records_category_check;
ALTER TABLE dpf_service_records ADD CONSTRAINT dpf_service_records_category_check
  CHECK (category IN ('as','clean','clean_elapsed','cs','parts_delivery','urea','engine_replace'));

ALTER TABLE dpf_service_records DROP CONSTRAINT IF EXISTS dpf_service_records_converted_from_category_check;
ALTER TABLE dpf_service_records ADD CONSTRAINT dpf_service_records_converted_from_category_check
  CHECK (converted_from_category IN ('as','clean','clean_elapsed','cs','parts_delivery','urea','engine_replace'));
