// 업무지침 Q&A 답변 생성용 Gemini 스트리밍 생성 + 함수 호출 클라이언트 (로컬 Ollama 대체)
import { GoogleGenerativeAI, type FunctionDeclarationSchema, type GenerationConfig } from '@google/generative-ai';

const MODEL_NAME = 'gemini-2.5-flash';

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
  if (!_genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다');
    _genAI = new GoogleGenerativeAI(key);
  }
  return _genAI;
}

/** think: 사고과정(thinking) 사용 여부. false면 thinkingBudget을 0으로 낮춰 응답 속도를 우선한다. */
export async function* generateStream(prompt: string, options?: { think?: boolean }): AsyncGenerator<string> {
  const model = getGenAI().getGenerativeModel({ model: MODEL_NAME });
  const generationConfig = options?.think
    ? undefined
    : ({ thinkingConfig: { thinkingBudget: 0 } } as unknown as GenerationConfig);

  const result = await model.generateContentStream({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(generationConfig ? { generationConfig } : {}),
  });

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
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
  const model = getGenAI().getGenerativeModel({
    model: MODEL_NAME,
    tools: [{
      functionDeclarations: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters as unknown as FunctionDeclarationSchema,
      })),
    }],
    ...(systemContext ? { systemInstruction: systemContext } : {}),
  });

  const result = await model.generateContent(question);
  const calls = result.response.functionCalls() ?? [];
  return calls
    .map((c): ToolCall => ({ name: c.name, arguments: (c.args as Record<string, unknown>) ?? {} }))
    .filter(c => !!c.name);
}
