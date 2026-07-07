# 관리자 대시보드 개편 작업 정리 (2026-07)

이 문서는 `/admin` 대시보드를 대대적으로 개편한 세션의 작업 내용을 정리한 것입니다.
다음 세션에서 이어서 작업할 때 git log/diff를 다시 훑지 않고도 맥락을 빠르게 파악할 수 있도록
"무엇을 왜 그렇게 했는지" 위주로 적었습니다.

## 전체 흐름 요약

1. 주간 브리핑(WeeklyScorecard) 위젯 신규 추가
2. 매출/미수금/설치/영업인입 4개 차트를 "주 단위 비교 + 호버 없이 보이는 표" 구조로 재설계
3. 위 4개 차트가 공유하는 `chart-kit.tsx` 공통 모듈 추출
4. 전역 필터 패널 제거
5. 영업 인입 건 섹션 세부 개선 (툴팁 겹침, 영업점 순위, 미지정 모달, 주간 집계 지원)
6. `/admin` 접근권한 보안 점검 → 데이터 API 전체에 서버측 인증 누락 발견 → 수정

## 1. 주간 브리핑 위젯

- 컴포넌트: `components/dashboard/WeeklyScorecard.tsx`
- API: `app/api/dashboard/weekly-scorecard/route.ts`
- **주 정의: 월요일~일요일**. 이는 `lib/dashboard-utils.ts`의 기존 대시보드 집계 주 정의(일요일~토요일)와
  **의도적으로 다른, 별개의 규칙**이다. 두 시스템을 혼동하지 말 것.
- `referenceDate` 쿼리 파라미터로 임의 시점 기준 조회 가능 → 프런트에 ◀/▶ 주차 이동 버튼 + "이번주로" 리셋 버튼 구현.
- 미수금 상/중/하 위험도는 설치일 기준 순수 날짜 계산이라 과거 시점도 별도 이력 테이블 없이 재계산 가능(계산 로직은 매출관리 페이지의 `calcAutoRisk`와 동일 기준: 90/60/30일).
- 영업/설치/인허가/미수금 4개 그룹만 구현. **사후관리(AS) 그룹은 범위에서 제외**(사용자가 명시적으로 다음으로 미룸) —
  이유: 출동/유선 구분을 저장할 필드가 `as_records`에 없음(신규 컬럼 필요). 미처리(`status != finished`)/청구(`is_paid_override`)는
  기존 필드로 유추 가능하다고 결론 내림.

## 2. 차트 4종 재설계 + `chart-kit.tsx`

대상: `RevenueChart.tsx`, `ReceivableChart.tsx`, `InstallationChart.tsx`, `MonthlyLeadsChart.tsx`
(전부 `components/dashboard/charts/`)

공통 모듈: `components/dashboard/charts/chart-kit.tsx`
- `PERIOD_PRESETS` / `PeriodPresetControl` — 4주/8주/6개월/1년 세그먼트 컨트롤
- `resolvePeriodParams(filters, preset, opts)` — 프리셋→API 쿼리파라미터(`startDate`/`endDate`/`months`) + 실제 집계 레벨(`weekly`/`monthly`) 변환. 부모의 전역 필터(커스텀 기간 등)가 있으면 그쪽 우선.
- `Sparkline`, `DeltaTag`, `HeroStat` — 스파크라인 + 증감 표시가 있는 핵심지표 카드
- `formatFullAmount` (전체 자릿수 콤마 + "원") vs `formatAbbrCurrency` (억/만 축약) — **상시 노출되는 카드/표는 무조건 `formatFullAmount`, 차트 축·부동 라벨처럼 공간이 좁은 곳만 `formatAbbrCurrency`.** 이건 사용자가 명시적으로 요청한 규칙.
- `periodLabels(level)` — "이번주/전주 대비" ↔ "이번달/전월 대비" 등 라벨을 집계 레벨에 맞게 자동 전환

