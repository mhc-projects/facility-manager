// app/api/settings/task-stages/reorder/route.ts - 업무단계 순서 일괄 저장
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryOne } from '@/lib/supabase-direct';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PUT: 순서 일괄 저장 { ids: [uuid, uuid, ...] } (앞에서부터 sort_order=1,2,...)
export const PUT = withApiHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { ids } = body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return createErrorResponse('ids 배열이 필요합니다.', 400);
  }

  await Promise.all(
    ids.map((id: string, index: number) =>
      queryOne(
        `UPDATE task_stages SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
        [index + 1, id]
      )
    )
  );

  return createSuccessResponse({ count: ids.length }, '순서가 저장되었습니다.');
}, { logLevel: 'debug' });
