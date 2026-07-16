# API 인증 누락 — 심층 재조사 결과 (2026-07-16, Phase 3 확장)

`api-auth-gap-systemwide.md`(1차 표본조사)를 이어서, 사업장/시설 도메인 밖 전체를 더 깊이 판 결과. 전체 API 라우트 375개 중 grep 기준 202개가 인증 심볼 0건이었고, 이번에 그중 핵심 클러스터를 직접 Read로 검증했다. **미착수 — 실행 승인 대상 아님, 조사만.**

## ✅ 조치 완료 (2026-07-16, 커밋 `2dc40ed`)

`auth/social-unified`는 **임시 차단**했다(삭제 아님). 실제 소셜 로그인은 별도의 `/api/auth/social/{provider}(+callback)` 경로(OAuth 코드교환, 안전)로 처리되고, 이 라우트를 호출하는 프론트엔드 코드가 전혀 없음을 재확인(`apiClient.socialLogin`도 정의만 있고 호출부 0건) — 지금 막아도 사용자 영향 없음. 관리자 계정이 예전에 소셜로 만들어졌더라도 그건 정상 `/api/auth/social/{provider}` 경로였고, 나중에 다시 쓸 가능성을 남겨두기 위해 코드는 삭제 안 하고 POST 핸들러 최상단에서 503을 조기 반환하도록만 막아뒀다. curl로 CSRF 우회까지 재현해서 라우트 자체가 막혔음을 확인함. 재사용하려면 실제 OAuth 액세스 토큰을 provider에 검증받는 로직을 추가한 뒤 이 차단(early return)을 제거할 것.

## 🔴 가장 심각한 단일 발견: 로그인 자체가 우회된다

**`app/api/auth/social-unified/route.ts` [POST]** — 인증 절차가 전무하다. 클라이언트가 보낸 `{provider, social_id, email, name}`을 그대로 신뢰하고, 사용자 조회 시 이메일이 일치하면(OR 조건) 그 계정으로 매칭해 **정상적으로 유효한 JWT를 발급**한다. 즉:

```
POST /api/auth/social-unified
{ "provider": "google", "social_id": "x", "email": "<대상자 이메일>", "name": "x" }
```

→ 대상자(관리자 포함, 권한 레벨 무관) 계정의 진짜 JWT를 그냥 받아간다. OAuth 토큰 검증도, 서명 검증도 없다. 이 JWT는 `verifyAuth`가 검증하는 나머지 모든 API에 그대로 통용된다.

**증폭 요소**: `app/api/auth/change-password/route.ts`는 자기 계정 한정으로 제대로 스코프되어 있지만, "현재 비밀번호" 확인이 **선택 사항**이다(제공 안 하면 검사 안 함). 즉 social-unified로 임의 계정 JWT를 얻은 뒤 change-password로 비번을 바꾸면 **영구 계정 탈취**가 완성된다.

이 항목은 이 프로젝트에서 지금까지 나온 모든 발견 중 가장 근본적이다 — "로그인 필요"라는 전제 자체가 깨지므로, 다른 API들이 아무리 인증을 잘 걸어놔도 이 경로로 얻은 진짜 JWT 앞에서는 무의미하다.

## CSRF는 사실상 장식이다

`validateCSRFToken()`은 쿠키값==헤더값만 비교하고 세션/서버 저장소와 무관하다. 토큰 발급 엔드포인트(`/api/csrf-token`)도 인증 없이 아무나 호출 가능해서, `GET /api/csrf-token`으로 받은 값을 그대로 다음 요청의 쿠키+헤더에 넣으면 CSRF 검증을 100% 통과한다. 실질 방어는 JWT 인증에만 의존하는데, 그 JWT 인증 자체가 위 social-unified로 우회 가능하다는 게 문제.

---

## 도메인별 요약 (심각도순, 파일 경로는 `claudedocs/`의 이전 조사 및 아래 참고)

### 🔴 CRITICAL
- **`auth/social-unified`** — 위 설명. 최우선.
- **`app/api/users/employees/route.ts`** [GET,POST,PUT] — 완전 무인증. GET으로 전 직원 PII(email, permission_level 등) 열람, POST로 임의 permission_level 직원 생성, PUT으로 임의 직원 email 변경 가능(소셜로그인과 결합 시 별도의 계정탈취 경로도 됨). 실사용 중(회의록 담당자 picker 등).
- **DPF 도메인 전체(13개 라우트, `app/api/dpf/**`)** — 완전 무인증. 차주 PII(이름/주소/연락처), 보조금액 열람 가능. `import`/`import/process`는 무인증 대량 UPSERT라 차량 데이터 대량 주입/변조 가능.
- **`app/api/estimates/**`, `app/api/construction-reports/**`** — 완전 무인증, 실사용 중. 고객 사업자등록번호·연락처·계약금액 열람/생성/삭제(IDOR) 가능. `construction-reports/pdf`는 심지어 **회사 은행계좌번호까지 포함된 계약서 PDF**를 인증 없이 생성한다.
- **`app/api/uploaded-files/route.ts` DELETE** — 인증 없이 임의 Google Drive 파일을 휴지통으로 이동(전체 drive 권한 서비스계정). 프론트 호출부 0건(死코드지만 공격표면은 살아있음).
- **`app/api/uploaded-files-supabase/route.ts` DELETE** — 인증 없이 임의 사업장 사진 삭제(Storage+DB+Drive 3중 삭제).

