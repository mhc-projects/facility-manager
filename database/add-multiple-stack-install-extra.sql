-- 복수굴뚝 설치비 전용 추가 수량 컬럼 추가
-- 매출 계산에는 영향을 주지 않고, 기본 설치비 계산에만 반영되는 추가 수량
-- 예: 4채널 복수굴뚝 1개 → 매출 ×1, 설치비 ×1(기본) + ×N(추가)

ALTER TABLE business_info
  ADD COLUMN IF NOT EXISTS multiple_stack_install_extra INTEGER DEFAULT 0;

COMMENT ON COLUMN business_info.multiple_stack_install_extra IS
  '복수굴뚝 설치비 전용 추가 수량. 매출 계산에는 반영되지 않으며, 채널 수 기준 차이분을 보정하기 위해 사용.';