각 차트 공통 구조 (다른 섹션과 순서 통일 요청 반영):
```
헤더(제목 + 기간 프리셋 + 새로고침)
→ 핵심지표 카드(스파크라인 + 증감, 상시 노출)
→ 보조 지표(누적 총액 등, 간단 텍스트)
→ 차트 (그래프가 먼저)
→ 항상 보이는 기간별 비교 표 (표는 그래프 다음)
```
**"그래프 먼저, 표 나중"은 사용자가 명시적으로 확인한 순서 규칙** — 영업 인입 건도 처음엔 표가 먼저였다가 이 순서로 바로잡음.

`N주차` 표기에 실제 날짜를 병기: `lib/dashboard-utils.ts`의 `formatAggregationLabel`이 주차 표시 시
`getWeekStartDate()`로 시작일을 역산해 `28주차(7/5)` 형태로 출력. `getWeekStartDate`는 `getAggregationKey`와
같은 주차 계산식을 연초부터 하루씩 대조해서 찾으므로 두 함수가 항상 일치함(닫힌 공식으로 역산 시도했다가
연초 요일에 따라 오프바이원 버그가 나서 폐기하고 이 방식으로 교체함).

`monthly-leads` API(`app/api/dashboard/monthly-leads/route.ts`)는 원래 월별 고정 집계만 지원했음
(다른 3개 API와 달리 `determineAggregationLevel`을 안 씀). 주간 프리셋을 지원하도록 백엔드를 직접 수정해서
다른 API들과 동일한 패턴으로 통일함.

영업 인입 건 세부:
- 호버 툴팁이 활성 영업점을 전부 나열해 영업점 많은 달에 범례와 겹치는 버그 → 상위 4개 + "외 N개" 요약으로 축소.
- "조회기간 전체 영업점 순위" 표 신규 추가 — 최신 시점 스냅샷(TOP5)과는 별개로, 선택 기간 전체 합계를 랭킹으로 보여줌.
- "미지정 건수 → 목록 보기"를 인라인 확장 목록에서 중앙 모달(`UnassignedModal`, 기존 `DetailModal`과 동일 UX)로 변경.

**목표설정(Target) 기능 제거**: `RevenueChart`의 "목표설정" 버튼/목표 라인/툴팁 목표대비 표시를 제거함.
DB 확인 결과 `dashboard_targets`에 2025-01~06 데이터 9건만 있고 그 이후 1년 넘게 미사용 확인 후 제거.
`TargetSettingModal.tsx` 컴포넌트, `/api/dashboard/targets` API, `dashboard_targets` 테이블 자체는
그대로 남겨둠(재사용 가능하도록, 데이터도 삭제 안 함).

## 3. 필터 섹션 제거

`components/dashboard/FilterPanel.tsx`를 `/admin` 페이지에서 더 이상 렌더링하지 않음
(각 차트가 자체 기간 프리셋을 가지므로 전역 필터 불필요 판단). **컴포넌트 파일 자체는 삭제하지 않고 남겨둠**
(사용자 요청 없이 파일 삭제하지 않는다는 프로젝트 원칙). 지사/제조사/영업점/진행구분 필터 기능은 이걸로
같이 없어졌음 — 필요해지면 복원 필요.

## 4. 보안 점검 — `/admin` 접근권한 (중요)

사용자 요청으로 `/admin` 권한 체크(레벨 3 이상)를 점검하다가 **심각한 구멍을 발견해서 수정함**.

**발견한 문제**: `app/admin/page.tsx`의 클라이언트 게이트(`checkAuthAndPermission`) 자체는 정상 동작하지만,
이 페이지가 그리는 컴포넌트들이 호출하는 실제 데이터 API 6개가 **서버측 인증 검사를 전혀 안 하고 있었음**:
`/api/dashboard/{revenue,receivables,installations,monthly-leads,weekly-scorecard,targets}`.
로그인 안 한 사용자도 curl로 직접 호출하면 매출/미수금 등 재무 데이터를 그대로 받아올 수 있었음.
`/api/dashboard/layout`은 로그인 여부(`verifyToken`)는 확인했지만 `permission_level >= 3` 체크가 빠져 있었음.

**수정**: `lib/auth/require-admin.ts` 공통 헬퍼 신규 작성 → 위 7개 라우트 전체에 적용.
- 토큰 추출: `Authorization: Bearer` 헤더 우선 → 없으면 `session_token` 쿠키 (주의: `auth_token`/`auth-token`
  쿠키가 아님 — 표준 로그인 플로우는 `session_token` + `auth_ready`만 세팅함. 이 프로젝트에 쿠키명이
  `session_token`/`auth_token`/`auth-token` 세 가지가 혼재하니 새 코드 작성 시 주의)
