---
name: business-sites
description: Facility Manager 프로젝트의 사업장(business_info) 도메인 참조. 진행구분/장비수량/계약금액 산출 로직, 대리점 판매가, is_active/is_deleted 실제 동작, 사업장 CRUD API 인증 상태를 확인할 때 사용한다.
---

# 사업장(business_info) 도메인

## 진행구분(progress_status)
- 값 목록은 하드코딩이 아니라 `progress_categories` 테이블(`/admin/settings` 진행구분 탭에서 관리자가 추가/수정)에서 동적으로 관리된다. 초기값(`20260415_create_progress_categories_table.sql`): 자비/보조금/보조금 동시진행/보조금 추가승인/대리점/외주설치/AS/진행불가/확인필요 — 목록이 고정이라고 가정하지 말 것.
- `facility_tasks.task_type`(self/subsidy/as/dealer/outsourcing/etc)은 `progress_status` 문자열 포함여부로 추론된다(`inferTaskType()` — `app/admin/settings/page.tsx`와 `app/api/settings/progress-categories/route.ts`에 동일 로직 2벌 중복). '보조금' 포함→subsidy, '자비' 포함→self, 정확히 'AS'→as, '외주' 포함→outsourcing, '대리점' 포함→dealer.
- 대리점 판매가 로직은 `progress_status`가 trim 후 정확히 `'대리점'`일 때만 적용된다(`isDealerBusiness()`, `lib/dealer-pricing.ts`) — task_type 추론과 달리 부분일치가 아니라 완전일치.

## order_date vs installation_date
- `installation_date`(설치일)가 매출 인식의 기본 기준(설치일 없고 입금·매출기준 모두 0이면 미수금 0 — 상세는 [[receivables]] 스킬).
- `order_date`(발주일)는 대리점 전용 보조 지표다. 대리점은 설치일이 자주 비어 있어, 매출관리 화면의 "설치 연도/월" 필터는 대리점 사업장만 `order_date` 기준으로 대체한다(`getFilterInstallDate()`, `app/admin/revenue/page.tsx`).
- `business-info-direct` PUT은 이 두 필드 변경을 감지해 부수효과를 트리거한다: `installation_date`가 새로 채워지면 설치비 본마감 자동트리거, `order_date`가 지워지거나 다른 월로 바뀌면 설치비 환수(`installation-closing/refund`) 호출 — 상세는 [[installation-payments]] 스킬.

## 계약금액(매출) 산출 — 사업장 데이터 관점
- 공식·단일소스는 [[receivables]] 스킬 참고. 사업장 관점 입력값: `EQUIPMENT_FIELDS`(18개 장비수량 컬럼) × 단가 + `additional_cost`(추가공사비) − `negotiation`(네고) + `revenue_adjustments`(JSONB 배열 `{reason, amount}`, `/admin/business` 폼에서 편집).
- ⚠️ `EQUIPMENT_FIELDS` 배열이 최소 7곳에 독립 하드코딩돼 있다(`lib/revenue-calculator.ts`, `lib/installation-closing.ts`, `app/api/installation-closing/forecast{,/process}/route.ts`, `app/api/commission-closing/eligible/route.ts`, `app/admin/business/page.tsx`, `app/admin/revenue/page.tsx`) — `receivables-engine.ts`가 export해도 실제로는 재사용되지 않는 곳이 더 많다. `lib/installation-closing.ts` 목록만 유일하게 레거시 `gateway` 필드가 빠져 있다. 게이트웨이 완전분리(`gateway`→`gateway_1_2`/`gateway_3_4`) 시도가 과거 이런 드리프트 때문에 실패해서, 이후 전류계 100A/400A 분리는 완전분리 대신 "총수량 유지 + `_400a` 부분수량 컬럼 추가" 방식을 택했다([[installation-payments]] 참고). 새 장비 필드 추가 시 이 목록들 전부 동기화 필요.
- `app/api/commission-closing/eligible/route.ts`는 `calculateContractAmount`/`computeReceivable`을 import하지 않고 자체 재구현한다. 주석엔 "매출관리 batch API와 동일 로직"이라 적혀 있지만 `invoice_records`를 참조하지 않고 `business_info`의 레거시 payment 컬럼만 쓰는 단순화 버전이라, 커미션 정산 대상 계산이 매출관리 화면과 미묘하게 다를 수 있다.

