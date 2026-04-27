/**
 * Gemini 기반 스마트 콘텐츠 추출
 *
 * HTML 구조를 분석하여 공고 본문의 정확한 위치를 자동으로 찾아냅니다.
 */

import { Page } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface ContentExtractionResult {
  content: string;
  confidence: number; // 0-1
  method: string; // 사용된 추출 방법
  selector?: string; // 사용된 CSS selector
}

interface PageTypeResult {
  type: 'list' | 'detail' | 'unknown';
  confidence: number;
  detailLinks?: string[]; // 목록 페이지인 경우 상세 페이지 링크
}

/**
 * HTML 구조를 Gemini로 분석하여 최적의 selector 찾기
 */
async function findBestSelectorWithGemini(html: string): Promise<string[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
다음은 한국 정부/지자체 보조금 공고 웹페이지의 HTML입니다.
공고 본문(신청기간, 예산, 지원대상, 지원금액 등의 정보 포함)이 있는 영역을 찾아주세요.

HTML 일부:
${html.substring(0, 8000)}

다음 형식으로 응답해주세요:
1. 가장 가능성 높은 CSS selector (예: .board-view-content)
2. 두 번째 후보 selector (예: .view-cont)
3. 세 번째 후보 selector (예: #boardContents)

응답 형식 (JSON):
{
  "selectors": [
    ".primary-selector",
    ".secondary-selector",
    ".tertiary-selector"
  ],
  "reasoning": "선택 이유 설명"
}
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // JSON 파싱 시도
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.selectors || [];
    }

    // JSON 파싱 실패 시 텍스트에서 selector 추출
    const selectorMatches = text.match(/[.#][\w-]+/g);
    return selectorMatches?.slice(0, 3) || [];

  } catch (error) {
    console.error('Gemini selector 분석 실패:', error);
    return [];
  }
}

/**
 * 여러 selector를 시도하여 최적의 콘텐츠 추출
 */
async function extractWithSelectors(
  page: Page,
  selectors: string[]
): Promise<ContentExtractionResult | null> {
  const qualityKeywords = [
    '신청기간', '접수기간', '모집기간',
    '예산', '지원금액', '지원규모',
    '지원대상', '신청대상', '대상',
    '지원내용', '지원사업',
  ];

  for (const selector of selectors) {
    try {
      const element = page.locator(selector).first();
      const content = await element.textContent({ timeout: 2000 });

      if (!content || content.length < 100) {
        continue;
      }

      // 품질 점수 계산 (키워드 포함 개수)
      const matchedKeywords = qualityKeywords.filter(k => content.includes(k));
      const confidence = matchedKeywords.length / qualityKeywords.length;

      // 최소 신뢰도 체크 (키워드 2개 이상)
      if (matchedKeywords.length >= 2) {
        return {
          content: content.trim(),
          confidence,
          method: 'selector',
          selector,
        };
      }

    } catch (e) {
      continue;
    }
  }

  return null;
}

/**
 * 불필요한 요소 제거 후 body 추출
 */
async function extractByRemovingNoise(page: Page): Promise<ContentExtractionResult | null> {
  try {
    // 불필요한 요소 제거
    const removed = await page.evaluate(() => {
      const unnecessarySelectors = [
        // 구조적 요소
        'nav', 'header', 'footer', 'aside',
        // 클래스 기반
        '[class*="header"]', '[class*="Header"]',
        '[class*="footer"]', '[class*="Footer"]',
        '[class*="nav"]', '[class*="Nav"]', '[class*="navigation"]',
        '[class*="menu"]', '[class*="Menu"]',
        '[class*="sidebar"]', '[class*="Sidebar"]', '[class*="side"]',
        '[class*="gnb"]', '[class*="lnb"]', '[class*="snb"]',
        '[class*="breadcrumb"]', '[class*="Breadcrumb"]',
        '[class*="quick"]', '[class*="Quick"]',
        '[class*="skip"]', '[class*="Skip"]',
        '[class*="util"]', '[class*="Util"]',
        '[class*="top"]', '[class*="Top"]',
        '[class*="bottom"]', '[class*="Bottom"]',
        // ID 기반
        '#header', '#Header', '#gnb', '#lnb', '#snb',
        '#footer', '#Footer', '#nav', '#navigation',
        '#sidebar', '#leftMenu', '#rightMenu',
        // 기타
        'script', 'style', 'noscript', 'iframe',
        '.skip-navigation', '.screen-out',
      ];

      let count = 0;
      unnecessarySelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            el.remove();
            count++;
          });
        } catch (e) {
          // selector 오류 무시
        }
      });
      return count;
    });

    console.log(`  🧹 제거된 요소: ${removed}개`);

    // body 전체 추출
    const content = await page.locator('body').textContent({ timeout: 2000 });

    if (!content || content.length < 100) {
      return null;
    }

    // 텍스트 후처리: 불필요한 패턴 제거
    let cleanContent = content
      // 연속된 공백/줄바꿈을 하나로
      .replace(/\s+/g, ' ')
      // "바로가기" 패턴 제거
      .replace(/\s*바로가기\s*/g, ' ')
      // "메뉴" 단독 패턴 제거
      .replace(/\s+메뉴\s+/g, ' ')
      .trim();

    const qualityKeywords = [
      '신청기간', '접수기간', '모집기간',
      '예산', '지원금액', '지원규모',
      '지원대상', '신청대상', '대상',
    ];

    const matchedKeywords = qualityKeywords.filter(k => cleanContent.includes(k));
    const confidence = matchedKeywords.length / qualityKeywords.length;

    return {
      content: cleanContent,
      confidence,
      method: 'noise-removal',
    };

  } catch (error) {
    return null;
  }
}

