# 사업장/시설 관리 API 인증 누락 — 현황 및 남은 작업 (Phase B)

2026-07-16 조사. Phase A(아래)는 완료·배포됨. Phase B는 아직 미착수 — 실행 승인 대상 아님, 검토 후 별도 진행.

## 요약: 지금 안 고치면 뭐가 위험한가

`app/api/business-info-direct` 등 아래 목록의 라우트는 **로그인 여부와 무관하게 누구나 호출 가능**하다. `business_info` 테이블 자체는 RLS로 막혀 있지만, 서버 API가 서비스 롤 키로 RLS를 우회하는 구조라 DB 방어가 무의미하고, 방어는 전적으로 라우트 코드의 인증 검증 여부에 달려 있는데 그게 없다.

- **정보 노출**: 사업자등록번호, 담당자·대표자 연락처, 대표자 생년월일, 그린링크(외부 포털) 평문 로그인정보, 계약금액, 미수금이 인증 없이 조회 가능. URL만 알면(또는 API 엔드포인트를 스캔하면) 회사 내부 정보에 로그인 없이 접근할 수 있다.
- **무단 변조/삭제**: 일부 라우트는 PUT/POST/DELETE도 인증 없이 가능 — 사업장 정보를 임의로 수정하거나 삭제(soft-delete)할 수 있다.
- **외부 노출 시 시나리오**: 사내망이 아니라 공인 도메인으로 배포된 서비스라면, 검색엔진 크롤러나 무작위 스캐너가 이 엔드포인트를 발견해 데이터를 긁어가거나 변조할 위험이 실존한다. 인증 로직 자체가 없는 것이라 "운 좋게 안 걸린" 상태에 가깝다.
- **방치 시 리스크는 시간이 지날수록 커짐** — 사용자·데이터가 늘수록 노출되는 정보량도 늘어난다.

## 이미 완료(Phase A, 커밋 `7c7ff2e`)

활성 사용자 사용에 영향 없는 것만 우선 처리:
- 프론트엔드 호출부 0건인 죽은/디버그 라우트 4개 삭제: `test-business-db`, `test-air-permit-db`, `check-air-permit-schema`, `business-info-edit`
- `lib/auth/require-auth.ts` 신설 — `lib/auth/require-admin.ts`와 동일 패턴(Bearer 헤더 → `session_token` 쿠키 폴백 → `verifyTokenString` → DB `permission_level` 재조회)의 레벨1(로그인한 일반 직원)용 버전. 아직 어떤 기존 라우트도 이걸 쓰지 않음 — Phase B 착수 시 바로 쓸 준비만 해둔 것.

## 핵심 발견 사실 (Phase B 진행 시 그대로 활용)

1. 재사용 가능한 인증 패턴이 이미 있다 — `lib/auth/require-admin.ts`(레벨3), `require-sales-or-admin.ts`, `require-system-admin.ts`(레벨4). 레벨1용은 Phase A에서 `require-auth.ts`로 이미 만들어둠.
2. `session_token`이 로그인 시 실제로 세팅되는 유일한 인증 쿠키(httpOnly, 30일)이고 브라우저가 same-origin 요청마다 자동 첨부한다 — 즉 프론트 fetch 호출부를 안 고쳐도 서버에 체크만 추가하면 인증이 걸릴 가능성이 높다(단, 서버-to-서버 호출 등 예외는 배치 착수 전 점검 필요). `AUTH_COOKIE_NAME='auth_token'`과 일부 라우트의 `cookies.get('auth_token')` 폴백은 실제로 세팅된 적 없는 죽은 코드라 무시할 것.
3. `withApiHandler`(`lib/api-utils.ts:79`)의 `requiresAuth` 옵션은 선언만 있고 미구현 — Phase B에서도 손대지 않고, 그 래퍼를 쓰는 라우트는 핸들러 내부에 인라인으로 체크 추가.
4. 같은 도메인 내 이미 올바르게 인증된 선례: `app/api/facility-tasks/route.ts` — 조회/수정은 레벨1, 삭제는 레벨4.
5. `app/api/business/[id]/route.ts`는 캘린더 모달용으로 **의도적 공개**(주석 명시) — Phase B 대상에서 완전히 제외, 필드 축소만 별도 검토.

