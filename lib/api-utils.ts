// lib/api-utils.ts - API 최적화 유틸리티
import { NextResponse } from 'next/server';

// 에러 응답 생성 함수
export function createErrorResponse(
  message: string, 
  status: number = 500, 
  details?: any
) {
  return NextResponse.json(
    {
      success: false,
      message,
      ...(details && { details }),
      timestamp: new Date().toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    },
    {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    }
  );
}

// 성공 응답 생성 함수
export function createSuccessResponse(
  data?: any,
  message?: string,
  status: number = 200,
  options?: { noCache?: boolean }
) {
  // 🔥 배포 환경 캐싱 방지 옵션
  const headers = options?.noCache
    ? {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    : {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Content-Type': 'application/json; charset=utf-8'
      };

  return NextResponse.json(
    {
      success: true,
      ...(data && { data }),
      ...(message && { message }),
      timestamp: new Date().toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    },
    {
      status,
      headers
    }
  );
}

// API 핸들러 래퍼 (에러 처리 및 로깅)
export function withApiHandler(
  handler: (request: any, context?: any) => Promise<NextResponse>,
  options: { requiresAuth?: boolean; logLevel?: 'info' | 'debug' | 'error' } = {}
) {
  return async (request: any, context?: any) => {
    const startTime = Date.now();
    const { logLevel = 'info' } = options;
    
    try {
      if (logLevel === 'debug') {
        console.log(`🔧 [API] ${request.method} ${request.url} 시작`);
      }
      
      const response = await handler(request, context);
      
      const duration = Date.now() - startTime;
      if (logLevel === 'debug') {
        console.log(`✅ [API] ${request.method} ${request.url} 완료 (${duration}ms)`);
      }
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [API] ${request.method} ${request.url} 실패 (${duration}ms):`, error);
      
      // Google Auth 관련 에러는 더 자세히 로깅
      if (error instanceof Error && error.message.includes('DECODER')) {
        console.error('🔐 [GOOGLE-AUTH] Private Key 디코딩 오류 - Vercel 환경변수 확인 필요');
        console.error('🔐 [GOOGLE-AUTH] Private Key 형식:', {
          hasBeginMarker: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.includes('-----BEGIN'),
          hasEndMarker: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.includes('-----END'),
          keyLength: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.length,
          isQuoted: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.startsWith('"')
        });
      }
      
      return createErrorResponse(
        error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
        500,
        process.env.NODE_ENV === 'development' ? { 
          stack: error instanceof Error ? error.stack : undefined,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        } : undefined
      );
    }
  };
}

// 입력 검증 헬퍼
export function validateRequired(data: Record<string, any>, fields: string[]): string | null {
  for (const field of fields) {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      return `${field}은(는) 필수 항목입니다.`;
    }
  }
  return null;
}

// Google Sheets 범위 생성 헬퍼
export function createSheetRange(sheetName: string, range?: string): string {
  return range ? `'${sheetName}'!${range}` : `'${sheetName}'!A:Z`;
}

// 타임아웃 헬퍼
export function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number,
  errorMessage = '요청 시간이 초과되었습니다.'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

// 연락처 포맷팅 (공통 함수)
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  
  const numbers = phone.replace(/[^0-9]/g, '');
  
  if (numbers.length === 11 && numbers.startsWith('010')) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
  }
  
  return phone;
}

// 파일명 안전화
export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\/\\:*?"<>|]/g, '_').trim();
}