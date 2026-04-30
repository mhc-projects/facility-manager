// app/api/settings/task-stages/route.ts - 업무단계 관리 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryAll, queryOne } from '@/lib/supabase-direct';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: 업무단계 목록 조회 (전체 or 카테고리 필터)
export const GET = withApiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('category_id');

  let sql = `SELECT id, progress_category_id, stage_key, stage_label, sort_order, is_active
             FROM task_stages`;
  const params: any[] = [];

  if (categoryId) {
    sql += ` WHERE progress_category_id = $1`;
    params.push(Number(categoryId));
  }

  sql += ` ORDER BY progress_category_id ASC, sort_order ASC, id ASC`;

  const stages = await queryAll(sql, params);
  return createSuccessResponse(stages ?? [], '업무단계 목록을 조회했습니다.', 200, { noCache: true });
}, { logLevel: 'debug' });

// POST: 업무단계 추가
export const POST = withApiHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { progress_category_id, stage_key, stage_label } = body ?? {};

  if (!progress_category_id) return createErrorResponse('progress_category_id가 필요합니다.', 400);

  const label = (stage_label ?? '').trim();
  if (!label) return createErrorResponse('단계 이름을 입력해주세요.', 400);
  if (label.length > 100) return createErrorResponse('단계 이름은 100자 이하여야 합니다.', 400);

  // stage_key: 지정하지 않으면 label 기반 자동 생성
  const key = stage_key?.trim() || `custom_${Date.now()}`;

  const category = await queryOne(
    `SELECT id FROM progress_categories WHERE id = $1 LIMIT 1`, [Number(progress_category_id)]
  );
  if (!category) return createErrorResponse('존재하지 않는 진행구분입니다.', 404);

  const existing = await queryOne(
    `SELECT id FROM task_stages WHERE progress_category_id = $1 AND stage_key = $2 LIMIT 1`,
    [Number(progress_category_id), key]
  );
  if (existing) return createErrorResponse('이미 존재하는 단계 키입니다.', 409);

  const maxOrder = await queryOne(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM task_stages WHERE progress_category_id = $1`,
    [Number(progress_category_id)]
  );
  const nextOrder = (maxOrder?.max_order ?? 0) + 1;

  const created = await queryOne(
    `INSERT INTO task_stages (progress_category_id, stage_key, stage_label, sort_order, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, progress_category_id, stage_key, stage_label, sort_order, is_active`,
    [Number(progress_category_id), key, label, nextOrder]
  );
  return createSuccessResponse(created, '업무단계가 추가되었습니다.', 200, { noCache: true });
}, { logLevel: 'debug' });

// PUT: 업무단계 수정
export const PUT = withApiHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { id, stage_label, sort_order, is_active } = body ?? {};

  if (!id) return createErrorResponse('id가 필요합니다.', 400);

  const current = await queryOne(
    `SELECT id FROM task_stages WHERE id = $1 LIMIT 1`, [id]
  );
  if (!current) return createErrorResponse('존재하지 않는 업무단계입니다.', 404);

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (stage_label !== undefined) {
    const trimmed = String(stage_label).trim();
    if (!trimmed) return createErrorResponse('단계 이름을 입력해주세요.', 400);
    updates.push(`stage_label = $${idx++}`); params.push(trimmed);
  }
  if (sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(Number(sort_order)); }
  if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(Boolean(is_active)); }
  if (updates.length === 0) return createErrorResponse('변경할 항목이 없습니다.', 400);

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const updated = await queryOne(
    `UPDATE task_stages SET ${updates.join(', ')} WHERE id = $${idx}
     RETURNING id, progress_category_id, stage_key, stage_label, sort_order, is_active`,
    params
  );
  return createSuccessResponse(updated, '업무단계가 수정되었습니다.', 200, { noCache: true });
}, { logLevel: 'debug' });

// DELETE: 업무단계 삭제
export const DELETE = withApiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return createErrorResponse('id가 필요합니다.', 400);

  const existing = await queryOne(
    `SELECT id, stage_label FROM task_stages WHERE id = $1 LIMIT 1`, [id]
  );
  if (!existing) return createErrorResponse('존재하지 않는 업무단계입니다.', 404);

  await queryOne(`DELETE FROM task_stages WHERE id = $1`, [id]);
  return createSuccessResponse({ id }, `'${existing.stage_label}' 단계가 삭제되었습니다.`, 200, { noCache: true });
}, { logLevel: 'debug' });