## 대리점 판매가 (`lib/dealer-pricing.ts`)
- `dealer_pricing.equipment_type`은 대분류라 매칭에 못 쓰고 `equipment_name`(한글명, `DEALER_EQUIPMENT_NAME_MAP`)으로 매칭한다. 게이트웨이는 대리점가에서 1,2구/3,4구 구분이 없어 `gateway_1_2`/`gateway_3_4`가 같은 한글명('게이트웨이')을 공유.
- 제조사 미매칭 시 같은 장비명의 첫 후보로 폴백, `dealer_pricing`에 매칭 자체가 없으면 원래 고시가로 폴백한다 — 대리점 사업장인데 고시가 그대로 찍혀 있다면 이 폴백 케이스일 수 있다.

## is_active / is_deleted 실제 동작
- `is_deleted`가 실질적 소프트삭제 플래그이고 대부분의 조회가 최소 `is_deleted = false`는 건다.
- `is_active`는 사업장 폼의 "활성/비활성" 드롭다운으로 수동 지정하는 값인데, 필터링 여부가 엔드포인트마다 다르다. ⚠️ 필터링함: `business-list`(GET includeAll), `business-memos`(사업장명→id 변환 시). 필터링 안 함: `business-info-direct`(`/admin/business` 메인 관리화면이 쓰는 CRUD 라우트 자체가 `is_deleted`만 걸고 `is_active`는 무시), 매출관리 기본조회([[receivables]] 참고). 즉 "비활성" 표시된 사업장도 메인 관리화면·매출관리에 그대로 나온다 — `is_active=false`를 "목록에서 숨김"으로 오해하지 말 것.

## 사업장 CRUD API 인증 상태 (2026-08-06 코드 재확인)
- 메인 CRUD 라우트 `business-info-direct`(GET/POST/PUT/DELETE, `/admin/business` 페이지가 사용)는 `requireAuth(request, 1)`로 보호된다. 커밋 `af1ce8d`(2026-07-26, "사업장 CRUD API 4개 핸들러에 인증 추가")에서 적용됨 — 과거 메모리(`project_business_facility_api_auth_gap`, 2026-07-25 기준 "Phase A만 완료, business-info-direct 포함 무인증")는 이 라우트에 한해 stale하니 재조사 없이 신뢰하지 말 것.
- 실사용 중인데 여전히 완전 무인증: `business-list`(GET — `verifyTokenHybrid`는 POST에서만 쓰이고 GET엔 미적용. order-management/facility/FilterPanel/air-permit/meeting-minutes/BusinessAutocomplete 등 다수 페이지가 이 GET을 그대로 씀), `business-memos`(GET/POST/PUT/DELETE 전체 — `/admin/business` 페이지의 메모 CRUD가 그대로 씀).
- 프론트 호출부가 없어 사실상 죽어있지만 URL을 알면 직접 호출 가능한 무인증 라우트: `business-info`(GET), `business-info-update`(POST, 엑셀 일괄수정), `business-unified`(GET/POST), `business-list-supabase`(GET/POST), `business-equipment-counts`(PUT — 장비수량 직접 변경 가능), `business-contacts`(GET/POST), `business-management`(GET/POST, DELETE는 no-op 스텁), `business-progress`(GET/POST/PUT/DELETE), `business-list-legacy`(GET).
- ⚠️ `lib/api-utils.ts`의 `withApiHandler(handler, { requiresAuth: true })` 옵션은 타입에만 선언돼 있고 함수 본문에서 전혀 검증하지 않으며, 코드베이스 어디서도 `requiresAuth: true`로 호출되지 않는다 — 이 옵션을 쓰면 인증이 걸린다고 착각하기 쉬운 죽은 기능이니 새 라우트 보호엔 `requireAuth`(`lib/auth/require-auth.ts`)를 직접 호출할 것.
