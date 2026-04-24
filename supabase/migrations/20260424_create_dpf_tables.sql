-- DPF (매연저감장치) 관리 섹션 테이블 생성
-- Phase 1: 차량 관리 7개 테이블 + Wiki 5개 테이블

-- pgvector, pg_trgm 확장 (없으면 생성)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================
-- 1. 차량 관리 테이블
-- =====================================================

-- 민감 개인정보 (관리자 전용)
CREATE TABLE IF NOT EXISTS dpf_owner_sensitive (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_number_hash   TEXT,
  resident_number_enc    TEXT,
  corporation_number_enc TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- 차량 마스터
-- ★ UI 표시 컬럼: 노란색 헤더 9개만 표시
-- 나머지 43개 컬럼은 raw_data JSONB에 보관
CREATE TABLE IF NOT EXISTS dpf_vehicles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ★ UI 표시 컬럼 (9개 — 엑셀 노란색 헤더)
  vin               VARCHAR(17) NOT NULL UNIQUE,  -- 차대번호
  plate_number      VARCHAR(20) NOT NULL,           -- 차량번호
  vehicle_name      VARCHAR(100),                   -- 차명
  owner_name        VARCHAR(100),                   -- 소유자성명
  owner_address     TEXT,                           -- 주소
  owner_contact     VARCHAR(50),                    -- 연락처
  local_government  VARCHAR(100),                   -- 접수지자체명 (비정규화)
  device_serial     VARCHAR(100),                   -- 장치시리얼번호 (비정규화)
  installation_date DATE,                           -- 구변일자 (비정규화)

  -- 나머지 컬럼 보관 (UI 미표시)
  raw_data          JSONB DEFAULT '{}',

  -- 시스템 컬럼
  is_active         BOOLEAN NOT NULL DEFAULT true,
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_vin        ON dpf_vehicles(vin);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_plate      ON dpf_vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_owner      ON dpf_vehicles(owner_name);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_gov        ON dpf_vehicles(local_government);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_serial     ON dpf_vehicles(device_serial);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_active     ON dpf_vehicles(is_active, is_deleted);
-- 트라이그램 인덱스 (부분 검색)
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_vin_trgm   ON dpf_vehicles USING gin (vin gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_plate_trgm ON dpf_vehicles USING gin (plate_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_owner_trgm ON dpf_vehicles USING gin (owner_name gin_trgm_ops);

-- 번호판 변경 이력
CREATE TABLE IF NOT EXISTS dpf_vehicle_plate_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID NOT NULL REFERENCES dpf_vehicles(id) ON DELETE CASCADE,
  plate_number  VARCHAR(20) NOT NULL,
  valid_from    DATE NOT NULL,
  valid_to      DATE,
  change_reason VARCHAR(200),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpf_plate_history_vehicle ON dpf_vehicle_plate_history(vehicle_id);

-- 장치 설치/탈착 이력
CREATE TABLE IF NOT EXISTS dpf_device_installations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        UUID NOT NULL REFERENCES dpf_vehicles(id) ON DELETE CASCADE,
  serial_number     VARCHAR(100),
  installer_company VARCHAR(100),
  installation_date DATE,
  management_number VARCHAR(100),
  sales_office      VARCHAR(100),
  action_type       VARCHAR(20) NOT NULL CHECK (action_type IN ('install','remove','replace')),
  notes             TEXT,
  created_by        UUID REFERENCES employees(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpf_install_vehicle ON dpf_device_installations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dpf_install_serial  ON dpf_device_installations(serial_number);

-- 성능검사 이력
CREATE TABLE IF NOT EXISTS dpf_performance_inspections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        UUID NOT NULL REFERENCES dpf_vehicles(id) ON DELETE CASCADE,
  installation_id   UUID REFERENCES dpf_device_installations(id),
  inspection_date   DATE,
  inspection_agency VARCHAR(200),
  kd147_before      NUMERIC(6,2),
  kd147_after       NUMERIC(6,2),
  lugdown_before    NUMERIC(6,2),
  lugdown_after     NUMERIC(6,2),
  free_accel_before NUMERIC(6,2),
  free_accel_after  NUMERIC(6,2),
  inspection_type   VARCHAR(50) CHECK (inspection_type IN ('initial','confirmation','periodic')),
  pass_yn           BOOLEAN,
  notes             TEXT,
  created_by        UUID REFERENCES employees(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpf_inspection_vehicle ON dpf_performance_inspections(vehicle_id);

-- 보조금 신청/처리 이력
CREATE TABLE IF NOT EXISTS dpf_subsidy_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            UUID NOT NULL REFERENCES dpf_vehicles(id) ON DELETE CASCADE,
  local_government      VARCHAR(100),
  reception_date        DATE,
  approval_status       VARCHAR(20) CHECK (approval_status IN ('pending','approved','rejected','cancelled')),
  subsidy_payment_date  DATE,
  subsidy_claim_amount  NUMERIC(12,0),
  subsidy_expected_date DATE,
  self_payment_removal  NUMERIC(12,0),
  deposit_date_removal  DATE,
  offset_date           DATE,
  notes                 TEXT,
  created_by            UUID REFERENCES employees(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpf_subsidy_vehicle ON dpf_subsidy_applications(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dpf_subsidy_status  ON dpf_subsidy_applications(approval_status);

-- 콜모니터링 이력
CREATE TABLE IF NOT EXISTS dpf_call_monitoring (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id         UUID NOT NULL REFERENCES dpf_vehicles(id) ON DELETE CASCADE,
  monitoring_yn      BOOLEAN,
  monitoring_date    DATE,
  satisfaction_score INTEGER CHECK (satisfaction_score BETWEEN 1 AND 5),
  memo               TEXT,
  call_agent         VARCHAR(100),
  created_by         UUID REFERENCES employees(id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpf_call_vehicle ON dpf_call_monitoring(vehicle_id);

-- 엑셀 임포트 스테이징
CREATE TABLE IF NOT EXISTS dpf_import_staging (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID NOT NULL,
  row_index       INTEGER,
  raw_data        JSONB NOT NULL,
  vin             VARCHAR(17),
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','done','error')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpf_staging_batch  ON dpf_import_staging(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_dpf_staging_status ON dpf_import_staging(status);

-- =====================================================
-- 2. Wiki / 지침 관리 테이블
-- =====================================================

-- Wiki 노드 트리 (챕터/섹션/서식 공통)
CREATE TABLE IF NOT EXISTS wiki_nodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           UUID REFERENCES wiki_nodes(id) ON DELETE CASCADE,
  node_type           TEXT NOT NULL CHECK (node_type IN ('root','chapter','section','subsection','form','attachment')),
  sort_order          SMALLINT NOT NULL DEFAULT 0,
  title               TEXT NOT NULL,
  slug                TEXT UNIQUE,
  content_md          TEXT,
  metadata            JSONB DEFAULT '{}',
  tags                TEXT[] DEFAULT '{}',
  is_published        BOOLEAN DEFAULT false,
  current_revision_id UUID,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_nodes_parent   ON wiki_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_wiki_nodes_type     ON wiki_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_wiki_nodes_tags     ON wiki_nodes USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_wiki_nodes_fts      ON wiki_nodes
  USING GIN (to_tsvector('simple', COALESCE(title,'') || ' ' || COALESCE(content_md,'')));
CREATE INDEX IF NOT EXISTS idx_wiki_nodes_trgm     ON wiki_nodes USING GIN (title gin_trgm_ops);

-- 개정 이력
CREATE TABLE IF NOT EXISTS wiki_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES wiki_nodes(id) ON DELETE CASCADE,
  revision_no SMALLINT NOT NULL,
  title       TEXT NOT NULL,
  content_md  TEXT,
  metadata    JSONB DEFAULT '{}',
  change_note TEXT,
  changed_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (node_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_wiki_revisions_node ON wiki_revisions(node_id);

-- AI 임베딩 청크 (multilingual-e5-large: 768차원)
CREATE TABLE IF NOT EXISTS wiki_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES wiki_nodes(id) ON DELETE CASCADE,
  chunk_index SMALLINT NOT NULL,
  chunk_text  TEXT NOT NULL,
  embedding   vector(768),
  token_count INT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (node_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_wiki_chunks_node ON wiki_chunks(node_id);
CREATE INDEX IF NOT EXISTS idx_wiki_chunks_embedding
  ON wiki_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 서식 템플릿 (14종)
CREATE TABLE IF NOT EXISTS form_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_node_id     UUID REFERENCES wiki_nodes(id),
  code             TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  version          TEXT NOT NULL DEFAULT '2026.1',
  schema           JSONB NOT NULL DEFAULT '[]',
  layout           JSONB NOT NULL DEFAULT '{}',
  vehicle_field_map JSONB DEFAULT '{}',
  source_file_url  TEXT,
  source_file_type TEXT CHECK (source_file_type IN ('pdf','docx')),
  ai_extracted     BOOLEAN DEFAULT FALSE,
  upload_note      TEXT,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 서식 제출 이력
CREATE TABLE IF NOT EXISTS form_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES form_templates(id),
  vehicle_id   UUID REFERENCES dpf_vehicles(id),
  business_id  UUID REFERENCES business_info(id),
  values       JSONB NOT NULL DEFAULT '{}',
  status       TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','printed')),
  submitted_by UUID REFERENCES employees(id),
  pdf_url      TEXT,
  submitted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_vehicle  ON form_submissions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_template ON form_submissions(template_id);

-- 지침서 업로드 이력
CREATE TABLE IF NOT EXISTS guideline_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url      TEXT NOT NULL,
  version_label TEXT NOT NULL,
  status        TEXT DEFAULT 'analyzing'
                CHECK (status IN ('analyzing','review_needed','applied','rejected')),
  diff_summary  TEXT,
  wiki_changes  JSONB DEFAULT '[]',
  form_changes  JSONB DEFAULT '[]',
  applied_by    UUID REFERENCES employees(id),
  applied_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES employees(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. RLS 정책
-- =====================================================

ALTER TABLE dpf_vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpf_vehicles_read"  ON dpf_vehicles;
DROP POLICY IF EXISTS "dpf_vehicles_write" ON dpf_vehicles;
CREATE POLICY "dpf_vehicles_read" ON dpf_vehicles
  FOR SELECT USING (auth.role() = 'authenticated' AND is_deleted = false);
CREATE POLICY "dpf_vehicles_write" ON dpf_vehicles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 2)
  );

ALTER TABLE dpf_owner_sensitive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpf_sensitive_admin_only" ON dpf_owner_sensitive;
CREATE POLICY "dpf_sensitive_admin_only" ON dpf_owner_sensitive
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 3)
  );

ALTER TABLE dpf_vehicle_plate_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpf_plate_history_read"  ON dpf_vehicle_plate_history;
DROP POLICY IF EXISTS "dpf_plate_history_write" ON dpf_vehicle_plate_history;
CREATE POLICY "dpf_plate_history_read" ON dpf_vehicle_plate_history
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dpf_plate_history_write" ON dpf_vehicle_plate_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 2)
  );

ALTER TABLE dpf_device_installations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpf_install_read"  ON dpf_device_installations;
DROP POLICY IF EXISTS "dpf_install_write" ON dpf_device_installations;
CREATE POLICY "dpf_install_read" ON dpf_device_installations
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dpf_install_write" ON dpf_device_installations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 2)
  );

ALTER TABLE dpf_performance_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpf_inspection_read"  ON dpf_performance_inspections;
DROP POLICY IF EXISTS "dpf_inspection_write" ON dpf_performance_inspections;
CREATE POLICY "dpf_inspection_read" ON dpf_performance_inspections
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dpf_inspection_write" ON dpf_performance_inspections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 2)
  );

ALTER TABLE dpf_subsidy_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpf_subsidy_read"  ON dpf_subsidy_applications;
DROP POLICY IF EXISTS "dpf_subsidy_write" ON dpf_subsidy_applications;
CREATE POLICY "dpf_subsidy_read" ON dpf_subsidy_applications
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dpf_subsidy_write" ON dpf_subsidy_applications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 2)
  );

ALTER TABLE dpf_call_monitoring ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpf_call_read"  ON dpf_call_monitoring;
DROP POLICY IF EXISTS "dpf_call_write" ON dpf_call_monitoring;
CREATE POLICY "dpf_call_read" ON dpf_call_monitoring
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dpf_call_write" ON dpf_call_monitoring
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 2)
  );

ALTER TABLE dpf_import_staging ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpf_staging_admin" ON dpf_import_staging;
CREATE POLICY "dpf_staging_admin" ON dpf_import_staging
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 3)
  );

ALTER TABLE wiki_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wiki_read"  ON wiki_nodes;
DROP POLICY IF EXISTS "wiki_write" ON wiki_nodes;
CREATE POLICY "wiki_read" ON wiki_nodes
  FOR SELECT USING (auth.role() = 'authenticated' AND is_published = true);
CREATE POLICY "wiki_write" ON wiki_nodes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 3)
  );

