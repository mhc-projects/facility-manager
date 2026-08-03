/**
 * app/api/migrations/legacy-invoice-to-records/route.ts
 *
 * business_info 레거시 계산서 컬럼 → invoice_records 테이블 일괄 마이그레이션 API
 *
 * GET  ?preview=true  → 마이그레이션 대상 통계 반환 (실제 변경 없음)
 * POST               → 실제 마이그레이션 실행
 *
 * 안전 규칙:
 * - 이미 invoice_records에 original 레코드가 있는 사업장은 스킵 (중복 방지)
 * - 계산서 날짜/금액이 모두 null인 사업장은 스킵
 * - progress_status에 따라 stage 결정 (보조금: subsidy_*, 자비: self_*)
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, query as pgQuery } from '@/lib/supabase-direct';
import { mapProgressToCategory } from '@/types/invoice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ──────────────────────────────────────────────────────────────
// 헬퍼: 진행구분 → 보조금 / 자비 분류
// ──────────────────────────────────────────────────────────────
function isSubsidy(progressStatus: string | null): boolean {
  return mapProgressToCategory(progressStatus) === '보조금';
}

// ──────────────────────────────────────────────────────────────
// 레거시 → invoice_records 변환 함수
// ──────────────────────────────────────────────────────────────
interface LegacyBusiness {
  id: string;
  business_name: string;
  progress_status: string | null;
  invoice_1st_date: string | null;
  invoice_1st_amount: number | null;
  payment_1st_date: string | null;
  payment_1st_amount: number | null;
  invoice_2nd_date: string | null;
  invoice_2nd_amount: number | null;
  payment_2nd_date: string | null;
  payment_2nd_amount: number | null;
  invoice_additional_date: string | null;
  payment_additional_date: string | null;
  payment_additional_amount: number | null;
  invoice_advance_date: string | null;
  invoice_advance_amount: number | null;
  payment_advance_date: string | null;
  payment_advance_amount: number | null;
  invoice_balance_date: string | null;
  invoice_balance_amount: number | null;
  payment_balance_date: string | null;
  payment_balance_amount: number | null;
  additional_cost: number | null;
}

interface InvoiceRecordInsert {
  business_id: string;
  invoice_stage: string;
  record_type: 'original';
  issue_date: string | null;
  supply_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_date: string | null;
  payment_amount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function buildRecords(biz: LegacyBusiness): InvoiceRecordInsert[] {
  const now = new Date().toISOString();
  const records: InvoiceRecordInsert[] = [];

  const makeRecord = (
    stage: string,
    issueDate: string | null,
    totalAmount: number | null,
    paymentDate: string | null,
    paymentAmount: number | null
  ): InvoiceRecordInsert | null => {
    // 금액도 없고 날짜도 없으면 스킵
    if (!totalAmount && !issueDate) return null;
    const total = totalAmount || 0;
    const tax = Math.round(total / 11); // 총액에서 부가세 역산 (부가세 포함 금액 기준)
    const supply = total - tax;
    return {
      business_id: biz.id,
      invoice_stage: stage,
      record_type: 'original',
      issue_date: issueDate || null,
      supply_amount: supply,
      tax_amount: tax,
      total_amount: total,
      payment_date: paymentDate || null,
      payment_amount: paymentAmount || 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
  };

  if (isSubsidy(biz.progress_status)) {
    // 보조금: 1차, 2차, 추가공사비
    const r1 = makeRecord('subsidy_1st', biz.invoice_1st_date, biz.invoice_1st_amount, biz.payment_1st_date, biz.payment_1st_amount);
    if (r1) records.push(r1);

    const r2 = makeRecord('subsidy_2nd', biz.invoice_2nd_date, biz.invoice_2nd_amount, biz.payment_2nd_date, biz.payment_2nd_amount);
    if (r2) records.push(r2);

    // 추가공사비: invoice_additional_date 또는 additional_cost > 0 인 경우
    const additionalTotal = biz.additional_cost ? Math.round(biz.additional_cost * 1.1) : null;
    const rA = makeRecord(
      'subsidy_additional',
      biz.invoice_additional_date,
      additionalTotal,
      biz.payment_additional_date,
      biz.payment_additional_amount
    );
    if (rA) records.push(rA);

  } else {
    // 자비: 선금, 잔금
    const rAdv = makeRecord('self_advance', biz.invoice_advance_date, biz.invoice_advance_amount, biz.payment_advance_date, biz.payment_advance_amount);
    if (rAdv) records.push(rAdv);

    const rBal = makeRecord('self_balance', biz.invoice_balance_date, biz.invoice_balance_amount, biz.payment_balance_date, biz.payment_balance_amount);
    if (rBal) records.push(rBal);
  }

  return records;
}

// ──────────────────────────────────────────────────────────────
// GET: 마이그레이션 대상 미리보기
// ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const preview = searchParams.get('preview') !== 'false';

    // 레거시 데이터 있는 사업장 조회
    const legacyBusinesses: LegacyBusiness[] = await queryAll(`
      SELECT
        id, business_name, progress_status,
        invoice_1st_date, invoice_1st_amount, payment_1st_date, payment_1st_amount,
        invoice_2nd_date, invoice_2nd_amount, payment_2nd_date, payment_2nd_amount,
        invoice_additional_date, payment_additional_date, payment_additional_amount,
        invoice_advance_date, invoice_advance_amount, payment_advance_date, payment_advance_amount,
        invoice_balance_date, invoice_balance_amount, payment_balance_date, payment_balance_amount,
        additional_cost
      FROM business_info
      WHERE is_active = true AND is_deleted = false
        AND (
          invoice_1st_date IS NOT NULL OR invoice_1st_amount IS NOT NULL OR
          invoice_2nd_date IS NOT NULL OR invoice_2nd_amount IS NOT NULL OR
          invoice_additional_date IS NOT NULL OR
          invoice_advance_date IS NOT NULL OR invoice_advance_amount IS NOT NULL OR
          invoice_balance_date IS NOT NULL OR invoice_balance_amount IS NOT NULL
        )
      ORDER BY business_name
    `, []);

    // 이미 invoice_records에 있는 사업장 ID 목록
    const existing = await queryAll(`
      SELECT DISTINCT business_id FROM invoice_records
      WHERE is_active = true AND record_type = 'original'
    `, []);
    const existingIds = new Set(existing.map((r: any) => r.business_id));

    // 마이그레이션 대상 / 스킵 분류
    const toMigrate = legacyBusinesses.filter(b => !existingIds.has(b.id));
    const toSkip = legacyBusinesses.filter(b => existingIds.has(b.id));

    // 레코드 수 계산
    const totalRecords = toMigrate.reduce((sum, b) => sum + buildRecords(b).length, 0);

    return NextResponse.json({
      success: true,
      summary: {
        legacy_businesses_with_invoice: legacyBusinesses.length,
        already_in_invoice_records: toSkip.length,
        to_migrate: toMigrate.length,
        estimated_records_to_insert: totalRecords,
      },
      sample_migrate: toMigrate.slice(0, 10).map(b => ({
        id: b.id,
        name: b.business_name,
        progress_status: b.progress_status,
        records: buildRecords(b).map(r => ({ stage: r.invoice_stage, total: r.total_amount, payment: r.payment_amount })),
      })),
      sample_skip: toSkip.slice(0, 5).map(b => ({ id: b.id, name: b.business_name })),
    });

  } catch (error) {
    console.error('❌ [MIGRATION-PREVIEW] 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────
// POST: 실제 마이그레이션 실행
// ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    console.log(`🚀 [MIGRATION] 레거시 → invoice_records 마이그레이션 시작 (dry_run=${dryRun})`);

    // 1. 레거시 데이터 있는 사업장 전체 조회
    const legacyBusinesses: LegacyBusiness[] = await queryAll(`
      SELECT
        id, business_name, progress_status,
        invoice_1st_date, invoice_1st_amount, payment_1st_date, payment_1st_amount,
        invoice_2nd_date, invoice_2nd_amount, payment_2nd_date, payment_2nd_amount,
        invoice_additional_date, payment_additional_date, payment_additional_amount,
        invoice_advance_date, invoice_advance_amount, payment_advance_date, payment_advance_amount,
        invoice_balance_date, invoice_balance_amount, payment_balance_date, payment_balance_amount,
        additional_cost
      FROM business_info
      WHERE is_active = true AND is_deleted = false
        AND (
          invoice_1st_date IS NOT NULL OR invoice_1st_amount IS NOT NULL OR
          invoice_2nd_date IS NOT NULL OR invoice_2nd_amount IS NOT NULL OR
          invoice_additional_date IS NOT NULL OR
          invoice_advance_date IS NOT NULL OR invoice_advance_amount IS NOT NULL OR
          invoice_balance_date IS NOT NULL OR invoice_balance_amount IS NOT NULL
        )
      ORDER BY business_name
    `, []);

    console.log(`📊 [MIGRATION] 레거시 계산서 있는 사업장: ${legacyBusinesses.length}개`);

    // 2. 이미 invoice_records에 있는 사업장 제외
    const existing = await queryAll(`
      SELECT DISTINCT business_id FROM invoice_records
      WHERE is_active = true AND record_type = 'original'
    `, []);
    const existingIds = new Set(existing.map((r: any) => r.business_id));

    const toMigrate = legacyBusinesses.filter(b => !existingIds.has(b.id));
    console.log(`✅ [MIGRATION] 마이그레이션 대상: ${toMigrate.length}개 (기존 ${existingIds.size}개 스킵)`);

    if (toMigrate.length === 0) {
      return NextResponse.json({
        success: true,
        message: '마이그레이션할 데이터가 없습니다 (이미 모두 invoice_records에 있음)',
        summary: { migrated: 0, skipped: existingIds.size, records_inserted: 0 },
      });
    }

    // 3. invoice_records 레코드 생성
    const allRecords: InvoiceRecordInsert[] = [];
    for (const biz of toMigrate) {
      const records = buildRecords(biz);
      allRecords.push(...records);
    }

    console.log(`📝 [MIGRATION] 삽입할 레코드: ${allRecords.length}개`);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        message: `DRY RUN: ${toMigrate.length}개 사업장, ${allRecords.length}개 레코드 삽입 예정`,
        summary: {
          businesses_to_migrate: toMigrate.length,
          businesses_skipped: existingIds.size,
          records_to_insert: allRecords.length,
        },
        sample: allRecords.slice(0, 10),
      });
    }

    // 4. 배치 INSERT (50개씩)
    const BATCH_SIZE = 50;
    let insertedCount = 0;
    const errors: string[] = [];

    const fields: (keyof InvoiceRecordInsert)[] = [
      'business_id', 'invoice_stage', 'record_type',
      'issue_date', 'supply_amount', 'tax_amount', 'total_amount',
      'payment_date', 'payment_amount', 'is_active', 'created_at', 'updated_at',
    ];

    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_SIZE);
      const fieldCount = fields.length;
      const valuePlaceholders = batch.map((_, idx) => {
        const start = idx * fieldCount;
        return `(${fields.map((_, j) => `$${start + j + 1}`).join(', ')})`;
      }).join(', ');
      const values = batch.flatMap(r => fields.map(f => r[f]));

      try {
        const result = await pgQuery(`
          INSERT INTO invoice_records (${fields.join(', ')})
          VALUES ${valuePlaceholders}
          ON CONFLICT DO NOTHING
          RETURNING id
        `, values);
        insertedCount += result.rows.length;
        console.log(`📦 [MIGRATION] 배치 ${Math.floor(i / BATCH_SIZE) + 1}: ${result.rows.length}개 삽입`);
      } catch (err: any) {
        console.error(`❌ [MIGRATION] 배치 오류 (i=${i}):`, err.message);
        errors.push(err.message);
      }
    }

    console.log(`🎉 [MIGRATION] 완료 - 삽입: ${insertedCount}개, 오류: ${errors.length}개`);

    return NextResponse.json({
      success: true,
      message: `마이그레이션 완료: ${toMigrate.length}개 사업장, ${insertedCount}개 레코드 삽입`,
      summary: {
        businesses_migrated: toMigrate.length,
        businesses_skipped: existingIds.size,
        records_inserted: insertedCount,
        errors: errors.length,
        error_details: errors.slice(0, 5),
      },
    });

  } catch (error) {
    console.error('❌ [MIGRATION] 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    }, { status: 500 });
  }
}
