-- ============================================================
-- AS 레코드에 굴뚝번호 컬럼 추가
-- 기존 outlet_description은 배출구 상세 설명 용도로 유지
-- chimney_number는 굴뚝/배출구 번호 식별자 전용
-- ============================================================

ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS chimney_number VARCHAR(100);

COMMENT ON COLUMN as_records.chimney_number IS '굴뚝/배출구 번호 (예: 1번 굴뚝, A굴뚝)';


-- ============================================================
-- 외부 연동용 API 키 테이블 생성
-- 에코센스 등 외부 시스템이 우리 API를 호출할 때 사용
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name VARCHAR(100) NOT NULL,           -- 키 이름 (예: 에코센스_AS연동)
  api_key VARCHAR(128) NOT NULL UNIQUE,     -- 실제 API 키 값
  description TEXT,                          -- 용도 설명
  is_active BOOLEAN NOT NULL DEFAULT true,  -- 활성화 여부
  allowed_paths TEXT[],                      -- 허용할 API 경로 목록 (NULL이면 전체 허용)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,                  -- 마지막 사용 시각
  expires_at TIMESTAMPTZ                     -- 만료일 (NULL이면 무기한)
);

COMMENT ON TABLE api_keys IS '외부 시스템 연동용 API 키 관리';
COMMENT ON COLUMN api_keys.key_name IS 'API 키 식별 이름';
COMMENT ON COLUMN api_keys.api_key IS '실제 Bearer 토큰 값';
COMMENT ON COLUMN api_keys.allowed_paths IS '허용된 API 경로 패턴 목록 (NULL=모든 경로 허용)';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key) WHERE is_active = true;

-- ============================================================
-- 에코센스 초기 API 키 발급 (실제 사용 전 key 값 변경 필요)
-- gen_random_uuid()로 생성된 값이 초기 키로 사용됨
-- 아래 INSERT를 실행하면 api_key 컬럼에서 실제 키 값을 확인 가능
-- ============================================================

-- 주의: 아래 INSERT는 처음 한 번만 실행하세요.
-- 실행 후 SELECT api_key FROM api_keys WHERE key_name = '에코센스_AS연동'; 으로 키 값 확인
INSERT INTO api_keys (key_name, api_key, description, allowed_paths)
VALUES (
  '에코센스_AS연동',
  'ek_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  '에코센스 시스템에서 AS 데이터를 BlueOn AS관리로 전송하기 위한 API 키',
  ARRAY['/api/as-records', '/api/as-records/*']
)
ON CONFLICT DO NOTHING;

-- 생성된 API 키 확인
SELECT key_name, api_key, description, created_at
FROM api_keys
WHERE key_name = '에코센스_AS연동';
