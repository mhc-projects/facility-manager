# 외부 협력업체용 `/business/[businessName]` 페이지 — 현황 및 안전한 설계 제안

2026-07-16 조사. 미착수 — 실행 승인 대상 아님.

## 배경

`app/business/[businessName]/page.tsx` + `BusinessContent.tsx`는 회사 외부 사람(현장 방문 협력업체·설치기사, 로그인 계정 없음)이 현장 사진을 올리고 현장 정보(배출/방지시설, 점검자, 특이사항)를 입력하도록 **의도적으로** 로그인 없이 열어둔 페이지다. `middleware.ts`의 `isAuthExemptRoute()`에 `/business/`가 등록돼 있다(주석은 "카카오톡 링크 미리보기용"이라 돼 있지만 실제 용도는 이 현장 입력 폼이 맞다).

## 이 페이지가 실제로 쓰는 API (정확한 목록)

**조회**: `GET /api/facilities-supabase/{businessName}`, `GET /api/facility-management`, `GET /api/business-photo-categories`, `GET /api/facility-photos`

**업로드**: `POST /api/upload-supabase`(사진), `POST /api/facility-photos/download-zip`

**쓰기(수정)**: `POST /api/facilities-supabase/{businessName}`(배출/방지시설 정보 — **전체 교체 저장**), `PUT /api/air-permits/outlets/{outletId}`, `POST /api/facility-management`, `POST /api/business-photo-categories`

**삭제**: `DELETE /api/facility-photos/{photoId}`, `DELETE /api/business-photo-categories?id=`

**이전에 지적했던 `business-info-direct`/`business-info-update`/`business-unified`/캘린더용 `business/[id]`는 이 페이지가 전혀 쓰지 않는다** — 별개의 소비자용 API였다. 이 페이지의 실제 문제는 위 목록 자체다.

## 문제점 (심각도순)

1. **`POST /api/facilities-supabase/{businessName}`가 인증 없이 파괴적으로 동작** — 사업장명으로 `discharge_facilities`/`prevention_facilities`를 전부 DELETE 후 요청 본문으로 교체한다(route.ts:697-706). 사업장명만 알면 임의로 시설 데이터를 통째로 덮어쓸 수 있다.
2. **`DELETE /api/facility-photos/{photoId}`가 전역 IDOR** — 인증·소유권 검사가 전혀 없고 `photoId`만 받는다. photoId를 알거나 순차적으로 추측하면 **이 페이지가 속한 사업장뿐 아니라 전 사업장의 사진을 삭제**할 수 있다.
3. **URL 자체가 유일한 접근 통제 수단인데, 비밀 토큰이 아니라 사업장명 문자열** — 만료도, 재사용 방지도, 1회성도 없다. 한국어 상호명은 추측·열거 가능하다.
4. **접근 로그 없음** — `/business/`는 `isAuthExemptRoute`라 IP 접근 로깅(`logUserAccess`)을 건너뛴다. 외부인이 언제 어떤 사업장에 접근했는지 기록이 안 남는다.
5. **CSRF도 이 API들 전부 의도적으로 면제**돼 있어 타 사이트 스크립트에서도 호출 가능.
6. 방어선은 사실상 **IP 기준 rate limit뿐**(업로드 20회/시간/IP) — 인증 부재를 보완하지 못한다.

## 이 코드베이스에 이미 있는 재사용 가능한 조각

전용 "사업장 스코프 + 만료 토큰" 패턴은 없지만, 부분적으로 재사용 가능한 게 있다.

- `app/api/approvals/attachments/signed-url/route.ts` — Supabase Storage `createSignedUploadUrl()` 발급 로직 자체는 그대로 재사용 가능(현재는 로그인 사용자 전용으로만 열려 있음).
- `utils/auth.ts`의 `verifyToken`/`verifyTokenString`, `lib/secure-jwt.ts` — JWT 서명/검증 유틸을 그대로 응용해 "사업장 스코프 + 만료" 클레임을 담은 별도 토큰을 만들 수 있다(현재 그런 스코프 토큰은 없음).
- 이메일 발송 1회용 링크/매직링크 인프라는 **없음** (비밀번호 찾기 기능 자체가 비활성화돼 있음).

## 제안: 사업장 스코프 액세스 토큰 방식