/**
 * 메인 스마트 추출 함수
 */
export async function smartExtractContent(
  page: Page,
  url: string
): Promise<ContentExtractionResult> {
  console.log(`🧠 스마트 추출 시작: ${url}`);

  // 1단계: 일반적인 selector들 먼저 시도
  const commonSelectors = [
    '.board-view-content', '.board-content', '.board-detail',
    '.view-content', '.view-cont', '.view-detail',
    '.post-content', '.post-detail', '.post-view',
    '.content-view', '.detail-content', '.article-content',
    '#content', '#boardContent', '#viewContent',
    'article', 'main',
  ];

  console.log('  📋 1단계: 일반 selector 시도...');
  const commonResult = await extractWithSelectors(page, commonSelectors);
  if (commonResult && commonResult.confidence >= 0.3) {
    console.log(`  ✅ 성공 (confidence: ${commonResult.confidence.toFixed(2)})`);
    return commonResult;
  }

  // 2단계: Gemini로 HTML 구조 분석
  console.log('  🤖 2단계: Gemini 구조 분석...');
  try {
    const html = await page.content();
    const geminiSelectors = await findBestSelectorWithGemini(html);

    if (geminiSelectors.length > 0) {
      console.log(`  🎯 Gemini 추천 selectors: ${geminiSelectors.join(', ')}`);
      const geminiResult = await extractWithSelectors(page, geminiSelectors);

      if (geminiResult && geminiResult.confidence >= 0.2) {
        console.log(`  ✅ 성공 (confidence: ${geminiResult.confidence.toFixed(2)})`);
        return geminiResult;
      }
    }
  } catch (error) {
    console.warn('  ⚠️  Gemini 분석 실패:', error);
  }

  // 3단계: 불필요한 요소 제거 후 body 추출
  console.log('  🧹 3단계: 노이즈 제거 후 추출...');
  const noiseResult = await extractByRemovingNoise(page);
  if (noiseResult && noiseResult.confidence >= 0.2) {
    console.log(`  ✅ 성공 (confidence: ${noiseResult.confidence.toFixed(2)})`);
    return noiseResult;
  }

  // 4단계: 최후의 수단 - body 전체 (낮은 신뢰도)
  console.log('  ⚠️  4단계: body 전체 추출 (fallback)...');
  const bodyContent = await page.locator('body').textContent({ timeout: 2000 });
  return {
    content: bodyContent?.trim() || '',
    confidence: 0.1,
    method: 'body-fallback',
  };
}

/**
 * 페이지 타입 감지 (목록 vs 상세)
 */
