// ============================================================
// Gemini AI Verification System
// ============================================================
// Purpose: Verify subsidy announcement relevance using Google Gemini
// Model: gemini-2.0-flash (free tier, replaces retired gemini-1.5-flash)
// Integration: Works alongside existing keyword matching system
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Gemini model configuration
const MODEL_NAME = 'gemini-2.5-flash';
const GENERATION_CONFIG = {
  temperature: 0.3, // Lower temperature for more consistent results
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 500, // Limit response length for cost efficiency
};

// IoT subsidy-related keywords (from existing system)
const IOT_KEYWORDS = [
  'IoT',
  '사물인터넷',
  '스마트',
  '센서',
  '모니터링',
  '측정기기',
  '원격',
  '자동화',
  '데이터',
  '실시간',
  '클라우드',
  '플랫폼',
];

// System prompt for announcement verification
const SYSTEM_PROMPT = `당신은 IoT 기술 및 보조금 공고 전문가입니다.
귀하의 임무는 제공된 공고가 IoT 관련 보조금, 지원금, 또는 관련 사업인지 판단하는 것입니다.

**IoT 관련 공고 기준:**
1. 사물인터넷(IoT) 기술 활용
2. 스마트 시티/팩토리/팜 등 스마트 인프라
3. 센서 및 측정기기 설치/관리
4. 원격 모니터링 시스템
5. 데이터 수집 및 분석 플랫폼
6. 환경/에너지 관리를 위한 IoT 솔루션
7. 중소기업/소상공인 대상 IoT 기술 지원

**제외 기준:**
- 일반 건설/토목 공사
- 순수 소프트웨어만 다루는 사업
- IoT와 무관한 일반 보조금
- 연구개발만 다루는 학술 공고 (실제 사업화와 무관)

**응답 형식 (JSON):**
{
  "is_relevant": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "판단 근거를 1-2문장으로 설명",
  "matched_criteria": ["기준1", "기준2"]
}`;

// Verification result interface
export interface GeminiVerificationResult {
  is_relevant: boolean;
  confidence: number;
  reasoning: string;
  matched_criteria: string[];
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  response_time_ms: number;
  api_cost_usd: number;
}

/**
 * Verify announcement relevance using Gemini AI
 */
export async function verifyAnnouncementWithGemini(
  title: string,
  content: string,
  sourceUrl: string
): Promise<GeminiVerificationResult> {
  const startTime = Date.now();

  try {
    // Initialize model
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: GENERATION_CONFIG,
    });

    // Construct prompt
    const prompt = constructPrompt(title, content, sourceUrl);

    // Generate response
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse JSON response
    const parsed = parseGeminiResponse(text);

    // Calculate token usage and cost
    const tokenUsage = {
      prompt_tokens: estimateTokens(prompt),
      completion_tokens: estimateTokens(text),
      total_tokens: estimateTokens(prompt) + estimateTokens(text),
    };

    // Gemini 1.5 Flash pricing (as of Dec 2024)
    // Input: $0.075 per 1M tokens
    // Output: $0.30 per 1M tokens
    const inputCost = (tokenUsage.prompt_tokens / 1_000_000) * 0.075;
    const outputCost = (tokenUsage.completion_tokens / 1_000_000) * 0.30;
    const totalCost = inputCost + outputCost;

    const responseTime = Date.now() - startTime;

    return {
      is_relevant: parsed.is_relevant,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      matched_criteria: parsed.matched_criteria || [],
      token_usage: tokenUsage,
      response_time_ms: responseTime,
      api_cost_usd: totalCost,
    };
  } catch (error: any) {
    console.error('Gemini verification error:', error);

    // Return fallback result on error
    return {
      is_relevant: false,
      confidence: 0,
      reasoning: `AI verification failed: ${error.message}`,
      matched_criteria: [],
      token_usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      response_time_ms: Date.now() - startTime,
      api_cost_usd: 0,
    };
  }
}

/**
 * Batch verify multiple announcements
 */
export async function batchVerifyAnnouncements(
  announcements: Array<{
    title: string;
    content: string;
    sourceUrl: string;
  }>
): Promise<GeminiVerificationResult[]> {
  const results: GeminiVerificationResult[] = [];

  // Process sequentially to avoid rate limits
  for (const announcement of announcements) {
    const result = await verifyAnnouncementWithGemini(
      announcement.title,
      announcement.content,
      announcement.sourceUrl
    );
    results.push(result);

    // Small delay to avoid rate limits (adjust as needed)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Construct verification prompt
 */
function constructPrompt(title: string, content: string, sourceUrl: string): string {
  // Truncate content to avoid excessive token usage
  const maxContentLength = 2000;
  const truncatedContent =
    content.length > maxContentLength
      ? content.substring(0, maxContentLength) + '...'
      : content;

  return `${SYSTEM_PROMPT}

**공고 정보:**
제목: ${title}
출처: ${sourceUrl}
내용: ${truncatedContent}

위 공고가 IoT 관련 보조금/지원금 공고인지 판단하고 JSON 형식으로 응답해주세요.`;
}

/**
 * Parse Gemini JSON response
 */
function parseGeminiResponse(text: string): {
  is_relevant: boolean;
  confidence: number;
  reasoning: string;
  matched_criteria?: string[];
} {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    const parsed = JSON.parse(jsonText);

    return {
      is_relevant: Boolean(parsed.is_relevant),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reasoning: String(parsed.reasoning || 'No reasoning provided'),
      matched_criteria: Array.isArray(parsed.matched_criteria)
        ? parsed.matched_criteria
        : [],
    };
  } catch (error) {
    console.error('Failed to parse Gemini response:', text, error);

    // Fallback: check if response contains positive keywords
    const lowerText = text.toLowerCase();
    const isRelevant = lowerText.includes('relevant') || lowerText.includes('관련');

    return {
      is_relevant: isRelevant,
      confidence: 0.5,
      reasoning: 'Failed to parse structured response',
      matched_criteria: [],
    };
  }
}

/**
 * Estimate token count (rough approximation)
 * Korean text: ~1.5 tokens per character
 * English text: ~0.25 tokens per word
 */
function estimateTokens(text: string): number {
  // Count Korean characters
  const koreanChars = (text.match(/[\u3131-\uD79D]/g) || []).length;

  // Count non-Korean words
  const nonKoreanWords = text
    .replace(/[\u3131-\uD79D]/g, '')
    .trim()
    .split(/\s+/).length;

  return Math.ceil(koreanChars * 1.5 + nonKoreanWords * 0.25);
}

/**
 * Get verification statistics summary
 */
export function summarizeVerificationResults(
  results: GeminiVerificationResult[]
): {
  total: number;
  relevant: number;
  irrelevant: number;
  avg_confidence: number;
  total_cost_usd: number;
  avg_response_time_ms: number;
  total_tokens: number;
} {
  return {
    total: results.length,
    relevant: results.filter(r => r.is_relevant).length,
    irrelevant: results.filter(r => !r.is_relevant).length,
    avg_confidence:
      results.reduce((sum, r) => sum + r.confidence, 0) / results.length || 0,
    total_cost_usd: results.reduce((sum, r) => sum + r.api_cost_usd, 0),
    avg_response_time_ms:
      results.reduce((sum, r) => sum + r.response_time_ms, 0) / results.length || 0,
    total_tokens: results.reduce((sum, r) => sum + r.token_usage.total_tokens, 0),
  };
}
