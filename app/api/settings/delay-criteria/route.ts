// app/api/settings/delay-criteria/route.ts - 지연/위험 업무 기준 설정 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryOne } from '@/lib/supabase-direct';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// 지연/위험 기준 타입 정의
export interface DelayCriteria {
  self: {
    delayed: number;
    risky: number;
  };
  subsidy: {
    delayed: number;
    risky: number;
  };
  as: {
    delayed: number;
    risky: number;
  };
  etc: {
    delayed: number;
    risky: number;
  };
}

// 기본값
const DEFAULT_CRITERIA: DelayCriteria = {
  self: { delayed: 7, risky: 14 },
  subsidy: { delayed: 14, risky: 20 },
  as: { delayed: 3, risky: 7 },
  etc: { delayed: 7, risky: 10 }
};

// GET: 현재 설정 조회
export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    console.log('📊 [DELAY-CRITERIA] 설정 조회 요청');

    let criteria = DEFAULT_CRITERIA;

    try {
      // settings 테이블에서 delay_criteria 조회 - Direct PostgreSQL
      const settings = await queryOne(
        `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
        ['delay_criteria']
      );

      if (settings?.value) {
        try {
          criteria = JSON.parse(settings.value);
        } catch (parseError) {
          console.warn('⚠️ [DELAY-CRITERIA] 설정 파싱 오류, 기본값 사용:', parseError);
        }
      }
    } catch (dbError: any) {
      // settings 테이블이 없는 경우 기본값 사용
      if (dbError?.message?.includes('does not exist') || dbError?.message?.includes('relation')) {
        console.warn('⚠️ [DELAY-CRITERIA] settings 테이블 없음, 기본값 사용');
      } else {
        // 다른 DB 오류는 throw
        throw dbError;
      }
    }

    console.log('✅ [DELAY-CRITERIA] 조회 성공:', criteria);

    return createSuccessResponse(
      criteria,
      '설정을 성공적으로 조회했습니다.'
    );

  } catch (error: any) {
    console.error('🔴 [DELAY-CRITERIA] GET 오류:', error?.message || error);
    return createErrorResponse('설정 조회 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// POST: 설정 저장
export const POST = withApiHandler(async (request: NextRequest) => {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const body = await request.json();

    console.log('💾 [DELAY-CRITERIA] 설정 저장 요청:', body);

    // 요청 데이터 검증
    if (!body || typeof body !== 'object') {
      return createErrorResponse('유효하지 않은 요청 데이터입니다', 400);
    }

    // 필수 필드 검증
    const requiredTypes = ['self', 'subsidy', 'as', 'etc'];
    for (const type of requiredTypes) {
      if (!body[type] || typeof body[type] !== 'object') {
        return createErrorResponse(`${type} 설정이 누락되었습니다`, 400);
      }
      if (typeof body[type].delayed !== 'number' || typeof body[type].risky !== 'number') {
        return createErrorResponse(`${type} 설정의 값이 유효하지 않습니다`, 400);
      }
      if (body[type].delayed < 1 || body[type].risky < 1) {
        return createErrorResponse('설정 값은 1 이상이어야 합니다', 400);
      }
    }

    const criteria: DelayCriteria = body;

    try {
      // settings 테이블에 upsert - Direct PostgreSQL
      const result = await queryOne(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = $3
         RETURNING *`,
        ['delay_criteria', JSON.stringify(criteria), new Date().toISOString()]
      );

      if (!result) {
        console.error('🔴 [DELAY-CRITERIA] 저장 실패');
        throw new Error('설정 저장 실패');
      }

      console.log('✅ [DELAY-CRITERIA] 저장 성공:', result);

      return createSuccessResponse(
        criteria,
        '설정이 성공적으로 저장되었습니다.'
      );
    } catch (dbError: any) {
      // settings 테이블이 없는 경우 안내 메시지
      if (dbError?.message?.includes('does not exist') || dbError?.message?.includes('relation')) {
        console.warn('⚠️ [DELAY-CRITERIA] settings 테이블 없음, 저장 불가');
        return createErrorResponse(
          'settings 테이블이 없어 저장할 수 없습니다. 데이터베이스 관리자에게 문의하세요.',
          503
        );
      }
      // 다른 DB 오류는 throw
      throw dbError;
    }

  } catch (error: any) {
    console.error('🔴 [DELAY-CRITERIA] POST 오류:', error?.message || error);
    return createErrorResponse('설정 저장 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });