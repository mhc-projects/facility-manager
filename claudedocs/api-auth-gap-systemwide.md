# API 인증 누락 — 사업장/시설 도메인 밖으로 확장된 시스템 전체 조사 (1차 표본조사)

2026-07-16 조사. 미착수 — 실행 승인 대상 아님. `business-facility-api-auth-gap.md`(사업장/시설 도메인), `external-business-page-security.md`(외부인용 페이지)와 별개로, 다른 도메인까지 훑어본 결과.

**⚠️ 이 문서는 1차 표본조사다. 훨씬 심각한 심층 재조사 결과는 `claudedocs/api-auth-gap-critical-findings.md`를 먼저 읽을 것** — 특히 `auth/social-unified`가 인증(로그인) 자체를 완전히 우회할 수 있는 최우선 CRITICAL 항목이다.

## 구조적 원인 (가장 중요)

`middleware.ts`는 `/api/*`에 대해 **인증을 아예 하지 않는다.** Rate limit → 요청크기 검증 → CSRF 검증만 통과하면 그대로 핸들러로 넘어간다(`middleware.ts:327-343`, 주석: "실제 검증은 페이지/API 레벨에서 수행"). 즉 모든 API의 인증은 **개별 라우트 핸들러 코드에만 의존**하고, 핸들러에 인증 코드가 없으면 그 API는 완전히 공개다. 사업장/시설 도메인은 이 구조적 문제의 한 사례일 뿐이었다.

추가로 CSRF 면제 목록이 **두 곳**(`middleware.ts`의 `isCSRFExemptAPI()`, `lib/security/csrf-protection.ts`의 `protectCSRF()` 내부 목록)에 나뉘어 있고, 각 항목 주석에 "JWT 인증 사용"/"Supabase Admin 인증 사용"이라 적혀 있는데 **실제 핸들러에는 그 인증이 없는 경우가 다수**다. 즉 "CSRF는 면제해도 자체 인증이 있으니 안전하다"는 전제 자체가 여러 라우트에서 거짓이다.

또한 CSRF 보호 방식 자체가 **세션과 무관한 double-submit 패턴**(`csrf-protection.ts:46-56`, 쿠키의 토큰값과 헤더의 토큰값이 같은지만 비교)이라, `/api/csrf-token`으로 토큰을 새로 발급받아 쿠키·헤더에 그대로 넣으면 인증 없이도 CSRF 검증을 통과한다. 즉 "CSRF 보호는 되니까 상대적으로 안전"이라는 가정도 실제로는 약하다.

## 직접 핸들러를 읽어 확인한 무인증 라우트 (심각도순)

### 🔴 CRITICAL — 재무 데이터, 무인증 + CSRF 면제(직접 curl 호출 가능)
- **`app/api/invoice-records/route.ts`** (POST/PUT/DELETE) — 인증 전무. `business_info`의 발행액·입금액까지 동기화하며 임의 계산서 레코드 생성/수정/(소프트)삭제 가능.
- **`app/api/business-invoices/route.ts`** (GET/PUT) — 인증 전무. GET으로 임의 사업장의 계산서·입금·미수금 전체 조회, PUT으로 금액 임의 수정 가능.

### 🔴 HIGH — 쓰기/파괴적, 무인증 + CSRF 면제
- **`app/api/migrate-business-id/route.ts`** — (기존에 파악됨) POST가 `facility_tasks` 대량 UPDATE.
- **`app/api/announcements/route.ts`** (POST) — 인증 전무(주석은 "Level3+ 필요"라 되어있으나 코드 미검증). `author_id/author_name`을 요청 바디 그대로 신뢰 → 전사 공지 위조 가능.
- **`app/api/calendar/route.ts`** (POST) + **`app/api/calendar/[id]/route.ts`** (PUT/DELETE) — 인증 전무. 캘린더 일정 조회/쓰기/삭제 가능.
- **`app/api/uploaded-files/route.ts`** (DELETE) — 인증 전무. 바디의 fileId로 Google Drive 파일 삭제 가능.

### 🟠 MEDIUM — 정보 노출, 무인증 + CSRF 면제
- **`app/api/messages/route.ts`** (GET) — 인증 전무. 사내 "전달사항" 전체 조회 가능(주석은 "Level1+"라 되어있으나 미검증).
- **`app/api/test-caption/route.ts`** — 인증 전무, service role 사용. 최근 업로드 파일 메타데이터 노출 + caption 수정.

### ⚠️ Service-role 스키마/파괴 엔드포인트 (CSRF는 걸려있으나 위 double-submit 우회로 사실상 무의미)
`app/api/create-users-table`(POST, users 테이블 DDL+admin 시드), `app/api/setup-database`, `app/api/setup-db`, `app/api/setup-memos-table`, `app/api/fix-schema`, `app/api/migrate-schema`, `app/api/clean-old-permits`(DELETE, 대기필증 대량삭제), `app/api/business-info-update`(POST, business_info 대량 upsert), `app/api/migrations/*` — 전부 인증 없이 service role로 스키마/데이터 조작.

### 기타
- `/api-test` 페이지(`app/api-test/page.tsx`) — AS 접수/단가 API를 호출하는 공개 테스트 UI. `middleware.ts`의 `isAuthExemptRoute`에 등록돼 있음.
- 페이지 레벨: 전체 85개 page.tsx 중 `withAuth` 사용은 11개뿐. 나머지(모든 `/admin/*` 포함)는 미들웨어의 "쿠키 존재 여부"만 확인(서명 검증 아님) — devtools로 `auth_ready` 쿠키만 세팅해도 페이지 셸은 로드됨. 다만 실질 데이터 노출 경로는 페이지가 아니라 위에 나열한 무인증 API들이라, 근본 문제는 API 쪽.

## 아직 미정독 (표본만 확인, 전수조사 아님)
`protectCSRF`에서 "공개 사용" 주석과 함께 명시적으로 면제된 다수(`facility-photos/*`, `upload-supabase`, `upload-metadata`, `business-equipment-counts`, `equipment-field-checks/*`, `facility-management`, `facility-measurement`, `uploaded-files-supabase/*`)는 사업장/시설 도메인 조사에서 이미 다뤘음. `construction-reports`, `meeting-departments` 등 "JWT 인증 사용"이라 주석은 있으나 핸들러를 직접 확인 못 한 라우트도 있어 announcements/messages와 같은 패턴(주석만 있고 실제 검증 없음)일 가능성이 있음 — 재확인 필요.

## 결론

`/business/[사업장명]`은 예외가 아니라 **광범위한 무인증 API 노출의 대표 사례 중 하나**였다. 최우선 대응 후보(사업장/시설 도메인과 별개로): **`invoice-records`, `business-invoices`(재무 데이터, 직접호출 가능)** → **`calendar`/`announcements`/`uploaded-files`(쓰기·파괴, 직접호출 가능)** → **`create-users-table`/`setup-*`/`clean-old-permits`(service role 파괴/스키마)**.

이 문서는 표본 조사이며 전수조사가 아니다. 진행하기로 하면 사업장/시설 도메인과 같은 방식(무위험 확인 → 배치 분할 → 실사용자 세션 검증)으로 별도 계획을 세워야 한다.

## Critical Files
- `middleware.ts` — 구조적 원인(API 미인증 통과, CSRF 이중 목록)
- `lib/security/csrf-protection.ts` — double-submit 우회 가능성
- `app/api/invoice-records/route.ts`, `app/api/business-invoices/route.ts` — 최우선
- `app/api/announcements/route.ts`, `app/api/calendar/route.ts`, `app/api/uploaded-files/route.ts`
