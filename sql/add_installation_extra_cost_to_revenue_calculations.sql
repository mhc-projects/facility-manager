-- ============================================================================
-- revenue_calculations 테이블에 installation_extra_cost 컬럼 추가
-- 생성일: 2026-04-06
-- 목적: 기본설치비와 추가설치비를 분리하여 저장 (엑셀 내보내기 정확도 향상)
-- ============================================================================

-- 1. 컬럼 추가
ALTER TABLE revenue_calculations
ADD COLUMN IF NOT EXISTS installation_extra_cost DECIMAL(10,2) NOT NULL DEFAULT 0;

-- 2. 컬럼 설명
COMMENT ON COLUMN revenue_calculations.installation_extra_cost IS '추가설치비 (설치팀 요청 추가 비용, installation_costs와 별도 관리)';

-- 3. 기존 데이터 보정: installation_costs에 합산되어 있던 추가설치비를 분리
-- business_info.installation_extra_cost 값을 revenue_calculations에 옮기고,
-- installation_costs에서 해당 금액을 차감
UPDATE revenue_calculations rc
SET
  installation_extra_cost = COALESCE(bi.installation_extra_cost, 0),
  installation_costs = rc.installation_costs - COALESCE(bi.installation_extra_cost, 0)
FROM business_info bi
WHERE rc.business_id = bi.id
  AND COALESCE(bi.installation_extra_cost, 0) > 0
  AND rc.installation_extra_cost = 0;
