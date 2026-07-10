// 로컬 Ollama 모델 스트리밍 생성 클라이언트 (업무지침 Q&A 답변 생성용)
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:26b';

type OllamaChunk = { response?: string; done?: boolean; error?: string };

/** think: 사고과정(chain-of-thought) 생성 여부. 단순 조회형 질문은 false가 훨씬 빠르고 품질 차이가 없다. */
export async function* generateStream(prompt: string, options?: { think?: boolean }): AsyncGenerator<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: true,
      think: options?.think ?? false,
      keep_alive: '30m',
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama 서버 응답 오류 (${res.status}). 로컬 모델 서버가 실행 중인지 확인하세요.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const obj: OllamaChunk = JSON.parse(line);
      if (obj.error) throw new Error(obj.error);
      if (obj.response) yield obj.response;
      if (obj.done) return;
    }
  }
}

export type ToolDef = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolCall = { name: string; arguments: Record<string, unknown> };

/** 질문을 보고 어떤 도구를 어떤 인자로 호출할지 모델이 결정하게 한다 (도구 실행은 호출부 책임). */
export async function decideToolCalls(
  question: string,
  tools: ToolDef[],
  systemContext?: string
): Promise<ToolCall[]> {
  const messages = [
    ...(systemContext ? [{ role: 'system', content: systemContext }] : []),
    { role: 'user', content: question },
  ];

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      tools,
      stream: false,
      think: false,
      keep_alive: '30m',
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama 서버 응답 오류 (${res.status}). 로컬 모델 서버가 실행 중인지 확인하세요.`);
  }

  const data = await res.json();
  const rawToolCalls: any[] = data?.message?.tool_calls ?? [];
  return rawToolCalls
    .map((tc): ToolCall => ({ name: tc.function?.name, arguments: tc.function?.arguments ?? {} }))
    .filter(tc => !!tc.name);
}