### 🟠 HIGH
- `admin/user-login-history`, `admin/user-social-accounts` — 무인증, 세션/소셜계정 PII 열람 + 세션 강제종료/소셜연결 해제
- `admin/tasks/duplicates` — 인증이 있는 척하지만 실제론 토큰 존재 여부만 확인(서명 검증 없음) → 사실상 무인증. 임의 업무 대량 삭제 가능
- `settings/progress-categories`, `settings/task-stages` — 무인증 CRUD, 하드삭제 가능. `progress-categories/migrate`는 **business_info 대량 UPDATE**까지 함
- `announcements`, `calendar`, `messages` (+하위 attachments) — 전부 무인증. **작성자(author_id/name)를 요청 바디에서 그대로 신뢰** — 누구나 타인 명의로 공지/일정/전달사항 위조 가능
- `notifications` PUT/DELETE — 무인증 IDOR, userId만 알면 타인 알림 읽음처리/삭제
- `wiki/reindex`, `wiki/upload-guideline`, `wiki/nodes/[id]` PATCH — 무인증. 위키 콘텐츠 임의 변조 가능하고, **블루온AI가 참조하는 RAG 지식베이스 자체를 오염시킬 수 있음**(이번 세션 앞부분에서 다룬 블루온AI 기능과 직결)
- `telegram/webhook` — 웹훅 서명검증 없음 + connect_token이 24비트라 브루트포스 가능 → 직원 알림을 공격자 텔레그램으로 가로채기 가능

### 🟡 MEDIUM
- `subsidy-crawler/manual` — 무인증으로 GitHub Actions 워크플로우 반복 트리거 가능(리소스 소진)
- `meeting-departments` — 무인증 설정 테이블 변조(주석은 "JWT 인증 사용"이라 되어있으나 거짓)
- `social/kakao/webhook` — 서명검증이 항상 true를 반환하는 스텁, 무인증 계정 연결해제/취소
- `weekly-reports`(base route) — 무인증 GET이 부작용으로 DB에 쓰기까지 함
- `nicepay/transactions` — 무인증이나 현재 env 미설정으로 동작 안 함(死코드, env 설정 시 HIGH로 격상)

### 정정 (오탐 — 실제로는 안전하거나 무해함)
- `reset-password`, `admin/users/approve`, `departments/*` — **전부 정상적으로 인증·권한체크됨**(1차 grep이 `jwt.verify` 인라인 호출/`verifyAuth` 사용을 못 잡아낸 오탐)
- `projects`, `workflows` — 인증은 정상이나, 이 API를 쓰는 컴포넌트 자체가 어느 페이지에서도 로드 안 되는 고아 코드(데드) — 보안 우선순위 낮음
- **`app/api/tasks/*`(레거시로 추정했던 것)는 실제로는 살아있고 인증도 정상** — 이전(1차) 조사에서 "죽은 레거시"라 했던 판단은 **오류로 정정**. `app/admin/tasks/[id]` 등에서 실사용 중이며 `verifyAuth` 적용됨. (`facility-tasks/*`가 메인 업무 시스템이라는 사실은 그대로 유지, `tasks/*`는 별도 기능으로 둘 다 살아있음)
- `forgot-password` — 405로 완전 비활성화, 이슈 없음
- `social/{google,kakao,naver}` 정식 OAuth 콜백들 — client_secret 기반 정상 코드교환, `social-unified`와 무관하게 안전

---

## 근본 원인 (반복 확인됨)
1. `middleware.ts`가 `/api/*`에 인증을 전혀 강제하지 않음 — 전적으로 라우트 핸들러 책임
2. 여러 라우트의 "JWT 인증 사용"/"Level 3+" 주석이 **실제 코드와 다름**(주석만 있고 구현 없음) — DPF, meeting-departments, estimates, construction-reports, announcements/calendar/messages에서 반복 확인
3. CSRF는 double-submit이라 인증 대체 수단이 못 됨, 게다가 대부분 민감 라우트가 CSRF 면제 목록에도 들어있어 이중으로 무방비
4. 이미 있는 정상 패턴(`lib/auth/middleware.ts`의 `verifyAuth`, `jwt.verify` 인라인, `lib/auth/require-admin.ts` 계열)을 안 쓴 라우트가 훨씬 많음

## 다음에 할 일 (제안, 미실행)
1. **`auth/social-unified` 즉시 차단** — 이건 다른 모든 항목과 시급성이 다르다. 임시로 해당 엔드포인트를 비활성화(410/503)하거나, 최소한 실제 OAuth 토큰 검증을 추가하기 전까지 트래픽을 막는 것을 최우선 검토 권장.
2. `users/employees`, DPF 전체, estimates/construction-reports — 다음 우선순위
3. 나머지는 이전 문서(business-facility-api-auth-gap.md)와 같은 방식으로 배치 분할 + 무위험/영향가능 분리해서 진행

## Critical Files
- `app/api/auth/social-unified/route.ts` — 최우선
- `app/api/auth/change-password/route.ts` — 증폭 요소(현재비번 검증 선택적)
- `app/api/users/employees/route.ts`
- `app/api/dpf/**`
- `app/api/estimates/**`, `app/api/construction-reports/**`
- `lib/security/csrf-protection.ts` — CSRF 무력화 근거
