-- 백업 스냅샷 테이블 생성
-- 전체 교체(replace-all) 업로드 시 롤백을 위한 JSON 백업 저장

CREATE TABLE IF NOT EXISTS backup_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  snapshot_type VARCHAR(50) NOT NULL,
  -- 값: 'business_replace_all' | 'tasks_replace_all'
  created_by    VARCHAR(100),
  data          JSONB NOT NULL,
  expires_at    TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  is_restored   BOOLEAN DEFAULT false,
  restored_at   TIMESTAMP WITH TIME ZONE,
  record_count  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_type_date
  ON backup_snapshots(snapshot_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_expires
  ON backup_snapshots(expires_at)
  WHERE is_restored = false;

COMMENT ON TABLE backup_snapshots IS '전체 교체 업로드 전 자동 생성되는 백업 스냅샷. 7일 후 만료.';
COMMENT ON COLUMN backup_snapshots.snapshot_type IS 'business_replace_all | tasks_replace_all';
COMMENT ON COLUMN backup_snapshots.data IS '백업 데이터 JSON. businesses[] 또는 tasks[] 구조.';
COMMENT ON COLUMN backup_snapshots.expires_at IS '7일 후 만료. 만료된 백업은 복원 불가.';
