// 사업장 메모 임베딩 생성/저장 유틸 (Q&A RAG 검색용)
import { supabaseAdmin } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embedding';

export async function generateMemoEmbedding(title: string, content: string): Promise<number[]> {
  const text = `${title}\n${content}`.slice(0, 2000);
  return getEmbedding(text, 'passage');
}

/** memo_embeddings에 upsert. 실패 시 throw하므로 호출부에서 try/catch로 감싸 메모 저장을 막지 않도록 한다. */
export async function upsertMemoEmbedding(memoId: string, title: string, content: string): Promise<void> {
  const embedding = await generateMemoEmbedding(title, content);
  const { error } = await supabaseAdmin
    .from('memo_embeddings')
    .upsert({ memo_id: memoId, embedding, updated_at: new Date().toISOString() });

  if (error) {
    throw new Error(error.message);
  }
}
