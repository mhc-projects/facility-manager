/**
 * app/api/migrations/add-password-changed-at/route.ts
 *
 * employees 테이블에 password_changed_at 컬럼을 추가하는 마이그레이션
 *
 * GET  → 컬럼 존재 여부 확인 (미리보기)
 * POST → 실제 컬럼 추가 실행
 */

import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery, queryAll } from '@/lib/supabase-direct';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ──────────────────────────────────────────────────────────────
// GET: 컬럼 존재 여부 확인
// ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const rows = await queryAll(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'employees'
        AND column_name = 'password_changed_at'
    `, []);

    const exists = rows.length > 0;

    return NextResponse.json({
      success: true,
      column_exists: exists,
      message: exists
        ? '✅ password_changed_at 컬럼이 이미 존재합니다. 마이그레이션이 필요하지 않습니다.'
        : '⚠️ password_changed_at 컬럼이 없습니다. POST 요청으로 마이그레이션을 실행하세요.',
    });

  } catch (error) {
    console.error('❌ [ADD-PASSWORD-CHANGED-AT] 확인 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────
// POST: 컬럼 추가 실행
// ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 [ADD-PASSWORD-CHANGED-AT] password_changed_at 컬럼 추가 시작');

    // 이미 존재하는지 확인
    const existing = await queryAll(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'employees'
        AND column_name = 'password_changed_at'
    `, []);

    if (existing.length > 0) {
      return NextResponse.json({
        success: true,
        already_exists: true,
        message: 'password_changed_at 컬럼이 이미 존재합니다. 마이그레이션이 필요하지 않습니다.',
      });
    }

    // 컬럼 추가
    await pgQuery(`
      ALTER TABLE employees
      ADD COLUMN password_changed_at TIMESTAMPTZ NULL
    `, []);

    console.log('✅ [ADD-PASSWORD-CHANGED-AT] 컬럼 추가 완료');

    return NextResponse.json({
      success: true,
      message: '✅ password_changed_at 컬럼이 employees 테이블에 추가되었습니다.',
    });

  } catch (error) {
    console.error('❌ [ADD-PASSWORD-CHANGED-AT] 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    }, { status: 500 });
  }
}
