// Gemini vs 로컬 Ollama 모델(qwen3.6:35b, gemma4:26b) 검색·답변 품질/속도 비교 테스트
// 실행: node scripts/local-llm-comparison-test.js
require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const OLLAMA_URL = 'http://localhost:11434';
const GEN_MODELS = ['qwen3.6:35b', 'gemma4:26b'];
const EMBED_MODEL = 'nomic-embed-text';

// 실제 business_memos에서 가져온 샘플 (2026-07-10 세션에서 조회한 값 재사용, 신규 쿼리 없음)
const MEMOS = [
  { business: '㈜유엠하이텍 아산공장(이전설치)', content: '폐쇄된 시설의 전류계를 재활용하여 금번에 추가된 시설의 전류계 추가건 (우선 견적만 드림)' },
  { business: '백두정비', content: '배출전류계 1ea삭감함\n26.03.12 수정계산서(-33만원) 발행하고 사업장에 환불(6만원)함' },
  { business: '미르환경', content: '배출시설1은 36파이 전류계, 배출시설2(배2~배3 통합전원)은 24파이 전류계, 송풍 전류계는 16파이 전류계 필요함' },
  { business: '영진수지', content: '비디텍 전류계 3기 부착 건' },
  { business: '성만산업', content: '사업반려 히스토리. 배치도에 전류계가 하나의 판넬에 설치하는걸로 되어 있지만 각각의 시설 옆에 컨트롤러가 있는데 왜 차단기 하나에 거느냐는 지적' },
];

const QUESTION = '폐쇄된 시설의 전류계를 재활용했던 사업장이 어디지?';

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  const data = await res.json();
  return data.embedding;
}

async function ollamaGenerate(model, prompt) {
  const start = Date.now();
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  const data = await res.json();
  return { text: data.response, ms: Date.now() - start };
}

async function geminiGenerate(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const start = Date.now();
  const result = await model.generateContent(prompt);
  return { text: result.response.text(), ms: Date.now() - start };
}

function buildPrompt(context) {
  return `당신은 환경설비 업무 전문가입니다. 아래 사업장 메모를 근거로 질문에 답변하세요.
반드시 관련된 사업장명을 명시해서 답변하세요.

[사업장 메모]
${context}

[질문]
${QUESTION}`;
}

async function main() {
  console.log('=== 1. 임베딩 검색 품질 테스트 (nomic-embed-text) ===\n');
  const queryEmb = await ollamaEmbed(QUESTION);
  const scored = [];
  for (const m of MEMOS) {
    const emb = await ollamaEmbed(`${m.business}\n${m.content}`);
    scored.push({ ...m, sim: cosineSim(queryEmb, emb) });
  }
  scored.sort((a, b) => b.sim - a.sim);
  scored.forEach((s, i) => console.log(`${i + 1}. [${s.sim.toFixed(4)}] ${s.business} - ${s.content.slice(0, 40)}...`));
  const top1Correct = scored[0].business.includes('유엠하이텍');
  console.log(`\n1위가 정답(유엠하이텍)인가: ${top1Correct ? 'O' : 'X'}\n`);

  console.log('=== 2. 답변 생성 품질/속도 비교 (정답 메모를 컨텍스트로 고정 제공) ===\n');
  const context = `[사업장: ${MEMOS[0].business}] ${MEMOS[0].content}`;
  const prompt = buildPrompt(context);

  const gemini = await geminiGenerate(prompt);
  console.log(`--- Gemini 2.5 Flash (${gemini.ms}ms) ---`);
  console.log(gemini.text.trim());
  console.log();

  for (const model of GEN_MODELS) {
    const r = await ollamaGenerate(model, prompt);
    console.log(`--- ${model} (${r.ms}ms) ---`);
    console.log(r.text.trim());
    console.log();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
