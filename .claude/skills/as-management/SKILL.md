---
name: as-management
description: Facility Manager 프로젝트의 AS(사후관리) 시스템 참조. AS 건 등록/상태/유상무상 판정, AS 매출 집계 로직 수정 시 사용한다.
---

# AS 관리

## 핵심 테이블
- `as_records` — AS 건 메인. `business_id`(등록 사업장) 또는 `business_name_raw`(미등록/타업체) 중 하나만 채워짐(상호 배타적, POST에서 business_id 있으면 site_* 3필드는 강제 NULL). `status`, `is_paid_override`, `delivery_date_override`, `manufacturer`, `dispatch_count`/`dispatch_cost_price_id`/`dispatch_revenue_price_id`, `progress_notes` JSONB, `is_deleted`(소프트 삭제)
- `as_price_list` — 단가표. `price_type`: `cost`(자재원가)/`revenue`(자재매출)/`dispatch_cost`(출동원가)/`dispatch_revenue`(출동매출)
- `as_material_usage` — 건별 사용자재 스냅샷(단가표 변경 영향 없음). `revenue_unit_price`/`revenue_price_list_id`로 매출단가 개별 override 가능
- `as_price_adjustments` — 건별 매출/매입 수동 조정(`adjustment_type`: revenue/cost, amount, reason, 0원 불가)
- RLS는 4개 테이블 전부 "server only access" — 클라이언트가 Supabase에서 직접 접근 불가, 반드시 API route 경유.

## status (⚠️ db-schema 스킬과 실제 값이 다름)
`.claude/skills/db-schema/SKILL.md`에는 최초 설계값(received/scheduled/in_progress/parts_waiting/on_hold/completed/cancelled)이 적혀 있지만 2026-03 `sql/migrate_as_status_values.sql`로 CHECK 제약을 통째로 교체했다. 현재 실제 값(8개, `AsStatusBadge.tsx`의 `STATUS_CONFIG`가 라벨/색상 단일 소스):
- `scheduled` 진행예정 · `site_check` 현장확인 · `installation` 포설 · `modem_check` 모뎀확인 · `completion_fix` 준공보완 · `on_hold` 보류 · `completed` 진행완료 · `finished` 완료
- ⚠️ `completed`(진행완료)와 `finished`(완료)는 이름만 봐선 어느 쪽이 최종 상태인지 헷갈리는 함정 — `finished`가 최종 종료, `completed`는 중간 진행 완료에 가깝다.
- 강제된 상태 전이 순서는 코드에 없다. `AsRecordModal.tsx`의 드롭다운(`STATUS_OPTIONS`)에서 자유 선택.
- `VALID_STATUSES` 배열이 5개 파일에 각각 하드코딩돼 있어 단일 소스가 아니다 — 새 상태 추가 시 전부 수정 필요: `as-records/route.ts`, `as-records/[id]/route.ts`, `external/as-records/route.ts`, `external/as-records/[id]/route.ts`, `as-records/bulk-upload/route.ts`(+ 엑셀 한글 매핑용 `STATUS_MAP`) 그리고 `AsStatusBadge.tsx`의 `STATUS_CONFIG`.

## 유상/무상 판정
우선순위: `is_paid_override`(수동 true/false) → `delivery_date_override`(AS건 자체 출고일 수동입력) → `business_info.delivery_date`(연결 사업장 출고일). 셋 다 없으면 `is_paid = NULL`(미확인, UI엔 "미확인" 배지).
- 기준: 출고일 + 26개월(2년 2개월 보증기간) 경과 시 유상, 이내면 무상.
- `delivery_date_override`(2026-03-25 추가)는 `business_id` 미연결 건(타업체) 또는 연결됐지만 `business_info.delivery_date`가 빈 사업장을 위한 폴백.
- 판정 CASE문이 GET(`as-records/route.ts`, `[id]/route.ts`)과 `as-revenue/route.ts`(집계용, is_free로 반전) 양쪽에 중복 구현돼 있다 — 공유 함수 없음, 로직 변경 시 두 곳 다 고쳐야 한다.
- ⚠️ `as-revenue/route.ts`는 무상 판정 시 자재원가·자재매출·매출/매입 조정을 전부 0으로 처리하지만 **출동비(dispatch_cost/dispatch_revenue)는 유·무상 관계없이 항상 집계**된다(코드 주석: "출동비는 공통, 자재는 유상만").

## AS 매출 집계 (`as-revenue/route.ts`)
- `lib/receivables-engine.ts`/`invoice_records` 기반 미수금 계산과는 **완전히 별개 시스템**이다. AS 매출은 이 라우트가 자체 SQL로 집계하며 대시보드/매출관리의 미수금 수치에는 반영되지 않는다.
- 자재 매출단가 우선순위: `as_material_usage.revenue_unit_price`(직접입력) → `revenue_price_list_id`(수동 매핑) → `item_name` 자동 매핑(`as_price_list.price_type='revenue'`) → 0원.
- 담당자 인센티브 = (자재매출 − 자재원가) × 30%, 무상 건은 자동 0. 사업장 `net_profit`은 **건별로 먼저 계산 후 합산**한다(주석: 인센티브를 사업장 합계에서 다시 빼면 이중차감).
- ⚠️ `business_info.as_cost`(revenue 페이지 설치원가 계산용 컬럼)는 `as_records`/`as-revenue`와 **이름만 비슷한 완전 별개 필드**다. 혼동 주의.

## progress_notes (JSONB)
배열, append-only(`POST .../progress`가 `progress_notes || newNote`로 뒤에 추가, 삭제는 별도 DELETE에서 id로 필터링해 재구성). 원소 구조: `{id(uuid), timestamp, author, content, status_at_time}`. `status_at_time`은 메모 작성 시점의 status 스냅샷 — 현재 status와 달라질 수 있으며 UI는 `STATUS_CONFIG[status_at_time]`로 그 시점 배지를 그대로 보여준다.

## facility_tasks의 task_type='as'와는 다른 시스템
`facility_tasks`에도 `task_type='as'`가 있고 별도 상태 흐름(`asSteps`: as_customer_contact→as_site_inspection→as_quotation→as_contract→as_part_order→as_completed, `lib/task-steps-new.ts`)을 갖지만, 이는 영업/행정 업무 트래킹용이다. 이 문서의 대상인 `as_records`(현장 AS 접수·작업·정산 관리)와는 테이블도 상태값도 완전히 별개이며 서로를 연결하는 컬럼도 없다.

## 인증
`as-records`(목록/등록), `[id]`(조회/수정/삭제), `progress`, `adjustments` 라우트는 JWT(`verifyTokenString`)만 허용. `materials` POST와 `external/as-records`(+`[id]`)는 JWT 또는 API 키(`verifyApiKey`) 둘 다 허용 — 에코센스 등 외부 제조사 시스템 연동용이며, `external/as-records` POST는 `manufacturer='ecosense'`로 자동 고정된다. 외부 API 키 인증 시엔 `materials` POST에 `price_list_id`가 필수(JWT/내부 인증은 `material_name`만으로도 허용).