## Phase B — 미착수, 검토 후 진행

인증 추가 시 이론적으로는 `session_token` 쿠키 자동 첨부로 안전할 것으로 판단되나, 활성 세션/서버-to-서버 호출 등 완전히 배제 못 하는 변수가 있어 보류 중.

### B-1. 파괴적 DELETE (영향 큼 → 레벨3 `requireAdmin` 적용 예정)
`business-info-direct` DELETE, `air-permit` DELETE, `air-permits/[id]` DELETE, `air-permits/outlets/[outletId]` DELETE, `outlet-facility` DELETE, `facility-photos/[photoId]` DELETE

### B-2. 사업장관리 화면이 상시 호출하는 조회/수정 (레벨1 `requireAuth` 적용 예정) — 가장 넓은 범위
`business-info-direct`(GET/PUT/POST), `business-unified`, `business-contacts`, `business-invoices`(+batch), `business-info-update`, `business-id`, `business-management`(+duplicate-check), `business-memos`(+reindex), `business-progress`, `business-equipment-counts`, `business-list-supabase`, `business-list-legacy`, `business-info`

### B-3. 대기필증/배출구 (레벨1, DELETE만 레벨3)
`air-permit`(GET/POST/PUT), `air-permit-pdf`, `air-permits/[id]`(GET/PUT), `air-permits/outlets/[outletId]`(GET/PUT), `outlet-facility`(GET/POST/PUT), `outlet-gateway`

### B-4. 시설/업무 (레벨1)
`facilities-supabase/[businessName]`, `facility-detail`, `facility-management`, `facility-measurement`, `facility-photos`(POST/GET), `facility-photos/download-zip`, `facility-stats`, `facility-tasks/[id]/history`, `facility-tasks/advance`

### B-5. 개별 확인 필요 (삭제도 수정도 아직 판단 보류)
- `app/api/migrate-business-id/route.ts` — GET 미리보기 + **POST가 실제 DB 스키마 마이그레이션 실행**. 프론트 호출부는 없지만 운영 도구로 수동 호출됐을 가능성이 있어 임의 삭제 안 함. 아직 필요한 도구인지 사용자 확인 필요.
- `app/api/business/[id]/route.ts` — 인증은 추가 안 하되, 사업자등록번호/담당자연락처/이메일까지 반환하는 게 맞는지(주석상 "공개 정보만"과 실제 구현이 다름) 필드 축소 여부 검토 필요.

### Phase B 진행 시 권장 절차
- 배치 단위(B-2 → B-3 → B-4 → B-1 순 등)로 나눠 각 배치마다: 수정 → `tsc --noEmit` → curl로 무인증 401 확인 → 실사용자 세션(claude-in-chrome, JWT 위조 없이)으로 화면 스모크 테스트 → 커밋. 앞 배치 검증 통과 후 다음 배치 진행.
- 배치 착수 전 각 라우트를 `grep -rn "api/<route>" app/ components/ hooks/ lib/`로 호출부 전수 확인해서 서버-to-서버 호출(쿠키 미첨부 → 401 발생 가능) 여부부터 걸러낼 것 — 이게 유일한 실질 회귀 리스크.
- 폭넓은 변경이므로 별도 브랜치(`security/api-auth-hardening`) 작업 후 병합 권장(최종 결정은 사용자 몫).

## Critical Files
- `lib/auth/require-admin.ts` — 복제 템플릿 (완료)
- `lib/auth/require-auth.ts` — Phase A에서 신설 (완료)
- `app/api/business-info-direct/route.ts` — 가장 민감, Phase B 착수 시 최우선 참고 구현 대상
- `app/api/facility-tasks/route.ts` — 레벨 배정 선례
