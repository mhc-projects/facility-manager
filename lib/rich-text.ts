/**
 * 리치 텍스트(Tiptap) 관련 유틸리티.
 *
 * Tiptap 에디터는 HTML을 입력받기 때문에, 레거시로 저장된 plain text(줄바꿈 `\n` 포함)를
 * 그대로 주입하면 HTML 파서가 whitespace를 collapse 하여 줄바꿈이 모두 사라집니다.
 * 이 모듈은 plain text 여부를 감지하고, 필요 시 `<p>` 단락 HTML로 변환해 줍니다.
 */

/** 문자열이 이미 HTML 마크업을 포함하는지 판단. 태그가 하나라도 있으면 HTML로 간주. */
export function isHtmlContent(value: string): boolean {
  if (!value) return false
  // 간단한 태그 감지: `<tag ...>` 또는 `<tag>` 형태
  return /<[a-zA-Z][\s\S]*?>/.test(value)
}

/** HTML 특수문자 이스케이프 (XSS 방지) */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * plain text를 Tiptap 호환 HTML로 변환한다.
 * - 줄바꿈(`\n`)을 기준으로 분리해 각 줄을 `<p>...</p>` 로 감싼다.
 * - 빈 줄은 `<p></p>` 로 유지하여 단락 구분을 보존한다.
 * - HTML 특수문자는 이스케이프된다.
 */
export function plainTextToHtml(text: string): string {
  if (!text) return ''
  // CRLF / CR 정규화
  const normalized = text.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  return lines
    .map(line => (line.length > 0 ? `<p>${escapeHtml(line)}</p>` : '<p></p>'))
    .join('')
}

/**
 * 저장된 Tiptap HTML 에 남아 있는 레거시/비일관 패턴을 상세 페이지 렌더링에
 * 적합한 형태로 정규화한다.
 *
 * 1) HTML entity 로 태그가 이스케이프된 채 이중 래핑된 데이터 복원
 *    (예: `<p>&lt;p&gt;abc&lt;/p&gt;</p>`). Tiptap 에 HTML 텍스트를 plain-text
 *    paste 할 때 발생.
 *
 * 2) 단락 내부의 연속 `<br>` 로 빈 줄을 만든 경우 `<p></p>` 빈 단락으로 평탄화
 *    (예: `<p>A<br><br></p>` → `<p>A</p><p></p>`). 편집기에서는 Tiptap 의
 *    내부 CSS 때문에 한 줄 공백으로 잘 보이지만, 상세 페이지의 브라우저 기본
 *    스타일에서는 간격이 달라진다. 빈 단락으로 바꿔 `p:empty::before` 규칙의
 *    혜택을 받게 한다. 편집 페이지에서도 같은 정규화를 거쳐 Tiptap 이 재파싱
 *    하므로, 저장 시 자연스럽게 DB 데이터가 정상 형태로 마이그레이션된다.
 */
export function sanitizeLegacyEscapedHtml(value: string): string {
  let result = value

  if (/&lt;\/?[a-zA-Z]/.test(result)) {
    result = result
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
    const outerMatch = result.match(/^\s*<p[^>]*>([\s\S]*)<\/p>\s*$/i)
    if (outerMatch && /<(p|div|h[1-6]|ul|ol|li|table|blockquote)[\s>]/i.test(outerMatch[1])) {
      result = outerMatch[1]
    }
  }

  if (/<br\s*\/?>\s*<br\s*\/?>/i.test(result)) {
    result = result.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (match: string, attrs: string, inner: string) => {
      if (!/<br\s*\/?>\s*<br\s*\/?>/i.test(inner)) return match
      const processed = inner.replace(/(?:<br\s*\/?>\s*){2,}/gi, (brMatch: string) => {
        const brCount = (brMatch.match(/<br\s*\/?>/gi) || []).length
        const emptyPCount = Math.floor(brCount / 2)
        return `</p>${'<p></p>'.repeat(emptyPCount)}<p${attrs}>`
      })
      return `<p${attrs}>${processed}</p>`
    })
    // trailing 에 남는 중복 빈 p 정리 (의도한 중간 빈 p 수는 보존)
    result = result.replace(/(<p[^>]*><\/p>\s*)+$/i, '<p></p>')
  }

  return result
}

/**
 * Tiptap 에디터에 주입할 content 를 정규화한다.
 * - 이미 HTML이면 그대로 반환.
 * - plain text(레거시 데이터)이면 `<p>` 단락 HTML 로 변환.
 * - HTML entity로 이스케이프된 태그가 포함되면 디코딩.
 * - 빈 값은 빈 문자열 반환.
 */
export function normalizeTiptapContent(value: string | null | undefined): string {
  if (!value) return ''
  const unescaped = sanitizeLegacyEscapedHtml(value)
  if (isHtmlContent(unescaped)) return unescaped
  return plainTextToHtml(unescaped)
}
