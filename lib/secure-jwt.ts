// 보안 강화된 JWT 시스템
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

// 환경 변수
const NEW_JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET_V2 || generateSecureSecret();

// Supabase 클라이언트
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * 보안 강화된 JWT 시크릿 생성
 */
function generateSecureSecret(): string {
  // JWT_SECRET/JWT_SECRET_V2 미설정 시에만 도달 - 64바이트 랜덤 시크릿 생성
  // (프로세스 재시작마다 값이 바뀌므로 기존 토큰이 전부 무효화됨 - 반드시 env var를 설정할 것)
  console.warn('⚠️ [SECURE-JWT] JWT_SECRET 환경변수 미설정 - 임시 랜덤 시크릿 사용 중');
  const crypto = require('crypto');
  return crypto.randomBytes(64).toString('hex');
}

/**
 * JWT 페이로드 타입
 */
interface JWTPayload {
  userId?: string;
  id?: string;
  name?: string;
  email?: string;
  permission_level?: number;
  department?: string;
  iat?: number;
  exp?: number;
}

/**
 * 사용자 정보 타입
 */
interface User {
  id: string;
  name: string;
  email: string;
  permission_level: number;
  department: string;
}

/**
 * 토큰 검증 결과 타입
 */
interface TokenVerificationResult {
  user: User | null;
  isOldToken: boolean;
  shouldRefresh: boolean;
  error?: string;
}

/**
 * 하이브리드 토큰 검증 (기존 + 새로운 토큰 모두 지원)
 */
export async function verifyTokenHybrid(token: string): Promise<TokenVerificationResult> {
  let decoded: JWTPayload;
  const isOldToken = false;

  try {
    decoded = jwt.verify(token, NEW_JWT_SECRET) as JWTPayload;
  } catch (error: any) {
    console.error('❌ [JWT] 토큰 검증 실패:', error.message);
    return {
      user: null,
      isOldToken: false,
      shouldRefresh: false,
      error: '유효하지 않은 토큰'
    };
  }

  // 3. 사용자 정보 조회
  const userId = decoded.userId || decoded.id;
  if (!userId) {
    return {
      user: null,
      isOldToken,
      shouldRefresh: false,
      error: '토큰에 사용자 ID가 없습니다'
    };
  }

  try {
    // Direct PostgreSQL query
    const { queryOne } = await import('@/lib/supabase-direct');
    const user = await queryOne(
      'SELECT id, name, email, permission_level, department FROM employees WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (!user) {
      console.warn('⚠️ [JWT] 사용자 조회 실패: 사용자 없음');
      return {
        user: null,
        isOldToken,
        shouldRefresh: false,
        error: '사용자를 찾을 수 없습니다'
      };
    }

    // 4. 토큰 갱신 필요 여부 판단
    const shouldRefresh = isOldToken || isTokenExpiringSoon(decoded);

    return {
      user: user as User,
      isOldToken,
      shouldRefresh,
    };

  } catch (dbError) {
    console.error('❌ [JWT] 데이터베이스 오류:', dbError);
    return {
      user: null,
      isOldToken,
      shouldRefresh: false,
      error: '데이터베이스 연결 오류'
    };
  }
}

/**
 * 토큰 만료 임박 여부 확인 (1일 이내)
 */
function isTokenExpiringSoon(decoded: JWTPayload): boolean {
  if (!decoded.exp) return true;

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = decoded.exp - now;
  const oneDayInSeconds = 24 * 60 * 60;

  return expiresIn < oneDayInSeconds;
}

/**
 * 새로운 보안 토큰 생성
 */
export function generateSecureToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    id: user.id,
    name: user.name,
    email: user.email,
    permission_level: user.permission_level,
    department: user.department,
  };

  return jwt.sign(payload, NEW_JWT_SECRET, {
    expiresIn: '7d', // 7일 만료
    issuer: 'facility-manager',
    audience: 'facility-manager-users'
  });
}

/**
 * 요청에서 사용자 정보 추출 (기존 API와 호환성 유지)
 */
export async function getUserFromToken(request: NextRequest): Promise<User | null> {
  try {
    console.log('🔍 [SECURE-JWT] 요청 헤더에서 토큰 추출 시작');

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ [SECURE-JWT] Authorization 헤더 없음');
      return null;
    }

    const token = authHeader.substring(7);
    const result = await verifyTokenHybrid(token);

    if (!result.user) {
      console.log('❌ [SECURE-JWT] 토큰 검증 실패:', result.error);
      return null;
    }

    // TODO: 토큰 갱신이 필요한 경우 응답 헤더에 새 토큰 포함
    if (result.shouldRefresh) {
      console.log('🔄 [SECURE-JWT] 토큰 갱신 필요 (응답 헤더에 새 토큰 포함 예정)');
    }

    console.log('✅ [SECURE-JWT] 사용자 인증 성공:', result.user.name);
    return result.user;

  } catch (error) {
    console.error('❌ [SECURE-JWT] 토큰 처리 중 예외:', error);
    return null;
  }
}

/**
 * 토큰 갱신 응답 헤더 설정
 */
export function setRefreshTokenHeader(response: Response, newToken: string): Response {
  response.headers.set('X-New-Token', newToken);
  response.headers.set('X-Token-Refreshed', 'true');
  return response;
}

/**
 * 간단한 토큰 검증 (기존 API 호환용)
 * 사용자 정보 대신 디코딩된 페이로드만 반환
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, NEW_JWT_SECRET) as JWTPayload;
  } catch (error) {
    console.error('❌ [JWT] verifyToken 실패');
    return null;
  }
}

export {
  NEW_JWT_SECRET
};