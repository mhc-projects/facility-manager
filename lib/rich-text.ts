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
 * 레거시 데이터에서 HTML 태그가 entity로 이스케이프된 채 저장된 경우 디코딩한다.
 * Tiptap 에디터에 HTML 텍스트를 plain-text paste 할 때 `<`, `>` 가 자동으로
 * `&lt;`, `&gt;` 로 이스케이프되어 저장되는 케이스가 실제로 발견되었음.
 * (예: `<p>&lt;p&gt;abc&lt;/p&gt;</p>` 형태의 이중 래핑)
 */
export function sanitizeLegacyEscapedHtml(value: string): string {
  // 태그 모양을 가진 HTML entity(`&lt;a`, `&lt;/` 등)가 있을 때만 디코딩.
  // 단순히 `&lt;` 만 있는 경우(의도적인 escape)는 건드리지 않는다.
  if (!/&lt;\/?[a-zA-Z]/.test(value)) return value
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
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
