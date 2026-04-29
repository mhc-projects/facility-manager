// app/api/settings/task-stages/seed/route.ts - TASK_STATUS_KR → DB 마이그레이션 (1회)
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryAll, queryOne } from '@/lib/supabase-direct';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 진행구분 이름 → 해당하는 stage_key prefix 매핑
const CATEGORY_PREFIX_MAP: Record<string, string[]> = {
  '자비':              ['self_'],
  '보조금':            ['subsidy_'],
  '보조금(5년경과)':   ['subsidy_'],
  '보조금 동시진행':   ['subsidy_'],
  '보조금 추가승인':   ['subsidy_'],
  '대리점':            ['dealer_'],
  '외주설치':          ['outsourcing_'],
  'AS':                ['as_'],
  '진행불가':          ['etc_'],
  '확인필요':          ['etc_'],
};

// 시드 데이터: 현재 TASK_STATUS_KR에서 하드코딩된 단계들
const SEED_STAGES: { key: string; label: string }[] = [
  // needs_check (공통)
  { key: 'self_needs_check', label: '확인필요' },
  { key: 'subsidy_needs_check', label: '확인필요' },
  { key: 'as_needs_check', label: '확인필요' },
  { key: 'dealer_needs_check', label: '확인필요' },
  { key: 'outsourcing_needs_check', label: '확인필요' },
  { key: 'etc_needs_check', label: '확인필요' },
  // 자비 단계
  { key: 'self_customer_contact', label: '고객 상담' },
  { key: 'self_site_inspection', label: '현장 실사' },
  { key: 'self_quotation', label: '견적서 작성' },
  { key: 'self_progress_confirm', label: '진행확인필요' },
  { key: 'self_contract', label: '계약 체결' },
  { key: 'self_deposit_confirm', label: '계약금 확인' },
  { key: 'self_product_order', label: '제품 발주' },
  { key: 'self_product_shipment', label: '제품 출고' },
  { key: 'self_installation_schedule', label: '설치예정' },
  { key: 'self_installation', label: '설치완료' },
  { key: 'self_completion_doc_done', label: '준공서류 작성완료(입금안내)' },
  { key: 'self_balance_payment', label: '잔금 입금' },
  { key: 'self_document_complete', label: '서류 발송 완료' },
  // 보조금 단계
  { key: 'subsidy_customer_contact', label: '고객 상담' },
  { key: 'subsidy_site_inspection', label: '현장 실사' },
  { key: 'subsidy_quotation', label: '견적서 작성' },
  { key: 'subsidy_progress_confirm', label: '진행확인필요' },
  { key: 'subsidy_contract', label: '계약 체결' },
  { key: 'subsidy_document_preparation', label: '신청서 작성 필요' },
  { key: 'subsidy_application_submit', label: '신청서 제출' },
  { key: 'subsidy_approval_pending', label: '보조금 승인대기' },
  { key: 'subsidy_approved', label: '보조금 승인' },
  { key: 'subsidy_rejected', label: '보조금 탈락' },
  { key: 'subsidy_document_supplement', label: '신청서 보완' },
  { key: 'subsidy_pre_construction_inspection', label: '착공 전 실사' },
  { key: 'subsidy_pre_construction_supplement_1st', label: '착공 보완 1차' },
  { key: 'subsidy_pre_construction_supplement_2nd', label: '착공 보완 2차' },
  { key: 'subsidy_construction_report_submit', label: '착공신고서 제출' },
  { key: 'subsidy_product_order', label: '제품 발주' },
  { key: 'subsidy_product_shipment', label: '제품 출고' },
  { key: 'subsidy_installation_schedule', label: '설치예정' },
  { key: 'subsidy_installation', label: '설치완료' },
  { key: 'subsidy_pre_completion_document_submit', label: '준공도서 작성 필요' },
  { key: 'subsidy_completion_inspection', label: '준공 실사' },
  { key: 'subsidy_completion_supplement_1st', label: '준공 보완 1차' },
  { key: 'subsidy_completion_supplement_2nd', label: '준공 보완 2차' },
  { key: 'subsidy_completion_supplement_3rd', label: '준공 보완 3차' },
  { key: 'subsidy_final_document_submit', label: '보조금지급신청서 제출' },
  { key: 'subsidy_payment_pending', label: '보조금 입금 대기' },
  { key: 'subsidy_payment', label: '보조금 입금' },
  // AS 단계
  { key: 'as_customer_contact', label: 'AS 고객 상담' },
  { key: 'as_site_inspection', label: 'AS 현장 확인' },
  { key: 'as_quotation', label: 'AS 견적 작성' },
  { key: 'as_progress_confirm', label: '진행확인필요' },
  { key: 'as_contract', label: 'AS 계약 체결' },
  { key: 'as_part_order', label: 'AS 부품 발주' },
  { key: 'as_completed', label: 'AS 완료' },
  // 대리점 단계
  { key: 'dealer_order_received', label: '발주 수신' },
  { key: 'dealer_invoice_issued', label: '계산서 발행' },
  { key: 'dealer_payment_confirmed', label: '입금 확인' },
  { key: 'dealer_product_ordered', label: '제품 발주' },
  // 외주설치 단계
  { key: 'outsourcing_order', label: '외주 발주' },
  { key: 'outsourcing_schedule', label: '일정 조율' },
  { key: 'outsourcing_in_progress', label: '설치 진행 중' },
  { key: 'outsourcing_completed', label: '설치 완료' },
  // 기타 단계
  { key: 'etc_status', label: '기타' },
];

export const POST = withApiHandler(async (_request: NextRequest) => {
  // 이미 시드된 경우 스킵
  const existing = await queryOne(`SELECT COUNT(*) as cnt FROM task_stages`);
  if (existing && Number(existing.cnt) > 0) {
    return createErrorResponse('이미 시드 데이터가 존재합니다. 중복 실행을 방지합니다.', 409);
  }

  const categories = await queryAll(
    `SELECT id, name FROM progress_categories WHERE is_active = true ORDER BY sort_order`
  ) as { id: number; name: string }[];

  let inserted = 0;
  let skipped = 0;

  for (const category of categories) {
    const prefixes = CATEGORY_PREFIX_MAP[category.name] ?? [];
    if (prefixes.length === 0) {
      // 인허가 등 매핑 없는 카테고리는 빈 상태로 시작
      continue;
    }

    const categoryStages = SEED_STAGES.filter(s =>
      prefixes.some(prefix => s.key.startsWith(prefix))
    );

    for (let i = 0; i < categoryStages.length; i++) {
      const stage = categoryStages[i];
      try {
        await queryOne(
          `INSERT INTO task_stages (progress_category_id, stage_key, stage_label, sort_order, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (progress_category_id, stage_key) DO NOTHING`,
          [category.id, stage.key, stage.label, i + 1]
        );
        inserted++;
      } catch {
        skipped++;
      }
    }
  }

  return createSuccessResponse(
    { inserted, skipped, categories: categories.length },
    `시드 완료: ${inserted}개 단계 추가, ${skipped}개 스킵`
  );
}, { logLevel: 'debug' });
