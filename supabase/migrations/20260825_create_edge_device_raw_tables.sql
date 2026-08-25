-- 방지시설 전력량계 엣지디바이스: RS-485 원본 프레임 보존 + 구간 기반 가동상태 라벨 테이블 신설
--
-- 배경: measurement_history는 "시점 하나에 값 하나" scalar row 구조라 아래 두 가지를 담을 수 없음
-- (2026-08-19 결정, "방지시설 전력량계 데이터수집기" 프로젝트 context-notes.md 참고).
--   1) raw_frames — RS-485 원본 프레임 바이트. 레지스터맵이 역공학 상태라 파싱값만 저장하면
--      나중에 맵 오류가 밝혀져도 재파싱이 불가능하므로 원본 바이트를 별도 보존한다.
--   2) operation_status_label — 구간 기반 가동상태 라벨(예: "이 구간 동안 우회가동이었다").
--      measurement_history는 시점 하나에 값 하나인 구조라 구간 정보를 담지 못한다.

-- 1. RS-485 원본 프레임 보존
CREATE TABLE IF NOT EXISTS raw_frames (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES measurement_devices(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES business_info(id) ON DELETE CASCADE,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    payload BYTEA NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_frames_device_time ON raw_frames(device_id, captured_at DESC);

-- 2. 구간 기반 가동상태 라벨
-- facility_id는 이 스키마에 없으므로(business_info/discharge_outlets/prevention_facilities로 분리돼 있음),
-- measurement_history와 동일하게 business_id를 필수 앵커로 두고 prevention_facility_id는 선택 참조로 둔다.
CREATE TABLE IF NOT EXISTS operation_status_label (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    business_id UUID NOT NULL REFERENCES business_info(id) ON DELETE CASCADE,
    prevention_facility_id UUID REFERENCES prevention_facilities(id) ON DELETE SET NULL,

    start_ts TIMESTAMP WITH TIME ZONE NOT NULL,
    end_ts TIMESTAMP WITH TIME ZONE NOT NULL,
    label VARCHAR(30) NOT NULL, -- 예: 'normal_operation', 'bypass_operation', 'stopped'
    source VARCHAR(30) NOT NULL, -- 예: 'operator_manual', 'estimated'
    confidence DECIMAL(3,2) DEFAULT 1.00,
    notes TEXT,

    CHECK (end_ts > start_ts)
);

CREATE INDEX IF NOT EXISTS idx_operation_status_label_business_range ON operation_status_label(business_id, start_ts, end_ts);
CREATE INDEX IF NOT EXISTS idx_operation_status_label_facility_range ON operation_status_label(prevention_facility_id, start_ts, end_ts);

DROP TRIGGER IF EXISTS trigger_operation_status_label_updated_at ON operation_status_label;
CREATE TRIGGER trigger_operation_status_label_updated_at
  BEFORE UPDATE ON operation_status_label
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: 20260325_enable_rls_on_public_tables.sql과 동일한 "server only access" 패턴
ALTER TABLE raw_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_status_label ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_frames: server only access"
  ON raw_frames
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "operation_status_label: server only access"
  ON operation_status_label
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
