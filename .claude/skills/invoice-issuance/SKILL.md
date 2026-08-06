---
name: invoice-issuance
description: Facility Manager 프로젝트의 세금계산서 발행·수정·취소 워크플로우 참조. invoice_records CRUD, 발행/수정발행/취소 로직 수정, 계약금액(청구총액) 산출 버그 조사 시 사용한다.
---

# 계산서 발행

## 핵심 구조
- `invoice_records` — 발행 이력 테이블. `invoice_stage`(subsidy_1st/2nd/additional, self_advance/balance, extra) × `record_type`(original/revised/cancelled)로 한 사업장의 발행 계보를 표현. `parent_record_id`로 revised가 원본에 연결되고, 조회 시 원본의 `revisions[]`에 중첩되어 반환된다(`app/api/business-invoices/route.ts` GET).
- CRUD는 `app/api/invoice-records/route.ts`(POST/PUT/DELETE) 한 파일이 전담한다. ⚠️ 이름이 비슷한 `app/api/business-invoices/route.ts`는 GET(조회+미수금계산)과 레거시 PUT(business_info 컬럼 직접수정)만 하고 invoice_records에는 쓰지 않는다 — 헷갈리기 쉬움.
- UI: `InvoiceTabSection.tsx`(탭 컨테이너, 저장 시 탭별로 개별 POST/PUT) → `InvoiceRecordForm.tsx`(단계별 발행·입금 폼) + `InvoiceRevisionForm.tsx`(수정발행, 항상 POST) + `ExtraInvoiceList/Form.tsx`(extra 계산서, DELETE 포함) — 전부 `components/business/invoices/`.

## 발행 / 수정 / 취소
- 최초 발행: `record_type:'original'` POST 1회. 세액 미입력 시 서버가 `supply_amount*0.1` 반올림으로 자동계산(`invoice-records/route.ts:101`).
- 오기 정정(같은 건 값만 고침): PUT `{id, ...}`. `existing.record_type === 'original'`일 때만 business_info 레거시 컬럼에 동기화된다.
- 수정발행(정식 수정세금계산서): POST `record_type:'revised', parent_record_id:<원본id>`. **(2026-08-06 수정 완료)** `lib/receivables-engine.ts`의 `resolveEffectiveRecord()`(receivables 스킬 참고)가 원본+수정발행 이력에서 최신 금액/발행일을 고르고(입금은 항상 원본에서), `computeBusinessReceivableNow`/`AsOf`와 `business-invoices/route.ts` GET의 `getStageRecord`/`getStageRecordFinal` 전부 이걸 쓰도록 통일함. 매출관리 배치/상세모달/대시보드 위젯/주간브리핑/AI도구가 전부 이 경로라 여기까지는 수정발행이 정상 반영된다. 실제 로그인 세션으로 브라우저 검증 완료(수정발행 없는 사업장은 값 불변 확인).
- **(2026-08-06 수정 완료) `app/api/business-info-direct/route.ts`의 별도 raw SQL 구현도 통일함** — 이 파일의 사업장 목록 조회 CTE(`ir_receivables`)는 `lib/receivables-engine.ts`를 쓰지 않는 완전히 별개의 raw SQL 계산이고, `/admin/business` 메인 목록의 "미수금" 컬럼이 이 값을 쓴다(가장 눈에 띄는 숫자). `WITH ir AS (...)` 앞에 `latest_per_original` CTE를 신설해 각 원본(`parent_record_id IS NULL`)에 `LEFT JOIN LATERAL`로 가장 최근 수정발행(`record_type='revised'`, `created_at DESC LIMIT 1`)의 금액/발행일을 붙이고(`eff_total_amount`/`eff_issue_date`), 기존 `ir` CTE가 `total_amount`/`issue_date` 대신 이 실효값을 쓰도록 변경. extra 단계의 발행금액 합계도 `SUM(total_amount) WHERE record_type != 'cancelled'`(원본+수정발행 중복합산 버그, TS 엔진과 반대 방향으로 과다계산되고 있었음)에서 `ir_extra_invoice_total`(latest_per_original 기반, 원본당 1건만 합산)로 교체 — 4곳 중복된 인라인 서브쿼리를 이 컬럼 참조로 통일. 입금 컬럼(`ir_payment_*`)은 원래도 원본만 봤으므로 변경 없음. `tsc` 통과 + 실제 로그인 세션으로 목록 정상 로드(1946건)·수정발행 없는 사업장 미수금 990,000원 불변 확인.
- 취소(`record_type:'cancelled'`): 타입은 정의돼 있고 여러 계산 로직이 `!== 'cancelled'` 필터를 걸어두지만, ⚠️ UI에는 이 값을 실제로 생성하는 경로가 없다(POST/PUT 어느 컴포넌트도 보내지 않음). 실제 삭제는 `ExtraInvoiceList.tsx`의 DELETE(`is_active=FALSE` 소프트삭제, extra 전용, 권한레벨 3+)뿐 — subsidy/self 단계엔 삭제 UI 자체가 없다.
- 한 stage에 original이 이미 있는지 API는 검증하지 않는다. UI가 `existingRecord` 유무로 POST/PUT을 알아서 분기해줄 뿐이라, API를 직접 호출하면 한 stage에 original이 중복 생성될 수 있다.

