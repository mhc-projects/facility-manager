-- 블루온AI Q&A 대화 히스토리 (계정별 대화 목록 및 메시지 저장)

CREATE TABLE qa_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  domain TEXT CHECK (domain IS NULL OR domain IN ('dpf', 'iot')),
  title TEXT NOT NULL DEFAULT '새 대화',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_qa_conversations_owner ON qa_conversations(created_by, updated_at DESC) WHERE is_deleted = false;

CREATE TABLE qa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES qa_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qa_messages_conversation ON qa_messages(conversation_id, created_at);

-- 이 프로젝트는 Supabase Auth 대신 자체 JWT 인증을 쓰므로 (utils/auth.ts),
-- service role(supabaseAdmin)만 접근 가능하게 막고 소유권 검증은 API route에서 처리한다.
-- (memo_embeddings 등 기존 테이블과 동일한 패턴)
ALTER TABLE qa_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_conversations server only access" ON qa_conversations
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

ALTER TABLE qa_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_messages server only access" ON qa_messages
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
