---
name: air-permit
description: Facility Manager 프로젝트의 대기환경(대기필증) 도메인 참조. 대기필증/배출구/배출시설/방지시설 CRUD, IoT 측정기기·게이트웨이 연동, 견적서 연계 로직 조사·수정 시 사용한다.
---

# 대기환경(대기필증) 관리

## 테이블 계층 구조
`business_info`(1) → `air_permit_info`(N, 한 사업장이 여러 대기필증 보유 가능) → `discharge_outlets`(N, 배출구) → `discharge_facilities`/`prevention_facilities`(각 N, 배출구별 배출·방지시설). FK: `air_permit_info.business_id`, `discharge_outlets.air_permit_id`, `discharge_facilities.outlet_id`, `prevention_facilities.outlet_id`. 전 테이블 `is_active`/`is_deleted` 소프트삭제 컬럼 보유(DB 실물 확인됨) — 단 `types/database.ts`의 `DischargeOutlet`/`DischargeFacility`/`PreventionFacility` 인터페이스엔 이 필드들이 빠져있다(타입과 실제 스키마 불일치).

## API 라우트 — 단수/복수 이중 구조 주의
- **`app/api/air-permit/route.ts`(794줄)** — 실제 사용되는 메인 CRUD. `lib/supabase-direct`(raw SQL, `queryOne`/`queryAll`/`pgQuery`) 사용. `app/admin/air-permit/page.tsx`, `app/admin/air-permit-detail/page.tsx`가 전부 이 라우트만 호출한다.
- ⚠️ **`app/api/air-permits/route.ts`, `app/api/air-permits/[id]/route.ts`**(plural)는 코드베이스 어디서도 fetch 호출되지 않는 **죽은 코드**로 보인다. 새 기능을 여기 추가하지 말 것 — 실사용 라우트는 단수형이다.
- 예외적으로 **`app/api/air-permits/outlets/[outletId]/route.ts`**(plural)만 `components/sections/EnhancedFacilityInfoSection.tsx`에서 실사용된다(배출구 게이트웨이 정보 전용 PUT/DELETE).
- `app/api/air-permit/update/route.ts`는 별도 라우트로, 대기필증 내 시설의 `측정기기(measuring_devices)` 정보만 갱신 — `document-automation`의 `EstimatePreviewModal.tsx`가 호출한다.
- 인증: 전 라우트 `requireAuth(request, 1)` — 권한레벨 1(전 직원) 이상이면 접근 가능, 별도 사업장 소유권 검증 없음.

## PUT(수정)은 UPSERT-only — 삭제 diff 없음
`air-permit/route.ts` PUT은 요청 payload의 outlets/facilities를 id 유무로 UPDATE/INSERT만 수행하고, **payload에서 빠진(사용자가 UI에서 삭제한) 기존 배출구·시설을 DB에서 지우는 로직이 없다.** 개별 배출구/시설 삭제 API도 없다(전체 대기필증 DELETE 시에만 `is_deleted=true`로 계층 전체 캐스케이드 소프트삭제). 즉 편집 화면에서 시설을 지워도 DB엔 고아 레코드로 남을 수 있다 — 시설 개수 집계(`useFacilityStats.ts` 등)가 이 고아 레코드까지 세는지 확인 없이 신뢰하지 말 것.

## "게이트웨이" 세 가지 서로 다른 개념 (혼동 주의)
1. `discharge_outlets.gateway_number`(`'gateway1'~'gateway50'` 문자열, 정규식 검증) + `vpn_type`(유선/무선) — 배출구별 게이트웨이 **라벨**일 뿐, 실제 장비 레코드와 FK로 연결되지 않는다. 전용 API: `air-permits/outlets/[outletId]` PUT/DELETE.
2. `measurement_devices` 테이블에서 `device_type='gateway'`인 행 — 실제 등록된 IoT 게이트웨이 장비(ip_address, mac_address, facility_association JSONB로 outlet_ids 연결). API: `app/api/gateway-devices/route.ts`(조회 시 `measurement_devices`를 프론트 형식으로 변환).
3. `components/sections/GatewayInfoSection.tsx` — 위 2번을 소비하는 UI 컴포넌트지만 ⚠️ 페이지 어디서도 import되지 않는 **고아 컴포넌트**로 보인다. fetch 실패 시 하드코딩된 목업 게이트웨이 데이터로 조용히 폴백하는 코드도 포함(운영 중 노출되면 가짜 데이터가 실데이터처럼 보일 위험).

## IoT 측정기기/이력 — db-schema 스킬 내용 최신화 필요
- `measurement_devices`는 **구현되어 있다**(db-schema 스킬의 "미구현" 표기는 outdated). CRUD: `app/api/measurement-devices/route.ts`, 관련: `app/api/gateway-devices/route.ts`, `app/api/facility-management/route.ts`. UI: `components/MeasurementDeviceManager.tsx`, `components/FacilityManagementDashboard.tsx`. `device_type`: ph_meter/differential_pressure_meter/temperature_meter/ct_meter/gateway/flow_meter/gas_analyzer.
- `measurement_history`는 여전히 **미구현**이 맞다 — `database/unified-extensible-schema.sql`, `database/extended-schema.sql`에 `CREATE TABLE`은 존재하지만(supabase/migrations엔 없음, 즉 실제 적용 여부 미확인) 앱 코드(app/lib/components) 어디서도 참조되지 않는다. 타입도 이름이 다른 `MeasurementReading`(`types/database.ts:282`)만 정의돼 있어 테이블명과 타입명이 불일치한다.

## 매출/견적서 연계
`app/api/estimates/generate/route.ts`, `app/api/estimates/preview/route.ts`가 견적서 생성 시 `air_permit_info` + `discharge_facilities`/`prevention_facilities`를 조회해 시설 목록을 견적서에 반영한다 — 대기필증 등록이 정확한 견적 산출의 전제조건. `app/api/facilities-supabase/[businessName]/route.ts`는 이 경로와 별개로 시설 데이터를 `business_name`(레거시 호환 필드) 기준 **하드 DELETE 후 재INSERT**하는 방식을 쓴다 — `air-permit/route.ts`의 UPSERT+소프트삭제 방식과 삭제 시맨틱이 다르므로 두 라우트를 같은 것으로 취급하지 말 것.

## 필드명 충돌 주의
`business_info.pollutants`(단순 문자열, "오염물질" 한 개 값)와 `air_permit_info.pollutants`(구조화 배열 `{type, amount, unit, limit}[]`)는 이름만 같고 테이블·타입이 다르다. `air_permit_info.emission_limits`는 생성 시 항상 `{}`로만 채워지는 것이 확인되어(실사용 데이터 없음) 사실상 미사용 확장 필드로 보인다.
