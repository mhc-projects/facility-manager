// 업무지침(wiki) + 사업장 메모 도메인에서 Gemini vs gemma4:26b vs qwen3.6:35b 답변 품질 비교
// 프로덕션 qa route와 동일한 검색 로직(getEmbedding + wiki_chunks 코사인 + search_memo_embeddings RPC)을 재사용한다.
// 실행: node scripts/local-llm-domain-comparison.js > /tmp/model-comparison.json
require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getEmbedding(text) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent({
    content: { parts: [{ text }], role: 'user' },
    outputDimensionality: 768,
  });
  return result.embedding.values;
}

const OLLAMA_URL = 'http://localhost:11434';
const GEN_MODELS = ['gemma4:26b', 'qwen3.6:35b'];

const QUESTIONS = [
  'DPF 보증기간은 얼마나 되나요?',
  '방지시설 IoT 점검 주기는?',
  '폐쇄된 시설의 전류계를 재활용했던 사업장이 어디지?',
];

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function parseEmbed(v) { return Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : []); }

async function buildContext(question) {
  const queryEmbedding = await getEmbedding(question);

  const { data: allChunks } = await supabaseAdmin
    .from('wiki_chunks')
    .select('chunk_text, node_id, embedding, wiki_nodes!inner(title, is_published)')
    .eq('wiki_nodes.is_published', true);
  const scored = (allChunks ?? [])
    .map(c => ({ text: c.chunk_text, sim: cosineSim(queryEmbedding, parseEmbed(c.embedding)) }))
    .filter(c => c.sim >= 0.2)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 8);
  const wikiContext = scored.map(c => c.text).join('\n\n---\n\n');

  const { data: memoMatches } = await supabaseAdmin.rpc('search_memo_embeddings', {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    match_count: 5,
    similarity_threshold: 0.5,
  });
  const memoContext = (memoMatches ?? []).length
    ? `[사업장 메모]\n${memoMatches.map(m => `• [사업장: ${m.business_name}] ${m.title}\n  ${m.content}`).join('\n\n')}`
    : '';

  return { wikiContext, memoContext };
}

function buildPrompt(wikiContext, memoContext, question) {
  return `당신은 환경설비 업무 전문가입니다. 아래 참고자료를 근거로 질문에 답변하세요.
참고자료에 없는 내용은 추측하지 말고 "확인되지 않습니다"라고 답하세요.
사업장 메모에서 근거를 찾았으면 사업장명을 명시하세요.

${wikiContext ? `[업무처리지침]\n${wikiContext}` : ''}

${memoContext}

[질문]
${question}`;
}

async function ollamaGenerate(model, prompt) {
  const start = Date.now();
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model, prompt, stream: false, think: false, keep_alive: '30m' }),
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

async function main() {
  const results = [];
  for (const question of QUESTIONS) {
    const { wikiContext, memoContext } = await buildContext(question);
    const prompt = buildPrompt(wikiContext, memoContext, question);
    const answers = {};
    answers.gemini = await geminiGenerate(prompt);
    for (const m of GEN_MODELS) answers[m] = await ollamaGenerate(m, prompt);
    results.push({ question, answers });
    process.stderr.write(`done: ${question}\n`);
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
