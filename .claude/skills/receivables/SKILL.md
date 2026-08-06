---
name: receivables
description: Facility Manager 프로젝트의 미수금(외상매출금) 계산 로직 참조. 미수금 관련 버그 수정, 매출관리/대시보드/주간브리핑 수치 검증, 계산 공식 변경 시 사용한다.
---

# 미수금 계산

## 단일 진실 공급원
- `lib/receivables-engine.ts` — **유일한** 미수금 계산 구현. 매출관리(`business-invoices/batch`), 대시보드 위젯(`/api/dashboard/receivables`), 주간 브리핑(`/api/dashboard/weekly-scorecard`), AI 도구(`lib/revenue-tools.ts`)가 전부 이 파일을 공유한다.
  - `computeBusinessReceivableNow(business, stages)` — "지금" 기준. 매출관리 페이지가 보여주는 값과 100% 일치.
  - `computeBusinessReceivableAsOf(business, stages, asOfDate)` — 과거 시점 스냅샷 재구성(주간 브리핑 "지난주" 비교용). issue_date/payment_date가 asOfDate 이후면 없었던 것으로 간주하는 근사치 — Now와 미묘하게 다른 공식이므로 "지금" 값이 필요하면 반드시 Now를 쓸 것.
- `lib/receivables-calculator.ts` — 핵심 산식 `calculateReceivables()`, `sumAllPayments()`. engine이 내부에서 호출.
- ⚠️ `lib/invoice-receivables.ts`(`computeReceivables`)는 **아무 데서도 import되지 않는 dead code**다. 헤더 주석엔 "단일 진실 공급원"이라 적혀 있지만 실제로는 안 쓰인다 — 새 코드에서 참조하지 말 것.

## 핵심 공식
미수금 = max(contract_amount, 발행된 계산서 합계) − 총 입금액
- 설치일(`installation_date`) 없고 입금도 없고 매출 기준도 0이면 → 미수금 0 (아직 매출 미발생)
- 10원 이하 양수는 부가세 반올림 오차로 간주해 0 처리 (`RECEIVABLES_TOLERANCE`)
- 초과 입금(음수)은 그대로 반환
- 보조금/자비 구분 없이 동일 규칙, 입금 필드만 다름 (`mapProgressToCategory` in `types/invoice.ts` — progress_status에 '보조금' 포함 여부로 판정)
- `invoice_records`(계산서 발행/입금 이력)가 있으면 그 값을 쓰고, 없으면 `business_info`의 레거시 컬럼(`invoice_1st_amount` 등)으로 fallback
- **수정발행 반영(2026-08-06 수정)**: `resolveEffectiveRecord(original, asOfDate?)` — 원본에 수정발행(`record_type:'revised'`) 이력이 있으면 금액·발행일은 최신 수정발행 값을, 없으면 원본 값을 쓴다. **입금액/입금일은 항상 원본에서만 읽는다** — 수정발행 폼엔 입금 입력란이 없어서 무조건 최신 레코드를 쓰면 실제 입금액이 0으로 사라지는 별개의 버그가 생김. `buildRecordsMap`이 이제 `revisions[]`를 원본에 매달아주므로(과거엔 그냥 버렸음) 이 함수가 그걸 읽는다. `business-invoices` GET(발행내역 표시 + 미수금 계산 양쪽)도 이 함수를 가져다 쓰도록 통일함 — 상세 모달과 리스트 합계가 어긋나지 않는다.

## 확정된 업무 규칙: "정확한 미수금"의 정의
매출관리 페이지 기본(무필터) 화면 총액은 **설치 전 사업장까지 포함**해 실제보다 약 7.6배 부풀려진다(실측: 19.7억 vs 2.6억). 사용자가 신뢰하는 "정확한 미수금"은 **`installation_date IS NOT NULL`(설치완료) 사업장만** 포함한 값이다. 미수금 집계 쿼리를 새로 짤 때는 이 필터를 기본으로 걸 것. `is_active`는 매출관리 기본 조회도 필터링하지 않으므로 맞추지 않는다.

## 관련 컬럼
- `business_info.receivable_risk` — 미수금 위험도(상/중/하). **자동 계산이 아니라** admin/revenue 페이지에서 수동 지정하는 값이다.
