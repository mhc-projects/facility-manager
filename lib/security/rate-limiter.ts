import { NextRequest } from 'next/server';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  windowMs: number; // 시간 윈도우 (밀리초)
  maxRequests: number; // 최대 요청 수
}

// Rate Limiter 클래스
export class RateLimiter {
  private static requests = new Map<string, RateLimitEntry>();

  // 기본 설정
  private static defaultConfig: RateLimitConfig = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15분
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100') // 100 요청
  };

  // API별 커스텀 설정
  private static apiConfigs: Record<string, RateLimitConfig> = {
    '/api/auth/login': {
      windowMs: 15 * 60 * 1000, // 15분
      maxRequests: process.env.NODE_ENV === 'development' ? 100 : 5 // 개발: 100, 프로덕션: 5
    },
    '/api/auth/verify': {
      windowMs: 15 * 60 * 1000, // 15분
      maxRequests: process.env.NODE_ENV === 'development' ? 1000 : 100 // 페이지 로드마다 호출되므로 높은 제한
    },
    '/api/upload': {
      windowMs: 60 * 60 * 1000, // 1시간
      maxRequests: 20 // 파일 업로드 제한
    },
    '/api/auth/social': {
      windowMs: 15 * 60 * 1000, // 15분
      maxRequests: 50 // 소셜 로그인 테스트용으로 증가
    },
    '/api/auth': {
      windowMs: 15 * 60 * 1000, // 15분
      maxRequests: 30 // 인증 관련 API 제한 완화
    },
    '/api/revenue/calculate': {
      windowMs: 60 * 60 * 1000, // 1시간
      maxRequests: 10000 // 대량 재계산 지원 (슈퍼관리자 전용)
    },
    '/api/revenue/recalculate': {
      windowMs: 60 * 60 * 1000, // 1시간
      maxRequests: 50 // 슈퍼관리자 전용 (전체 재계산 포함)
    },
    '/api/revenue/business-summary': {
      windowMs: 15 * 60 * 1000, // 15분
      maxRequests: 200 // 캐시 조회는 상대적으로 제한 완화
    },
    '/api/facility-tasks': {
      windowMs: 15 * 60 * 1000, // 15분
      maxRequests: 10000 // 개발 환경: 대량 조회를 위한 높은 제한
    },
    '/api/uploaded-files-supabase': {
      windowMs: 15 * 60 * 1000, // 15분
      maxRequests: process.env.NODE_ENV === 'development' ? 1000 : 200 // 개발: Hot Reload 대응, 프로덕션: 정상 사용 + 여유
    }
  };

  // IP 주소 기반 Rate Limiting 체크
  static async check(request: NextRequest): Promise<{
    success: boolean;
    limit?: number;
    remaining?: number;
    resetTime?: number;
    error?: string;
  }> {
    try {
      const ip = this.getClientIP(request);
      const path = request.nextUrl.pathname;
      const config = this.getConfigForPath(path);
      const key = `${ip}:${path}`;

      const now = Date.now();
      const entry = this.requests.get(key);

      // 윈도우 리셋 확인
      if (!entry || (now - entry.windowStart) >= config.windowMs) {
        this.requests.set(key, {
          count: 1,
          windowStart: now
        });

        return {
          success: true,
          limit: config.maxRequests,
          remaining: config.maxRequests - 1,
          resetTime: now + config.windowMs
        };
      }

      // 요청 수 증가
      entry.count += 1;

      if (entry.count > config.maxRequests) {
        // 보안 로그 기록
        console.warn(`[RATE_LIMIT] IP ${ip} exceeded limit for ${path}: ${entry.count}/${config.maxRequests}`);

        return {
          success: false,
          limit: config.maxRequests,
          remaining: 0,
          resetTime: entry.windowStart + config.windowMs,
          error: 'Too many requests'
        };
      }

      return {
        success: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - entry.count,
        resetTime: entry.windowStart + config.windowMs
      };

    } catch (error) {
      console.error('[RATE_LIMIT] Error checking rate limit:', error);
      // 에러 시 요청 허용 (보안과 서비스 가용성 균형)
      return { success: true };
    }
  }

  // 클라이언트 IP 주소 추출
  private static getClientIP(request: NextRequest): string {
    // Vercel/Next.js 환경에서 IP 추출
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');

    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    if (realIP) {
      return realIP;
    }

    // 개발 환경
    return request.ip || '127.0.0.1';
  }

  // 경로별 설정 가져오기
  private static getConfigForPath(path: string): RateLimitConfig {
    // 정확한 경로 매치 먼저 확인
    if (this.apiConfigs[path]) {
      return this.apiConfigs[path];
    }

    // 부분 매치 확인
    for (const [configPath, config] of Object.entries(this.apiConfigs)) {
      if (path.startsWith(configPath)) {
        return config;
      }
    }

    return this.defaultConfig;
  }

  // 특정 IP 차단 해제 (관리자 기능)
  static unblock(ip: string, path?: string): boolean {
    try {
      if (path) {
        const key = `${ip}:${path}`;
        return this.requests.delete(key);
      } else {
        // 해당 IP의 모든 경로 차단 해제
        const keysToDelete = Array.from(this.requests.keys())
          .filter(key => key.startsWith(`${ip}:`));

        keysToDelete.forEach(key => this.requests.delete(key));
        return keysToDelete.length > 0;
      }
    } catch (error) {
      console.error('[RATE_LIMIT] Error unblocking IP:', error);
      return false;
    }
  }

  // 만료된 엔트리 정리 (메모리 관리)
  static cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      const config = this.getConfigForPath(key.split(':')[1] || '');
      if ((now - entry.windowStart) >= config.windowMs) {
        this.requests.delete(key);
      }
    }
  }

  // 현재 상태 조회 (모니터링용)
  static getStats(): {
    totalEntries: number;
    blockedIPs: number;
    topRequesterIPs: Array<{ ip: string; requests: number; path: string }>;
  } {
    const stats = {
      totalEntries: this.requests.size,
      blockedIPs: 0,
      topRequesterIPs: [] as Array<{ ip: string; requests: number; path: string }>
    };

    const ipStats = new Map<string, number>();

    for (const [key, entry] of this.requests.entries()) {
      const [ip, path] = key.split(':');
      const config = this.getConfigForPath(path);

      if (entry.count >= config.maxRequests) {
        stats.blockedIPs += 1;
      }

      const currentCount = ipStats.get(ip) || 0;
      ipStats.set(ip, currentCount + entry.count);

      stats.topRequesterIPs.push({
        ip,
        requests: entry.count,
        path
      });
    }

    // 요청 수 기준 정렬
    stats.topRequesterIPs.sort((a, b) => b.requests - a.requests);
    stats.topRequesterIPs = stats.topRequesterIPs.slice(0, 10); // 상위 10개만

    return stats;
  }
}

// 정기적 정리 작업 (1시간마다)
if (typeof window === 'undefined') {
  setInterval(() => {
    RateLimiter.cleanup();
  }, 60 * 60 * 1000);
}