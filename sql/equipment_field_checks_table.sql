-- 측정기기 현장 확인 기록 테이블
-- 현장에서 입력한 측정기기 수량과 사무실 관리 데이터를 분리하여 관리
-- Admin 승인 후 사업장 정보로 반영 가능

CREATE TABLE IF NOT EXISTS equipment_field_checks (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- 측정기기 수량 (현장 확인)
  discharge_flowmeter INTEGER DEFAULT 0 CHECK (discharge_flowmeter >= 0),
  supply_flowmeter INTEGER DEFAULT 0 CHECK (supply_flowmeter >= 0),

  -- 메타데이터
  checked_by VARCHAR(100),                 -- 확인자 (사용자 이름)
  checked_at TIMESTAMP DEFAULT NOW(),      -- 확인 시각
  check_location VARCHAR(200),             -- 확인 장소 (선택사항)
  notes TEXT,                              -- 메모 (특이사항)

  -- 상태 관리
  is_synced BOOLEAN DEFAULT FALSE,         -- 사무실 데이터로 반영 여부
  synced_at TIMESTAMP,                     -- 반영 시각
  synced_by VARCHAR(100),                  -- 반영자

  -- 타임스탬프
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_equipment_field_checks_business_id
  ON equipment_field_checks(business_id);

CREATE INDEX IF NOT EXISTS idx_equipment_field_checks_checked_at
  ON equipment_field_checks(checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_equipment_field_checks_is_synced
  ON equipment_field_checks(is_synced);

-- RLS (Row Level Security) 정책
ALTER TABLE equipment_field_checks ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있을 경우)
DROP POLICY IF EXISTS "Anyone can read equipment checks" ON equipment_field_checks;
DROP POLICY IF EXISTS "Authenticated users can create checks" ON equipment_field_checks;
DROP POLICY IF EXISTS "Users can update own checks" ON equipment_field_checks;

-- 모든 사용자가 읽기 가능
CREATE POLICY "Anyone can read equipment checks"
  ON equipment_field_checks
  FOR SELECT
  USING (true);

-- 인증된 사용자가 생성 가능
CREATE POLICY "Authenticated users can create checks"
  ON equipment_field_checks
  FOR INSERT
  WITH CHECK (true);

-- 모든 사용자가 수정 가능 (업무 특성상)
CREATE POLICY "Users can update checks"
  ON equipment_field_checks
  FOR UPDATE
  USING (true);

-- 코멘트 추가
COMMENT ON TABLE equipment_field_checks IS '측정기기 현장 확인 기록 - 현장 입력 데이터를 별도 관리';
COMMENT ON COLUMN equipment_field_checks.business_id IS '사업장 ID (외래키)';
COMMENT ON COLUMN equipment_field_checks.discharge_flowmeter IS '배출전류계 수량 (현장 확인)';
COMMENT ON COLUMN equipment_field_checks.supply_flowmeter IS '송풍전류계 수량 (현장 확인)';
COMMENT ON COLUMN equipment_field_checks.checked_by IS '현장 확인자 이름';
COMMENT ON COLUMN equipment_field_checks.checked_at IS '현장 확인 일시';
COMMENT ON COLUMN equipment_field_checks.notes IS '현장 확인 시 특이사항 메모';
COMMENT ON COLUMN equipment_field_checks.is_synced IS '사무실 데이터(businesses 테이블)로 반영 여부';
COMMENT ON COLUMN equipment_field_checks.synced_at IS '사무실 데이터 반영 일시';
COMMENT ON COLUMN equipment_field_checks.synced_by IS '사무실 데이터 반영자';

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_equipment_field_checks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_equipment_field_checks_updated_at_trigger ON equipment_field_checks;

CREATE TRIGGER update_equipment_field_checks_updated_at_trigger
  BEFORE UPDATE ON equipment_field_checks
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_field_checks_updated_at();
