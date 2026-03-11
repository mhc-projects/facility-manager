import { query as pgQuery } from '@/lib/supabase-direct';

export interface ApiKeyInfo {
  id: string;
  key_name: string;
  allowed_paths: string[] | null;
}

/**
 * API 키 검증
 * api_keys 테이블에서 유효한 키인지 확인하고, 허용된 경로인지 검사
 * 성공 시 키 정보 반환, 실패 시 null 반환
 */
export async function verifyApiKey(
  apiKey: string,
  requestPath: string
): Promise<ApiKeyInfo | null> {
  if (!apiKey) return null;

  try {
    const result = await pgQuery(
      `SELECT id, key_name, allowed_paths
       FROM api_keys
       WHERE api_key = $1
         AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [apiKey]
    );

    if (result.rows.length === 0) return null;

    const keyInfo: ApiKeyInfo = result.rows[0];

    // 경로 제한이 있는 경우 확인
    if (keyInfo.allowed_paths && keyInfo.allowed_paths.length > 0) {
      const allowed = keyInfo.allowed_paths.some(pattern => {
        // 와일드카드 패턴 지원 (예: /api/as-records/*)
        if (pattern.endsWith('/*')) {
          const base = pattern.slice(0, -2);
          return requestPath === base || requestPath.startsWith(base + '/');
        }
        return requestPath === pattern;
      });
      if (!allowed) return null;
    }

    // 마지막 사용 시각 업데이트 (비동기, 실패해도 무시)
    pgQuery(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [keyInfo.id]
    ).catch(() => {});

    return keyInfo;
  } catch {
    return null;
  }
}