- 검증: `verifyTokenString` from `@/utils/auth` (같은 이름의 함수가 `@/lib/secure-jwt`에도 있는데, 코드베이스
  전체에서 `@/utils/auth` 쪽이 104곳으로 압도적 다수 — 새 코드는 이쪽을 표준으로 사용)
- 권한 확인은 JWT에 박힌 값을 믿지 않고 **DB에서 `permission_level`을 다시 조회**(토큰이 30일 유효하므로,
  그 사이 권한이 바뀔 수 있음을 감안). `employees` 테이블 `is_active = true` 조건도 포함.
- 이 패턴은 새로 만든 게 아니라 기존 `app/api/admin/promote-user/route.ts` 등에서 이미 쓰던 검증된 패턴을 그대로 재사용.

**미들웨어(`middleware.ts`) 관련 참고**: `middleware.ts`는 Edge Runtime 한계로 JWT 서명 검증을 안 하고
구조/만료만 얕게 확인하며, "실제 서명 검증은 페이지/API 레벨에서 수행됨"이라고 코드에 명시되어 있음.
즉 미들웨어만으로는 보호가 안 되고 각 API가 스스로 검증해야 하는 구조 — 이번에 빠졌던 6개 API가
바로 그 책임을 놓치고 있던 부분.

**수정하다 발견한, 이번 작업과 무관한 별개의 기존 버그(고치지 않음)**: `/api/dashboard/layout`이 500 에러를 냄.
원인은 `dashboard_layouts` 테이블이 실제 DB에 없기 때문(`relation "dashboard_layouts" does not exist`).
생성 스크립트는 `sql/dashboard_layouts_table.sql`에 이미 있음 — 사용자가 직접 실행해야 함(Supabase SQL은
사용자가 직접 실행하는 게 이 프로젝트의 확립된 방식). 이것 때문에 대시보드 자체가 막히진 않고, 위젯
배치 커스터마이징만 저장이 안 되고 계속 기본 배치로 나옴.

## 파일 변경 목록 (신규/주요 수정)

**신규**
- `components/dashboard/WeeklyScorecard.tsx`
- `app/api/dashboard/weekly-scorecard/route.ts`
- `components/dashboard/charts/chart-kit.tsx`
- `lib/auth/require-admin.ts`

**주요 수정**
- `app/admin/page.tsx` (위젯 순서/레이아웃 병합 로직, FilterPanel 제거)
- `components/dashboard/charts/{RevenueChart,ReceivableChart,InstallationChart,MonthlyLeadsChart}.tsx`
- `app/api/dashboard/{revenue,receivables,installations,monthly-leads,layout,targets}/route.ts` (인증 추가)
- `app/api/dashboard/monthly-leads/route.ts` (주간 집계 지원 추가 — 인증과는 별개 변경)
- `lib/dashboard-utils.ts` (`getWeekStartDate` 추가, `formatAggregationLabel` 주차 표기에 날짜 병기)
- `components/dashboard/DashboardCustomizer.tsx` (위젯 라벨 목록에 `weekly-scorecard` 추가)

**건드리지 않고 그대로 둔 것 (의도적)**
- `components/dashboard/FilterPanel.tsx` — 사용 안 하지만 파일은 유지
- `components/dashboard/modals/TargetSettingModal.tsx`, `/api/dashboard/targets`, `dashboard_targets` 테이블 — 프런트 진입점만 제거
- `dashboard_layouts` 테이블 생성 — SQL 파일만 준비돼 있고 미실행 상태

## 남은 작업 후보 (사용자가 다음으로 미뤘거나 발견만 하고 안 고친 것)

1. 사후관리(AS) 그룹을 주간 브리핑에 추가 — `as_records`에 출동/유선 구분 컬럼 신규 필요
2. `dashboard_layouts` 테이블 생성 SQL 실행 (`sql/dashboard_layouts_table.sql`)
3. 전역 필터(지사/제조사/영업점/진행구분) 복원 여부 결정