로그인을 요구할 수 없는 페이지이므로 "로그인" 대신 **이 사업장 하나에만, 정해진 기간만 유효한 비밀 토큰**으로 접근을 제한하는 방식을 제안한다.

### 설계 개요
1. **신규 테이블** `business_field_access_tokens` (business_id, token(랜덤 32바이트+), expires_at, created_by, is_revoked, created_at, last_used_at). 사내 직원이 "현장방문 링크 생성" 액션(사업장관리 상세 화면에 버튼 추가)으로 발급 — 예: 유효기간 7일 또는 방문 예정일까지.
2. **URL 변경**: `/business/{businessName}` → `/business/{businessName}?token={token}` (또는 아예 `/field-visit/{token}` 형태로 사업장명 노출도 줄이는 안). BusinessContent.tsx 진입 시 토큰을 서버에 검증 요청.
3. **서버 검증 헬퍼 신규**: `lib/auth/require-business-token.ts` — 토큰으로 `business_field_access_tokens`를 조회해 `is_revoked=false AND expires_at > now()`인지 확인하고, 매칭되는 `business_id`를 반환. 이 페이지가 쓰는 6개 쓰기/삭제 API(`facilities-supabase` POST, `air-permits/outlets` PUT, `facility-management` POST, `business-photo-categories` POST/DELETE, `facility-photos` POST/DELETE, `upload-supabase` POST) 전부에 이 헬퍼로 검증을 추가하고, **요청 대상 리소스의 business_id가 토큰의 business_id와 일치하는지도 반드시 재확인**한다 — 이게 현재의 전역 IDOR(특히 `facility-photos` DELETE)를 근본적으로 막는 지점이다.
4. **로그인 사용자는 토큰 없이도 그대로 통과**하도록, 헬퍼를 "토큰 검증 OR 직원 로그인(`requireAuth`)" 방식으로 구성 — 내부 직원도 같은 페이지/API를 문제없이 계속 쓸 수 있게.
5. **접근 로깅 추가**: 토큰 사용 시 `last_used_at` 갱신 + IP 기록으로 최소한의 감사 추적 확보.
6. **레이트리밋 강화**: 토큰 단위로도 rate limit(예: 토큰당 시간당 N회)을 추가해 IP 로테이션 우회를 어렵게 함.

### 왜 이 방식인가
- 외부인 로그인 계정을 새로 만들 필요가 없다(운영 부담 최소화).
- 기존 Storage 업로드 로직(`createSignedUploadUrl` 패턴)을 그대로 재사용 가능.
- "사업장명 추측"이 아니라 "토큰 소유"가 접근 조건이 되므로 IDOR과 스캐닝 위험이 사실상 사라진다.
- 발급/회수를 사내 직원이 통제하므로 방문이 끝난 뒤 토큰을 만료/폐기하면 그 시점부터 접근이 완전히 차단된다.

### 단계적으로 할 수 있는 최소 조치 (전체 토큰 시스템 전에)
급하게 위험만 줄이려면, 토큰 인프라 구축 전에 아래만 먼저 해도 가장 심각한 항목(전역 IDOR)은 줄어든다.
- `DELETE /api/facility-photos/{photoId}`에 최소한 "요청에 함께 온 businessName과 그 photoId가 실제로 속한 사업장이 일치하는지" 정도의 검증만 추가 — 전역 삭제를 사업장 단위로는 좁힘(다만 사업장명 자체가 비밀이 아니므로 근본 해결은 아님).
- `POST /api/facilities-supabase/{businessName}`도 최소한 "완전 교체" 대신 부분 업데이트로 바꾸면 파괴 반경이 줄어듦(별도 검토 필요).

이건 임시방편이고, 근본 해결은 위 토큰 설계다.

## Critical Files
- `app/business/[businessName]/BusinessContent.tsx`, `page.tsx`
- `app/api/facilities-supabase/[businessName]/route.ts` — 가장 파괴적, 최우선
- `app/api/facility-photos/[photoId]/route.ts` — 전역 IDOR, 최우선
- `app/api/approvals/attachments/signed-url/route.ts` — signed URL 재사용 참고
- `utils/auth.ts`, `lib/secure-jwt.ts` — 토큰 서명/검증 유틸 참고
