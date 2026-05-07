-- 업무단계에 예측마감 대상 여부 컬럼 추가
ALTER TABLE task_stages
  ADD COLUMN IF NOT EXISTS is_forecast_target BOOLEAN NOT NULL DEFAULT false;

-- 기존 하드코딩된 7개 단계를 예측마감 대상으로 초기 설정
UPDATE task_stages
SET is_forecast_target = true
WHERE stage_key IN (
  'self_product_order',
  'self_installation_schedule',
  'subsidy_product_order',
  'subsidy_installation_schedule',
  'outsourcing_order',
  'outsourcing_schedule',
  'outsourcing_in_progress'
);
