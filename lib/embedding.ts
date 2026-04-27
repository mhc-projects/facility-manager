// Gemini text-embedding-004 (768차원) - GEMINI_API_KEY 사용
// HuggingFace 대신 Gemini 임베딩으로 교체 (더 안정적, 추가 키 불필요)
import { GoogleGenerativeAI } from '@google/generative-ai';

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
  if (!_genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다');
    _genAI = new GoogleGenerativeAI(key);
  }
  return _genAI;
}

export async function getEmbedding(text: string, _type: 'query' | 'passage' = 'query'): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent({
    content: { parts: [{ text }], role: 'user' },
    outputDimensionality: 768,
  } as Parameters<typeof model.embedContent>[0]);
  return result.embedding.values;
}

/** 텍스트를 토큰 수 기준으로 청크 분할 (약 400토큰 = ~300자 한국어) */
export function splitIntoChunks(text: string, chunkSize = 300, overlap = 50): string[] {
  const sentences = text.split(/(?<=[.!?。\n])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = current.slice(-overlap) + sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter(c => c.length > 10);
}
