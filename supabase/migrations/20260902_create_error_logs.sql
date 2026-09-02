-- Migration: 운영 에러 로그 테이블 생성 (theion 일일 보고용)
-- Created: 2026-09-02

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);

-- RLS 비활성화 (서비스 롤 키로 접근)
ALTER TABLE error_logs DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE error_logs IS '프로덕션 console.error 캡처 (instrumentation.ts register()에서 몽키패치), theion이 매일 조회해 요약 보고';
COMMENT ON COLUMN error_logs.tag IS '기존 콘솔 로그의 라우트 태그 문자열(예: "❌ [EMPLOYEES] GET 오류:") — 첫 인자 원문 그대로';
COMMENT ON COLUMN error_logs.message IS '에러 메시지 (4KB로 잘림)';
COMMENT ON COLUMN error_logs.stack IS '스택 트레이스 (4KB로 잘림, 없을 수 있음)';
