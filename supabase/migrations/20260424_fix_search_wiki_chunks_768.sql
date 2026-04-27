-- search_wiki_chunks 함수를 vector(768)로 재정의
-- 이전 마이그레이션(20260424_wiki_embedding_3072.sql)에서 함수 파라미터가
-- vector(3072)로 변경되었으나 wiki_chunks.embedding 컬럼은 여전히 vector(768)이어서
-- 차원 불일치로 <=> 연산이 NULL을 반환, 검색 결과 0개 발생

CREATE OR REPLACE FUNCTION search_wiki_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 8,
  similarity_threshold float DEFAULT 0.2
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
