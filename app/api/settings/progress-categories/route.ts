// app/api/settings/progress-categories/route.ts - 진행구분 관리 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryAll, queryOne } from '@/lib/supabase-direct';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: 진행구분 목록 조회
export const GET = withApiHandler(async (_request: NextRequest) => {
  const categories = await queryAll(
    `SELECT id, name, sort_order, is_active
     FROM progress_categories
     ORDER BY sort_order ASC, id ASC`
  );
  return createSuccessResponse(categories ?? [], '진행구분 목록을 조회했습니다.');
}, { logLevel: 'debug' });

// POST: 진행구분 추가
export const POST = withApiHandler(async (request: NextRequest) => {
  const body = await request.json();
  const name = (body?.name ?? '').trim();

  if (!name) return createErrorResponse('진행구분 이름을 입력해주세요.', 400);
  if (name.length > 100) return createErrorResponse('진행구분 이름은 100자 이하여야 합니다.', 400);

  const existing = await queryOne(
    `SELECT id FROM progress_categories WHERE name = $1 LIMIT 1`, [name]
  );
  if (existing) return createErrorResponse('이미 존재하는 진행구분입니다.', 409);

  const maxOrder = await queryOne(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM progress_categories`
  );
  const nextOrder = (maxOrder?.max_order ?? 0) + 1;

  const created = await queryOne(
    `INSERT INTO progress_categories (name, sort_order, is_active, created_at, updated_at)
     VALUES ($1, $2, true, NOW(), NOW())
     RETURNING id, name, sort_order, is_active`,
    [name, nextOrder]
  );
  return createSuccessResponse(created, '진행구분이 추가되었습니다.');
}, { logLevel: 'debug' });

// PUT: 진행구분 수정
export const PUT = withApiHandler(async (request: NextRequest) => {
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

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return createErrorResponse('진행구분 이름을 입력해주세요.', 400);
    const dup = await queryOne(
      `SELECT id FROM progress_categories WHERE name = $1 AND id != $2 LIMIT 1`, [trimmed, id]
    );
    if (dup) return createErrorResponse('이미 존재하는 진행구분입니다.', 409);
    updates.push(`name = $${idx++}`); params.push(trimmed);
  }
  if (sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(Number(sort_order)); }
  if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(Boolean(is_active)); }
  if (updates.length === 0) return createErrorResponse('변경할 항목이 없습니다.', 400);

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const updated = await queryOne(
    `UPDATE progress_categories SET ${updates.join(', ')}
     WHERE id = $${idx}
     RETURNING id, name, sort_order, is_active`,
    params
  );
  return createSuccessResponse(updated, '진행구분이 수정되었습니다.');
}, { logLevel: 'debug' });

// DELETE: 진행구분 삭제
export const DELETE = withApiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return createErrorResponse('id가 필요합니다.', 400);

  const existing = await queryOne(
    `SELECT id, name FROM progress_categories WHERE id = $1 LIMIT 1`, [Number(id)]
  );
  if (!existing) return createErrorResponse('존재하지 않는 진행구분입니다.', 404);

  await queryOne(`DELETE FROM progress_categories WHERE id = $1`, [Number(id)]);
  return createSuccessResponse({ id: Number(id) }, `'${existing.name}' 진행구분이 삭제되었습니다.`);
}, { logLevel: 'debug' });
