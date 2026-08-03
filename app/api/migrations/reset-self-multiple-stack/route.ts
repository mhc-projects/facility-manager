/**
 * app/api/migrations/reset-self-multiple-stack/route.ts
 *
 * 자비(보조금 아닌) 사업장의 multiple_stack 수량을 0으로 초기화하는 API
 *
 * GET  → 대상 사업장 통계 미리보기 (실제 변경 없음)
 * POST → 실제 초기화 실행
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryAll, query as pgQuery } from '@/lib/supabase-direct';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 자비/보조금 판정은 types/invoice.ts의 mapProgressToCategory(문자열 포함 판정)와 동일한 기준(LIKE '%보조금%')을 SQL로 재현한다

// ──────────────────────────────────────────────────────────────
// GET: 초기화 대상 미리보기
// ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    // 자비 사업장 중 multiple_stack > 0 인 건 조회
    const targets = await queryAll(`
      SELECT id, business_name, progress_status, multiple_stack
      FROM business_info
      WHERE is_active = true AND is_deleted = false
        AND multiple_stack > 0
        AND (progress_status IS NULL OR progress_status NOT LIKE '%보조금%')
      ORDER BY business_name
    `);

    // 전체 자비 사업장 수 (multiple_stack 상관없이)
    const allSelf = await queryAll(`
      SELECT COUNT(*) AS cnt
      FROM business_info
      WHERE is_active = true AND is_deleted = false
        AND (progress_status IS NULL OR progress_status NOT LIKE '%보조금%')
    `);

    return NextResponse.json({
      success: true,
      summary: {
        self_businesses_total: parseInt(allSelf[0]?.cnt || '0'),
        targets_to_reset: targets.length,
      },
      targets: targets.map((b: any) => ({
        id: b.id,
        name: b.business_name,
        progress_status: b.progress_status,
        current_multiple_stack: b.multiple_stack,
      })),
    });

  } catch (error) {
    console.error('❌ [RESET-MULTIPLE-STACK] 미리보기 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────
// POST: 실제 초기화 실행
// ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    console.log(`🚀 [RESET-MULTIPLE-STACK] 자비 사업장 복수굴뚝 초기화 시작 (dry_run=${dryRun})`);

    // 대상 조회
    const targets = await queryAll(`
      SELECT id, business_name, multiple_stack
      FROM business_info
      WHERE is_active = true AND is_deleted = false
        AND multiple_stack > 0
        AND (progress_status IS NULL OR progress_status NOT LIKE '%보조금%')
    `);

    console.log(`📊 [RESET-MULTIPLE-STACK] 초기화 대상: ${targets.length}개`);

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        message: '초기화할 데이터가 없습니다 (자비 사업장 중 복수굴뚝 수량이 0보다 큰 사업장 없음)',
        summary: { reset: 0 },
      });
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        message: `DRY RUN: ${targets.length}개 사업장의 복수굴뚝 수량을 0으로 초기화 예정`,
        summary: { targets: targets.length },
        sample: targets.slice(0, 10).map((b: any) => ({
          name: b.business_name,
          current_value: b.multiple_stack,
        })),
      });
    }

    // 실제 업데이트
    const ids = targets.map((b: any) => b.id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pgQuery(`
      UPDATE business_info
      SET multiple_stack = 0,
          updated_at = NOW()
      WHERE id IN (${placeholders})
      RETURNING id
    `, ids);

    console.log(`🎉 [RESET-MULTIPLE-STACK] 완료 - 초기화: ${result.rows.length}개`);

    return NextResponse.json({
      success: true,
      message: `자비 사업장 ${result.rows.length}개의 복수굴뚝 수량을 0으로 초기화했습니다`,
      summary: { reset: result.rows.length },
    });

  } catch (error) {
    console.error('❌ [RESET-MULTIPLE-STACK] 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    }, { status: 500 });
  }
}
