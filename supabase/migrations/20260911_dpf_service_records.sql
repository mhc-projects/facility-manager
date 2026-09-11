-- DPF 사후관리(AS/크리닝/물류) 접수·처리 원장
-- 설계: claudedocs/dpf-as-logistics-design.md (크린어스 DEAR System 부착현황/물류관리/접수현황 구조 참고, 어드바이저 검토 반영)
-- 접수현황/물류관리/부착현황 3개 화면은 이 테이블 하나를 category로 필터링한 뷰로 구현한다.

-- =====================================================
-- 1. dpf_service_records
-- =====================================================

CREATE TABLE IF NOT EXISTS dpf_service_records (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id               UUID NOT NULL REFERENCES dpf_vehicles(id) ON DELETE CASCADE,

  category                 VARCHAR(30) NOT NULL
                            CHECK (category IN ('as','clean','cs','parts_delivery','urea','engine_replace')),
  converted_from_category  VARCHAR(30)
                            CHECK (converted_from_category IN ('as','clean','cs','parts_delivery','urea','engine_replace')),
  round_no                 INT NOT NULL,                    -- (vehicle_id, category) 내 순번 — 트리거가 채번, API는 세팅하지 않음
  status                   VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress','completed','cancelled')),
  is_deleted               BOOLEAN NOT NULL DEFAULT false,  -- 소프트 삭제. status의 cancelled(고객 철회)와는 별개 축

  reception_date           DATE DEFAULT CURRENT_DATE,          -- 크린어스도 접수일을 오늘 날짜로 미리 채워둠
  reception_content        TEXT,                            -- 접수내용
  detail_content            TEXT,                            -- 세부내용
  processing_content       TEXT,                            -- 처리내용

  local_government         VARCHAR(100),                    -- 자유 텍스트, dpf_vehicles.local_government와 이름 맞춤
  service_branch           VARCHAR(100),                    -- 처리점, 자유 텍스트

  assigned_as_technician   VARCHAR(100),                    -- 담당AS기사, 자유 텍스트
  processing_technician    VARCHAR(100),                    -- 처리기사, 자유 텍스트
  technician_processed_at  DATE,
  processed_at             DATE,
  completed_at             DATE,

  is_urgent                BOOLEAN DEFAULT false,           -- 긴급
  needs_callback           BOOLEAN DEFAULT false,           -- 통화요청
  is_dispatch              BOOLEAN DEFAULT false,           -- 출동
  is_dropoff               BOOLEAN DEFAULT false,           -- 입고
  filter_type               VARCHAR(100),
  collected_filter          VARCHAR(100),                    -- 회수필터
  replaced_filter           VARCHAR(100),                    -- 교체필터

  cost_type                VARCHAR(20)
                            CHECK (cost_type IN ('paid','free','mixed')),
  association_billing_date  DATE,
  billing_status            VARCHAR(30) DEFAULT 'none'
                            CHECK (billing_status IN ('none','billed','unbillable_reception','unbillable_completion','held')),

  dispatch_area_primary     VARCHAR(100),                    -- 출동지역 (크린어스도 '/'로 구분된 2칸)
  dispatch_area_secondary   VARCHAR(100),
  contact_wireless          VARCHAR(50),
  contact_wired             VARCHAR(50),

  courier                   VARCHAR(50),                     -- parts_delivery/urea 전용, 택배사
  delivery_request_type     VARCHAR(20)
                            CHECK (delivery_request_type IN ('request','fixed')),
  delivery_address          TEXT,

  extension_requested       BOOLEAN DEFAULT false,
  extension_approved        BOOLEAN,
  extension_note            TEXT,

  notes                     TEXT,
  created_by                UUID REFERENCES employees(id),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpf_service_records_vehicle  ON dpf_service_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dpf_service_records_category ON dpf_service_records(category, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dpf_service_records_round
  ON dpf_service_records(vehicle_id, category, round_no);

-- round_no 자동 채번: INSERT 시, 그리고 UPDATE로 category가 바뀔 때(전환)만 재계산.
-- 전환 시 원래 분류를 converted_from_category에 자동 기록(비어있을 때만 — 두 번 전환돼도 최초 분류를 보존).
-- vehicle_id도 UPDATE OF 대상에 넣어 차량 간 레코드 이동 시에도 round_no가 새 차량 기준으로 재계산되게 한다(그런 이동은
-- API에서 애초에 허용하지 않을 예정이지만, 혹시 실수로 vehicle_id가 바뀌어도 유니크 인덱스가 깨지지 않도록 방어).
-- API는 round_no를 절대 세팅하지 않는다 — Supabase JS는 트랜잭션을 API 쪽에서 매번 직접 감싸야 하는데
-- (lib/supabase-direct의 transaction() 헬퍼를 approve/submit 라우트가 빠뜨렸던 전례가 있음) 그 실수를 원천 차단하기 위해
-- DB 트리거로 강제한다. 동시 접수로 유니크 인덱스 위반(23505)이 나면 API에서 1회 재시도한다.
CREATE OR REPLACE FUNCTION dpf_service_records_set_round_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.category IS DISTINCT FROM OLD.category OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN
    SELECT COALESCE(MAX(round_no), 0) + 1 INTO NEW.round_no
    FROM dpf_service_records
    WHERE vehicle_id = NEW.vehicle_id AND category = NEW.category;

    IF TG_OP = 'UPDATE' AND NEW.category IS DISTINCT FROM OLD.category AND NEW.converted_from_category IS NULL THEN
      NEW.converted_from_category := OLD.category;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dpf_service_records_round_no ON dpf_service_records;
CREATE TRIGGER trg_dpf_service_records_round_no
  BEFORE INSERT OR UPDATE OF category, vehicle_id ON dpf_service_records
  FOR EACH ROW EXECUTE FUNCTION dpf_service_records_set_round_no();

-- =====================================================
-- 2. dpf_vehicles 변경정보 오버레이 컬럼
--    write-back 대상: current_contact_wireless/wired, dispatch_area_primary/secondary
--    (접수 등록 폼에 실제로 있는 필드에서만 자동 갱신)
--    수동 전용: current_plate_number, current_vin_override, is_special_management, is_special_sale
--    (VehicleFormModal에서만 직접 수정 — 접수 등록 폼에 대응 필드가 없음)
-- =====================================================

ALTER TABLE dpf_vehicles
  ADD COLUMN IF NOT EXISTS current_contact_wireless VARCHAR(50),
  ADD COLUMN IF NOT EXISTS current_contact_wired     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS dispatch_area_primary     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS dispatch_area_secondary   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS current_plate_number      VARCHAR(50),  -- dpf_vehicles.plate_number와 동일 타입(20260424_dpf_vin_length.sql로 50까지 확장됨)
  ADD COLUMN IF NOT EXISTS current_vin_override      VARCHAR(20),  -- dpf_vehicles.vin과 동일 타입(20260424_dpf_vin_length.sql로 20까지 확장됨)
  ADD COLUMN IF NOT EXISTS is_special_management     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_special_sale           BOOLEAN DEFAULT false;

-- =====================================================
-- 3. RLS — 같은 도메인 기존 테이블(dpf_device_installations 등)과 동일한 패턴
-- =====================================================

ALTER TABLE dpf_service_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpf_service_records_read"  ON dpf_service_records;
DROP POLICY IF EXISTS "dpf_service_records_write" ON dpf_service_records;
CREATE POLICY "dpf_service_records_read" ON dpf_service_records
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dpf_service_records_write" ON dpf_service_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 2)
  );
