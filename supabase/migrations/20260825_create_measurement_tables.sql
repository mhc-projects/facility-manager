-- 방지시설 전력량계 엣지디바이스: IoT 측정기기·측정이력 테이블 신설
--
-- 배경: database/unified-extensible-schema.sql에 설계돼 있었으나 supabase/migrations엔
--       미적용 상태였음(.claude/skills/db-schema/SKILL.md에 "미구현"으로 표기돼 있었음, 실제
--       라이브 스키마 조회로도 확인함). "방지시설 전력량계 데이터수집기" 프로젝트의 엣지디바이스
--       (RS-485 스니퍼 + CT클램프 + 신규 디지털 전력량계)가 쌓는 측정값/파생 피처를 담을 자리로
--       설계된 스키마를 그대로 재사용한다(measurement_type만 세분화, 스키마 변경 없음).
--
-- 참고: app/api/gateway-devices/route.ts, app/api/outlet-gateway/route.ts 등 기존 API가 이미
--       measurement_devices를 참조하고 있었으나 테이블이 없어 실제로는 항상 오류 응답을 반환하던
--       상태였음. 이 마이그레이션 적용 후 해당 기능이 (빈 결과로) 정상 동작하게 됨.

-- 1. Measurement Devices
CREATE TABLE IF NOT EXISTS measurement_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES business_info(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Device Identity
    device_type VARCHAR(50) NOT NULL, -- 'ph_meter', 'differential_pressure_meter', 'temperature_meter', 'ct_meter', 'power_meter', 'gateway', 'edge_device'
    device_name VARCHAR(100) NOT NULL,
    model_number VARCHAR(100),
    serial_number VARCHAR(100),
    manufacturer VARCHAR(100),

    -- Installation & Location
    installation_location TEXT,
    facility_association JSONB DEFAULT '{}', -- {"discharge_facility_ids": [], "prevention_facility_ids": []}

    -- Technical Specifications
    measurement_range VARCHAR(50),
    accuracy VARCHAR(20),
    resolution VARCHAR(20),

    -- Calibration Management
    calibration_date DATE,
    next_calibration_date DATE,
    calibration_certificate VARCHAR(100),

    -- CT-specific Information
    ct_ratio VARCHAR(20),
    primary_current VARCHAR(20),
    secondary_current VARCHAR(20),

    -- Gateway/Network Information
    ip_address INET,
    mac_address VARCHAR(17),
    firmware_version VARCHAR(20),
    communication_protocol VARCHAR(30),
    network_config JSONB DEFAULT '{}',

    -- Status & Maintenance
    device_status VARCHAR(20) DEFAULT 'normal' CHECK (device_status IN ('normal', 'maintenance', 'error', 'inactive')),
    is_active BOOLEAN DEFAULT true,
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    maintenance_history JSONB DEFAULT '[]',

    -- Current Measurement
    current_value DECIMAL(10,4),
    unit VARCHAR(10),
    measurement_timestamp TIMESTAMP WITH TIME ZONE,
    data_quality VARCHAR(20) DEFAULT 'normal',

    -- Extensible Settings
    additional_settings JSONB DEFAULT '{}',

    UNIQUE(business_id, device_type, serial_number)
);

-- date_bucket/hour_bucket를 위한 IMMUTABLE 헬퍼 함수
-- DATE(timestamptz), EXTRACT(HOUR FROM timestamptz)는 세션 TimeZone 설정에 따라 결과가 달라질 수
-- 있어 Postgres가 STABLE로 취급함 — GENERATED ALWAYS AS ... STORED는 IMMUTABLE 표현식만 허용하므로
-- (원본 설계 파일 database/unified-extensible-schema.sql 그대로는 "generation expression is not
-- immutable" 오류 발생, 2026-08-25 실제 적용 시도로 확인). 타임존을 'Asia/Seoul'로 고정해 결과가
-- 항상 결정적이게 만든 뒤 IMMUTABLE로 선언(국내 사업장 데이터라 일/시간 버킷 기준도 KST).
CREATE OR REPLACE FUNCTION public.immutable_date_kst(ts TIMESTAMP WITH TIME ZONE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT (ts AT TIME ZONE 'Asia/Seoul')::date $$;

CREATE OR REPLACE FUNCTION public.immutable_hour_kst(ts TIMESTAMP WITH TIME ZONE)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT EXTRACT(HOUR FROM (ts AT TIME ZONE 'Asia/Seoul'))::integer $$;

-- 2. Measurement History
CREATE TABLE IF NOT EXISTS measurement_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES measurement_devices(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES business_info(id) ON DELETE CASCADE,
    measured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Measurement Data
    measured_value DECIMAL(10,4) NOT NULL,
    unit VARCHAR(10) NOT NULL,
    measurement_type VARCHAR(30), -- 예: 'ct_current_rms_60s', 'ct_current_peak_60s', 'ct_duty_cycle_60s', 'active_energy_kwh'

    -- Data Quality
    data_quality VARCHAR(20) DEFAULT 'normal' CHECK (data_quality IN ('normal', 'warning', 'error', 'calibration', 'maintenance')),
    confidence_level DECIMAL(3,2) DEFAULT 1.00,
    quality_flags TEXT[], -- ['outlier', 'drift', 'noise']

    -- Context Information
    measurement_method VARCHAR(50),
    environmental_conditions JSONB DEFAULT '{}', -- 예: {"threshold": 4.2, "window_sec": 60} (파생 피처 계산 파라미터)
    calibration_status BOOLEAN DEFAULT true,
    operator_notes TEXT,

    -- Derived/Calculated Fields
    normalized_value DECIMAL(10,4),
    trend_direction VARCHAR(10), -- 'increasing', 'decreasing', 'stable'
    alarm_status VARCHAR(20), -- 'normal', 'warning', 'alarm', 'critical'

    -- Partitioning helper (KST 기준, 위 immutable_date_kst/immutable_hour_kst 참고)
    date_bucket DATE GENERATED ALWAYS AS (immutable_date_kst(measured_at)) STORED,
    hour_bucket INTEGER GENERATED ALWAYS AS (immutable_hour_kst(measured_at)) STORED
);

CREATE INDEX IF NOT EXISTS idx_measurement_history_device_time ON measurement_history(device_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurement_history_business_date ON measurement_history(business_id, date_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_measurement_history_quality ON measurement_history(data_quality) WHERE data_quality != 'normal';
CREATE INDEX IF NOT EXISTS idx_measurement_history_hourly ON measurement_history(business_id, date_bucket, hour_bucket);

-- updated_at 자동 갱신 (프로젝트 공통 함수 update_updated_at_column() 재사용, 20260407/20260419 패턴과 동일)
DROP TRIGGER IF EXISTS trigger_measurement_devices_updated_at ON measurement_devices;
CREATE TRIGGER trigger_measurement_devices_updated_at
  BEFORE UPDATE ON measurement_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: 이 프로젝트의 모든 DB 접근은 Next.js API Routes(service_role)로만 이루어짐
-- (20260325_enable_rls_on_public_tables.sql과 동일한 "server only access" 패턴 — anon/authenticated 직접 접근 차단)
ALTER TABLE measurement_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "measurement_devices: server only access"
  ON measurement_devices
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "measurement_history: server only access"
  ON measurement_history
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