ALTER TABLE wiki_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wiki_revisions_read"  ON wiki_revisions;
DROP POLICY IF EXISTS "wiki_revisions_write" ON wiki_revisions;
CREATE POLICY "wiki_revisions_read" ON wiki_revisions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "wiki_revisions_write" ON wiki_revisions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 3)
  );

ALTER TABLE wiki_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wiki_chunks_read"  ON wiki_chunks;
DROP POLICY IF EXISTS "wiki_chunks_write" ON wiki_chunks;
CREATE POLICY "wiki_chunks_read" ON wiki_chunks
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "wiki_chunks_write" ON wiki_chunks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 3)
  );

ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "form_templates_read"  ON form_templates;
DROP POLICY IF EXISTS "form_templates_write" ON form_templates;
CREATE POLICY "form_templates_read" ON form_templates
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);
CREATE POLICY "form_templates_write" ON form_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 3)
  );

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "form_submissions_read"  ON form_submissions;
DROP POLICY IF EXISTS "form_submissions_write" ON form_submissions;
CREATE POLICY "form_submissions_read" ON form_submissions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "form_submissions_write" ON form_submissions
  FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE guideline_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "guideline_uploads_admin" ON guideline_uploads;
CREATE POLICY "guideline_uploads_admin" ON guideline_uploads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 3)
  );

