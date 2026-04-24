// HuggingFace multilingual-e5-large 임베딩 (무료, 768차원)
// passage: prefix는 문서 저장 시, query: prefix는 검색 시 사용

export async function getEmbedding(text: string, type: 'query' | 'passage' = 'query'): Promise<number[]> {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) throw new Error('HF_API_KEY가 설정되지 않았습니다');

  const input = `${type}: ${text}`;

  const res = await fetch(
    'https://api-inference.huggingface.co/models/intfloat/multilingual-e5-large',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: input }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HuggingFace API 오류: ${res.status} ${err}`);
  }

  return res.json();
}

/** 텍스트를 토큰 수 기준으로 청크 분할 (약 400토큰 = ~300자 한국어) */
export function splitIntoChunks(text: string, chunkSize = 300, overlap = 50): string[] {
  const sentences = text.split(/(?<=[.!?。\n])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      // 오버랩: 마지막 overlap자 재사용
      current = current.slice(-overlap) + sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter(c => c.length > 10);
}
