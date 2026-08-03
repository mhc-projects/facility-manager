// app/api/settings/weekly-briefing-criteria/route.ts - 주간 브리핑 계약 지표(자비 계약체결/보조금 신청서접수/보조금 승인)의 업무단계 기준 설정 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { requireAdmin } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface WeeklyBriefingMetricCriteria {
  label: string;
  statusKeys: string[];
}

export interface WeeklyBriefingCriteria {
  selfContract: WeeklyBriefingMetricCriteria;
  subsidyReceived: WeeklyBriefingMetricCriteria;
  subsidyApproved: WeeklyBriefingMetricCriteria;
}

// 기본값 - weekly-scorecard 라우트에서 그동안 하드코딩했던 값과 동일 (배포 직후 동작 불변)
const DEFAULT_CRITERIA: WeeklyBriefingCriteria = {
  selfContract: { label: '자비 계약체결', statusKeys: ['self_contract'] },
  subsidyReceived: { label: '보조금 신청서접수', statusKeys: ['subsidy_approval_pending'] },
  subsidyApproved: { label: '보조금 승인', statusKeys: ['subsidy_approved', 'custom_1777968825327', 'custom_1778198486933'] },
};

const METRIC_KEYS = ['selfContract', 'subsidyReceived', 'subsidyApproved'] as const;

// GET: 현재 기준 조회 (없으면 기본값)
export const GET = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  let criteria = DEFAULT_CRITERIA;

  try {
    const row = await queryOne(
      `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
      ['weekly_briefing_criteria']
    );

    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value);
        const isValid = METRIC_KEYS.every(
          key => parsed?.[key]?.label && Array.isArray(parsed[key].statusKeys) && parsed[key].statusKeys.length > 0
        );
        if (isValid) criteria = parsed;
      } catch (parseError) {
        console.warn('⚠️ [WEEKLY-BRIEFING-CRITERIA] 설정 파싱 오류, 기본값 사용:', parseError);
      }
    }
  } catch (dbError: any) {
    if (dbError?.message?.includes('does not exist') || dbError?.message?.includes('relation')) {
      console.warn('⚠️ [WEEKLY-BRIEFING-CRITERIA] settings 테이블 없음, 기본값 사용');
    } else {
      throw dbError;
    }
  }

  return createSuccessResponse(criteria, '주간 브리핑 기준을 조회했습니다.', 200, { noCache: true });
}, { logLevel: 'debug' });

// POST: 기준 저장 - statusKeys는 반드시 task_stages에 실재하는 stage_key여야 한다
export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  if (!body || typeof body !== 'object') {
    return createErrorResponse('유효하지 않은 요청 데이터입니다', 400);
  }

  for (const key of METRIC_KEYS) {
    const metric = body[key];
    if (!metric || typeof metric !== 'object') {
      return createErrorResponse(`${key} 설정이 누락되었습니다`, 400);
    }
    if (!String(metric.label ?? '').trim()) {
      return createErrorResponse(`${key}의 이름을 입력해주세요`, 400);
    }
    if (!Array.isArray(metric.statusKeys) || metric.statusKeys.length === 0) {
      return createErrorResponse(`${key}에서 최소 1개 이상의 업무단계를 선택해주세요`, 400);
    }
  }

  const allStatusKeys = Array.from(new Set(METRIC_KEYS.flatMap(key => body[key].statusKeys as string[])));
  const validRows = await queryAll(
    `SELECT stage_key FROM task_stages WHERE stage_key = ANY($1::text[])`,
    [allStatusKeys]
  );
  const validKeys = new Set(validRows.map((r: any) => r.stage_key));
  const invalidKeys = allStatusKeys.filter(k => !validKeys.has(k));
  if (invalidKeys.length > 0) {
    return createErrorResponse(`존재하지 않는 업무단계입니다: ${invalidKeys.join(', ')}`, 400);
  }

  const criteria: WeeklyBriefingCriteria = {
    selfContract: { label: String(body.selfContract.label).trim(), statusKeys: body.selfContract.statusKeys },
    subsidyReceived: { label: String(body.subsidyReceived.label).trim(), statusKeys: body.subsidyReceived.statusKeys },
    subsidyApproved: { label: String(body.subsidyApproved.label).trim(), statusKeys: body.subsidyApproved.statusKeys },
  };

  try {
    const result = await queryOne(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key)
       DO UPDATE SET value = $2, updated_at = $3
       RETURNING *`,
      ['weekly_briefing_criteria', JSON.stringify(criteria), new Date().toISOString()]
    );

    if (!result) throw new Error('설정 저장 실패');
  } catch (dbError: any) {
    if (dbError?.message?.includes('does not exist') || dbError?.message?.includes('relation')) {
      return createErrorResponse('settings 테이블이 없어 저장할 수 없습니다. 데이터베이스 관리자에게 문의하세요.', 503);
    }
    throw dbError;
  }

  return createSuccessResponse(criteria, '주간 브리핑 기준이 저장되었습니다.');
}, { logLevel: 'debug' });