## 계약금액(청구총액) 산출
- `lib/receivables-engine.ts`의 `calculateContractAmount` — `EQUIPMENT_FIELDS`(장비수량 컬럼들) × 고시가(`government_pricing`) 합 + `additional_cost`(추가공사비) − `negotiation`(협의사항) + `revenue_adjustments`(매출비용조정 JSON 배열 합), 최종 ×1.1(부가세 포함). 진행구분='대리점'이면 `lib/dealer-pricing.ts`의 `resolveEquipmentUnitPrices`가 고시가 대신 `dealer_selling_price`로 치환(매칭 없는 항목은 고시가로 폴백).
- `EQUIPMENT_FIELDS`/`DEALER_EQUIPMENT_NAME_MAP` 모두 `discharge/fan/pump_current_meter_400a`(전류계 400A 스펙분리 컬럼)를 포함하지 않는다 — 확인 결과 의도된 설계다. 환경부 고시가·대리점 판매가는 전류계 스펙(100A/400A) 무관 동일가이고, 스펙별 차등은 매입원가 쪽(`constants/equipment-specs.ts`, `lib/services/revenue-calculator.ts`)에만 있다. `project_current_meter_spec_split` 메모리(2026-07-29)와 현재 코드가 일치함을 확인했다 — 드리프트 없음.

## invoice_records를 CRUD API 없이 직접 쓰는 경로들
- `app/api/business-info-direct/route.ts`의 `syncInvoiceRecordsFromBatch` — 사업장 엑셀 일괄업로드에 계산서 필드가 있으면 `invoice_records`에 직접 INSERT/UPDATE(존재하는 original엔 UPDATE, 없으면 INSERT). ⚠️ 세액 계산식이 `/api/invoice-records` POST(`supply*0.1`)와 다르다 — 여기와 마이그레이션 라우트(`app/api/migrations/legacy-invoice-to-records/route.ts`)는 `total_amount`에서 역산(`round(total/11)`)한다. 두 공식은 반올림 경계에서 1원 어긋날 수 있다.
- 같은 파일의 사업장 목록 조회 CTE도 `invoice_records`를 직접 읽어 SQL로 미수금을 재계산한다(레거시 컬럼 COALESCE 패턴) — `lib/receivables-engine.ts`와 별개의 구현이라, 발행 관련 로직을 바꿀 때 이 파일도 같이 확인해야 값이 어긋나지 않는다.

## 인증 불일치
`app/api/business-invoices/*`는 `requireAuth(request, 1)` 세션 인증을 쓰는데, `app/api/invoice-records/route.ts`는 별도의 Bearer 토큰 `authGuard`(`verifyTokenString`)를 쓴다 — 같은 도메인인데 인증 방식이 다르다. DELETE만 권한레벨 3+ 체크가 있고, POST/PUT은 로그인만 하면 레벨 무관하게 발행·수정 가능하다.
