---
name: auth
description: Facility Manager 프로젝트의 사용자/인증(employees, permission_level, JWT, 소셜 로그인) 참조. 권한 체크 로직 수정, 신규 API 인증 추가, 로그인/소셜가입 버그 조사 시 사용한다.
---

# 사용자/인증

## employees.permission_level — 실제로는 0~4의 5단계
- 0=게스트(회의록 등에서 내부직원 필터링용, 로그인은 됨), 1=일반(로그인 기본값), 2=매니저(매출/원가 조회 — UI 라벨은 "매니저"), 3=관리자(직원·부서 관리, 대부분의 `admin/*` API), 4=시스템관리자(전자결재 슈퍼관리자, 접근로그, wiki 관리, 크롤러 직접URL, dev-work-log 등 최고권한). db-schema 스킬의 "1=일반·2=매출조회·3=관리자"는 0·4를 빠뜨린 구버전 서술이다.
- 라벨 정의는 `app/admin/users/page.tsx`의 `getPermissionLabel()`, enum형은 `lib/auth/AuthLevels.ts`의 `AuthLevel`(GUEST~SYSTEM_ADMIN).
- `sql/00_create_employees_table.sql`의 CHECK 제약은 1~3만 허용하지만, 실제 애플리케이션 로직(`app/api/admin/employees/[id]/route.ts`)은 0~4 전체를 유효값으로 취급한다 — 이 SQL 파일은 이후 마이그레이션으로 갱신된 구버전으로 보인다(실제 DB 제약 상태는 미확인).
- ⚠️ 레벨4 승격은 레벨4만 가능하도록 별도로 막혀있다(`app/api/admin/employees/[id]/route.ts:230` 부근) — 3에서 4로 셀프 승격 불가.
- ⚠️ JWT 페이로드 필드명이 구토큰 `permissionLevel`/신토큰 `permission_level` 두 가지로 혼재해 대부분의 라우트가 `decoded.permissionLevel || decoded.permission_level` 폴백을 반복한다(100곳 이상). 새 코드도 이 폴백을 유지할 것.
- 권장 패턴은 `lib/auth/require-auth.ts`/`require-admin.ts`/`require-system-admin.ts`/`require-sales-or-admin.ts` — 토큰 payload를 믿지 않고 매 요청마다 DB의 최신 permission_level을 재조회한다. 반면 다수의 기존 라우트는 토큰에 박힌 값을 그대로 신뢰한다 — 관리자가 권한을 낮춰도 해당 라우트에서는 재로그인 전까지 반영되지 않는다.

## role(staff/team_leader/executive/vice_president/ceo) — permission_level과 별개 축
- `role`은 전자결재 결재라인 판정 전용(`lib/approval-line.ts`, `approval` 스킬 참고), permission_level은 메뉴/데이터 접근 제어용. 서로 독립 저장이라 같은 사람이 role=team_leader이면서 permission_level=1(일반)일 수 있다 — 코드가 둘을 서로 유도하지 않는다.
- role 미지정 시 `'staff'`로 기본 처리(`app/api/admin/users/approve/route.ts`, `lib/auth/middleware.ts`).

## ⚠️ JWT 검증 구현이 3중으로 분리됨 (가장 중요한 함정)
- `utils/auth.ts`(`verifyToken`/`verifyTokenString`, secret: `JWT_SECRET` env, 서명 시 365일 만료), `lib/secure-jwt.ts`(`verifyTokenHybrid`, secret: `JWT_SECRET`/`JWT_SECRET_V2`, 7일 만료 발급), `lib/auth/middleware.ts`(`verifyAuth`/`requireAuth`, 자체 JWT_SECRET 폴백) — 세 파일이 각자 다른 시크릿 폴백·만료 정책을 갖고 병행 사용되며, 라우트마다 어느 걸 쓰는지 다르다.
- **BUG-202(2026-08-06 수정 완료)**: `lib/secure-jwt.ts`의 `OLD_JWT_SECRET`(소스노출 하드코딩 문자열 `'your-secret-key-change-this-in-production'`)이 `MIGRATION_PERIOD_DAYS=7` 주석과 달리 기간제한 없이 영구 신뢰되던 문제. `verifyTokenHybrid`/`verifyToken` 양쪽에서 OLD_JWT_SECRET 검증 분기와 관련 상수를 완전히 제거 — `NEW_JWT_SECRET`(env `JWT_SECRET`) 서명만 신뢰. `verifyTokenHybrid`는 78개 파일(`business-list`, `organization/*`, `facility-tasks`, `order-management` 등)에서 쓰이지만, 실제 로그인(`/api/auth/login`)이 이미 `JWT_SECRET`(=`NEW_JWT_SECRET`)로만 서명하므로 정상 세션엔 영향 없음(`tsc --noEmit` + 브라우저 로그인 세션으로 검증 완료).
- `lib/auth/middleware.ts`는 `JWT_SECRET` 미설정 시 동일한 하드코딩 문자열로 별개 폴백한다 — 이건 별개 파일이라 미수정 상태로 남아있음(BUG-202와 같은 패턴이니 손볼 때 같이 확인할 것).

