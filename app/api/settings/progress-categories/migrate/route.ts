// app/api/settings/progress-categories/migrate/route.ts - 진행구분 일괄 변경 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryOne, queryAll } from '@/lib/supabase-direct';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: 현재 business_info에 실제 사용 중인 진행구분 값 목록 + 사업장 수
export const GET = withApiHandler(async (_request: NextRequest) => {
  const rows = await queryAll(
    `SELECT
       COALESCE(progress_status, '') AS progress_status,
       COUNT(*) AS business_count
     FROM business_info
     WHERE is_deleted = false
     GROUP BY progress_status
     ORDER BY business_count DESC`
  );
  return createSuccessResponse(rows ?? [], '진행구분별 사업장 수를 조회했습니다.');
}, { logLevel: 'debug' });

// POST: 진행구분 일괄 변경 (from → to)
export const POST = withApiHandler(async (request: NextRequest) => {
  const body = await request.json();
  const from = (body?.from ?? '').trim();
  const to = (body?.to ?? '').trim();

  if (!from && from !== '') return createErrorResponse('변경할 진행구분(from)을 입력해주세요.', 400);
  if (!to) return createErrorResponse('변경될 진행구분(to)을 입력해주세요.', 400);
  if (from === to) return createErrorResponse('변경 전후 값이 같습니다.', 400);

  // 실제 변경 대상 수 확인
  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM business_info
     WHERE is_deleted = false AND COALESCE(progress_status, '') = $1`,
    [from]
  );
  const count = Number(countRow?.cnt ?? 0);

  if (count === 0) {
    return createSuccessResponse({ updated_count: 0 }, '변경 대상 사업장이 없습니다.');
  }

  // 일괄 업데이트
  await queryOne(
    `UPDATE business_info
     SET progress_status = $1, updated_at = NOW()
     WHERE is_deleted = false AND COALESCE(progress_status, '') = $2`,
    [to, from]
  );

  return createSuccessResponse(
    { updated_count: count, from, to },
    `${count}개 사업장의 진행구분이 '${from || '(없음)'}' → '${to}'로 변경되었습니다.`
  );
}, { logLevel: 'debug' });
