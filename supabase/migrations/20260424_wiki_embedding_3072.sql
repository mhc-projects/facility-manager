-- wiki_chunks 임베딩 차원 768 → 3072 (gemini-embedding-001 기준)
-- 기존 데이터 없으므로 컬럼 타입만 변경

ALTER TABLE wiki_chunks ALTER COLUMN embedding TYPE vector(3072);

-- search_wiki_chunks 함수도 3072차원으로 재정의
CREATE OR REPLACE FUNCTION search_wiki_chunks(
  query_embedding vector(3072),
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
  WHERE wn.is_published = true
    AND 1 - (wc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY wc.embedding <=> query_embedding
  LIMIT match_count;
$$;
