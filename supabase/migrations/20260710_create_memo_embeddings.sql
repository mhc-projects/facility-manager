-- 사업장 메모(business_memos) RAG 검색을 위한 임베딩 테이블
-- Gemini gemini-embedding-001, 768차원 (wiki_chunks와 동일 차원, 실제 운영 컬럼 기준)

CREATE TABLE memo_embeddings (
  memo_id UUID PRIMARY KEY REFERENCES business_memos(id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memo_embeddings_vector ON memo_embeddings USING hnsw (embedding vector_cosine_ops);

-- 서버(service_role)에서만 접근하는 테이블 (search_wiki_chunks/business_memos와 동일한 방어 패턴)
ALTER TABLE memo_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memo_embeddings server only access" ON memo_embeddings
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 질문 임베딩과 유사한 사업장 메모를 검색 (사업장명 포함, 삭제/비활성 메모 제외)
-- query_embedding은 text로 받아 내부에서 ::vector 캐스팅한다.
-- (주의) supabase-js .rpc()로 vector(N) 타입 파라미터에 JS number[]를 그대로 넘기면
-- 이 프로젝트에서 search_wiki_chunks가 이미 겪은 것과 동일한 문제로 실패한다.
-- 반드시 '[0.1,0.2,...]' 형태의 문자열로 직렬화해서 호출해야 한다 (app/api/wiki/debug/route.ts 참고).
CREATE OR REPLACE FUNCTION search_memo_embeddings(
  query_embedding text,
  match_count int DEFAULT 5,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  memo_id     uuid,
  business_id uuid,
  business_name text,
  title       varchar,
  content     text,
  created_at  timestamptz,
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    bm.id AS memo_id,
    bm.business_id,
    bi.business_name,
    bm.title,
    bm.content,
    bm.created_at,
    1 - (me.embedding <=> query_embedding::vector) AS similarity
  FROM memo_embeddings me
  JOIN business_memos bm ON bm.id = me.memo_id
  JOIN business_info bi ON bi.id = bm.business_id
  WHERE bm.is_active = true AND bm.is_deleted = false
    AND 1 - (me.embedding <=> query_embedding::vector) >= similarity_threshold
  ORDER BY me.embedding <=> query_embedding::vector
  LIMIT match_count;
$$;