-- =====================================================
-- 4. pgvector 검색 함수
-- =====================================================

CREATE OR REPLACE FUNCTION search_wiki_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 8,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  chunk_text  text,
  node_id     uuid,
  node_title  text,
  node_slug   text,
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    wc.chunk_text,
    wc.node_id,
    wn.title AS node_title,
    wn.slug  AS node_slug,
    1 - (wc.embedding <=> query_embedding) AS similarity
  FROM wiki_chunks wc
  JOIN wiki_nodes wn ON wn.id = wc.node_id
  WHERE 1 - (wc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY wc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- =====================================================
-- 5. 스테이징 → 본 테이블 처리 함수
-- =====================================================

CREATE OR REPLACE FUNCTION process_dpf_staging(p_batch_id UUID)
RETURNS TABLE (
  processed_count int,
  error_count     int
)
LANGUAGE plpgsql AS $$
DECLARE
  v_processed int := 0;
  v_errors    int := 0;
  v_row       RECORD;
BEGIN
  FOR v_row IN
    SELECT * FROM dpf_import_staging
    WHERE import_batch_id = p_batch_id AND status = 'pending'
    ORDER BY row_index
  LOOP
    BEGIN
      UPDATE dpf_import_staging SET status = 'processing' WHERE id = v_row.id;

      INSERT INTO dpf_vehicles (
        vin, plate_number, vehicle_name,
        owner_name, owner_address, owner_contact,
        local_government, device_serial, installation_date,
        raw_data
      )
      VALUES (
        v_row.raw_data->>'vin',
        COALESCE(v_row.raw_data->>'plate_number', ''),
        v_row.raw_data->>'vehicle_name',
        v_row.raw_data->>'owner_name',
        v_row.raw_data->>'owner_address',
        v_row.raw_data->>'owner_contact',
        v_row.raw_data->>'local_government',
        v_row.raw_data->>'device_serial',
        CASE
          WHEN v_row.raw_data->>'installation_date' IS NOT NULL
               AND v_row.raw_data->>'installation_date' <> ''
          THEN (v_row.raw_data->>'installation_date')::DATE
          ELSE NULL
        END,
        COALESCE(v_row.raw_data->'raw_data', '{}'::jsonb)
      )
      ON CONFLICT (vin) DO UPDATE SET
        plate_number      = EXCLUDED.plate_number,
        vehicle_name      = EXCLUDED.vehicle_name,
        owner_name        = EXCLUDED.owner_name,
        owner_address     = EXCLUDED.owner_address,
        owner_contact     = EXCLUDED.owner_contact,
        local_government  = EXCLUDED.local_government,
        device_serial     = EXCLUDED.device_serial,
        installation_date = EXCLUDED.installation_date,
        raw_data          = EXCLUDED.raw_data,
        updated_at        = NOW();

      UPDATE dpf_import_staging SET status = 'done' WHERE id = v_row.id;
      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE dpf_import_staging
      SET status = 'error', error_message = SQLERRM
      WHERE id = v_row.id;
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_errors;
END;
$$;
