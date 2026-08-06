---
name: installation-payments
description: Facility Manager 프로젝트의 설치비 예측마감/본마감(installation_payments, eungyeol_transfers) 계산·지급 로직 참조. 예측마감·본마감 버그 수정, 은결 송금 대사, 설치비 단가 변경 영향 분석 시 사용한다.
---

# 설치비 예측마감/본마감

## 핵심 테이블
- `installation_payments` — 지급 이력. `payment_type`: forecast(예측마감)/final(본마감)/adjustment(차액정산·환수). `payment_category`: base_installation(기본설치비, 기기수량×단가)/additional_construction(⚠️ 스키마만 있고 어떤 라우트에서도 0 외의 값을 넣지 않는 미구현 카테고리)/extra_installation(`business_info.installation_extra_cost`). `calculated_amount`=시스템계산값, `actual_amount`=실지급값 — 현재 모든 생성 경로가 둘을 항상 동일하게 넣는다(`amount_diff_reason`은 스키마상 존재하나 실제로 다르게 채우는 코드 경로 없음, 수동 편집용으로 추정). `payment_month`(YYYY-MM)가 귀속월. `idx_ip_unique_active`: `(business_id, payment_type, payment_category, payment_month)` 부분 유니크(cancelled/deducted 제외) — 중복 지급 방지의 실질적 방어선.
- `eungyeol_transfers` — 은결(외주 설치업체) 월별 송금 기록. `transfer_amount`/`payment_month`. POST 등록 시 항상 `status='transferred'`로 insert된다(⚠️ CHECK는 `pending`도 허용하지만 코드상 pending으로 세팅하는 경로를 찾지 못함).
- `closing_records` — ⚠️ **미사용 테이블**. 마이그레이션에 정의되고 RLS도 걸려있지만 `app/`·`lib/` 어디에서도 참조되지 않는다(grep 결과 0건). "월별 마감 잠금" 개념은 이 테이블이 아니라 각 쿼리의 `payment_month` 필터 + 결재 상태로 암묵적으로만 구현돼 있다.
- `equipment_installation_cost` — 기기별 기본설치비 단가(`sql/manufacturer_pricing_system.sql`, `supabase/migrations`엔 없음). `calculateInstallCosts()`가 여기서 단가를 읽어 `business_info`의 기기수량 컬럼과 곱한다.

## forecast/final을 왜 두 번 계산하는가
설치 전(발주~설치예정 단계)엔 `business_info`의 현재 기기수량 스냅샷으로 예상액을 먼저 계산해 은결에 선지급(forecast)한다. 설치 현장 사정으로 실제 설치 내역이 달라질 수 있어, `installation_date`가 채워지는 시점에 동일 로직(`calculateFinalDiff`, `lib/installation-closing.ts`)으로 재계산해 forecast와 비교하고 차액을 `adjustment`로 정산한다. 예측마감 없이 바로 본마감되는 건(`final/process`의 `is_direct_final`)도 지원한다.

## status 전이와 ⚠️ 두 개의 서로 다른 처리 경로
실제로 쓰이는 유일한 경로: `POST /api/installation-closing/approval`(UI: `app/admin/revenue/installation-closing/page.tsx`)가 트랜잭션으로 `approval_documents`(`document_type='installation_closing'`) 생성 + items별 `installation_payments`를 `status='pending'`으로 INSERT(`ON CONFLICT DO NOTHING`) + 즉시 `submit` API 호출. 결재 최종승인 시 pending→paid 전환되는 부수효과는 approval 스킬의 "최종 승인 시 부수효과" 참조(중복 생략).
- `app/api/installation-closing/forecast/process/route.ts`, `final/process/route.ts`는 결재 없이 즉시 `status='paid'`로 만드는 별도 경로지만 ⚠️ 프론트엔드 어디서도 호출하지 않는 미사용(orphan) 라우트다 — 새로 쓰기 전 왜 안 쓰이는지 먼저 확인할 것.

## 자동 트리거 (`app/api/business-info-direct/route.ts` PUT, 1081~1125줄)
- `installation_date` NULL→값: `final/auto-trigger` POST — forecast paid 기록이 있어야 동작(없으면 skip), idempotent(이미 final 기록 있으면 skip), 차액 있으면 adjustment도 함께 `pending`으로 생성.
- `order_date` 삭제 또는 다른 월로 변경: `refund` POST — 기존 forecast paid 기록을 `cancelled` 처리하고 **다음 달**에 음수 금액 `deducted` adjustment 레코드 생성(차기 월 차감 방식 환수).
- ⚠️ 두 트리거 모두 fire-and-forget(`.catch`로 로그만 남김) — 실패해도 `business_info` 업데이트 자체는 성공 처리된다. 트리거 실패 시 마감 레코드가 조용히 안 만들어질 수 있다.

## 예측마감 대상 판정
`task_stages.is_forecast_target`(관리자 설정 가능, 2026-05-07 마이그레이션 전엔 7개 단계 하드코딩)이 true인 업무단계 + `installation_date IS NULL` + 아직 forecast 미처리인 사업장이 대상(`forecast/route.ts` GET).

## eungyeol_transfers 대사(reconcile)
선택한 `installation_payments`(`status='paid'`) 건들에 `transfer_id`를 매칭 → 매칭액 합계가 송금액과 정확히 같아지면 `eungyeol_transfers.status`가 자동으로 `reconciled`로 전환(`transfers/[transferId]/reconcile/route.ts`). 금액이 다르면 매칭은 되지만 `warning` 메시지만 반환하고 상태는 그대로 둔다.

## 권한
모든 라우트가 `permissionLevel >= 3`(관리자) 요구. `payment-status`(매출관리 페이지 연동용, `v_business_payment_status` 뷰 조회)만 레벨 체크 없이 인증만 요구한다.
