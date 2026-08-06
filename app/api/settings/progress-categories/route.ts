// app/api/settings/progress-categories/route.ts - 진행구분 관리 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryOne } from '@/lib/supabase-direct';
import { requireAuth, unauthorized, forbidden } from '@/lib/auth/require-auth';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: 진행구분 목록 조회 — 권한조회와 목록조회를 SQL 한 번으로 병합(직렬 DB 왕복 1회 절감)
export const GET = withApiHandler(async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : request.cookies.get('session_token')?.value;
  if (!token) return unauthorized('UNAUTHORIZED', '인증이 필요합니다.');
  const decoded = verifyTokenString(token);
  if (!decoded) return unauthorized('INVALID_TOKEN', '유효하지 않은 토큰입니다.');
  const userId = decoded.id || decoded.userId;

  const result = await queryOne(
    `SELECT
       (SELECT to_jsonb(e) FROM (
          SELECT id, permission_level FROM employees WHERE id = $1 AND is_active = true
        ) e) AS me,
       (SELECT COALESCE(jsonb_agg(c ORDER BY c.sort_order, c.id), '[]'::jsonb) FROM (
          SELECT id, name, task_type, sort_order, is_active FROM progress_categories
        ) c) AS rows`,
    [userId]
  );

  if (!result?.me || (result.me.permission_level ?? 0) < 1) {
    return forbidden('권한이 없습니다.');
  }

  return createSuccessResponse(result.rows ?? [], '진행구분 목록을 조회했습니다.', 200, { noCache: true });
}, { logLevel: 'debug' });

const VALID_TASK_TYPES = ['self', 'subsidy', 'as', 'dealer', 'outsourcing', 'etc'] as const;
type ValidTaskType = typeof VALID_TASK_TYPES[number];

function inferTaskType(name: string): ValidTaskType {
  if (name.includes('보조금')) return 'subsidy';
  if (name.includes('자비'))   return 'self';
  if (name === 'AS')           return 'as';
  if (name.includes('외주'))   return 'outsourcing';
  if (name.includes('대리점')) return 'dealer';
  return 'etc';
}

// POST: 진행구분 추가
export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const name = (body?.name ?? '').trim();
  const taskTypeRaw = (body?.task_type ?? '').trim();

  if (!name) return createErrorResponse('진행구분 이름을 입력해주세요.', 400);
  if (name.length > 100) return createErrorResponse('진행구분 이름은 100자 이하여야 합니다.', 400);

  const taskType: ValidTaskType = VALID_TASK_TYPES.includes(taskTypeRaw as ValidTaskType)
    ? (taskTypeRaw as ValidTaskType)
    : inferTaskType(name); // 미지정 시 이름으로 추론

  const existing = await queryOne(
    `SELECT id FROM progress_categories WHERE name = $1 LIMIT 1`, [name]
  );
  if (existing) return createErrorResponse('이미 존재하는 진행구분입니다.', 409);

  const maxOrder = await queryOne(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM progress_categories`
  );
  const nextOrder = (maxOrder?.max_order ?? 0) + 1;

  const created = await queryOne(
    `INSERT INTO progress_categories (name, task_type, sort_order, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, true, NOW(), NOW())
     RETURNING id, name, task_type, sort_order, is_active`,
    [name, taskType, nextOrder]
  );
  return createSuccessResponse(created, '진행구분이 추가되었습니다.', 200, { noCache: true });
}, { logLevel: 'debug' });

// PUT: 진행구분 수정
export const PUT = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { id, name, sort_order, is_active } = body ?? {};

  if (!id) return createErrorResponse('id가 필요합니다.', 400);

  const current = await queryOne(
    `SELECT id FROM progress_categories WHERE id = $1 LIMIT 1`, [id]
  );
  if (!current) return createErrorResponse('존재하지 않는 진행구분입니다.', 404);

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  const { task_type } = body ?? {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return createErrorResponse('진행구분 이름을 입력해주세요.', 400);
    const dup = await queryOne(
      `SELECT id FROM progress_categories WHERE name = $1 AND id != $2 LIMIT 1`, [trimmed, id]
    );
    if (dup) return createErrorResponse('이미 존재하는 진행구분입니다.', 409);
    updates.push(`name = $${idx++}`); params.push(trimmed);
  }
  if (task_type !== undefined) {
    const t = String(task_type).trim();
    if (!VALID_TASK_TYPES.includes(t as ValidTaskType)) return createErrorResponse('유효하지 않은 task_type입니다.', 400);
    updates.push(`task_type = $${idx++}`); params.push(t);
  }
  if (sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(Number(sort_order)); }
  if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(Boolean(is_active)); }
  if (updates.length === 0) return createErrorResponse('변경할 항목이 없습니다.', 400);

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const updated = await queryOne(
    `UPDATE progress_categories SET ${updates.join(', ')}
     WHERE id = $${idx}
     RETURNING id, name, task_type, sort_order, is_active`,
    params
  );
  return createSuccessResponse(updated, '진행구분이 수정되었습니다.', 200, { noCache: true });
}, { logLevel: 'debug' });

// DELETE: 진행구분 삭제
export const DELETE = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return createErrorResponse('id가 필요합니다.', 400);

  const existing = await queryOne(
    `SELECT id, name FROM progress_categories WHERE id = $1 LIMIT 1`, [Number(id)]
  );
  if (!existing) return createErrorResponse('존재하지 않는 진행구분입니다.', 404);

  await queryOne(`DELETE FROM progress_categories WHERE id = $1`, [Number(id)]);
  return createSuccessResponse({ id: Number(id) }, `'${existing.name}' 진행구분이 삭제되었습니다.`, 200, { noCache: true });
}, { logLevel: 'debug' });