## 소셜 로그인 — provider별 라우트가 3벌, 승인 정책 적용이 제각각
- provider(kakao/naver/google) 각각 정식 라우트(`app/api/auth/social/{provider}/route.ts`)와 `-simple` 라우트가 따로 있다. `google/route.ts`·`naver/route.ts`는 `social_auth_policies`(도메인별 auto_approve, `sql/social_auth_approvals_table.sql`)를 조회해 미승인이면 `social_auth_approvals`에 pending 삽입한다.
- ⚠️ `kakao/route.ts`는 정책이 auto_approve=false여도 실제로는 무조건 자동가입되는 버그가 있고(BUG-214, 미수정), `-simple` 3종(`kakao-simple`/`google-simple`/`naver-simple`)은 정책 조회 자체를 하지 않고 무조건 permission_level=1 활성 계정을 즉시 생성한다(BUG-217, 미수정).
- ⚠️ `sql/approval_settings_table.sql`의 `approval_settings` 테이블은 **코드 어디서도 쿼리되지 않는 완전한 dead 테이블**이다 — 이를 다루는 `app/api/admin/approval-settings/route.ts`는 GET에서 하드코딩된 기본값을 반환하고 PUT은 "메모리에만 저장, 추후 DB 연동"이라는 주석과 함께 아무 것도 영속화하지 않는 스텁이다. 실제 자동승인 정책은 `social_auth_policies` 테이블 쪽이다. `approval` 스킬의 전자결재 승인과도 이름만 비슷할 뿐 무관하다.
- 현재 `app/login/page.tsx`에는 소셜 로그인 버튼이 없다(이메일/비밀번호 로그인만 노출) — 위 소셜 라우트들이 실제 프론트에서 호출되는 경로가 있는지는 미확인. `app/admin/social-login/page.tsx`(소셜 로그인 관리 페이지)는 승인/정책 데이터를 실제로 조회하지 않는 목업이다(BUG-232).

## departments/teams — employees.department(텍스트)가 실사용 기준, id 기반 스키마는 별도 트랙
- 메뉴/부서 제한 로직(`components/ui/AdminLayout.tsx`, `/api/employees/me/department-info`)은 `employees.department`(텍스트) 기준으로 동작한다. `departments.id`/`teams.id`(정수 PK) 기반 신규 조직 스키마(`v_organization_full` 뷰, `primary_department_id`/`primary_team_id`/`org_management_scope`)는 조직도 시각화와 `/api/organization/members`의 관리권한 판정에만 쓰이고 직원 편집 UI와는 아직 연결되지 않았다.
- `employees.team`(텍스트)도 `department`와 별개 — 예: 영업팀 직원은 `department='영업관리부'`, `team='영업팀'`으로 저장되어 `department` 문자열만으로는 영업팀 여부를 알 수 없다(`lib/auth/require-sales-or-admin.ts` 주석).
- ⚠️ `/api/departments`, `/api/departments/[id]`는 인원수 집계·삭제가드를 `employees.department_id`(FK)로 계산하는데 실제 부서 배정은 `employees.department`(텍스트)에 쓰인다 — 두 값이 어긋나면 부서 삭제가드가 무력화될 수 있다(BUG-225, 미수정).

## 그 외 알려진 함정
- `lib/auth/special-accounts.ts` — 특정 이메일 하드코딩 계정에 대해 permission_level과 무관하게 특정 경로를 숨기는 별도 메커니즘. 결재 접근제어의 `APPROVAL_FULL_ACCESS_EMAILS`(`lib/approval-access.ts`)와 같은 패턴 — 권한이 permission_level 하나로만 결정되지 않는 곳이 여럿이다.
- `lib/auth/AuthGuard.ts`/`AuthLevels.ts`/`PagePermissions.ts` — 더 최근에 만든 페이지 접근제어 프레임워크지만 실사용처는 `app/admin/page.tsx`(`checkComponentAccess`) 정도뿐이라, 대부분의 페이지는 여전히 각자 `user.permission_level`을 직접 비교한다.