export async function detectPageType(page: Page): Promise<PageTypeResult> {
  try {
    const html = await page.content();

    // 목록 페이지 패턴 감지
    const listPatterns = [
      /<table[^>]*>[\s\S]*?<tbody/i, // 테이블 목록
      /<ul[^>]*class="[^"]*list[^"]*"/i, // ul 리스트
      /목록.*번호.*제목/i, // 목록 헤더
      /총.*게시물.*건/i, // 게시물 개수 표시
      /페이지.*이동/i, // 페이지네이션
    ];

    const listScore = listPatterns.filter(p => p.test(html)).length;

    // 상세 페이지 패턴 감지
    const detailPatterns = [
      /신청기간|접수기간|모집기간/i,
      /지원대상|신청대상/i,
      /지원금액|지원규모|예산/i,
      /첨부파일|다운로드/i,
      /담당자|문의/i,
    ];

    const detailScore = detailPatterns.filter(p => p.test(html)).length;

    console.log(`  📊 타입 점수 - 목록: ${listScore}, 상세: ${detailScore}`);

    // 목록 페이지로 판단 (목록 점수가 더 높거나, 상세 점수가 낮음)
    if (listScore >= 2 && listScore > detailScore) {
      // 목록에서 상세 페이지 링크 추출
      const links = await extractDetailLinks(page);

      return {
        type: 'list',
        confidence: listScore / listPatterns.length,
        detailLinks: links,
      };
    }

    // 상세 페이지로 판단
    if (detailScore >= 2) {
      return {
        type: 'detail',
        confidence: detailScore / detailPatterns.length,
      };
    }

    // 불명확
    return {
      type: 'unknown',
      confidence: 0,
    };

  } catch (error) {
    console.error('  ❌ 페이지 타입 감지 실패:', error);
    return {
      type: 'unknown',
      confidence: 0,
    };
  }
}

/**
 * 목록 페이지에서 상세 페이지 링크 추출
 */
async function extractDetailLinks(page: Page): Promise<string[]> {
  try {
    const baseUrl = new URL(page.url());

    // 링크 추출 (테이블 안의 링크, mode=V 파라미터 포함 링크 등)
    const links = await page.evaluate(() => {
      const detectedLinks: string[] = [];

      // 1. 테이블 안의 링크
      document.querySelectorAll('table a[href*="mode=V"], table a[href*="bbs"]').forEach(a => {
        const href = (a as HTMLAnchorElement).href;
        if (href && !detectedLinks.includes(href)) {
          detectedLinks.push(href);
        }
      });

      // 2. 제목 링크 (일반적인 패턴)
      document.querySelectorAll('a[href*="view"], a[href*="detail"], a[href*="content"]').forEach(a => {
        const href = (a as HTMLAnchorElement).href;
        const text = a.textContent?.trim() || '';

        // 공고 제목으로 보이는 링크만 (최소 10자 이상)
        if (href && text.length >= 10 && !detectedLinks.includes(href)) {
          detectedLinks.push(href);
        }
      });

      return detectedLinks;
    });

    // 상대 경로를 절대 경로로 변환
    const absoluteLinks = links.map(link => {
      try {
        return new URL(link, baseUrl.origin + baseUrl.pathname).href;
      } catch {
        return link;
      }
    });

    console.log(`  🔗 발견된 상세 링크: ${absoluteLinks.length}개`);
    return absoluteLinks.slice(0, 10); // 최대 10개

  } catch (error) {
    console.error('  ❌ 링크 추출 실패:', error);
    return [];
  }
}

/**
 * 추출된 콘텐츠 품질 검증
 */
export function validateContentQuality(content: string): {
  isValid: boolean;
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 0;

  // 길이 체크
  if (content.length < 100) {
    issues.push('콘텐츠가 너무 짧음 (<100자)');
  } else if (content.length < 500) {
    issues.push('콘텐츠가 짧음 (<500자)');
    score += 0.3;
  } else {
    score += 0.5;
  }

  // 필수 키워드 체크
  const requiredKeywords = ['신청', '지원', '사업'];
  const foundRequired = requiredKeywords.filter(k => content.includes(k));
  score += (foundRequired.length / requiredKeywords.length) * 0.3;

  if (foundRequired.length === 0) {
    issues.push('필수 키워드 없음 (신청/지원/사업)');
  }

  // 상세 정보 키워드 체크
  const detailKeywords = ['기간', '예산', '대상', '금액'];
  const foundDetails = detailKeywords.filter(k => content.includes(k));
  score += (foundDetails.length / detailKeywords.length) * 0.2;

  if (foundDetails.length === 0) {
    issues.push('상세 정보 키워드 없음');
  }

  // 네비게이션 텍스트 오염도 체크
  const noiseKeywords = ['메뉴', '바로가기', 'Language', 'SITE MAP'];
  const noiseCount = noiseKeywords.filter(k => content.includes(k)).length;
  if (noiseCount > 2) {
    issues.push('네비게이션 텍스트 오염도 높음');
    score -= 0.2;
  }

  return {
    isValid: score >= 0.4 && issues.length < 3,
    score: Math.max(0, Math.min(1, score)),
    issues,
  };
}
