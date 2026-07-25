# Facility Manager 전수 감사 체크리스트 (2026-07-25)

20개 기능 도메인 × loop-until-dry(최대 3라운드) 병렬 탐색 → 도메인별 적대적 재검증 → 교차 도메인 디자인/모듈 일관성 분석 → 우선순위 통합으로 생성.

- 탐색 대상 도메인: 20개
- 최초 발견 버그(라운드 통합, 중복제거): 330건
- 적대적 재검증 후 확정된 버그: 302건 (28건은 재검증 과정에서 반박/기각됨)
- 교차 도메인 디자인/모듈 선택 불일치: 17건
- **총 항목: 319건**

상세 원문(전체 description/evidence 포함)은 같은 폴더의 `full-findings.json` 참고.

## 우선순위별 개수

| 우선순위 | 버그 | 디자인 | 모듈선택 | 합계 |
|---|---|---|---|---|
| 🔴 Critical | 40 | 0 | 0 | 40 |
| 🟠 High | 84 | 0 | 5 | 89 |
| 🟡 Medium | 125 | 1 | 5 | 131 |
| 🟢 Low | 53 | 2 | 4 | 59 |

> ⚠️ 이번 감사 도중, 이 목록과 별개로 **실제 보안 사고**(프로덕션 DB 비밀번호가 public GitHub 저장소에 6개월+ 노출)를 발견해 커밋 `613e46f`로 즉시 조치했습니다. 자세한 내용은 `context-notes.md` 참고. DB 비밀번호 로테이션은 아직 사용자가 직접 실행해야 하는 상태입니다.

## 🔴 Critical (40건)

- [ ] **BUG-053** [버그 / 수정위험도:낮음] PUT /api/order-management/[businessId] crashes on every authenticated save (block-scoped `params` shadows the destructured route param, TDZ ReferenceError caught as 500)
  - 위치: `app/api/order-management/[businessId]/route.ts:219-227, 250`
  - The original claim's mechanism (module-level SyntaxError making the file unparseable) is FALSE and is refuted: I hit the live dev server's GET and PUT endpoints and both compiled fine ('✓ Compiled /api/order-management/[businessId] in 249ms (211 modules)') and returned normal…
  - 권장 조치: Rename the local `const params: any[] = []` at route.ts L250 (and its later references) to e.g. `queryValues`, since it currently shadows the destructured route parameter `{ params }` used at L227 and, due to const/TDZ hoisting, throws a ReferenceError on every single authenticated PUT request — this is the single highest-priority fix in the list.

- [ ] **BUG-098** [버그 / 수정위험도:낮음] 영업비마감 지급명세 조회 API의 month 파라미터가 SQL 문자열에 그대로 삽입되어 SQL 인젝션 가능
  - 위치: `app/api/commission-closing/summary/route.ts:27-51`
  - monthClause를 `AND cp.payment_month = '${month}'` 형태로 이스케이프 없이 문자열 템플릿에 직접 삽입한 뒤 queryAll(sql)을 params 배열 없이 호출한다(29-51행). lib/supabase-direct.ts의 query()는 pool.query(text, params)를 그대로 호출하는데(62행) params가 undefined면 node-postgres가 simple query protocol을 사용해 세미콜론으로 구분된 다중…
  - 권장 조치: Parameterize the month filter as `AND cp.payment_month = $1` and pass `[month]` through queryAll's params argument instead of interpolating month directly into the SQL string; treat this as top priority given the security severity even though the code change itself is small.

- [ ] **BUG-104** [버그 / 수정위험도:낮음] /api/meeting-departments has zero authentication and is also CSRF-exempt
  - 위치: `app/api/meeting-departments/route.ts:19-99`
  - GET/POST/DELETE never call getUserFromToken or any auth check (no jwt import even present in this file), unlike every sibling meeting-* route which all implement the same getUserFromToken() + 401 pattern. lib/security/csrf-protection.ts explicitly lists…
  - 권장 조치: Add the same getUserFromToken()+401 check used by every sibling meeting-* route to GET/POST/DELETE in meeting-departments/route.ts; existing callers already run same-origin with the session cookie so no frontend change is needed.

- [ ] **BUG-209** [버그 / 수정위험도:낮음] Reflected XSS in Google OAuth callback popup page via unescaped query params
  - 위치: `app/api/auth/social/google/callback/route.ts:41-42`
  - code/error query params are interpolated unescaped into a JS string literal inside an inline <script> (`const code = "${code}";`). A URL like ?code=x";alert(document.cookie);// breaks out of the string literal and executes arbitrary JS on the app's own origin. Critically, this…
  - 권장 조치: Replace the raw `"${code}"` / `"${error}"` interpolation in the inline <script> with `JSON.stringify(code)` / `JSON.stringify(error)` so query values can't break out of the string literal; single-file, mechanical templating fix.

- [ ] **BUG-210** [버그 / 수정위험도:낮음] Reflected XSS in Naver OAuth callback popup page via unescaped query params
  - 위치: `app/api/auth/social/naver/callback/route.ts:42-44`
  - Identical pattern to the Google callback: code/state/error are interpolated unescaped into an inline <script> string literal (`const code = "${code}";` etc.). Same exploit: a crafted URL breaks out of the string and runs arbitrary JS on the app origin for any visitor,…
  - 권장 조치: Apply the same JSON.stringify() escaping to the code/state/error values embedded in the Naver callback's inline script; identical mechanical fix to the Google callback.

- [ ] **BUG-221** [버그 / 수정위험도:낮음] /api/data-history GET and POST have no authentication check at all
  - 위치: `app/api/data-history/route.ts:11-85`
  - GET and POST handlers never read any Authorization header or cookie. GET returns full change history (old_data/new_data) for business_info, contract_history, etc. to any unauthenticated caller. POST { historyId, reason } calls DatabaseService.restoreFromHistory() to roll back…
  - 권장 조치: Mirror access-logs/route.ts: read the Bearer/session_token cookie and call verifyToken() at the top of both GET and POST before touching DatabaseService.

- [ ] **BUG-264** [버그 / 수정위험도:낮음] commission-closing summary API — month 쿼리 파라미터 SQL 인젝션
  - 위치: `app/api/commission-closing/summary/route.ts:27-51`
  - month URL 파라미터를 이스케이프 없이 문자열 템플릿으로 SQL에 직접 삽입한 뒤(`AND cp.payment_month = '${month}'`) queryAll()로 실행한다. lib/supabase-direct.ts의 query()는 text를 그대로 pg Pool.query(text, params)에 전달하는 원시 실행 함수이므로 이스케이프 처리가 없다. 같은 폴더의 export/route.ts는 동일 패턴에 `.replace(/'/g, '')`로 작은따옴표 제거 방어를 하지만…
  - 권장 조치: Pass `month` as a bound parameter (e.g. `$1`) through queryAll's params array instead of string-interpolating it into the SQL text, mirroring a proper parameterized query rather than export/route.ts's incomplete quote-stripping workaround.

- [ ] **BUG-277** [버그 / 수정위험도:낮음] 견적서 DELETE API에 인증/권한 검증이 전혀 없음
  - 위치: `app/api/estimates/[id]/route.ts:10-43`
  - 주석은 '권한 4 이상 필요'라고 명시하지만 DELETE 핸들러 본문(11-43행)에는 토큰 파싱, verifyTokenHybrid 호출, permissionLevel 비교 등 어떤 인증 코드도 없다. middleware.ts는 /api/ 경로에 대해 rate limit과 CSRF 검증만 수행하고(protectAPIRoute, 137-231행), 실제 서명 검증은 '페이지/API에서 수행됨'이라고 스스로 명시한다(286행 주석). CSRF 토큰은 인증 없이 GET /api/csrf-token으로…
  - 권장 조치: Add the standard Bearer-token + token-verify + permissionLevel>=4 check (matching the route's own 'Level 4+' comment) to the DELETE handler, mirroring the auth pattern already used in app/api/installation-closing/transfers/route.ts.

- [ ] **BUG-039** [버그 / 수정위험도:중간] 삭제한 사용자재가 DB에서 실제로 삭제되지 않음
  - 위치: `app/admin/as-management/components/AsRecordModal.tsx:278-280, 417-448`
  - removeMaterial()은 setMaterials(prev => prev.filter(...))로 로컬 state만 갱신하고 DELETE 요청을 전혀 보내지 않는다. handleSave()의 저장 루프는 현재 materials 배열만 순회하며 신규 항목(POST)과 기존 항목(PATCH)만 처리하고, 로드 시점엔 있었지만 배열에서 제거된 항목에 대한 DELETE 호출이 없다. (evidence: AsRecordModal.tsx:278-280 removeMaterial()이 filter로…
  - 권장 조치: Track the set of material IDs present when the record was loaded, and in handleSave()'s material loop, call DELETE /api/as-materials/[id] (endpoint already exists) for any of those IDs no longer present in the current materials array.

- [ ] **BUG-040** [버그 / 수정위험도:중간] 단가표 삭제 시 AS건의 출동단가 참조를 확인하지 않아 하드 삭제로 과거 매출 데이터가 소급 손실됨
  - 위치: `app/api/as-price-list/[id]/route.ts:84-114`
  - DELETE 핸들러의 usageCheck는 as_material_usage.price_list_id만 확인하고 as_records.dispatch_cost_price_id/dispatch_revenue_price_id는 조회하지 않는다. 신규 AS건은 등록 시 첫 번째 출동 단가표 항목을 자동 선택하므로 대다수 AS건이 이를 참조한다. 관리자가 해당 단가표 항목을 삭제하면 usageCount=0으로 판정되어 실제 DELETE가 실행되고, FK의 ON DELETE SET NULL로 인해 과거…
  - 권장 조치: Extend the usageCheck in as-price-list/[id]/route.ts's DELETE handler to also COUNT as_records referencing the price entry via dispatch_cost_price_id/dispatch_revenue_price_id, and block hard-delete (offering a deactivate/hide-from-list flag instead) when any reference exists.

- [ ] **BUG-054** [버그 / 수정위험도:중간] Clicking '발주 완료' without first successfully saving permanently loses the user's entered step dates - and Save is currently 100% broken too (see TDZ bug above), so there is presently no way to persist step dates at all
  - 위치: `app/admin/order-management/components/OrderDetailModal.tsx:284-336`
  - handleComplete() (lines 284-336) validates 'no missing steps' purely against the local React state `stepDates` (lines 288-291), then calls only POST /api/order-management/[businessId]/complete (lines 309-316) - it never calls PUT to persist stepDates. I confirmed by reading…
  - 권장 조치: In handleComplete() (OrderDetailModal.tsx L284-336), issue the same PUT save request used by handleSave and confirm it succeeds before calling POST .../complete, so entered step dates are guaranteed to be persisted before the record is marked completed and its date inputs become permanently disabled — this must land together with the item 12 fix since PUT is currently non-functional.

- [ ] **BUG-067** [버그 / 수정위험도:중간] 문서 이력 삭제 API에 인증/권한 검증이 전혀 없음 (인증 우회로 임의 문서·계약서 삭제 가능)
  - 위치: `app/api/document-automation/history/[id]/route.ts:11-83`
  - DELETE 핸들러는 Authorization 헤더나 쿠키를 전혀 읽지 않고 verifyTokenString 등 어떤 인증 함수도 호출하지 않은 채 supabaseAdmin(SERVICE_ROLE_KEY)으로 곧바로 document_history를 조회·삭제하며, document_type이 'contract'이면 contract_history까지 연쇄 삭제한다. 같은 파일 계열의 app/api/document-automation/contract/route.ts DELETE 핸들러(라인…
  - 권장 조치: Add the same Bearer-token verifyTokenString + permissionLevel check used in app/api/document-automation/contract/route.ts's DELETE handler (line 537, permissionLevel>=4) to this history DELETE route — both existing frontend callers (ContractManagement.tsx L417-421, page.tsx L224-229) already send an Authorization header, so this can be wired in without a frontend change, but confirm the intended permission threshold for non-contract document types before deploying.

- [ ] **BUG-079** [버그 / 수정위험도:중간] POST /api/subsidy-crawler/manual has no authentication and is CSRF-exempt
  - 위치: `app/api/subsidy-crawler/manual/route.ts:28-118`
  - The POST handler only checks that process.env.GITHUB_TOKEN is configured (line 32-43); it never validates a caller identity, bearer token, or session anywhere in the function. middleware.ts's isCSRFExemptAPI (line 118) whitelists the '/api/subsidy-crawler' prefix, which this…
  - 권장 조치: Require the same Bearer CRAWLER_SECRET check already used in app/api/subsidy-crawler/route.ts (line 510-511) in this manual/route.ts POST handler, remove '/api/subsidy-crawler' from middleware's CSRF-exempt prefix list (or scope the exemption more narrowly), and update the one caller in monitoring-dashboard/page.tsx (line 208-215) to send the required credential/token — this triggers real paid GitHub Actions runs so validate end-to-end before deploying.

- [ ] **BUG-103** [버그 / 수정위험도:중간] PATCH /api/meeting-minutes/[id]/sections has no participant/organizer access check
  - 위치: `app/api/meeting-minutes/[id]/sections/route.ts:58-333`
  - The PATCH handler calls only getUserFromToken() (line 63) to confirm authentication, then fetches the meeting_minutes row (77-81) and mutates it (316-321) with no call to canAccessMeetingMinute/isFullAccessUser anywhere in the file (confirmed: no import of…
  - 권장 조치: Import canAccessMeetingMinute/isFullAccessUser (as [id]/route.ts already does) into sections/route.ts and reject the PATCH with 403 before any section-mutation branch runs if the caller isn't organizer/creator/participant/full-access.

- [ ] **BUG-122** [버그 / 수정위험도:중간] GET/POST /api/weekly-reports has no authentication check at all
  - 위치: `app/api/weekly-reports/route.ts:83-95, 394-403`
  - GET (line 83) reads userId straight from searchParams and POST (line 394) reads userId straight from request.json() — neither ever reads an Authorization header, a cookie token, nor calls verifyToken. withApiHandler (lib/api-utils.ts:79-90) declares an unused `requiresAuth`…
  - 권장 조치: Add the same verifyToken(Authorization header or auth_token cookie) check used in app/api/weekly-reports/admin/route.ts and realtime/route.ts to both GET and POST handlers, returning 401 on failure; the only live caller (app/admin/weekly-reports/[userId]/page.tsx) already sends a Bearer token so this should be a drop-in fix, but scan for any other untracked callers (cron/internal scripts) before deploying.

- [ ] **BUG-150** [버그 / 수정위험도:중간] Stored XSS via unauthenticated wiki node content modification (+ JWT theft path)
  - 위치: `app/api/wiki/nodes/[id]/route.ts:30-55`
  - PATCH /api/wiki/nodes/[id] has zero authentication/authorization check. It reads the body, loops over allowedFields = ['title','content_md','tags','is_published','sort_order','metadata'] and writes whatever the caller sends directly to…
  - 권장 조치: Add the same JWT + permission_level>=4 check used in app/api/wiki/guideline-uploads/[id]/route.ts to the PATCH handler (no current frontend caller relies on it being open, so this is safe to add), and separately HTML-escape content_md's `<`, `>`, `&` in WikiContent.tsx before applying the markdown regex replacements, since that component renders on every wiki page.

- [ ] **BUG-198** [버그 / 수정위험도:중간] /api/users/employees has zero authentication on GET/POST/PUT
  - 위치: `app/api/users/employees/route.ts:25, 142, 220`
  - GET/POST/PUT are only wrapped in withApiHandler(handler,{logLevel:'debug'}); withApiHandler's body (lib/api-utils.ts:79-125) never reads options.requiresAuth or checks any token. middleware.ts's protectAPIRoute (lines 142-217) only does rate-limiting, request-size checks, and…
  - 권장 조치: Wire the existing requireAuth() helper from lib/auth/require-auth.ts into GET (minLevel=1, matching the pattern already used elsewhere) and a higher minLevel into POST/PUT of app/api/users/employees/route.ts before it touches is_active/permission_level, then smoke-test AdminManagerPicker, MultiAssigneeSelector, and the meeting-minutes create/edit pages since they call this route via same-origin cookie auth with no explicit Authorization header.

- [ ] **BUG-199** [버그 / 수정위험도:중간] change-password allows changing password with no proof of the old one
  - 위치: `app/api/auth/change-password/route.ts:87-96`
  - currentPassword is checked only 'if (currentPassword && existingUser.password_hash)' -- omitting currentPassword in the request body skips verification entirely, so any request bearing a valid JWT (however obtained) can silently change the account's password with only…
  - 권장 조치: This needs a coordinated frontend+backend change: add a '현재 비밀번호' input to app/profile/page.tsx's password form (it currently sends only {newPassword}, confirmed at L252) and include it in the request, then make change-password/route.ts L87-96 require currentPassword whenever existingUser.password_hash is non-null, leaving the null-hash path (app/set-password/page.tsx) unaffected.

- [ ] **BUG-219** [버그 / 수정위험도:중간] checkUserPermission() in organization members API is a fake auth stub — any non-empty Bearer token grants full admin
  - 위치: `app/api/organization/members/route.ts:9-23`
  - checkUserPermission() only checks that the Authorization header starts with 'Bearer ' and unconditionally returns { authorized: true, user: { id: 'admin-user', permission_level: 3, name: '관리자' } } with no token verification. The middleware (middleware.ts protectAPIRoute) only…
  - 권장 조치: Replace checkUserPermission()'s hardcoded admin object with a real verifyTokenHybrid(token) call, copying the pattern already used correctly in the sibling app/api/organization/departments/route.ts and teams/route.ts files; single file but gates live position_level/member-mutation endpoints so verify the frontend already sends real Bearer tokens before deploying.

- [ ] **BUG-220** [버그 / 수정위험도:중간] /api/organization/members and /api/organization/task-assignments allow full org mutation with a forged Bearer header
  - 위치: `app/api/organization/task-assignments/route.ts:11-25`
  - Because checkUserPermission() (identical stub, duplicated in this file) never validates the token, a forged `Authorization: Bearer x` header is treated as permission_level 3 admin. POST /api/organization/members with action='promote' directly updates employees.position_level…
  - 권장 조치: Apply the identical verifyTokenHybrid(token) fix to task-assignments/route.ts's checkUserPermission(), ideally extracting one shared helper used by both this file and members/route.ts to prevent the same stub from drifting back in later.

- [ ] **BUG-258** [버그 / 수정위험도:중간] verifyAuth() stub from lib/auth.ts makes /api/tasks/[id]/comments effectively unauthenticated and crashes POST
  - 위치: `app/api/tasks/[id]/comments/route.ts:3, 16, 62, 122`
  - Route imports verifyAuth from @/lib/auth (a 9-line stub: `export function verifyAuth() { return true }`) instead of @/lib/auth/middleware used by sibling routes app/api/tasks/route.ts and app/api/tasks/[id]/route.ts. `const { user, error: authError } = await verifyAuth() as any`…
  - 권장 조치: Switch the import in app/api/tasks/[id]/comments/route.ts from the stub in @/lib/auth to verifyAuth(request) in @/lib/auth/middleware, matching the sibling routes app/api/tasks/route.ts and app/api/tasks/[id]/route.ts, and verify GET/POST both use the returned AuthResult correctly.

- [ ] **BUG-278** [버그 / 수정위험도:중간] 캘린더 이벤트 CRUD API 전체(PUT/DELETE/POST)에 인증/권한 검증이 없음
  - 위치: `app/api/calendar/[id]/route.ts:53-249`
  - PUT(53-186행)과 DELETE(194-249행) 핸들러 모두 요청자의 토큰을 검증하지 않는다. 같은 도메인의 app/api/calendar/route.ts POST(109-236행)도 author_id/author_name을 body에서 그대로 신뢰하며 인증 검증이 없다. 주석(51행 'Level 1+ 수정 가능', 107행 'Level 1+ 쓰기 가능')만 있을 뿐 실제 레벨 체크 코드는 없다. estimates DELETE와 동일하게 middleware는 CSRF/rate-limit만…
  - 권장 조치: Add the Bearer-token + permissionLevel check to PUT/DELETE in calendar/[id]/route.ts and POST in calendar/route.ts, and also add the Authorization header to the corresponding fetch calls in CalendarModal.tsx/CalendarBoard.tsx (they currently send no token at all) — server-only enforcement without the client change will break calendar writes for every user.

- [ ] **BUG-279** [버그 / 수정위험도:중간] 계산서 발행 레코드(재무 데이터) CRUD API에 인증이 전혀 없음
  - 위치: `app/api/invoice-records/route.ts:26-353`
  - POST(26-179행)/PUT(185-305행)/DELETE(311-353행) 모두 토큰 검증 코드가 없다. 특히 middleware.ts의 isCSRFExemptAPI 목록에 '/api/invoice-records'가 '쿠키 인증'이라는 주석과 함께 CSRF 예외로 등록되어 있는데(middleware.ts:120행), 실제로는 CSRF 검증도 건너뛰고 쿠키 기반 인증 로직도 라우트 코드에 전혀 구현되어 있지 않다. 이는 다른 CSRF-exempt 라우트들(delivery-addresses…
  - 권장 조치: Implement real auth (Bearer token + permissionLevel check matching sibling revenue-closing routes) on invoice-records POST/PUT/DELETE and add the Authorization header in the 5 consuming components (InvoiceRecordForm, InvoiceRevisionForm, ExtraInvoiceForm, ExtraInvoiceList, InvoiceTabSection), which currently call fetch() with no auth header at all — then correct or remove the stale '쿠키 인증' comment in middleware.ts's CSRF-exempt list.

- [ ] **BUG-001** [버그 / 수정위험도:높음] 대부분의 시설(facility) API 라우트에 인증 검사가 없어 미인증 접근으로 데이터 조회/변조 가능
  - 위치: `app/api/facility-management/route.ts, app/api/facility-measurement/route.ts, app/api/facility-detail/route.ts, app/api/facility-stats/route.ts, app/api/facility-photos/route.ts, app/api/facility-photos/[photoId]/route.ts, app/api/facility-photos/download-zip/route.ts, app/api/outlet-facility/route.ts, app/api/outlet-gateway/route.ts, app/api/gateway-devices/route.ts, app/api/measurement-devices/route.ts, app/api/equipment-field-checks/route.ts, app/api/equipment-field-checks/sync/[checkId]/route.ts, app/api/facilities-supabase/[businessName]/route.ts, app/api/facility-tasks/advance/route.ts, app/api/facility-tasks/[id]/history/route.ts:whole-file GET/POST/PUT/DELETE handlers`
  - middleware.ts:326-343 confirms API routes only get CSRF+rate-limit checks and explicitly skip checkPageAuthentication (the comment literally says '페이지 인증 체크 건너뛰기'). I opened every listed route file and none of them call any session/JWT verification helper (contrast with…
  - 권장 조치: Apply the existing checkUserPermission/verifyTokenHybrid helper (already used in app/api/facility-tasks/route.ts and app/api/router-inventory/*) to all 16 routes one file at a time, verifying first whether any (e.g. equipment-field-checks, called from field devices) need a service token issued rather than a browser session before enforcing 401.

- [ ] **BUG-011** [버그 / 수정위험도:높음] Primary air-permit CRUD API has zero authentication/authorization
  - 위치: `app/api/air-permit/route.ts:33-781`
  - GET/POST/PUT/DELETE go straight from request.json()/searchParams to raw SQL via lib/supabase-direct with no identity check anywhere in the file. (evidence: Read the entire file: only imports `queryOne, queryAll, query` from '@/lib/supabase-direct' (line 3) — no…
  - 권장 조치: Add the same checkUserPermission/verifyTokenHybrid guard already used in app/api/air-permit/update/route.ts to every handler in this file, verify the admin UI and EstimatePreviewModal already send auth_token, then correct the false '/api/air-permit ... JWT 인증 사용' comment in csrf-protection.ts's excludePaths.

- [ ] **BUG-012** [버그 / 수정위험도:높음] Legacy air-permits (plural) [id] API is unauthenticated and exposes an irreversible hard-delete
  - 위치: `app/api/air-permits/[id]/route.ts:12-254`
  - GET/PUT/DELETE perform no auth check; DELETE with ?hard=true issues a genuine hard delete on air_permit_info with no identity check and no undo path. (evidence: Read the full file: no auth check appears anywhere in GET(12-117), PUT(120-201), or DELETE(204-254). DELETE reads…
  - 권장 조치: Add auth requiring an elevated permission level specifically for the `hard=true` DELETE branch, and first check whether this legacy plural 'air-permits/[id]' route is still called anywhere — if not, delete the route instead of patching it.

- [ ] **BUG-090** [버그 / 수정위험도:높음] 본마감 자동 트리거가 예측마감 기지급액을 차감하지 않고 확정액 전액(final) + 차액(adjustment)을 이중 생성함
  - 위치: `app/api/installation-closing/final/auto-trigger/route.ts:92-136`
  - calculateFinalDiff()가 반환하는 diff_details[].final_amount는 finalBreakdown의 절대값(lib/installation-closing.ts 119-141행)인데, auto-trigger는 이를 그대로 payment_type='final' actual_amount로 INSERT하면서(93-112행) 동시에 동일 항목의 diff(=final-forecast)도 payment_type='adjustment'로 별도 INSERT한다(114-136행).…
  - 권장 조치: Redesign the auto-trigger insert logic so it records only the diff amount per category (not final_amount plus diff again) — e.g. drop the separate 'final' full-amount insert loop and keep only the diff-based 'adjustment' insert, which already equals the full amount when no forecast was paid — then write a one-off script to identify and correct/cancel already-duplicated pending records created by the current code.

- [ ] **BUG-096** [버그 / 수정위험도:높음] 영업비마감 결재 상신 실패가 무시되어 commission_payments가 pending_approval에 영구 고착됨
  - 위치: `app/api/commission-closing/approval/route.ts:116-174`
  - 트랜잭션(116-153행)에서 approval_documents(draft)와 commission_payments(pending_approval)를 이미 커밋한 뒤 /api/approvals/[id]/submit을 호출하고(156-163행), submitData.success 값과 무관하게 항상 success:true와 고정 성공 메시지를 반환한다(166-174행). submit 라우트는 요청자 role 기준 필수 결재자가 비어있으면 400을…
  - 권장 조치: Check submitData.success after the /submit call and, on failure, run a compensating update reverting commission_payments back to 'eligible' and marking/deleting the draft approval_documents row instead of unconditionally returning success:true; also add a cleanup pass for any records currently stuck in pending_approval from this bug.

- [ ] **BUG-097** [버그 / 수정위험도:높음] 설치비마감 결재 상신 실패도 동일하게 무시되어 installation_payments가 pending에 고착됨
  - 위치: `app/api/installation-closing/approval/route.ts:71-144`
  - commission-closing/approval과 동일 패턴. 트랜잭션(71-121행)에서 approval_documents(draft)와 installation_payments(status='pending')를 이미 커밋한 뒤 submit을 호출하고(124-131행), submitData.success와 무관하게 항상 success:true를 반환한다(134-144행). 프런트엔드(installation-closing/page.tsx 356-403행)도 data.success만 확인한다.…
  - 권장 조치: Apply the same fix as item 15 to installation-closing/approval/route.ts (check submitData.success, revert installation_payments to prior status on failure) since both routes share the identical broken pattern.

- [ ] **BUG-105** [버그 / 수정위험도:높음] Stored XSS via unsanitized rich-text agenda description rendered with dangerouslySetInnerHTML
  - 위치: `app/admin/meeting-minutes/[id]/page.tsx:341-356`
  - Agenda item description (rich HTML persisted via PATCH /api/meeting-minutes/[id]/sections, 'agenda'/'agenda-add'/bulk cases) is rendered via dangerouslySetInnerHTML after only being passed through sanitizeLegacyEscapedHtml() (lib/rich-text.ts, lines 57-88). I read that function…
  - 권장 조치: Introduce an allowlist-based HTML sanitizer (e.g. isomorphic-dompurify) applied server-side when agenda descriptions are persisted via sections/route.ts and defensively again before both dangerouslySetInnerHTML call sites ([id]/page.tsx and PresentationMode.tsx), choosing the allowed tag/attribute set carefully to avoid breaking existing rich-text formatting.

- [ ] **BUG-138** [버그 / 수정위험도:높음] DPF API 라우트 전체에 인증/인가가 없어 PII 무인증 조회 및 무인증 CRUD 가능
  - 위치: `app/api/dpf/search/route.ts (외 app/api/dpf/** 전체):search/route.ts 1-58; middleware.ts 326-343; lib/security/csrf-protection.ts 172`
  - app/api/dpf 아래 모든 route.ts는 supabaseAdmin(서비스 키)만 사용하고 session_token/JWT 검증 코드가 전혀 없다(grep 결과 session_token/jwt/verifyToken/requireAuth/Authorization 매칭 0건). middleware.ts 327-343행을 직접 확인한 결과, API 경로는 protectAPIRoute()(rate-limit·요청크기·CSRF만 검사)를 통과하면 340행에서 즉시…
  - 권장 조치: Add the same verifyToken(Authorization/auth_token cookie) check used elsewhere in the app to all 13 app/api/dpf/**/route.ts handlers (ideally via a shared middleware/wrapper to avoid repeating it 13 times), remove the false 'JWT 인증 사용' CSRF exclusion comment and correct the exclusion to only apply once auth is actually enforced, and add authorization checks for the write endpoints (PUT/DELETE) since this exposes PII with zero current gating.

- [ ] **BUG-167** [버그 / 수정위험도:높음] PUT/DELETE /api/notifications have zero authentication — any caller can mark-read or delete any user's notifications
  - 위치: `app/api/notifications/route.ts:675-725 (PUT), 728-822 (DELETE)`
  - Neither the PUT handler (line 675) nor the DELETE handler (line 728) calls getUserFromToken() or checks any Authorization header — they trust `user_id`/`userId` taken straight from the request body/query string and run `.eq('user_id', user_id)` updates/deletes with the…
  - 권장 조치: Add getUserFromToken() to both PUT and DELETE, derive the acting user's id from the verified JWT instead of trusting body/query user_id (or at minimum assert the supplied user_id === token user's id before running the update/delete), and update BusinessProgressSection.tsx and TierNotificationContext.tsx to send an Authorization header — coordinate the backend and both frontend call sites together since this endpoint is actively used by real users.

- [ ] **BUG-202** [버그 / 수정위험도:높음] lib/secure-jwt.ts permanently trusts a hardcoded, source-visible JWT secret with no time-based cutoff
  - 위치: `lib/secure-jwt.ts:7, 76-92, 225-239`
  - OLD_JWT_SECRET = 'your-secret-key-change-this-in-production' is a literal in the repo. verifyTokenHybrid() and the synchronous verifyToken() both fall back to jwt.verify(token, OLD_JWT_SECRET) if the current-secret check fails, unconditionally. MIGRATION_PERIOD_DAYS=7 is…
  - 권장 조치: Use the already-declared MIGRATION_PERIOD_DAYS to reject OLD_JWT_SECRET-signed tokens once the window has elapsed (or force a one-time global re-login), then drop the OLD_JWT_SECRET fallback entirely, and roll this out as a coordinated release since verifyTokenHybrid/getUserFromToken gate most of the app's authenticated API surface.

- [ ] **BUG-211** [버그 / 수정위험도:높음] set-password lets anyone set a password on any social-only employee account with no ownership proof
  - 위치: `app/api/auth/set-password/route.ts:43-59, 64-76, 132-142`
  - Origin validation passes unconditionally when the Origin header is absent (lines 45-46: `if (!origin) isOriginAllowed = true`), trivially bypassed by curl/fetch without a browser. If the Authorization header is missing or its JWT fails verification, the catch block at line 73-75…
  - 권장 조치: Remove the 'no Origin ⇒ allow' bypass and the JWT-failure fallback that trusts body.email, and require actual proof of account ownership (e.g. a time-limited emailed verification token) before letting a password be set on a social-only account — this needs a product decision on how first-time password-setting should prove identity, not just a validation tweak.

- [ ] **BUG-214** [버그 / 수정위험도:높음] Kakao social login POST approval gate is completely non-functional -- every new email is auto-approved regardless of policy
  - 위치: `app/api/auth/social/kakao/route.ts:132-149, 517-611`
  - getEmailDomainPolicy() returns auto_approve:true as the default for any domain lacking an explicit social_auth_policies row, despite a comment calling it 'the most restrictive default'. Worse, even when an explicit policy has auto_approve:false, the else-branch (517-611) is…
  - 권장 조치: Flip the default policy to auto_approve:false and replace the 'temporary auto-approve' else-branch with the real pending-approval flow (insert into social_auth_approvals, return 202) already implemented correctly in google/route.ts, but roll out only after admins pre-configure policies for domains that currently rely on Kakao auto-login, since flipping the default could otherwise lock out real users mid-flow.

- [ ] **BUG-222** [버그 / 수정위험도:높음] All /api/settings/* mutation endpoints have no auth check — withApiHandler() never enforces its own requiresAuth option
  - 위치: `app/api/settings/progress-categories/migrate/route.ts:10-57`
  - withApiHandler() (lib/api-utils.ts lines 79-122) accepts a `requiresAuth?: boolean` option but the returned handler never reads it — it only measures duration and catches errors. None of manufacturers/route.ts, manufacturers/reorder/route.ts, progress-categories/route.ts,…
  - 권장 조치: Decide the required auth/permission model for /api/settings/* first, then implement enforcement inside withApiHandler's requiresAuth branch and opt in the 8 settings routes one by one, testing each after the change since withApiHandler is shared by 52 route files.

- [ ] **BUG-240** [버그 / 수정위험도:높음] AnnouncementBoard의 userLevel이 하드코딩(3)되어 있고 서버 API도 권한 검증이 전혀 없어 Level 3+ 제한이 완전히 무력화됨
  - 위치: `components/boards/AnnouncementBoard.tsx:36`
  - `const [userLevel, setUserLevel] = useState<number>(3);`로 하드코딩되어 있어 컴포넌트 주석의 'Level 3+ (SUPER_ADMIN) 작성/수정/삭제 가능' 요구사항과 반대로 모든 방문자에게 항상 userLevel>=3이 참이 된다(line 180). handleAnnouncementClick(line 86-90)도 권한 체크 없이 클릭 즉시 modalMode를 'edit'로 설정한다. 게다가 서버측…
  - 권장 조치: Fix both sides together: replace the hardcoded userLevel=3 with a real value from the auth/session context in AnnouncementBoard, and add server-side role/permission checks to the announcements POST/PUT/DELETE handlers so client-side state can't be bypassed.

- [ ] **BUG-246** [버그 / 수정위험도:높음] Production Postgres password hardcoded in git-tracked source file
  - 위치: `lib/supabase-direct.ts:30`
  - getDirectConnection() builds the pg Pool with a literal password string 'chlansgh35855#' instead of reading from an environment variable such as SUPABASE_DB_PASSWORD. This is a direct Postgres superuser-level connection (Transaction Mode pooler, port 6543) that bypasses Supabase…
  - 권장 조치: Rotate the leaked Postgres password immediately, move the new credential to SUPABASE_DB_PASSWORD (already used elsewhere per project memory) read via process.env in lib/supabase-direct.ts, and purge the old literal from git history.

- [ ] **BUG-251** [버그 / 수정위험도:높음] business-info-direct route has zero authentication on GET/POST/PUT/DELETE (full CRUD on business_info)
  - 위치: `app/api/business-info-direct/route.ts:140 (GET), 493 (PUT), 1137 (POST), 1853 (DELETE)`
  - None of the four exported handlers call verifyToken/verifyTokenHybrid, check a session cookie, or check an Authorization header as a gate. Grep across the entire file confirms the only token usage is at lines 1052-1084, where an incoming bearer token is optionally forwarded to a…
  - 권장 조치: Add the same auth gate used elsewhere (verifyTokenHybrid/session check) to all four handlers in business-info-direct/route.ts, remove it from csrf-protection.ts's exclusion list, and regression-test every page that calls this route since it's core to business detail/list views.

- [ ] **BUG-252** [버그 / 수정위험도:높음] business-invoices route has zero authentication and is actively used to read/write live payment data
  - 위치: `app/api/business-invoices/route.ts:15 (GET), 394 (PUT)`
  - Neither the GET handler (line 15) nor the PUT handler (line 394) checks a token, session cookie, or Authorization header anywhere in the file (confirmed by full read -- no auth-related code exists). csrf-protection.ts explicitly excludes '/api/business-invoices' from CSRF checks…
  - 권장 조치: Add auth checks to GET/PUT in business-invoices/route.ts and fix the false csrf-protection.ts exclusion comment; test InvoiceDisplay, InvoiceFormInput, InvoiceTabSection, admin/business, admin/revenue, and admin/tasks pages since all six actively call this route.

## 🟠 High (89건)

- [ ] **BUG-016** [버그 / 수정위험도:낮음] Facility/outlet delete-error rollback fetches the wrong shape and corrupts permitDetail state
  - 위치: `app/admin/air-permit-detail/page.tsx:1089, 1129, 285`
  - The rollback fetch after a failed delete omits &details=true, so the API returns an array of all permits instead of one permit object; a later edit calls prev.outlets.map with no guard and throws. (evidence: deleteFacility's catch (line 1089) and deleteOutlet's catch (line 1129)…
  - 권장 조치: Add `&details=true` to the rollback fetch URLs in both deleteFacility's and deleteOutlet's catch blocks (lines 1089 and 1129), and add an optional-chaining guard on `prev.outlets?.map` in handleFacilityEdit as defense-in-depth.

- [ ] **BUG-029** [버그 / 수정위험도:낮음] 결재 상세 페이지 handleSubmit()의 자체 검증 로직이 ceo role을 제외하지 않아 대표이사가 재상신을 못함
  - 위치: `app/admin/approvals/[id]/page.tsx:306-320`
  - handleSubmit()이 lib/approval-line.ts의 getRequiredApprovalSteps()를 쓰지 않고 자체 조건식으로 재구현하는데, `role !== 'ceo'`를 어디에도 포함하지 않는다. 반면 같은 페이지에서 실제 UI 렌더링을 담당하는 ApproverSelector.tsx의 getRequiredSteps()(37-39줄)와 서버측 lib/approval-line.ts의 getRequiredApprovalSteps()(10-12줄)는 모두 `role ===…
  - 권장 조치: Add `&& requesterRole !== 'ceo'` to the needTeamLeader/needExecutive/needVicePresident checks in handleSubmit() (app/admin/approvals/[id]/page.tsx), matching the role exclusion already used in lib/approval-line.ts and ApproverSelector.tsx.

- [ ] **BUG-030** [버그 / 수정위험도:낮음] 신규 문서 작성 페이지 validateApprovers()도 동일하게 ceo role을 제외하지 않아 대표이사가 신규 상신을 못함
  - 위치: `app/admin/approvals/new/page.tsx:214-220`
  - validateApprovers()가 getRequiredApprovalSteps()를 쓰지 않고 role 비교를 직접 나열하며 'ceo'를 제외 목록에서 빠뜨렸다. ApproverSelector가 role==='ceo'일 때 팀장/중역/부사장 select를 숨기므로 해당 ID들은 빈 값으로 남고, validateApprovers()는 이를 필수값으로 요구한다. (evidence: app/admin/approvals/new/page.tsx 216-218줄: `requesterRole !==…
  - 권장 조치: Add the same `role !== 'ceo'` exclusion to validateApprovers() in app/admin/approvals/new/page.tsx so CEO-authored documents don't require a team leader/executive/vice-president selection that the UI never renders.

- [ ] **BUG-042** [버그 / 수정위험도:낮음] AS 등록 모달의 사업장 검색 자동완성이 API 응답 구조 불일치로 전혀 표시되지 않음
  - 위치: `app/admin/as-management/components/AsRecordModal.tsx:182-185, 578-580`
  - GET /api/businesses?search=... 는 createSuccessResponse({businesses, count, search, metadata})로 감싸져 최종 응답이 { success, data: { businesses: [...], ... } } 형태다. searchBusiness()는 setBusinessSuggestions(json2.data || [])로 배열이 아니라 래퍼 객체 전체를 상태에 저장하므로 businessSuggestions.length는…
  - 권장 조치: Change `setBusinessSuggestions(json2.data || [])` to `setBusinessSuggestions(json2.data?.businesses || [])` in AsRecordModal.tsx L184 to match the actual {success,data:{businesses}} shape returned by GET /api/businesses.

- [ ] **BUG-043** [버그 / 수정위험도:낮음] AS건 저장 시 자재 추가/수정 API 응답을 확인하지 않아 실패해도 사용자에게 알리지 않고 모달이 닫힘
  - 위치: `app/admin/as-management/components/AsRecordModal.tsx:417-448`
  - handleSave는 기본정보 저장(PATCH/POST /api/as-records)은 json.success를 확인해 실패 시 alert를 띄우지만, 뒤이은 자재 저장 루프는 await fetch(...) 결과를 변수에 담거나 파싱/검사하지 않는다. price_list_id가 유효하지 않아 POST가 400을 반환하거나 다른 세션에서 이미 삭제된 자재에 대한 PATCH가 404를 반환해도 무시되고 다음 자재로 넘어가며, 결국 onSave가 호출되어 모달이 성공한 것처럼 닫힌다.…
  - 권장 조치: In the materials save loop (AsRecordModal.tsx L417-448), capture and parse each fetch response, collect any entries with !json.success, and if any failed show an alert and skip calling onSave() so the modal stays open for retry instead of silently closing.

- [ ] **BUG-056** [버그 / 수정위험도:낮음] PUT handler doesn't trim business.manufacturer before mapping it, unlike every other read path in this codebase (currently unreachable in practice because the TDZ crash above happens first, but a real, separate defect)
  - 위치: `app/api/order-management/[businessId]/route.ts:297`
  - GET (line 143) does `business.manufacturer?.trim() || ''` before the MANUFACTURER_MAP lookup, and all four branches of app/api/order-management/route.ts (lines 282, 364, 416, 467) do the same trim before their own MANUFACTURER_MAP lookups. The PUT handler instead does…
  - 권장 조치: Add `?.trim() || ''` to `business.manufacturer` at route.ts L297 before the MANUFACTURER_MAP lookup, matching the pattern already used at L143 (GET) and in app/api/order-management/route.ts (L282/364/416/467).

- [ ] **BUG-059** [버그 / 수정위험도:낮음] 발주 목록의 '최종 업데이트' 표시와 정렬이 항상 깨짐 (필드명 불일치: order.updated_at 참조하지만 실제 키는 last_updated)
  - 위치: `app/api/order-management/route.ts:519 (생성부: 268, 313, 374, 426, 477); 530-547 (정렬)`
  - GET 핸들러의 4개 분기 모두 각 order 객체를 `last_updated: ...` 키로 생성한다 (268, 313, 374, 426, 477행에서 직접 확인). 그런데 orderList 매핑 단계(510-527행)에서 line 519가 `last_updated: order.updated_at` 로 읽는데, order 객체에는 updated_at이라는 키가 존재하지 않아 항상 undefined가 된다. node로 직접 검증한 결과 `new…
  - 권장 조치: Change route.ts L519 from `last_updated: order.updated_at` to `last_updated: order.last_updated` to match the field actually set by all four query branches (L268/313/374/426/477), fixing both the displayed date and the '최신순'/'수정순' sort which currently no-ops on NaN comparisons.

- [ ] **BUG-080** [버그 / 수정위험도:낮음] url-health page crashes on load: undefined.toFixed() from missing API field
  - 위치: `app/admin/subsidy/url-health/page.tsx:151`
  - app/api/subsidy-crawler/url-health/route.ts's GET builds `stats` (lines 53-65) with only total_urls, healthy_urls, unhealthy_urls, avg_success_rate, avg_relevance_rate, urls_with_failures, critical_urls — avg_response_time_ms is never included. The page unconditionally renders…
  - 권장 조치: Add avg_response_time_ms to the stats object in url-health/route.ts (average healthMetrics[].avg_response_time_ms, same reduce pattern already used for avg_success_rate at line 57-59), and defensively guard the page.tsx render at line 151 with optional chaining and a fallback (e.g. `data.statistics.avg_response_time_ms?.toFixed(0) ?? '-'`) in case any row's field is null.

- [ ] **BUG-089** [버그 / 수정위험도:낮음] POST /api/subsidy-crawler/runs has no authentication, letting anyone fabricate crawl_runs entries
  - 위치: `app/api/subsidy-crawler/runs/route.ts:106-156`
  - The POST handler reads run_id, trigger_type, github_run_id, total_batches straight from the request body and inserts a row into crawl_runs with status 'running' — there is no Authorization/CRAWLER_SECRET check anywhere in the function, unlike the main crawler's POST in…
  - 권장 조치: Add the same `Authorization: Bearer ${CRAWLER_SECRET}` check used in app/api/subsidy-crawler/route.ts to POST /api/subsidy-crawler/runs and PATCH /api/subsidy-crawler/runs/[runId]; the GitHub Actions callers already send this header (confirmed in subsidy-crawler-direct.yml L56-58), so no caller-side change is needed.

- [ ] **BUG-099** [버그 / 수정위험도:낮음] 설치비 환수(refund) API에 권한 레벨 체크가 없어 최하위 권한자도 지급 취소·차감 처리 가능
  - 위치: `app/api/installation-closing/refund/route.ts:15-33`
  - POST 핸들러는 토큰 유효성만 확인할 뿐(17-25행) permissionLevel 체크가 없다. 같은 디렉토리의 forecast/process, transfers, transfers/[id]/reconcile 라우트는 모두 permissionLevel < 3 체크를 갖고 있는 것과 대비된다. business_id만 있으면 해당 사업장의 paid 상태 예측마감 기록을 전부 cancelled로 바꾸고 차기월 음수 adjustment를 생성한다(49-90행).…
  - 권장 조치: Add the same `permissionLevel < 3` check used in the sibling forecast/process and transfers routes to POST /api/installation-closing/refund before it processes any business_id.

- [ ] **BUG-149** [버그 / 수정위험도:낮음] 서브이력 PUT/DELETE 라우트가 vin과 record id의 소속 차량 일치 여부를 검증하지 않음
  - 위치: `app/api/dpf/vehicles/[vin]/installations/[id]/route.ts (외 inspections/[id], subsidies/[id], calls/[id] 동일):installations/[id]/route.ts 25-32 (PUT), 44-49 (DELETE)`
  - installations/[id], inspections/[id], subsidies/[id], calls/[id]의 PUT/DELETE 핸들러는 모두 .eq('id', params.id)만으로 대상을 특정하고 URL의 params.vin은 전혀 사용하지 않는다(POST 핸들러는 vin으로 차량을 조회해 vehicle.id로 insert를 스코프하지만 PUT/DELETE는 그렇게 하지 않음). 따라서 '/api/dpf/vehicles/{vinA}/installations/{idB}'처럼 vin과…
  - 권장 조치: In each of installations/[id], inspections/[id], subsidies/[id], calls/[id] PUT/DELETE handlers, first resolve the vehicle by params.vin (as the sibling POST handlers already do) and add `.eq('vehicle_id', vehicle.id)` to the update/delete query so a record can't be mutated via a mismatched vin.

- [ ] **BUG-151** [버그 / 수정위험도:낮음] Unpublished/draft wiki nodes are readable via slug lookup, bypassing is_published filter
  - 위치: `app/api/wiki/nodes/route.ts:16-27`
  - The slug-lookup branch (used by /wiki/[slug]) queries wiki_nodes by slug alone with no `.eq('is_published', true)` filter and no auth check, while the tree-listing branch two lines below (line 33) does filter is_published=true, and search/route.ts line 22 also filters it.…
  - 권장 조치: Add `.eq('is_published', true)` to the slug-lookup query in app/api/wiki/nodes/route.ts (mirroring the tree-listing branch two lines below) so unpublished nodes 404 for normal callers; no admin preview flow currently depends on the unfiltered behavior.

- [ ] **BUG-153** [버그 / 수정위험도:낮음] POST /api/wiki/reindex has no auth check despite its own comment claiming 'admin only'
  - 위치: `app/api/wiki/reindex/route.ts:2, 12-73`
  - File header comment says '관리자 전용' (admin only), but the POST handler (lines 12-73) performs no JWT/session/permission check. Any unauthenticated caller can trigger a full-wiki re-embedding pass (maxDuration=300, 1s delay per chunk at line 64) that calls the paid Gemini embedding…
  - 권장 조치: Add the same JWT + permission-level check (reuse the pattern from guideline-uploads/[id]/route.ts) at the top of the POST handler in app/api/wiki/reindex/route.ts before it starts the paid embedding pass.

- [ ] **BUG-154** [버그 / 수정위험도:낮음] POST /api/wiki/upload-guideline has no authentication check
  - 위치: `app/api/wiki/upload-guideline/route.ts:15-24`
  - The upload handler (lines 15-73) never checks for a session/JWT before accepting a multipart PDF upload, creating a storage bucket if missing, uploading the file, inserting a guideline_uploads row, and kicking off the async Gemini analysis (which per the bug above ends with…
  - 권장 조치: Add an auth/permission check (same JWT pattern as guideline-uploads/[id]/route.ts) before accepting the multipart upload in app/api/wiki/upload-guideline/route.ts.

- [ ] **BUG-160** [버그 / 수정위험도:낮음] Unauthenticated Q&A leaks internal announcements/messages that the memo search explicitly gates behind login
  - 위치: `app/api/wiki/qa/route.ts:154-254`
  - POST /api/wiki/qa has no authentication requirement. The memo search block (lines 154-185) explicitly checks `isAuthenticated` before querying memos, with a comment stating memo content is sensitive and login-gated. Two steps later, announcements and messages are fetched…
  - 권장 조치: Wrap the announcements/messages fetch (or at minimum the boardContext assembly) in app/api/wiki/qa/route.ts inside the same `if (isAuthenticated)` gate already used for the memo search two blocks above.

- [ ] **BUG-161** [버그 / 수정위험도:낮음] GET /api/wiki/nodes/[id] has no auth check and no is_published filter, exposing unpublished/draft node content by ID
  - 위치: `app/api/wiki/nodes/[id]/route.ts:8-28`
  - The GET handler fetches a wiki_nodes row (and its children) purely by params.id, with no auth check and no `.eq('is_published', true)` filter — a second, independent path to the same class of exposure as the slug-lookup bug, reachable by direct node UUID. (evidence:…
  - 권장 조치: Add getUserFromToken auth check plus .eq('is_published', true) to the GET query (bypassing the published filter only for permission_level>=4 editors), mirroring the fix needed for the sibling slug-lookup endpoint.

- [ ] **BUG-168** [버그 / 수정위험도:낮음] createTierNotification/getTierSpecificNotifications reference nonexistent 'created_by' column (should be 'created_by_id'), breaking tier-notification creation and retrieval
  - 위치: `app/api/notifications/route.ts:380 (SELECT), 614 (INSERT)`
  - The notifications table's creator column is created_by_id (sql/create_notifications_base_tables.sql:60, sql/notifications_schema.sql:45), and every other file in this same feature area uses created_by_id correctly (app/api/notifications/[id]/route.ts:101,207,219;…
  - 권장 조치: Rename `created_by` to `created_by_id` in the SELECT at line 380 and the INSERT at line 614, matching the schema and the pattern already used consistently in [id]/route.ts and cleanup/route.ts.

- [ ] **BUG-190** [버그 / 수정위험도:낮음] 필터패널 '오늘/어제/이번주/이번달/지난달' 빠른 필터가 toISOString() UTC 절단으로 KST 자정~오전9시 하루 어긋남
  - 위치: `components/dashboard/FilterPanel.tsx:129-131,145-149,163-174,188-197,210-220`
  - 5개 빠른 필터 버튼 모두 로컬 Date 객체를 만든 뒤 .toISOString().split('T')[0]으로 날짜 문자열을 생성한다. KST 자정~오전 8:59 사이에는 UTC 날짜가 전날이므로 이 시간대에 버튼을 누르면 startDate/endDate가 실제보다 하루 이전으로 설정되어 매출/미수금/설치/영업인입 4개 차트 전체에 잘못된 기간이 전달된다. (evidence: FilterPanel.tsx L129-131: '오늘' 버튼 `const today = new Date(); const…
  - 권장 조치: Replace all five toISOString().split('T')[0] occurrences in FilterPanel.tsx (L129-131, 145-149, 163-174, 188-197, 210-220) with the same KST-safe date helper used to fix item 2, since each is an isolated, mechanical substitution within one file.

- [ ] **BUG-201** [버그 / 수정위험도:낮음] lib/auth.ts's verifyAuth()/getUser() are hardcoded stubs, breaking the live comment edit/delete feature
  - 위치: `lib/auth.ts:1-10`
  - verifyAuth() unconditionally returns the primitive `true`; getUser() returns a fake user. app/api/comments/[id]/route.ts does `const { user, error: authError } = await verifyAuth() as any;` -- destructuring off `true` yields user=undefined, authError=undefined (falsy, so the…
  - 권장 조치: Replace the two stub functions in lib/auth.ts with a real check (e.g. delegate to getUserFromToken/verifyTokenHybrid in lib/secure-jwt.ts) that returns the {user, error} shape the two callers (comments/[id] and tasks/[id]/comments routes) already destructure; blast radius is just those two files and the feature is currently 100% broken so there's nothing working to regress.

- [ ] **BUG-224** [버그 / 수정위험도:낮음] E-PTO results filter forwards the result-name value to the external API under the bid-status query key
  - 위치: `app/api/e-pto/results/route.ts:75`
  - `if (pbancRsltNm) params.set('pbancSttsNm', pbancRsltNm)` sends the incoming result filter (낙찰/유찰 etc.) to the government API under the key `pbancSttsNm`, which is the bid-status field name used by the sibling bids endpoint, not a result-name parameter. parseItems() in this same…
  - 권장 조치: Change `params.set('pbancSttsNm', pbancRsltNm)` to `params.set('pbancRsltNm', pbancRsltNm)` on line 75 to match the key parseItems() actually reads from the XML response.

- [ ] **BUG-235** [버그 / 수정위험도:낮음] 데이터 복구 실행 시 API 응답 필드명 불일치로 이력 배열에 undefined가 삽입되어 페이지 크래시
  - 위치: `app/admin/data-history/page.tsx:196-199`
  - handleRestore()는 성공 응답에서 result.historyEntry를 읽어 낙관적으로 추가해둔 임시 항목을 교체하지만, 실제 API(app/api/data-history/route.ts POST)는 { message, historyId, restoredAt }만 반환하고 historyEntry 필드를 내려주지 않는다. 복구가 성공할 때마다 history 배열의 해당 항목이 undefined로 치환되고, 이후 재계산되는 stats(useMemo, h.operation 접근)와…
  - 권장 조치: Have the POST handler in data-history/route.ts return a historyEntry object (fetch or construct the updated row) alongside message/historyId/restoredAt so handleRestore's map() doesn't insert undefined into history.

- [ ] **BUG-241** [버그 / 수정위험도:낮음] 공지사항 모달이 실제 로그인 사용자 대신 하드코딩된 가짜 작성자 정보를 저장함
  - 위치: `components/modals/AnnouncementModal.tsx:195-196`
  - handleSubmit 내부에 `const authorId = 'temp_user_id'; const authorName = '관리자';`가 하드코딩되어 있어 실제 로그인 사용자와 무관하게 모든 생성/수정 요청에 동일한 고정값이 author_id/author_name으로 전송된다(POST body: line 208-209). 동일 디렉토리의 CalendarModal.tsx는 `useAuth()`로 실제 user.id/user.name을 사용하며(line 78, 498-499), 로그인 여부까지…
  - 권장 조치: Import and call useAuth() in AnnouncementModal.tsx (mirroring CalendarModal.tsx) to replace the hardcoded authorId/authorName with the real logged-in user.id/name, and guard submission if the user isn't authenticated.

- [ ] **BUG-268** [버그 / 수정위험도:낮음] MessageModal이 실제 로그인 사용자 대신 하드코딩된 'temp_user_id'/'사용자'를 작성자로 저장
  - 위치: `components/modals/MessageModal.tsx:77-79, 88-91`
  - handleSubmit()의 create 분기에서 `const authorId = 'temp_user_id'; const authorName = '사용자';`를 그대로 POST /api/messages의 body(author_id, author_name)에 실어 보낸다. app/api/messages/route.ts:123-141의 POST 핸들러는 author_id/author_name을 필수 존재 여부만 검사하고(126행) 그대로 `INSERT INTO messages (title,…
  - 권장 조치: Read the current user from the app's AuthContext/useAuth (already used elsewhere) and send its real id/name as author_id/author_name instead of the hardcoded 'temp_user_id'/'사용자' literals; existing rows keep the placeholder value unless separately backfilled.

- [ ] **BUG-269** [버그 / 수정위험도:낮음] AnnouncementModal도 동일하게 하드코딩된 'temp_user_id'/'관리자'를 작성자로 저장
  - 위치: `components/modals/AnnouncementModal.tsx:195-196, 208-209`
  - handleSubmit()에서 `const authorId = 'temp_user_id'; const authorName = '관리자';`를 POST /api/announcements의 body로 그대로 전송한다. app/api/announcements/route.ts:88-136 POST 핸들러는 필수 필드 존재 여부만 검증 후(95행) 그대로 INSERT하며(103-110행), 실제 인증 사용자로 override하지 않는다. AnnouncementModal은…
  - 권장 조치: Same fix as MessageModal: source author_id/author_name from the authenticated session via AuthContext instead of the hardcoded 'temp_user_id'/'관리자' literals.

- [ ] **BUG-280** [버그 / 수정위험도:낮음] 나이스페이 결제 거래내역 조회 API가 인증 없이 배포됨
  - 위치: `app/api/nicepay/transactions/route.ts:14-16, 23-144`
  - 파일 상단 TODO 주석(14-16행)이 '인증 없이 결제 거래 내역을 조회할 수 있다'고 스스로 명시하는데, 실제 GET 핸들러(23-144행)에는 어떤 인증 코드도 없다. GET 요청은 middleware의 CSRF 검증에서도 safeMethods로 제외되므로(protectCSRF, GET/HEAD/OPTIONS 스킵) CSRF 토큰조차 필요 없이 누구나 결제 거래 상세를 조회할 수 있다. (evidence: app/api/nicepay/transactions/route.ts:14-16…
  - 권장 조치: Add the Bearer-token + permissionLevel>=3 check exactly as the file's own TODO already specifies, mirroring app/api/admin/monthly-closing/route.ts; no active frontend caller was found, so this is a low-risk isolated change.

- [ ] **BUG-285** [버그 / 수정위험도:낮음] 댓글 API가 더미 verifyAuth를 사용 - GET은 인증 우회, POST는 항상 500 크래시
  - 위치: `app/api/tasks/[id]/comments/route.ts:3, 16, 62, 122`
  - line 3에서 '@/lib/auth'를 import하는데, 이는 lib/auth.ts(디렉터리 lib/auth/middleware.ts의 실제 구현과 별개)의 더미 함수로 인자 없이 항상 true를 반환한다. GET(line 16)과 POST(line 62) 모두 `const { user, error: authError } = await verifyAuth() as any`로 boolean true를 구조분해하므로 user와 authError가 모두 undefined가 되고, `if…
  - 권장 조치: Change the import from `@/lib/auth` to `@/lib/auth/middleware` in `app/api/tasks/[id]/comments/route.ts`, matching the correct pattern already used by sibling routes `tasks/route.ts` and `tasks/[id]/route.ts`.

- [ ] **BUG-004** [버그 / 수정위험도:중간] 사업장명 조회 쿼리에 is_deleted 필터/정렬이 없어 이름 재사용 시 삭제된 사업장 데이터가 반환될 수 있음
  - 위치: `app/api/facilities-supabase/[businessName]/route.ts:58-66 (GET), 664-667 (POST)`
  - Both GET and POST resolve the business via `SELECT ... FROM business_info WHERE business_name = $1` with no is_deleted filter and no ORDER BY, then call queryOne (lib/supabase-direct.ts:91-94, which is literally `result.rows[0] || null`). The very next query in the same GET…
  - 권장 조치: Add `.eq('is_deleted', false)` to both the GET (line ~58-66) and POST (line ~664-667) business_info lookups, matching the pattern already used one query later for air_permit_info (line 100).

- [ ] **BUG-005** [버그 / 수정위험도:중간] 시설관리 정보 조회/저장 API가 business_name 조회 시 is_deleted 필터 누락
  - 위치: `app/api/facility-management/route.ts:24-33 (GET), 188-196 (PUT)`
  - Both GET (`businessQuery.eq('business_name', businessName).single()`) and PUT (`updateQuery.eq('business_name', businessName)...select().single()`) omit is_deleted, unlike the partial-unique-index design (see migration above) which permits a soft-deleted and an active…
  - 권장 조치: Add `is_deleted = false` (or `.eq('is_deleted', false)`) to the business_name lookup in both the GET (line 30) and PUT (line 193) handlers before `.single()`.

- [ ] **BUG-017** [버그 / 수정위험도:중간] Measuring-device update crashes for any business with more than one air permit
  - 위치: `app/api/air-permit/update/route.ts:92-97`
  - .maybeSingle() errors when the business_id filter matches more than one active air_permit_info row, which is a normal, supported state in this domain. (evidence: Lines 92-97: `.from('air_permit_info').select('id').eq('business_id', business_id).eq('is_deleted',…
  - 권장 조치: Replace `.maybeSingle()` with a query that accepts an explicit permit_id from the caller (EstimatePreviewModal already knows which permit it's editing) instead of matching on business_id alone, which breaks as soon as a business has more than one active permit.

- [ ] **BUG-018** [버그 / 수정위험도:중간] Measuring-device update matches facilities only by facility_number across ALL outlets of a permit
  - 위치: `app/api/air-permit/update/route.ts:120-206`
  - facility_number is only unique per-outlet, but the update loop does air_permit.emission_facilities?.find(f => f.facility_number === facility.facility_number) against a flat array spanning every outlet, so it can silently write one outlet's data onto another outlet's…
  - 권장 조치: Have EstimatePreviewModal (the only caller, per grep) send outlet_number alongside facility_number, and change the `.find()` in air-permit/update/route.ts to match on the compound (outlet_number, facility_number) key instead of facility_number alone.

- [ ] **BUG-019** [버그 / 수정위험도:중간] handleSave silently swallows non-2xx responses from the air-permit PUT/POST
  - 위치: `app/admin/air-permit-detail/page.tsx:561-679, 874-887`
  - The only follow-up check on the PUT/POST response is `if (airPermitResponse && airPermitResponse.ok)` with no else branch; fetch() doesn't throw on HTTP error status so the try/catch never fires on server-side failure, leaving the user with no error feedback and unsaved edits.…
  - 권장 조치: Add an else branch after `if (airPermitResponse && airPermitResponse.ok)` that surfaces the error response to the user (toast/alert) and keeps the form dirty, instead of silently falling through as if the save succeeded.

- [ ] **BUG-020** [버그 / 수정위험도:중간] Outlet numbering collision after delete-then-add produces duplicate outlet_number in permit edit page
  - 위치: `app/admin/air-permit-detail/page.tsx:966, 1105-1112`
  - addOutlet assigns outlet_number from the current array length rather than the max existing number; deleting a middle outlet then adding a new one produces a duplicate outlet_number that collides with a still-present outlet, and the silent-save-failure bug hides the resulting DB…
  - 권장 조치: Compute the new outlet_number as `Math.max(0, ...outlets.map(o => o.outlet_number)) + 1` instead of `length + 1` in addOutlet, and fix this together with item 18's silent-save-failure so a resulting UNIQUE constraint violation is no longer hidden from the user.

- [ ] **BUG-021** [버그 / 수정위험도:중간] Same outlet_number collision in the 'new permit' creation modal causes partial, orphaned DB rows on save
  - 위치: `app/admin/air-permit/page.tsx:606-630`
  - addOutlet/removeOutlet in the create-permit modal use the identical array-length-based numbering bug; on submit, POST /api/air-permit inserts outlets one-by-one with no transaction, so a mid-loop unique-constraint failure leaves the air_permit_info row and earlier…
  - 권장 조치: Wrap the outlet/facility insert loop in POST /api/air-permit with the existing lib/supabase-direct.ts transaction() helper so a mid-loop unique-constraint failure rolls back the whole permit, and fix addOutlet/removeOutlet in the create modal to renumber by max(outlet_number)+1 instead of array length.

- [ ] **BUG-028** [버그 / 수정위험도:중간] 결재 문서 상세조회의 총무팀 폴백 접근권한 체크가 팀-부서 실제 소속관계를 검증하지 않음
  - 위치: `app/api/approvals/[id]/route.ts:64-77`
  - 작성자/결재선 포함자가 아닌 사용자에 대한 폴백 체크(`mgmtMember` 쿼리)가 `JOIN teams t ON t.name = e.team`와 `JOIN departments d ON d.name = e.department`를 서로 연결 없이 각각 이름으로만 매칭한다. `t.department_id = d.id` 검증이 전혀 없어, department 조인은 사실상 아무 필터링도 하지 않는 사문화된 조인이다. 같은 파일 옆의 app/api/approvals/route.ts(68-70줄,…
  - 권장 조치: Add `t.department_id = d.id` to the JOIN condition in approvals/[id]/route.ts's mgmtMember fallback query, mirroring the already-correct pattern in approvals/route.ts (JOIN departments d ON d.id = t.department_id).

- [ ] **BUG-031** [버그 / 수정위험도:중간] 결재 상세 FormViewer가 commission_closing(영업비마감) 문서 유형을 처리하지 않음
  - 위치: `app/admin/approvals/[id]/page.tsx:61-112`
  - FormViewer의 switch문에 commission_closing case가 없어 default 분기('알 수 없는 문서 유형')로 떨어진다. app/api/commission-closing/approval/route.ts가 document_type='commission_closing'인 approval_documents를 실제 생성해 정상적으로 결재 프로세스에 태우므로, 이 문서를 받은 결재자는 상세 페이지에서 내용을 전혀 볼 수 없다. (evidence:…
  - 권장 조치: Add a `commission_closing` case to FormViewer's switch statement in app/admin/approvals/[id]/page.tsx, building a small viewer component for the commission_closing payload shape (mirroring installation_closing's form) so approvers can actually see the content.

- [ ] **BUG-032** [버그 / 수정위험도:중간] 전결(express-approve) 처리 시 commission_closing 문서는 approve와 달리 commission_payments 상태를 자동 전환하지 않음
  - 위치: `app/api/approvals/[id]/express-approve/route.ts:424-444`
  - approve/route.ts는 installation_closing과 commission_closing 두 블록 모두 존재해 관련 레코드를 자동 전환하지만, express-approve/route.ts는 installation_closing 블록만 있고 commission_closing에 대응하는 commission_payments 상태 전환 블록이 없다. (evidence: app/api/approvals/[id]/express-approve/route.ts 424-444줄에…
  - 권장 조치: Copy the commission_closing → commission_payments status-transition block from approve/route.ts into express-approve/route.ts so 전결 processing also flips commission_payments.status from pending_approval to approved.

- [ ] **BUG-068** [버그 / 수정위험도:중간] 자비(self_pay) 계약서 템플릿의 '페이지3' 컨테이너가 비어있어 PDF 3페이지 본문(제5~9조)이 통째로 누락/오배치됨
  - 위치: `app/admin/document-automation/components/SelfPayContractTemplate.tsx:272-345`
  - 272-273행의 `<div className="page-3 p-4"></div>`는 비어있는 채로 즉시 닫힌다. 실제 제5조~제9조 및 계약 확정 문구(279-344행)는 divs 중첩을 직접 계수해 확인한 결과 페이지2 컨테이너(177행에서 열려 345행에서 닫힘) 내부에 그대로 중첩되어 있으며, .page-3로 감싸이지 않는다. utils/contractPdfGenerator.ts(47-53, 108-121행)는 querySelector('.page-2')와…
  - 권장 조치: Move the .page-3 wrapping div to actually enclose the 제5조~제9조 content (lines ~279-344) instead of closing it empty at line 273, and close the .page-2 div right before that content starts; re-verify contractPdfGenerator.ts's page-2/page-3 canvas capture and maxHeight scaling against the corrected markup before shipping (contract-generation output is customer-facing).

- [ ] **BUG-072** [버그 / 수정위험도:중간] 협의사항(네고)이 차감이 아니라 가산되어 착공신고서 사업장 보관용 계약서 총액이 부풀려짐
  - 위치: `app/admin/document-automation/components/construction-report/ContractBusinessTemplate.tsx:60-78`
  - totalSupplyAmount(72행) = government_notice_price + additional_cost + negotiation_cost, totalDeposit(78행) = depositAmountIot + additionalCostTotal + negotiationCostTotal로 negotiation_cost(할인 성격의 값)를 가산하고 있다. 반면 같은 코드베이스의 lib/receivables-engine.ts(42행 `revenue -= negotiation`)와…
  - 권장 조치: Change the '+' to '-' for negotiationCostTotal in both totalSupplyAmount (line 72) and totalDeposit (line 78), matching the subtraction already used in lib/receivables-engine.ts and business-summary/route.ts; this affects the printed/contracted total on a customer-facing document so cross-check a sample generated contract against the revenue-engine figure before shipping.

- [ ] **BUG-073** [버그 / 수정위험도:중간] PDF 사진 리포트에서 페이지 분할 시 이미지 y좌표가 새 페이지 기준으로 리셋되지 않아 다수 사진이 페이지 밖으로 밀려 사라짐
  - 위치: `lib/pdfGenerator.ts:30-44, 178-207, 228-257`
  - calculateImagePosition(index,...)의 y좌표(41행)는 전체 누적 index 기준 row로만 계산되고 현재 페이지 내 상대 위치가 아니다. 페이지 하단 초과 시 addPage()를 호출(186-189, 236-239행)하지만 그 직후에도 동일한(이미 계산된) 큰 y값을 그대로 사용해 이미지를 그린다. row=3(13~15번째 이미지, includeUserCaption=false 기준 y=236mm)에서 페이지 브레이크가 발생하지만 y=236mm는 새 페이지에서도 여전히…
  - 권장 조치: In calculateImagePosition, recompute row/col relative to the current page (e.g. track imagesOnCurrentPage and reset the row counter to 0 right after each addPage() call) instead of using the global cumulative index, and add a regression check for photo reports with >12-15 images across the two callers (178-207 and 228-257) since both branches share the same off-by-page-break bug.

- [ ] **BUG-078** [버그 / 수정위험도:중간] PATCH /api/subsidy-announcements has zero authentication/authorization
  - 위치: `app/api/subsidy-announcements/route.ts:110-166`
  - GET and PATCH both build a service-role Supabase client at module scope and PATCH never checks any session/JWT/Authorization header before applying `{status, is_read, notes}` updates keyed only by client-supplied `id`. middleware.ts's protectAPIRoute() (lines 142-223) only does…
  - 권장 조치: Add the same TokenManager.getToken() + Authorization Bearer header + permission_level check used for /api/subsidy-announcements/manual PATCH (already implemented in this same file at lines 356-368 and manual/route.ts lines 21-118) to both the PATCH handler in app/api/subsidy-announcements/route.ts and its two callers in app/admin/subsidy/page.tsx (lines 207-211 and ~240), and remove it from the CSRF-exempt list in lib/security/csrf-protection.ts since the exemption comment's stated justification ('Supabase Admin 인증 사용') is false — this needs coordinated frontend+backend changes but has a working precedent already in the same files.

- [ ] **BUG-082** [버그 / 수정위험도:중간] Compound Korean '억+만원' budget strings are inflated ~10,000x by parseBudget/formatBudget
  - 위치: `components/subsidy/ActiveAnnouncementsModal.tsx:109-130`
  - parseBudget strips all non-digit characters into one concatenated string, then if the original string contains '억' anywhere, multiplies the ENTIRE concatenated digit string by 100,000,000 without separating the '억' portion from any smaller unit like '만원'. For '3억5,000만원'…
  - 권장 조치: Rewrite parseBudget to split the string on '억' first, parse the 억-portion and the remaining 만원/원 portion separately (multiplying by 1e8 and 1e4 respectively) and sum them, then unit-test it against '3억5,000만원', '5억원', '3,500만원', and plain '원' cases before reuse.

- [ ] **BUG-086** [버그 / 수정위험도:중간] formatNumber() destroys Korean compound currency units (억/만), displaying grant amounts off by orders of magnitude
  - 위치: `app/admin/subsidy/page.tsx:440-449`
  - formatNumber strips every non-digit character from the raw budget/support_amount string and re-adds a trailing '원' only if the original string contained '원' — it never converts or preserves '억'/'만' magnitude. For '5억원' (500,000,000원), `value.replace(/[^\d]/g,'')` yields only '5'…
  - 권장 조치: Replace formatNumber in page.tsx and the duplicated logic in AnnouncementDetailModal.tsx with the same compound-unit-aware Korean currency parser used to fix item 1, applied consistently in all three call sites.

- [ ] **BUG-092** [버그 / 수정위험도:중간] 영업비마감 대상 조회의 미수금 계산이 추가계산서 청구금액을 기준금액에 반영하지 않아 미수금을 과소 산정함
  - 위치: `app/api/commission-closing/eligible/route.ts:40-65`
  - computeReceivable()은 totalPayments에 extra_payment_total(추가계산서 입금액)을 더하지만(46-54행), 기준금액 contractAmount는 calculateContractAmount()로 순수 장비필드+추가공사비-협의사항으로만 계산되고 추가계산서 청구액이 전혀 반영되지 않는다(19-37, 56행). lib/receivables-engine.ts의 computeBusinessReceivableNow는 동일 상황에서…
  - 권장 조치: Replace the duplicated computeReceivable/calculateContractAmount in eligible/route.ts with a call to lib/receivables-engine.ts's computeBusinessReceivableNow (which already folds extraSupplyTotal into the base amount), consistent with the prior receivables-calculation unification.

- [ ] **BUG-106** [버그 / 수정위험도:중간] Cross-meeting issue-completion propagation is dead code due to issue_content/issue_description field mismatch
  - 위치: `app/api/meeting-minutes/business-issues/complete/route.ts:125-131`
  - The fallback match `issue.business_id === business_id && issue.issue_content === issue_content && issue.is_completed === false` reads issue.issue_content, but I confirmed in types/meeting-minutes.ts (line 51) that BusinessIssue objects only ever have an issue_description field —…
  - 권장 조치: Change the fallback comparison in business-issues/complete/route.ts from issue.issue_content to issue.issue_description, but be aware this newly activates cross-meeting propagation for any matching business_id+text pair so verify it doesn't produce false-positive matches across unrelated recurring issues.

- [ ] **BUG-108** [버그 / 수정위험도:중간] Edit page defines full business-issue CRUD but never renders the corresponding UI
  - 위치: `app/admin/meeting-minutes/[id]/edit/page.tsx:412-460`
  - handleAddBusinessIssue (412), handleRemoveBusinessIssue (426), handleUpdateBusinessIssue (437), and handleToggleComplete (450) are fully defined and businessIssues state is loaded/migrated (218, 264-282, 439), but I confirmed via grep that none of these four handlers are…
  - 권장 조치: Add a '사업장별 이슈' section to app/admin/meeting-minutes/[id]/edit/page.tsx JSX (mirroring the create page's business-issue list) and wire it to the already-defined handleAddBusinessIssue/handleRemoveBusinessIssue/handleUpdateBusinessIssue/handleToggleComplete handlers.

- [ ] **BUG-124** [버그 / 수정위험도:중간] Legacy string `assignee` tasks get a non-UUID user_id and are silently dropped by the permission filter
  - 위치: `app/api/weekly-reports/realtime/route.ts:52-59, 336-338`
  - extractAssigneeInfo() falls back to `{ userId: task.assignee, userName: task.assignee }` (lines 53-59) whenever a task's `assignees` array is missing or empty — using the employee's NAME string as userId. The permission filter for non-admins at line 338 does `reports.filter(r =>…
  - 권장 조치: In extractAssigneeInfo's no-assignees fallback, resolve the employee UUID by looking up the name against the employees table (or better, stop persisting name-only assignee fallbacks at task-write time) instead of using the name string as user_id, so the permission filter's `r.user_id === userId` comparison works correctly for affected non-admin users.

- [ ] **BUG-128** [버그 / 수정위험도:중간] SQL column collision on completed_at breaks per-stage completion indicator in status_transitions
  - 위치: `app/api/weekly-reports/realtime/route.ts:161-172, 259-269`
  - The statusHistories SQL is `SELECT tsh.*, ft.task_type, ..., ft.completed_at, ...` — `tsh.*` already includes task_status_history's own `completed_at` column (confirmed in sql/task_status_history.sql: 'completed_at TIMESTAMPTZ' with comment '해당 단계 완료 시각 (null이면 진행 중)'), and the…
  - 권장 조치: Alias the duplicate column in the SQL (e.g. `ft.completed_at AS task_completed_at`) and update the consuming code at ~line 267 to read the aliased field for is_completed/completed_at, leaving `tsh.completed_at` (via `tsh.*`) as the per-stage value; verify no other field in `ft.*`/`tsh.*` collides the same way before shipping.

- [ ] **BUG-129** [버그 / 수정위험도:중간] Back-filled tasks (created before this week, status-changed this week) get the earliest, not the latest, status of the week
  - 위치: `app/api/weekly-reports/realtime/route.ts:161-172, 188-208`
  - statusHistories is fetched `ORDER BY tsh.started_at ASC` (line 170). The back-fill loop (lines 190-208) only adds a task the FIRST time its id is encountered (`!taskIds.has(h.task_id)`), and since the array is ascending, that first encounter is the earliest transition of the…
  - 권장 조치: Change the statusHistories query to `ORDER BY tsh.started_at DESC` (or keep ASC but overwrite on every matching id instead of skipping already-seen ones) so back-filled tasks pick up the week's latest status, not the earliest; re-verify completion_rate numbers for previously back-filled tasks after the fix.

- [ ] **BUG-165** [버그 / 수정위험도:중간] 재업로드 시 이전 챕터 wiki_nodes가 정리되지 않고 그대로 게시 상태로 남음
  - 위치: `app/api/wiki/upload-guideline/route.ts:205-263`
  - createWikiNodes()는 루트 노드를 slug 기준 upsert하고 이번 분석에서 나온 챕터들만 upsert할 뿐, 같은 루트 아래 이전 업로드에서 생성됐으나 이번 분석 결과에는 없는 챕터 wiki_nodes를 삭제하거나 is_published=false로 내리는 로직이 전혀 없다. 동일 version_label로 재업로드 시 챕터 수가 줄어들면(예: 10개→8개) 구버전 chapter-9, chapter-10이 is_published:true로 영구히 남아 위키 트리·검색·AI…
  - 권장 조치: In createWikiNodes(), before upserting the new chapter set, query existing chapter wiki_nodes under the same root slug and unpublish (is_published=false) any whose slug is not in the current analysis result, rather than deleting rows outright, to avoid breaking internal references.

- [ ] **BUG-169** [버그 / 수정위험도:중간] 3-tier notification filter (personal/team/company) is computed but never applied to the query
  - 위치: `app/api/notifications/route.ts:341-402`
  - getTierSpecificNotifications() builds a `whereClause` string from the `tier` argument (personal → target_user_id match, team → target_team_id/target_department_id match, company → notification_tier='company') at lines 342-366, but the Supabase query built at lines 368-402 never…
  - 권장 조치: Replace the unused string-built `whereClause` with actual Supabase query builder calls (`.eq('notification_tier', tier)` plus `.eq('target_user_id', user.id)` / `.or(team+department conditions)` / tier='company' as appropriate) so each tab is genuinely scoped; verify against the fix for the created_by column bug since both live in the same query.

- [ ] **BUG-172** [버그 / 수정위험도:중간] Notification detail GET endpoint has no ownership check (IDOR) — any authenticated employee can read any other user's private notification
  - 위치: `app/api/notifications/[id]/route.ts:44-113`
  - GET /api/notifications/[id] only requires a valid JWT (any active employee, any permission_level) via getUserFromToken; after that it fetches `.from('notifications').select('*, user_notification_reads!left(...)').eq('id', notificationId).single()` with no check that the…
  - 권장 조치: After fetching the notification, verify the requester is authorized to view it (target_user_id === user.id for personal tier, team/department membership for team tier, or notification_tier === 'company') and return 403/404 otherwise, reusing the same tier-membership logic needed for finding #8.

- [ ] **BUG-173** [버그 / 수정위험도:중간] Daily monitor endpoints (GET/POST/PATCH) have zero authentication, exposing internal task data and per-user notification stats, and allow triggering RPCs
  - 위치: `app/api/notifications/daily-monitor/route.ts:9-172`
  - None of GET (risk-task overview), POST (runs check_task_deadlines RPC), or PATCH (per-user notification stats) call any auth/JWT check, and middleware.ts's protectAPIRoute (lines 142-210) only does rate-limiting, request-size validation, and CSRF — it performs no session/JWT…
  - 권장 조치: Decide whether this route is cron-only or user-facing: if cron-only, gate all three handlers behind a shared-secret header (e.g. CRON_SECRET) checked against an env var; if user-facing, add getUserFromToken() and, for PATCH, ignore the client-supplied userId and use the authenticated user's own id.

- [ ] **BUG-183** [버그 / 수정위험도:중간] 기본 4주/8주 기간 계산이 toISOString() UTC 절단으로 KST 자정~오전9시 사이 하루 당겨짐
  - 위치: `components/dashboard/charts/chart-kit.tsx:51-55`
  - resolvePeriodParams의 4w/8w 분기가 `new Date()`(로컬 시각) 값을 `.toISOString().split('T')[0]`(UTC 날짜)로 변환한다. KST(UTC+9)에서 로컬 00:00~08:59 사이에는 UTC 날짜가 로컬 날짜보다 하루 이르므로 startDate/endDate가 모두 하루 당겨진다. 이 값이 각 API의 installation_date<=endDate 등 부등호 필터에 그대로 쓰이므로 실제 오늘 설치/등록된 레코드가 쿼리 결과에서 제외된다.…
  - 권장 조치: Replace the toISOString().split('T')[0] calls in chart-kit.ts L51-55 (resolvePeriodParams, shared by Revenue/Receivable/Installation/MonthlyLeads charts) with a KST-safe date formatter and verify all four consuming charts' default 4w/8w windows still align after the change.

- [ ] **BUG-191** [버그 / 수정위험도:중간] resolvePeriodParams가 filters.months(최근 N개월 드롭다운)를 전혀 읽지 않아 드롭다운이 무동작
  - 위치: `components/dashboard/charts/chart-kit.tsx:27-64`
  - FilterPanel의 '최근 기간' 드롭다운(months: 3/6/12/24/36)을 바꿔도 4개 차트 컴포넌트는 반응하지 않는다. resolvePeriodParams는 filters.periodMode, startDate/endDate, year만 검사하고 filters.months는 함수 내 어디에서도 참조되지 않는다. periodMode가 'recent'이고 startDate/endDate가 없으면 각 차트 자신의 periodPreset(기본 '8w') 값에 따라 임의로 6개월/12개월만…
  - 권장 조치: In chart-kit.ts's resolvePeriodParams (L27-64), read filters?.months and pass it through as params.months when periodMode is 'recent' with no explicit date range, instead of deriving monthsFallback from the local periodPreset alone -- verify against all 4 consuming charts since this changes actually-displayed ranges, not just formatting.

- [ ] **BUG-200** [버그 / 수정위험도:중간] Kakao webhook signature verification is a stub that always returns true, and is skipped entirely when no signature header is sent
  - 위치: `app/api/auth/social/kakao/webhook/route.ts:18-22, 101-108`
  - verifyWebhookSignature() unconditionally returns true, and is only invoked inside `if (signature && !verifyWebhookSignature(...))` -- an absent x-kakao-signature header makes signature '' (falsy), skipping the check altogether. Any anonymous POST with {event_type:'user.revoke',…
  - 권장 조치: Since no frontend social-login flow currently calls this webhook, block the endpoint outright (404/410) until real verification is designed, because Kakao's unlink callback has no documented HMAC-signature contract to trivially implement -- don't just flip verifyWebhookSignature() to a guessed check.

- [ ] **BUG-212** [버그 / 수정위험도:중간] Kakao social login POST endpoint never receives or validates a state parameter (login CSRF)
  - 위치: `app/api/auth/social/kakao/route.ts:202-220`
  - The POST handler destructures only `{ code }` from the body; `state` is never read or checked anywhere in exchangeCodeForToken or the handler. An attacker who completes their own Kakao OAuth flow to obtain a valid code can craft an external page that auto-POSTs that code to this…
  - 권장 조치: Generate and store a random state value when the Kakao login flow is initiated and validate it in this POST handler before exchanging the code, mirroring the state-check already used in the Naver flow; spans the initiating client code plus this route so needs coordinated testing, not a single isolated file.

- [ ] **BUG-217** [버그 / 수정위험도:중간] Kakao/Google/Naver 'simple' callback routes create active permission_level-1 accounts with zero domain-policy check
  - 위치: `app/api/auth/social/kakao-simple/route.ts:171-195`
  - createUserDirectly() in all three -simple routes (kakao-simple, google-simple, naver-simple) inserts a new employee with is_active:true, permission_level:1 whenever no existing account is found, with no query against social_auth_policies at all (confirmed via grep -- the string…
  - 권장 조치: Add the same social_auth_policies lookup used in google/route.ts and naver/route.ts to all three -simple routes (kakao-simple, google-simple, naver-simple) before auto-provisioning an active employee, and first confirm via logs/telemetry whether these -simple endpoints are actually reachable in production given the separate redirect_uri typo (item 17) that may currently be masking the exposure.

- [ ] **BUG-231** [버그 / 수정위험도:중간] 알림 생성 화면의 대상 사용자/팀/부서 목록이 실제 API 대신 하드코딩된 가짜 데이터
  - 위치: `app/admin/notifications/page.tsx:39-70`
  - loadInitialData()는 실제 직원/팀/부서 API를 호출하지 않고 users=[{id:'1',name:'김철수',...}], teams=[{id:1,...}], departments=[{id:1,...}]를 그대로 setState한다(주석: '실제 구현에서는 API에서 가져와야 함'). handleCreateNotification이 이 가짜 id를 target_user_id로 그대로 createNotification()에 전달하므로, 개인 알림 기능이 실제 직원과 무관한 값을 서버로…
  - 권장 조치: Replace the hardcoded users/teams/departments arrays in loadInitialData() with calls to the existing employees/teams/departments APIs, verifying the id/name fields match what createNotification expects.

- [ ] **BUG-236** [버그 / 수정위험도:중간] 업무 담당자 변경 알림이 information_schema 존재확인 오류로 인해 항상 발송되지 않음
  - 위치: `app/api/organization/task-assignments/route.ts:46-53`
  - notifyTaskAssignmentChange()는 `supabase.from('information_schema.tables').select('table_name').eq('table_name', 'notifications').single()`로 notifications 테이블 존재 여부를 확인한 뒤 `if (tableExists)` 블록 안에서만 알림 insert 및 sendWebPushToUser/sendTelegramToUser를 호출한다. supabase-js의 `.from()`은…
  - 권장 조치: Remove the broken information_schema.tables existence check (supabase-js .from() can't query it) and call the notification insert/push/telegram logic unconditionally, but fix bug #16 in the same pass since enabling this dead code path will immediately expose it.

- [ ] **BUG-247** [버그 / 수정위험도:중간] Estimate DELETE endpoint has no server-side permission check despite documented 'level 4+' requirement
  - 위치: `app/api/estimates/[id]/route.ts:11-43`
  - The DELETE handler performs `supabase.from('estimate_history').delete().eq('id', id)` with the service-role client, with zero inspection of any auth cookie/header/token before executing. The '권한 4 이상 필요' comment on line 10 is not enforced anywhere server-side. (evidence: Read…
  - 권장 조치: Add a server-side permission check (verifyTokenHybrid/checkUserPermission consistent with other protected routes) requiring level 4+ at the top of the DELETE handler in app/api/estimates/[id]/route.ts before it touches the DB.

- [ ] **BUG-257** [버그 / 수정위험도:중간] fetchTasks is not defined – ReferenceError crashes bulk-upload success handler and swallows duplicate-delete refresh
  - 위치: `app/admin/tasks/page.tsx:394, 3680`
  - Component defines only loadTasks (line 259) and refreshTasks (line 645); no fetchTasks exists anywhere. Line 3680 (BulkUploadModal onSuccess, no try/catch) throws an uncaught ReferenceError after every successful Excel bulk upload, so the list never refreshes. Line 394 (inside…
  - 권장 조치: Replace both undefined fetchTasks() calls (lines 394, 3680) with refreshTasks(), which is the existing function already used elsewhere in the file for post-action refresh, and wrap the bulk-upload onSuccess call in try/catch for safety.

- [ ] **BUG-270** [버그 / 수정위험도:중간] AnnouncementBoard의 하드코딩된 userLevel=3으로 작성 버튼이 항상 노출되고, 서버(API)도 Level 3 권한을 전혀 검증하지 않음
  - 위치: `components/boards/AnnouncementBoard.tsx:36, 180`
  - `const [userLevel, setUserLevel] = useState<number>(3)`로 초기화된 뒤 어디서도 갱신되지 않아 180행 `{userLevel >= 3 && (<button onClick={handleCreateClick}>작성</button>)}`이 항상 참이 되어 모든 사용자에게 작성 버튼이 노출된다. 클라이언트 문제뿐 아니라 서버도 무방비인데, app/api/announcements/route.ts POST 핸들러(88-100행)는 제목/내용/작성자 필드 존재…
  - 권장 조치: Initialize `userLevel` from the real authenticated user's permission_level via AuthContext instead of a hardcoded 3, and add a server-side `permission_level >= 3` check to the POST handler in app/api/announcements/route.ts — do both together, since a client-only fix leaves the API still open to direct calls.

- [ ] **BUG-286** [버그 / 수정위험도:중간] 업무 상세조회/수정/삭제 권한 체크가 permissionLevel>=1(모든 로그인 직원)이면 무조건 통과
  - 위치: `app/api/tasks/[id]/route.ts:153-158, 259-262, 460-462`
  - GET(hasAccess, line 153-156), PUT(canEdit, line 259-262), DELETE(canDelete, line 460-462) 모두 담당자/생성자 여부와 무관하게 `decodedToken.permissionLevel >= 1` 조건으로 통과시킨다. lib/auth/AuthLevels.ts 기준 permissionLevel 1은 AuthLevel.AUTHENTICATED, 즉 로그인한 일반 직원의 최저 레벨이므로(0=게스트만 미달) 사실상 로그인한 모든 직원이…
  - 권장 조치: Replace the blanket `permissionLevel >= 1` fallback in GET/PUT/DELETE with department-scoped access mirroring the existing list API pattern (`tasks/route.ts` GET), reserving unrestricted access for a genuinely elevated permission level.

- [ ] **MODULE-02** [모듈 선택 불일치 / 수정위험도:중간] Success/error feedback overwhelmingly uses blocking native alert() instead of the mounted toast system
  - 위치: `components/providers/ClientProviders.tsx`, `components/ui/Toast.tsx`, `app/business/[businessName]/BusinessContent.tsx`, `app/admin/air-permit/page.tsx` 외 6곳
  - react-hot-toast is globally mounted via components/providers/ClientProviders.tsx, and components/ui/Toast.tsx's own docstring states it exists to 'replace alert with a non-blocking notification' — yet per-domain audits show native `alert()` is the dominant feedback mechanism…
  - 권장 조치: Pick one toast system as canonical — react-hot-toast is the strongest candidate since it's already mounted app-wide with zero extra wiring — and replace alert() call sites domain by domain, starting with the highest-frequency ones (tasks, order-management, document-automation). Retire the ad-hoc DOM-toast in BusinessContent.tsx and the dev-work-log custom toast in favor of it.

- [ ] **MODULE-11** [모듈 선택 불일치 / 수정위험도:중간] Success/error feedback: canonical Toast/InAppNotificationToast/react-hot-toast exist but native alert() dominates almost every domain
  - 위치: `components/ui/Toast.tsx`, `app/admin/air-permit-detail/page.tsx`, `app/admin/air-permit/page.tsx`, `app/admin/tasks/page.tsx` 외 5곳
  - The app has three legitimate toast mechanisms (components/ui/Toast.tsx, components/ui/InAppNotificationToast.tsx for the notification system, and a globally-mounted react-hot-toast in ClientProviders), yet the shared-ui audit counts 50+ native alert()/confirm() call sites across…
  - 권장 조치: Pick one canonical toast (components/ui/Toast.tsx, since it's already the one used successfully in air-permit-detail) as the standard for transactional success/error feedback, and replace alert() call sites domain by domain starting with air-permit/page.tsx (to fix the intra-domain inconsistency with air-permit-detail) and approvals/dev-work-log (which already built bespoke local toast logic that can be deleted in favor of the shared component).

- [ ] **MODULE-13** [모듈 선택 불일치 / 수정위험도:중간] Date input: canonical components/ui/DateInput.tsx has a literal duplicate elsewhere that regressed a bug fix, plus scattered native/inline reimplementations
  - 위치: `components/ui/DateInput.tsx`, `app/admin/document-automation/components/DateInput.tsx`, `app/admin/document-automation/components/ConstructionReportManagement.tsx`, `app/admin/order-management/components/OrderDetailModal.tsx` 외 4곳
  - components/ui/DateInput.tsx (a 3-field YYYY/MM/DD widget) is used correctly in shared/business-admin contexts and in blueon-ai-misc's CalendarModal. But document-automation ships its own app/admin/document-automation/components/DateInput.tsx — same name, same YYYY/MM/DD design,…
  - 권장 조치: Delete app/admin/document-automation/components/DateInput.tsx and repoint ConstructionReportManagement at components/ui/DateInput.tsx — this immediately fixes the missing isInternalChange guard rather than requiring it to be re-patched twice. Replace order-management's inline 3-field widget in OrderDetailModal with the canonical component so the domain's three modals stop disagreeing on date-input UX.

- [ ] **BUG-003** [버그 / 수정위험도:높음] 시설 정보 저장 시 전체 삭제 후 재삽입으로 facility ID가 매번 바뀌어 측정기기 수정이 조용히 실패
  - 위치: `app/api/facilities-supabase/[businessName]/route.ts:696-807 (POST handler)`
  - POST deletes all discharge_facilities/prevention_facilities rows for the business_name (lines ~696-706: DELETE ... WHERE business_name = $1) then bulk-INSERTs new rows without ever supplying the old id, so Postgres assigns brand-new UUIDs on every save. The GET handler…
  - 권장 조치: Replace the delete-then-bulk-insert in the POST handler with an upsert that matches existing rows by (business_name, outlet_number, facility_number) and updates in place, preserving id so measurement-device links in facility-measurement/facility-detail PUTs keep working.

- [ ] **BUG-013** [버그 / 수정위험도:높음] Collection-level air-permits API (list/create) has no authentication and exposes business PII
  - 위치: `app/api/air-permits/route.ts:13-167`
  - GET/POST are wrapped in withApiHandler without requiresAuth, verifyToken is imported but never called, and the code comments admit auth was intentionally removed. (evidence: Line 5 imports `verifyToken` from '@/utils/auth' but it is never invoked anywhere in the file. Line 14…
  - 권장 조치: Re-enable the already-imported but unused `verifyToken` check (the '임시로 인증 체크 제거 (테스트용)' comment at line 14 confirms it was deliberately disabled) on both GET and POST, after confirming the admin UI already sends the auth token.

- [ ] **BUG-014** [버그 / 수정위험도:높음] Outlet gateway/VPN API is unauthenticated
  - 위치: `app/api/air-permits/outlets/[outletId]/route.ts:10-181`
  - GET/PUT/DELETE on discharge_outlets by outletId perform no auth check before reading or mutating gateway_number/vpn_type. (evidence: Read the full file: GET(10-52), PUT(55-129), DELETE(132-181) go straight from `params.outletId`/`request.json()` to…
  - 권장 조치: Add the same auth guard used in air-permit/update/route.ts to GET/PUT/DELETE in this outlet-gateway route before any gateway_number/vpn_type read or mutation is allowed.

- [ ] **BUG-015** [버그 / 수정위험도:높음] Gateway assignment is stored in two different, non-synchronized places
  - 위치: `app/api/air-permits/outlets/[outletId]/route.ts:54-129`
  - This route and components/sections/EnhancedFacilityInfoSection.tsx persist gateway info into discharge_outlets.gateway_number/vpn_type columns, while app/admin/air-permit-detail/page.tsx and app/admin/air-permit/page.tsx exclusively read/write outlet.additional_info.gateway, and…
  - 권장 조치: Pick one canonical location for gateway assignment (recommend additional_info.gateway, since both admin pages already read/write it), migrate any existing gateway_number/vpn_type data into it, and update EnhancedFacilityInfoSection.tsx to use the same field instead of the separate columns.

- [ ] **BUG-036** [버그 / 수정위험도:높음] 결재자 후보 API의 본인 제외 필터가 대표이사를 자기 문서 결재라인에서 영구히 선택 불가능하게 만듦
  - 위치: `app/api/approvals/approvers/route.ts:24-35`
  - GET /api/approvals/approvers가 `AND id != $1`을 모든 role(팀장/중역/부사장/대표이사)에 무차별 적용한다. 대표이사 select는 role과 무관하게 항상 노출되고 항상 필수(submit/route.ts 183-185줄)인데, 회사에 대표이사가 1명뿐인 구성에서 그 대표이사 본인이 작성자이면 자기 자신이 제외되어 ceoList가 빈 배열이 된다. (evidence: app/api/approvals/approvers/route.ts 24-35줄: `WHERE…
  - 권장 조치: This needs a product decision before coding: either auto-skip/auto-fill the ceo_id slot when the requester's own role is 'ceo' (mirroring how team_leader/executive/vice_president steps are already skipped for those roles), or change the approvers API's self-exclusion to not apply to the ceo role — get sign-off on the intended behavior first, since it currently blocks all CEO submissions.

- [ ] **BUG-041** [버그 / 수정위험도:높음] AS 매출관리(as-revenue)가 미등록 사업장의 delivery_date_override를 무시해 유상 건을 무상으로 계산
  - 위치: `app/api/as-revenue/route.ts:76-169, 341-356`
  - is_free/material_cost/material_revenue/revenue_adjustment/cost_adjustment CASE 식과 담당자 지급 집계 모두 ar.is_paid_override와 bi.delivery_date만 참조하고 ar.delivery_date_override는 전혀 사용하지 않는다. business_id가 없는 미등록 사업장 건에서 delivery_date_override를 과거 날짜로 입력해도 bi.delivery_date가 NULL이므로…
  - 권장 조치: Extract a single reusable SQL expression implementing the is_paid_override > delivery_date_override > bi.delivery_date precedence (already correct in as-records/route.ts L144-149) and use it consistently in place of every is_free/material_cost/material_revenue/adjustment CASE and the manager-pay aggregation in as-revenue/route.ts, then re-validate historical monthly totals against as-records before shipping since this changes previously-reported financial figures.

- [ ] **BUG-091** [버그 / 수정위험도:높음] 본마감 직접 처리(final/process) 시에도 예측마감 있는 사업장에서 전체금액(final)+차액(adjustment) 이중 생성
  - 위치: `app/api/installation-closing/final/process/route.ts:72-138`
  - 기존 pending final/adjustment 레코드가 없을 때(updatedCount===0) diff.final_breakdown의 전체 현재 금액으로 final 레코드를 새로 생성(94-122행)한 뒤, diff.forecast_total > 0 && diff.diff_total !== 0 이면 diff_details의 차액만큼 adjustment 레코드까지 추가로 생성한다(125-137행). 예측 100 + final 150(전액) + adjustment 50(차액) = 300만원이…
  - 권장 조치: Fix in lockstep with item 9 by reusing the same corrected diff-only insert logic (this route currently has no frontend caller, so ship the shared fix first and verify this endpoint against it rather than patching independently).

- [ ] **BUG-094** [버그 / 수정위험도:높음] 매출 재계산 API가 트랜잭션 없이 기존 계산 기록을 먼저 삭제한 뒤 재계산해, 실패 시 데이터가 영구 소실됨
  - 위치: `app/api/revenue/recalculate/route.ts:58-135, 184-221`
  - 개별 재계산(186-189행 DELETE → 200-221행 fetch 재계산)과 전체 재계산(59-62행 전체 DELETE → 94-135행 배치 재계산) 모두 삭제와 재계산이 트랜잭션으로 묶여있지 않다. calculateResult.success가 false면(215-220행, 113-114행) 이미 삭제된 revenue_calculations 행은 복구되지 않고 failedBusinesses 배열에만 기록된다(122-129행). (evidence: 59-62행: 전체 DELETE 먼저…
  - 권장 조치: Wrap each delete-then-recalculate unit (per-business and per-batch) in a single DB transaction via lib/supabase-direct.ts's transaction() helper so a failed recalculation rolls back the delete instead of leaving revenue_calculations rows permanently missing.

- [ ] **BUG-107** [버그 / 수정위험도:높음] PUT /api/meeting-minutes/business-issues/complete has no per-meeting access check before writing to other meetings
  - 위치: `app/api/meeting-minutes/business-issues/complete/route.ts:71-166`
  - This handler checks only getUserFromToken() (line 74), then fetches ALL non-archived '정기회의' rows system-wide (lines 93-97, no participant/organizer filter) and writes updated content to any matching row (lines 152-160). I confirmed this file never imports…
  - 권장 조치: Get a product decision on intended scope (should cascade-completion only touch meetings the caller can access, or is org-wide propagation by design for shared recurring issues?) before adding a canAccessMeetingMinute-based filter to the meetings this endpoint is allowed to update.

- [ ] **BUG-123** [버그 / 수정위험도:높음] "완료" (completed) task definition diverges between /api/weekly-reports and /api/weekly-reports/realtime
  - 위치: `app/api/weekly-reports/route.ts:208-221`
  - route.ts classifies completed as only status==='subsidy_payment' (lines 208-210) and explicitly buckets 'document_complete' into inProgressTasks (lines 213-216); generate-all/route.ts mirrors this. realtime/route.ts's isTaskCompleted() (lines 65-71) instead treats…
  - 권장 조치: Get a product decision on whether 'document_complete' should count as completed, then make isTaskCompleted/inProgress logic identical (ideally extracted into one shared helper) across route.ts, generate-all/route.ts, and realtime/route.ts so completion_rate never disagrees by page for the same user/week.

- [ ] **BUG-139** [버그 / 수정위험도:높음] Wiki 목차/서식 목록 페이지가 브라우저 anon 클라이언트로 조회하는데 RLS는 auth.role()='authenticated'를 요구해 항상 빈 결과
  - 위치: `app/dpf/wiki/page.tsx, app/dpf/wiki/forms/page.tsx:wiki/page.tsx 22-48 (loadTree), wiki/forms/page.tsx 31-42; RLS: supabase/migrations/20260424_create_dpf_tables.sql:360-361, 390-391`
  - 이 앱의 로그인은 app/api/auth/login/route.ts에서 bcryptjs+jsonwebtoken으로 employees 테이블을 직접 검증하는 자체 JWT 방식이며, 코드베이스 전체에서 supabase.auth.signInWithPassword 등 Supabase Auth 세션 발급/설정(setSession, setAuth) 호출이 전혀 없다(grep 결과 0건). lib/supabase.ts의 브라우저용 supabase 클라이언트는…
  - 권장 조치: Since the app uses a custom bcrypt/JWT login (not Supabase Auth sessions), don't try to satisfy the `auth.role()='authenticated'` RLS policies from the browser anon client — move wiki_nodes/form_templates reads behind a server-side API route that verifies the app's own JWT and queries with the service-role client, then update wiki/page.tsx and wiki/forms/page.tsx to call that route instead of querying Supabase directly; this is an architectural decision (RLS policy redesign vs. server-route indirection) best made alongside item 19 and the DPF auth gap in item 17.

- [ ] **BUG-140** [버그 / 수정위험도:높음] 서식 작성 페이지 차량정보 자동입력이 동일한 RLS 불일치로 항상 실패
  - 위치: `app/dpf/wiki/forms/[code]/page.tsx:109-120, 227-232`
  - loadData()가 브라우저 anon 클라이언트로 supabase.from('dpf_vehicles').select('*').eq('vin', vin).single()을 호출하지만(113행), dpf_vehicles_read RLS 정책(create_dpf_tables.sql 286-287행)이 auth.role()='authenticated'를 요구하므로 위와 동일한 이유로 항상 필터링되어 vehicle이 null로 남는다. 227-232행의 `hasTemplate && !vehicle`…
  - 권장 조치: Apply the same fix as item 18 to the vehicle auto-fill lookup in forms/[code]/page.tsx — move the dpf_vehicles read behind an authenticated server route rather than the anon browser client, since it hits the identical `auth.role()='authenticated'` RLS mismatch; implement together with item 18 to avoid solving the same architecture problem twice.

- [ ] **BUG-152** [버그 / 수정위험도:높음] AI-analyzed guideline content is published live immediately; the 'review_needed' workflow never actually gates or resolves
  - 위치: `app/api/wiki/upload-guideline/route.ts:177-263`
  - After Gemini analysis, the guideline_uploads row status is set to 'review_needed' (line 178), but createWikiNodes() is called unconditionally right after (line 186) and upserts every chapter with `is_published: true` (lines 218, 254) — content goes live before any human reviews…
  - 권장 조치: This needs a product decision: change the chapter/root upserts in upload-guideline/route.ts to `is_published: false` while status is 'review_needed', then add an approve/reject action in app/wiki/admin/page.tsx that flips nodes to is_published:true and the upload row to 'applied'/'rejected'.

- [ ] **BUG-182** [버그 / 수정위험도:높음] '대기' 설치 건이 기간지정(4w/8w) 뷰에서 집계 윈도우 밖으로 스킵되어 완료율이 부풀려짐
  - 위치: `app/api/dashboard/installations/route.ts:152-166`
  - installation_date가 없는 사업장은 project_year의 1월 1일을 fallbackDate로 삼아 집계 키를 계산한다(159-161행). 이 키가 aggregationData 맵에 없으면(163-166행) total/waiting 어느 쪽에도 반영되지 않고 조용히 스킵된다. 각 차트의 기본 periodPreset='8w'는 최근 약 8주 구간만 aggregationData 키로 만들어 두므로, project_year 1월 초 구간이 아닌 한 fallback 키는 항상 이 윈도우…
  - 권장 조치: Before touching app/api/dashboard/installations/route.ts L152-166, get a product decision on how installation_date-less '대기' sites should be represented in windowed views (e.g. an 'out-of-window' overflow bucket or making waiting totals period-independent) since this directly drives the displayed 완료율 KPI.

- [ ] **BUG-188** [버그 / 수정위험도:높음] 매출 API '최근 N개월' 기본 조회에서 setMonth() day-overflow로 월 버킷이 누락되어 해당 월 매출이 통째로 사라짐
  - 위치: `app/api/dashboard/revenue/route.ts:199-202,275`
  - 월 버킷 초기화 시 date.setMonth(date.getMonth()-i)가 오늘의 day-of-month를 유지한 채 월만 뺀다. 오늘이 29~31일이고 i개월 전 달이 그보다 짧으면(2월 등) JS Date가 다음 달로 롤오버되어 monthKey가 중복 생성되고, 원래 있어야 할 달의 키는 aggregationData Map에 전혀 생성되지 않는다. 실제 집계 단계(L275)는 `if (!aggregationData.has(aggregationKey)) continue;`로 그 달의…
  - 권장 조치: Fix the duplicated date.setMonth(date.getMonth()-i) day-overflow bug in revenue/route.ts L199-202 by normalizing to day 1 first (date.setDate(1); date.setMonth(...)), and land it together with the identical fixes for items 13 and 14 so the three financial/installation dashboards don't diverge mid-rollout; test explicitly with today = 29/30/31.

- [ ] **BUG-194** [버그 / 수정위험도:높음] 미수금 API '최근 N개월' 기본 조회에서 setMonth() day-overflow로 월 버킷 누락
  - 위치: `app/api/dashboard/receivables/route.ts:131-133,187`
  - revenue/route.ts와 동일한 패턴: date.setMonth(date.getMonth()-i)가 오늘의 day를 유지한 채 월만 감소시켜, 대상 월이 오늘의 day보다 짧으면 다음 달로 롤오버되어 그 달의 키가 Map에서 아예 빠진다. 이 파일은 asOf 스냅샷 방식이라, 해당 시점의 사업장은 애초에 버킷 자체가 순회 대상에서 빠지므로 그 시점의 미수금/회수금이 결과에서 통째로 누락된다. (evidence: receivables/route.ts L131-133: `const date…
  - 권장 조치: Apply the identical date.setDate(1) normalization fix as item 7 to receivables/route.ts L131-133 in the same change, since it's live financial data and the three duplicated instances (7/13/14) should not be fixed independently.

- [ ] **BUG-195** [버그 / 수정위험도:높음] 설치 현황 API '최근 N개월' 기본 조회에서 setMonth() day-overflow로 월 버킷 누락
  - 위치: `app/api/dashboard/installations/route.ts:131-133,163`
  - receivables/revenue와 동일한 코드 패턴이 존재한다. date.setMonth(date.getMonth()-i)가 day-overflow로 롤오버되면 해당 월 키가 aggregationData Map에서 빠지고, 148행 근처의 if (!aggregationData.has(aggregationKey)) return;에 걸려 그 달에 설치된 사업장(대기/진행중/완료 전체)이 차트와 요약 수치에서 사라진다. (evidence: installations/route.ts L131-133:…
  - 권장 조치: Apply the identical date.setDate(1) normalization fix to installations/route.ts L131-133 alongside items 7 and 13, and add a regression check asserting all 12 month buckets exist for a today=29/30/31 fixture.

- [ ] **BUG-225** [버그 / 수정위험도:높음] /api/departments and /api/departments/[id] compute employee counts and delete-guards from employees.department_id, while real department assignment writes employees.department (text)
  - 위치: `app/api/departments/route.ts:22-43`
  - GET builds employee_count/total_employees from an implicit `employees(id, name, email, role, is_active)` join keyed on department_id, and DELETE in departments/[id]/route.ts blocks deletion only if `employees.department_id = departmentId` finds active rows. The actual…
  - 권장 조치: Get a product decision on which field (department_id FK vs department text) is canonical, then either backfill department_id from department on employee writes or switch the count/delete-guard queries in both departments routes to key off the text column.

- [ ] **BUG-232** [버그 / 수정위험도:높음] 소셜 로그인 관리 페이지가 승인/정책 데이터를 전혀 조회하거나 처리하지 않음(전부 목업)
  - 위치: `app/admin/social-login/page.tsx:62-119`
  - loadData()는 어떤 API도 호출하지 않고 setApprovals([]); setPolicies([]);만 실행한다(주석: 'Mock data for now since API endpoints don't exist'). handleApprovalAction과 handleCreatePolicy도 실제 API 호출 없이 loadData()를 다시 부르고 alert만 띄운다. (evidence: 62-119행을 직접 읽음: loadData()의 fetch 호출이 전무하고 주석 그대로 목업…
  - 권장 조치: Treat this as an unbuilt feature: design and implement real approval/policy API endpoints and DB-backed state before wiring loadData/handleApprovalAction/handleCreatePolicy to them, since none exist today.

- [ ] **BUG-263** [버그 / 수정위험도:높음] commission-closing eligible의 미수금 계산이 receivables-engine과 발산 — extra 계산서 매출 반영 누락으로 미수금 과소평가
  - 위치: `app/api/commission-closing/eligible/route.ts:40-65`
  - computeReceivable()는 contractAmount = calculateContractAmount(row, officialPrices)만으로 기준매출을 계산하는데, 이 함수(19-37행)는 기기수량×고시가 + additional_cost - negotiation + revenue_adjustments만 반영하고 extra(추가) 계산서의 supply_amount는 전혀 더하지 않는다. 그런데 totalPayments(44-54행)에는…
  - 권장 조치: Replace the local `calculateContractAmount`/`computeReceivable` logic in eligible/route.ts with a call to the SSOT `computeBusinessReceivableNow` in lib/receivables-engine.ts so extra-invoice supply amounts are included on both the base-amount and payment side before this ships, since it currently zero-clamps understated receivables that gate 영업비 지급 보류.

- [ ] **BUG-299** [버그 / 수정위험도:높음] 첨부파일 signed-url 발급 API가 대상 문서에 대한 접근 권한을 검증하지 않아 임의 문서 폴더에 스토리지 업로드가 가능함
  - 위치: `app/api/approvals/attachments/signed-url/route.ts:30-61`
  - POST 핸들러는 인증 토큰만 검증하고(32-40줄), body의 documentId(56줄, `const folder = documentId || temp_${userId}`)에 대해 요청자가 작성자/결재선/총무팀인지 전혀 확인하지 않은 채 Supabase Storage signed upload URL을 발급한다(59-61줄). 로그인한 임의 직원이 다른 사람의 documentId를 넘기면 그 문서의 스토리지 폴더에 파일을 직접 업로드할 수 있다. 다만…
  - 권장 조치: Add an authorization check in the signed-url endpoint (verify requester ownership, step-approver status, or 총무팀/admin, with an explicit rule for not-yet-created `temp_` documents) before issuing the storage upload URL — needs a security/product decision since this endpoint is shared by every attachment upload across all document types.

- [ ] **MODULE-01** [모듈 선택 불일치 / 수정위험도:높음] Modal/dialog chrome is hand-rolled per domain instead of using components/ui/Modal
  - 위치: `components/ui/Modal.tsx`, `components/business/modals/BusinessDetailModal.tsx`, `components/business/InstallationBreakdownModal.tsx`, `app/admin/air-permit/page.tsx` 외 6곳
  - A canonical components/ui/Modal exists (isOpen/onClose, size presets, closeOnOverlayClick, showCloseButton, ModalActions.Cancel/Confirm, ConfirmModal helper) but the large majority of domains ignore it and hand-roll their own `fixed inset-0 ...` overlay + white panel, each…
  - 권장 조치: Standardize all overlay dialogs on components/ui/Modal (dpf is the working reference implementation). Migrate the hand-rolled overlays domain by domain, starting with the highest-traffic ones (business-core, tasks, approvals, order-management), and delete the duplicated `<style jsx>` keyframe blocks in subsidy in favor of Modal's built-in transition. This also fixes the missing ESC/backdrop-click/scroll-lock behavior in one place instead of N places.

- [ ] **MODULE-09** [모듈 선택 불일치 / 수정위험도:높음] Modal/dialog: canonical components/ui/Modal.tsx is bypassed by hand-rolled overlay divs in nearly every domain
  - 위치: `components/ui/Modal.tsx`, `components/business/modals/BusinessDetailModal.tsx`, `components/facility/ExportDialog.tsx`, `app/admin/tasks/page.tsx` 외 7곳
  - components/ui/Modal.tsx (with ModalActions and ConfirmModal) is the canonical modal, and it is used correctly in a handful of places (dpf's VehicleFormModal/SubRecordFormModal, revenue-closing's revenue/page.tsx and pricing/page.tsx, air-permit's permit-deletion ConfirmModal,…
  - 권장 조치: Standardize on components/ui/Modal.tsx (+ ModalActions, ConfirmModal) for every new/edit dialog and delete-confirmation across the app. Prioritize migrating the highest-traffic offenders first: approvals (all screens use native overlays), order-management (5 modals), and document-automation (delete the dead ConfirmModal import in page.tsx and actually wire it in, then convert the other 4 modals). Replace window.confirm()/window.alert() confirmation flows in meeting-minutes, dashboard, and as-management with ConfirmModal.

## 🟡 Medium (131건)

- [ ] **BUG-002** [버그 / 수정위험도:낮음] PUT /api/facility-tasks에서 스코프 밖 변수 참조로 ReferenceError, task_type 변경 시 메모 제목 동기화가 항상 조용히 실패
  - 위치: `app/api/facility-tasks/route.ts:865`
  - currentCategory is declared with const inside the block `if (task_type && TASK_TYPE_TO_PROGRESS[task_type]) {...}` (lines 829-861) and referenced again at line 865, which is outside that block (same level as the if-statement, still inside the outer try). Confirmed by directly…
  - 권장 조치: Hoist the currentCategory computation (declare with let) above the `if (task_type && TASK_TYPE_TO_PROGRESS[task_type])` block at line 829 so it's still in scope at line 865, then confirm with `npx tsc --noEmit`.

- [ ] **BUG-006** [버그 / 수정위험도:낮음] 측정기기 조회 API가 businessName→businessId 변환 시 is_deleted 필터 누락
  - 위치: `app/api/measurement-devices/route.ts:31-36`
  - When businessId is absent, GET resolves business_info by name via `.eq('business_name', businessName).single()` with no is_deleted filter, so a coexisting soft-deleted and active row with the same name causes `.single()` to error, and the handler falls back to returning an empty…
  - 권장 조치: Add `.eq('is_deleted', false)` to the business_info name lookup at line 32-36 before `.single()`.

- [ ] **BUG-010** [버그 / 수정위험도:낮음] 라우터 재고 목록 검색어에 콤마가 포함되면 PostgREST .or() 필터 구문이 깨짐
  - 위치: `app/api/router-inventory/route.ts:94-106`
  - The `search` query param is interpolated unescaped directly into a PostgREST `.or()` filter string. Since PostgREST's or-filter syntax uses comma as the condition separator, a search value containing a comma (e.g. part of a serial number or business name) splits the filter into…
  - 권장 조치: Strip/escape commas (and other PostgREST-reserved characters) from `search` before interpolating it into the `.or()` filter string at both call sites in this handler.

- [ ] **BUG-022** [버그 / 수정위험도:낮음] Creating a permit for a business other than the one currently open desyncs the detail panel
  - 위치: `app/admin/air-permit/page.tsx:738-767, 861-950, 1143`
  - openAddModal never locks the modal's business selection to the currently open business, and the post-create refresh reloads permits for whichever business was picked inside the modal — leaving the header showing one business while the list underneath shows another's permits.…
  - 권장 조치: In openAddModal, pre-fill and lock business_id/business_name to the currently open selectedBusiness (or disable business switching in the create modal), and refresh the header/business context after handleCreatePermit succeeds so it stays consistent with the reloaded permit list.

- [ ] **BUG-023** [버그 / 수정위험도:낮음] Custom DateInput accepts invalid dates like day/month '00' as 'complete' and submits them
  - 위치: `app/admin/air-permit/page.tsx:94-161`
  - isCompleteDate only checks string length; handleMonthChange/handleDayChange clamp only the upper bound, never rejecting 0, so a date like '2024-00-00' is accepted as complete and sent to the server, which fails the INSERT with only a generic error. (evidence: Line 94-96:…
  - 권장 조치: In DateInput's handleMonthChange/handleDayChange, reject numVal === 0 (not just >12/>31) before padding, since DateInput is defined locally in app/admin/air-permit/page.tsx and used nowhere else, so the fix is fully contained to this one file.

- [ ] **BUG-033** [버그 / 수정위험도:낮음] 전자결재 공용 DOC_TYPE_LABEL에 commission_closing(영업비마감) 매핑 누락
  - 위치: `components/approvals/ApprovalStatusBadge.tsx:31-40`
  - 이 컴포넌트가 export하는 DOC_TYPE_LABEL은 목록 페이지의 유형 배지/필터, 상세 페이지의 타이틀·결재라인 헤더 문서명에 공통 사용되는데 commission_closing이 빠져 있다. 반면 백엔드 4개 라우트(submit/reject/approve/express-approve)의 DOC_TYPE_LABEL에는 모두 포함되어 있다. (evidence: components/approvals/ApprovalStatusBadge.tsx 31-40줄에 expense_claim부터…
  - 권장 조치: Add `commission_closing: '영업비마감'` to DOC_TYPE_LABEL in components/approvals/ApprovalStatusBadge.tsx, matching the entry already present in the four backend route files.

- [ ] **BUG-045** [버그 / 수정위험도:낮음] AS건 수정 저장 시 굴뚝번호(chimney_number)가 매번 null로 초기화됨
  - 위치: `app/api/as-records/[id]/route.ts:142, 177, 200`
  - PATCH 핸들러는 chimney_number = $14로 직접 대입하며(COALESCE 없음) 바인딩 값은 chimney_number !== undefined ? (chimney_number || null) : null이다. AsRecordModal.tsx에는 굴뚝번호 입력 UI가 없고 handleSave()의 payload에도 chimney_number 키가 전혀 없으므로, 모달을 통한 모든 저장 요청은 이 필드가 undefined로 도착해 항상 null로 덮어써진다. 엑셀 업로드로 저장된…
  - 권장 조치: Change line 177 to `chimney_number = COALESCE($14, chimney_number)`, matching the pattern already used for status/dispatch_count/manufacturer in the same UPDATE, so an omitted field from the modal preserves the existing value instead of nulling it.

- [ ] **BUG-047** [버그 / 수정위험도:낮음] AS 매출관리 상세 모달의 '총 원가' 컬럼이 매입 조정만 제외해 '총 매출'과 비대칭적으로 계산됨
  - 위치: `app/admin/as-management/revenue/page.tsx:254-255`
  - 건별 내역 표에서 '총 매출' 셀은 revenue_adjustment가 이미 합산된 rec.total_revenue를 그대로 표시하지만, 바로 옆 '총 원가' 셀은 rec.total_cost - rec.cost_adjustment로 매입 조정을 다시 빼서 표시한다. 매출 쪽은 조정 포함, 원가 쪽은 조정 제외라는 비대칭 계산이며, 표시된 순이익(rec.profit)과 정확히 cost_adjustment 금액만큼 검산이 어긋난다. (evidence: revenue/page.tsx:254…
  - 권장 조치: Change the '총 원가' cell (revenue/page.tsx L255) from `rec.total_cost - rec.cost_adjustment` to `rec.total_cost` so it mirrors the '총 매출' cell's adjustment-inclusive treatment and reconciles with rec.profit; confirm with whoever owns AS accounting which side (cost or revenue) should include adjustments before picking the fix.

- [ ] **BUG-048** [버그 / 수정위험도:낮음] AS 매출관리 상세 모달의 '순이익 − 담당자 지급 합계 = 회사 실수익' 표시가 실제 계산식과 불일치
  - 위치: `app/admin/as-management/revenue/page.tsx:198-221, 662`
  - 화면은 '순이익' 아래 '−담당자 지급'을 표시하고 구분선 뒤 '회사 실수익'을 보여줘 순이익−담당자지급=회사실수익으로 읽히도록 구성돼 있으나(662행 캡션도 동일 문구), 실제 net_profit은 profit - incentive_pay만 계산하고 dispatch_pay는 다시 빼지 않는다(이미 profit에 원가로 반영돼 있다는 설계 의도). 화면에 보이는 두 숫자(순이익, 담당자지급)를 그대로 빼면 표시된 회사 실수익과 dispatch_pay 금액만큼 차이가 난다. (evidence:…
  - 권장 조치: Fix the display/caption (revenue/page.tsx L198-221, 662) rather than the formula: since as-revenue/route.ts intentionally does not re-subtract dispatch_pay (it's already embedded in cost), relabel the row so it reads '순이익 − 인센티브 지급 = 회사 실수익' and show dispatch_pay as a separate informational line rather than implying it's subtracted in the same equation.

- [ ] **BUG-062** [버그 / 수정위험도:낮음] 발주 단계 완료일 입력에서 존재하지 않는 날짜(2월 30일 등)가 JS Date 롤오버 때문에 클라이언트 검증을 통과함
  - 위치: `app/admin/order-management/components/OrderDetailModal.tsx:132-168, 171-225`
  - handleDateFieldChange/handleDateFieldBlur 모두 `new Date(`${year}-${month}-${day}`)`를 만든 뒤 `!isNaN(date.getTime())`로만 유효성을 판단한다. node로 직접 검증한 결과 new Date('2024-02-30')는 3월 1일로 롤오버되어 유효한 Date를 반환하므로(반면 월=13처럼 범위를 벗어나면 정상적으로 Invalid Date가 됨), 사용자가 연=2024/월=02/일=30을 입력하면 경고 없이 초록 체크로…
  - 권장 조치: In both handleDateFieldChange and handleDateFieldBlur, after constructing the Date, verify date.getFullYear()/getMonth()+1/getDate() equal the parsed year/month/day (or use a daysInMonth(year,month) check) so a rollover like Feb 30 is rejected instead of silently accepted.

- [ ] **BUG-069** [버그 / 수정위험도:낮음] 착공신고서 계약서(지자체 제출용)에서 제4조 계약이행보증보험 비율이 사용자가 선택한 값과 무관하게 '10%'로 하드코딩됨
  - 위치: `app/admin/document-automation/components/construction-report/ContractGovernmentTemplate.tsx:236-244`
  - 제4조(239행)는 '10%의 비율로 정한다'는 고정 문자열이며 data.contract_bond_rate를 참조하지 않는다. 바로 아래 제5조(251행)는 `{data.contract_bond_rate || '5'}%`로 동적 출력한다. ConstructionReportManagement.tsx의 폼(1016-1043행)에서 5%/10% 토글로 contract_bond_rate를 선택할 수 있으므로, 5%를 선택해도 제4조는 항상 10%로 표시되어 같은 문서 내에서 제4조와 제5조가 서로 다른…
  - 권장 조치: Change the hardcoded '10%의 비율로 정한다' text at line 239 to interpolate {data.contract_bond_rate || '10'}% the same way line 251 (제5조) already does, so 제4조 and 제5조 stay consistent with the user's selected bond rate.

- [ ] **BUG-075** [버그 / 수정위험도:낮음] 사업장 보관용 계약서(ContractBusinessTemplate) 제4조 계약이행보증보험 비율도 사용자가 선택한 값과 무관하게 10%로 하드코딩됨
  - 위치: `app/admin/document-automation/components/construction-report/ContractBusinessTemplate.tsx:286-293`
  - 제4조(290-292행)는 '10%의 비율로 정한다' 고정 문자열이며 data.contract_bond_rate를 참조하지 않는다. 바로 아래 제5조(300행)는 `{data.contract_bond_rate || '5'}%`로 사용자가 선택한 비율을 반영한다. ContractGovernmentTemplate.tsx(지자체 제출용)와 동일한 결함이 사업장 보관용 계약서에도 별도로 존재한다. (evidence: ContractBusinessTemplate.tsx 289-292행 '10%의 비율로…
  - 권장 조치: Same fix as item 8 but in ContractBusinessTemplate.tsx: change the hardcoded '10%의 비율로 정한다' at line ~291 to interpolate {data.contract_bond_rate || '10'}%, consistent with 제5조 at line 300; fix both templates together since they share the same root cause.

- [ ] **BUG-077** [버그 / 수정위험도:낮음] 계약서 템플릿 편집기에서 보조금/자비 템플릿을 빠르게 전환하면 stale 응답이 다른 유형의 폼을 덮어쓸 수 있음
  - 위치: `app/admin/document-automation/components/ContractTemplateEditor.tsx:41-72`
  - loadTemplate()은 [isOpen, contractType]이 바뀔 때마다 useEffect로 재호출되지만 이전 요청 취소(AbortController)나 응답이 최신 요청인지 검증하는 가드가 없다. ContractManagement.tsx에서 이 컴포넌트는 조건부 마운트가 아니라 항상 마운트된 채 isOpen/contractType props만 바뀌므로(776-784행), 보조금 편집을 열었다가 닫고 곧바로 자비 편집을 열면 두 fetch가 인플라이트로 공존할 수 있다. 응답 순서가…
  - 권장 조치: Add an AbortController (or a request-id/ref guard) in ContractTemplateEditor's loadTemplate effect so a stale fetch response for the previous contractType is discarded if a newer request has since started, before setTemplate/setFormData run.

- [ ] **BUG-081** [버그 / 수정위험도:낮음] AI verification summary card is permanently hidden due to API/frontend field-name mismatch
  - 위치: `app/api/subsidy-crawler/runs/[runId]/route.ts:79-86`
  - GET's aiSummary object uses keys total_verifications, ai_verified_count, disagreement_count, agreement_rate. app/admin/subsidy/monitoring/[runId]/page.tsx declares a completely different shape (total_verified, ai_relevant, ai_irrelevant, keyword_only_match, ai_only_match,…
  - 권장 조치: Change page.tsx's ai_verification_summary type and the L183 gate to match the API's actual keys (total_verifications, ai_verified_count, disagreement_count, agreement_rate) instead of the never-present total_verified/ai_relevant fields.

- [ ] **BUG-084** [버그 / 수정위험도:낮음] Main crawler increments relevant_announcements for every saved record, ignoring Gemini's is_relevant verdict
  - 위치: `app/api/subsidy-crawler/route.ts:638-646,700-711`
  - In the GOVERNMENT_SOURCES loop, after upserting a row the code does `if (!error) { results.new_announcements++; results.relevant_announcements++; }` unconditionally, never checking `analysisResult.is_relevant` even though that value is computed and stored on the row moments…
  - 권장 조치: Guard both relevant_announcements++ sites (main GOVERNMENT_SOURCES loop and crawlPhase2SourceWithRetry/savedCount) with `if (analysisResult.is_relevant)` so the counter reflects Gemini's actual verdict instead of every successful save.

- [ ] **BUG-085** [버그 / 수정위험도:낮음] URL health statistics and pagination total are computed from the paginated page, not the full dataset
  - 위치: `app/api/subsidy-crawler/url-health/route.ts:30-77`
  - GET builds the query with `.range(offset, offset+limit-1)` (limit defaults to 50) without `{count: 'exact'}`, then derives all stats fields and `pagination.total` from `healthMetrics.length`/filtered lengths — i.e., from at most `limit` rows, not the true row count. The frontend…
  - 권장 조치: Add `{count: 'exact'}` to the Supabase query in url-health/route.ts and use the returned count for pagination.total and the aggregate stats instead of healthMetrics.length, which only reflects the current page.

- [ ] **BUG-087** [버그 / 수정위험도:낮음] crawlGGEEA() computes a keyword-relevance flag but never applies it, letting all announcements through unfiltered
  - 위치: `app/api/subsidy-crawler/route.ts:1206-1211`
  - Inside crawlGGEEA(), the loop computes `hasKeyword = keywords.some(...)` (line 1208) right after a comment about keyword filtering, but the following `if (id && title.length > 5 && !items.find(...))` (line 1210) that gates the push into `items` never references hasKeyword — the…
  - 권장 조치: Add `&& isRelevantTitle(title)` to the item-push condition in crawlGGEEA (line 1210), matching the same gate already used by the other 8 Phase-2 crawler functions.

- [ ] **BUG-088** [버그 / 수정위험도:낮음] saveAnnouncements() counts duplicate/already-saved announcements toward relevant_count before checking for duplicates
  - 위치: `app/api/subsidy-crawler/direct/route.ts:274-299`
  - For each crawled announcement, the code runs Gemini analysis and does `if (isRelevant) relevantCount++` (lines 283-288) BEFORE querying for an existing row with the same source_url and `continue`ing past the insert if found (lines 290-298). Since the direct-URL crawler re-runs…
  - 권장 조치: Move the source_url duplicate-check (and its `continue`) before the Gemini relevance analysis and relevantCount++ in saveAnnouncements, so duplicates are skipped before being counted (and before spending a Gemini call).

- [ ] **BUG-100** [버그 / 수정위험도:낮음] 송금건 매칭 상세 조회 API가 권한 레벨을 검증하지 않아 낮은 권한자도 사업장별 지급액 열람 가능
  - 위치: `app/api/installation-closing/transfers/[transferId]/payments/route.ts:12-38`
  - GET 핸들러는 토큰 유효성만 확인하고(17-25행) permissionLevel 체크가 없다. 형제 라우트 transfers/route.ts GET/POST, transfers/[id]/reconcile PUT은 모두 permissionLevel < 3을 요구한다. 결과적으로 권한 레벨 1~2 직원도 유효 토큰만 있으면 특정 송금건에 매칭된 사업장명, 영업점, 실지급액을 조회할 수 있다. (evidence: transfers/[transferId]/payments/route.ts 17-27행에…
  - 권장 조치: Add the same `permissionLevel < 3` check used in transfers/route.ts and transfers/[id]/reconcile to GET /api/installation-closing/transfers/[transferId]/payments.

- [ ] **BUG-110** [버그 / 수정위험도:낮음] GET /api/meeting-templates/[id] has no privacy check despite claiming RLS handles it
  - 위치: `app/api/meeting-templates/[id]/route.ts:81-93`
  - The comment at line 81 claims '템플릿 조회 (RLS로 권한 자동 체크)' (access auto-checked via RLS), but the query uses the service-role Supabase client created at module scope (line 13: `createClient(supabaseUrl, supabaseServiceKey)`), which bypasses RLS entirely. There is no…
  - 권장 조치: After fetching the template in meeting-templates/[id]/route.ts GET, add an explicit `if (!template.is_public && template.created_by !== user.id) return 404` check since the service-role client bypasses RLS.

- [ ] **BUG-111** [버그 / 수정위험도:낮음] PUT /api/meeting-minutes/[id] spreads the raw request body into the update with no field whitelist
  - 위치: `app/api/meeting-minutes/[id]/route.ts:164-167`
  - `const updateData: any = { ...body, updated_by: user.id }` spreads the entire parsed JSON body verbatim into the Supabase update. Unlike POST /api/meeting-minutes (field-by-field construction, per the sibling file pattern) and the /sections PATCH endpoint (which whitelists…
  - 권장 조치: Replace `{ ...body, updated_by: user.id }` in meeting-minutes/[id]/route.ts PUT with an explicit field allowlist (title, meeting_date, meeting_type, location, etc.); no frontend currently calls this PUT endpoint so the change is safe to make immediately.

- [ ] **BUG-112** [버그 / 수정위험도:낮음] Imported recurring business issues get a new random id, breaking already-added de-duplication and allowing duplicate imports
  - 위치: `components/admin/meeting-minutes/RecurringIssuesPanel.tsx:122-136, 162-176`
  - handleAddAllToMeeting (100-142) and handleAddToMeeting (144-178) build the new BusinessIssue with `id: crypto.randomUUID()` (lines 123, 164) instead of reusing the original recurring issue's id, in contrast to the agenda_item branch which correctly reuses `id: issue.id` (lines…
  - 권장 조치: In RecurringIssuesPanel.tsx, set `id: issue.id` (not crypto.randomUUID()) when building the imported BusinessIssue in both handleAddAllToMeeting and handleAddToMeeting, matching the existing agenda_item branch.

- [ ] **BUG-113** [버그 / 수정위험도:낮음] BusinessIssueCard ignores the response of the cross-meeting completion PUT, silently swallowing failures
  - 위치: `app/admin/meeting-minutes/[id]/page.tsx:617-654`
  - In BusinessIssueCard.handleToggle, after the per-meeting PATCH succeeds, marking an issue complete fires `await fetch('/api/meeting-minutes/business-issues/complete', {method: 'PUT', ...})` (lines 635-643) but the response is never read (no .json(), no .ok/.success check), and…
  - 권장 조치: In BusinessIssueCard.handleToggle, check response.ok/result.success on the business-issues/complete PUT and surface an error (or revert the toggle) if it fails, instead of unconditionally calling onToggle.

- [ ] **BUG-114** [버그 / 수정위험도:낮음] GET /api/meeting-minutes/recurring-issues parses limit/offset but never applies them
  - 위치: `app/api/meeting-minutes/recurring-issues/route.ts:83-84, 88-102, 194-233`
  - limit and offset are parsed from query params (lines 83-84) and echoed back in the JSON response (lines 230-231), but neither is passed to the Supabase query (no .range()/.limit() call anywhere in the query builder at lines 88-102) nor used to slice uniqueIssues/groupedIssues…
  - 권장 조치: Apply the already-parsed limit/offset to the query (or slice groupedIssues/uniqueIssues) in recurring-issues/route.ts before returning the response, so the ?limit=100 the panel sends is actually honored.

- [ ] **BUG-115** [버그 / 수정위험도:낮음] PresentationMode's generateSummary treats a failed PATCH as a successful save
  - 위치: `components/meeting-minutes/PresentationMode.tsx:583-605`
  - generateSummary awaits the PATCH fetch (lines 595-599) then unconditionally calls setLocalSummary(summary) and setGenerated(true) (600-601) inside the try block, with no check of response.ok or any success field in a parsed body. fetch() only rejects on network failure, not on…
  - 권장 조치: In PresentationMode.tsx generateSummary, check response.ok before calling setLocalSummary/setGenerated and show an error state on failure.

- [ ] **BUG-116** [버그 / 수정위험도:낮음] PresentationMode's saveComment (debounced autosave) has no error handling
  - 위치: `components/meeting-minutes/PresentationMode.tsx:564-575`
  - saveComment wraps its PATCH fetch in try { ... } finally { setSavingId(null) } (lines 565-574) with no catch clause and no check of response.ok. If the request fails (offline, agenda item deleted concurrently, transient 500), the rejection is unhandled beyond a console warning,…
  - 권장 조치: Add a catch clause and response.ok check to saveComment in PresentationMode.tsx and surface a 'save failed' indicator instead of silently treating the request as saved.

- [ ] **BUG-121** [버그 / 수정위험도:낮음] Edit page's new business issues are marked dirty with the same key as edits, and handleSave has no 'business-add' emission path
  - 위치: `app/admin/meeting-minutes/[id]/edit/page.tsx:412-424, 532-536`
  - handleAddBusinessIssue marks a new issue dirty via `markDirty(\`business-${newIssue.id}\`)` (line 423) — the identical key format used for edits to existing issues — instead of a distinct key, unlike handleAddAgenda which correctly uses `agenda-add-${newItem.id}` (line 375),…
  - 권장 조치: In edit/page.tsx use a distinct key like `business-add-${newIssue.id}` (mirroring handleAddAgenda's `agenda-add-${id}` pattern), track new-issue ids in a separate Set, add a 'business-add' emission loop in handleSave, and add an else branch in sections/route.ts's bulk 'business' case to push the new issue when idx===-1; since the add UI isn't wired up yet this is currently unreachable, so ship the fix without urgency but before exposing the add controls.

- [ ] **BUG-125** [버그 / 수정위험도:낮음] Clearing the search/assignee filter (X button) re-fetches with the stale (pre-clear) filter value
  - 위치: `app/admin/weekly-reports/admin/page.tsx:162-206, 277, 295`
  - fetchRealtimeReports (line 162) is a plain const redefined every render, closing over that render's searchQuery/assigneeFilter. The clear buttons (lines 277, 295) do `onClick={() => { setSearchQuery(''); setTimeout(fetchRealtimeReports, 0) }}`. The `fetchRealtimeReports`…
  - 권장 조치: Replace the `setTimeout(fetchRealtimeReports, 0)` calls with a fetch that takes the cleared value as an explicit argument (e.g. `fetchRealtimeReports({ search: '' })`) or drive the fetch from a useEffect keyed on searchQuery/assigneeFilter so it always runs against the just-committed state.

- [ ] **BUG-126** [버그 / 수정위험도:낮음] Default "this week" date computed via toISOString() shifts by one day during early-morning KST hours
  - 위치: `app/weekly-reports/page.tsx:72-80`
  - `const today = new Date(); ...; const monday = new Date(today.setDate(diff)); setSelectedWeek(monday.toISOString().split('T')[0])`. setDate/getDay operate in the browser's local (KST) time, but toISOString() converts to UTC before truncating to the date part. Between local 00:00…
  - 권장 조치: Replace `monday.toISOString().split('T')[0]` with a local-date formatter (e.g. manually build `${y}-${m}-${d}` from getFullYear/getMonth/getDate, or a date-fns `format`) so the default week doesn't roll back a day during 00:00-08:59 KST.

- [ ] **BUG-130** [버그 / 수정위험도:낮음] Search query filter is not applied to tasks discovered via task_status_history, polluting search results
  - 위치: `app/api/weekly-reports/realtime/route.ts:142-172, 188-208`
  - searchCondition/$3 (title/business_name/description ILIKE) is built and applied only to the first `tasks` query (lines 142-157). The statusHistories query (lines 161-172) has no search filter at all, and any task_id found there that isn't already in taskIds is unconditionally…
  - 권장 조치: Apply the same searchCondition/ILIKE filter to the statusHistories query (or filter the merged task list by the search term before pushing back-filled entries) so unrelated tasks that only had a stage change this week don't leak into search results.

- [ ] **BUG-133** [버그 / 수정위험도:낮음] POST /api/weekly-reports reports email_sent:true even though no email is ever actually sent
  - 위치: `app/api/weekly-reports/route.ts:416-429`
  - When sendEmail && recipients.length > 0, the handler builds `emailContent = generateEmailContent(weeklyReport)` and does nothing else with it — only a comment '// 여기에 실제 이메일 발송 로직 구현' remains, no send call exists. The response still returns `email_sent: sendEmail &&…
  - 권장 조치: Either implement the actual email-sending call using the already-built emailContent, or until that's done, always return `email_sent: false` with a clear 'not implemented' note in the response instead of echoing back the request flag as if it succeeded; no live caller currently sets sendEmail=true, so this is safe to fix without urgency.

- [ ] **BUG-134** [버그 / 수정위험도:낮음] Default "this week" date via toISOString() shifts to the wrong week during early-morning KST hours — duplicated in two more files
  - 위치: `app/admin/weekly-reports/admin/page.tsx:145-158`
  - The same root-cause pattern reported for app/weekly-reports/page.tsx is independently re-implemented here (`const monday = new Date(today.setDate(diff)); setSelectedWeek(monday.toISOString().split('T')[0])`) and again in app/admin/weekly-reports/[userId]/page.tsx:152-156 with…
  - 권장 조치: Apply the same local-date-formatting fix as item 5 to app/admin/weekly-reports/admin/page.tsx and app/admin/weekly-reports/[userId]/page.tsx's Sunday variant; consider extracting a single shared `getLocalDateString(date)` helper used by all three files to prevent future re-duplication of this bug.

- [ ] **BUG-155** [버그 / 수정위험도:낮음] Wiki search breaks (500 error) whenever the query contains a comma
  - 위치: `app/api/wiki/search/route.ts:19-23`
  - The query is interpolated unescaped into a PostgREST `.or()` filter string: `.or(`title.ilike.%${query}%,content_md.ilike.%${query}%`)`. PostgREST's `.or()` syntax uses top-level commas to separate `column.operator.value` conditions; a comma inside the user's own search text…
  - 권장 조치: Apply the same comma/parenthesis-escaping fix as item 3 to the `.or()` filter string built from `query` in app/api/wiki/search/route.ts.

- [ ] **BUG-156** [버그 / 수정위험도:낮음] Print button (인쇄) produces a blank page in the App Router app
  - 위치: `app/wiki/forms/[code]/page.tsx:289-303`
  - The print stylesheet's first rule is `body > *:not(#__next) { display: none !important; }`, a leftover Pages-Router selector. This is an App Router project (app/ directory); repo-wide grep shows no element with id `__next` anywhere except this file and its app/dpf/wiki sibling.…
  - 권장 조치: Replace the leftover Pages-Router `body > *:not(#__next) { display: none !important; }` print rule with an App-Router-correct one, e.g. hide `body > *` except the element wrapping `#form-print-area`, and verify by actually printing the page in-browser after the change.

- [ ] **BUG-157** [버그 / 수정위험도:낮음] Upload-status polling stops after the first check and never restarts for a newly started upload
  - 위치: `app/wiki/admin/page.tsx:28-39`
  - The mount-only useEffect starts a 5s poll of /api/wiki/guideline-uploads but self-clears the interval the first time it sees no row with status 'analyzing' (lines 34-36). If the admin page loads with nothing currently analyzing (the common case), the interval is torn down ~5s…
  - 권장 조치: Extract the 5s polling logic into a function callable both from the mount useEffect and from handleUpload (after it sets a row to 'analyzing'), so the interval re-arms whenever a new upload starts instead of only running once at mount.

- [ ] **BUG-162** [버그 / 수정위험도:낮음] Wiki sidebar search ignores the selected domain filter, leaking cross-domain results
  - 위치: `app/api/wiki/search/route.ts:9-27`
  - The frontend appends a `domain` query param to the search request whenever a non-'all' tab is selected, but GET /api/wiki/search only reads `q` and `type` from searchParams (lines 12-13) — `domain` is never read or applied to the query, so results are never scoped by domain…
  - 권장 조치: Read `domain = searchParams.get('domain')` in the search route and add `.eq('domain', domain)` (when not 'all') to the Supabase query alongside the existing q/type filters.

- [ ] **BUG-163** [버그 / 수정위험도:낮음] GET /api/wiki/guideline-uploads has no authentication, exposing internal AI analysis summaries and document URLs
  - 위치: `app/api/wiki/guideline-uploads/route.ts:8-17`
  - The GET handler returns the last 20 guideline_uploads rows (version_label, status, diff_summary, wiki_changes, file_url, domain) with no auth check, in contrast to the sibling DELETE handler in [id]/route.ts which correctly requires a level-4 JWT. (evidence:…
  - 권장 조치: Copy the jwt.verify + permission_level>=4 check from guideline-uploads/[id]/route.ts's DELETE handler into this GET handler before it queries guideline_uploads.

- [ ] **BUG-166** [버그 / 수정위험도:낮음] WikiContent 마크다운 변환기가 리스트를 ul/ol로 감싸지 않고 <br/>로 분리된 고아 <li>를 생성
  - 위치: `components/wiki/WikiContent.tsx:13-23`
  - '- item'과 '1. item' 라인을 각각 <li> 태그로 치환하지만 <ul>/<ol> 래핑 후처리가 없다. 이어서 남은 단일 개행이 모두 <br/>로 치환되고 전체가 <p>로 감싸진다. 업로드-지침 분석 결과의 key_points 섹션('### 핵심 포인트\n- ...' 형태, upload-guideline/route.ts 239-240행에서 생성)이 렌더링되면 <li>가 <p> 안에 위치하는 무효 마크업이 되어 브라우저가 <p>를 암묵적으로 닫고, <ul>/<ol> 부모 부재로…
  - 권장 조치: In the markdown converter, after the per-line <li> replacements, wrap consecutive <li> runs in <ul>/<ol> (e.g. via a regex pass grouping adjacent `<li ...>...</li>` lines) before the paragraph/<br/> replacement steps run, so lists never end up as orphaned <li> inside <p>.

- [ ] **BUG-170** [버그 / 수정위험도:낮음] "Delete all notifications" endpoint always operates on a hardcoded demo-user, silently no-oping for real users
  - 위치: `app/api/notifications/delete-all/route.ts:4-12`
  - getUserFromToken() in this file ignores the Authorization header entirely and always returns `{id:'demo-user', name:'데모 사용자', email:'demo@example.com'}` (comment: "임시 인증 우회"). Both DELETE and POST handlers then filter `.eq('user_id', user.id)` against `user_id:'demo-user'`,…
  - 권장 조치: Replace the hardcoded demo-user getUserFromToken() stub in delete-all/route.ts with a real jwt.verify-based implementation (same pattern as settings/route.ts) so DELETE/POST operate on the actual authenticated user's rows.

- [ ] **BUG-171** [버그 / 수정위험도:낮음] Task-notification read endpoint has no ownership check (IDOR)
  - 위치: `app/api/notifications/[id]/read/route.ts:70-121`
  - When the id has a `task-` prefix, the handler looks up and updates task_notifications filtered only by `.eq('id', notificationId)` (lines 72-76, 101-104) — there is no `.eq('user_id', user.id)` anywhere in this branch, unlike the non-task branch just below (lines 125-130) which…
  - 권장 조치: Add `.eq('user_id', user.id)` to both the task_notifications lookup (L72-76) and update (L101-104) in the task-prefixed branch, matching the ownership filter already applied in the non-task branch just below.

- [ ] **BUG-184** [버그 / 수정위험도:낮음] 서버 레이아웃 초기화 DEFAULT_LAYOUT에 monthly-leads 위젯 누락으로 리셋 직후 위젯 사라짐
  - 위치: `app/api/dashboard/layout/route.ts:7-15`
  - 서버 DEFAULT_LAYOUT은 5개 위젯만 포함하고 'monthly-leads'가 빠져있다. handleResetLayout(app/admin/page.tsx L247-264)은 DELETE 응답의 result.data(서버 DEFAULT_LAYOUT)를 그대로 setLayout에 반영하므로, '기본값으로 초기화' 클릭 시 영업 인입 건 위젯이 즉시 사라진다. 새로고침 시에만 loadLayout의 병합 로직이 누락 위젯을 채워 다시 나타난다. (evidence: layout/route.ts…
  - 권장 조치: Add the missing monthly-leads entry to the server-side DEFAULT_LAYOUT array in app/api/dashboard/layout/route.ts L7-15 so it matches the 6-widget client DEFAULT_LAYOUT in admin/page.tsx L29-38.

- [ ] **BUG-186** [버그 / 수정위험도:낮음] 주간 브리핑 referenceDate가 toISOString() UTC 절단으로 자정~오전9시(KST) 사이 잘못된 주로 이동 가능
  - 위치: `components/dashboard/WeeklyScorecard.tsx:177-182`
  - referenceDate 계산이 d.toISOString().split('T')[0]을 사용해 로컬 Date를 UTC 날짜 문자열로 변환한다. KST 00:00~08:59 구간에는 계산된 날짜가 실제보다 하루 이르며, 이 값이 그대로 서버의 주 경계 계산에 전달되므로 주 경계 근처에서 '이전주' 이동 시 의도한 주가 아닌 그 전 주 데이터가 표시될 수 있다. (evidence: WeeklyScorecard.tsx L177-182: `const d = new Date();…
  - 권장 조치: Reuse the same KST-safe date helper from item 2's fix in WeeklyScorecard.tsx L177-182's referenceDate calculation instead of toISOString(), keeping week-boundary math consistent with the other dashboard widgets.

- [ ] **BUG-189** [버그 / 수정위험도:낮음] DashboardCustomizer가 layout prop을 useState 초기값으로만 받아, 저장된 실제 레이아웃 로드 후에도 위젯 목록이 동기화되지 않음
  - 위치: `components/dashboard/DashboardCustomizer.tsx:37`
  - useState<Widget[]>(layout.widgets)로 초기화되고 layout prop 변경을 반영하는 useEffect가 없다. admin/page.tsx에서 DashboardCustomizer는 auth 통과 직후(layout이 아직 DEFAULT_LAYOUT일 때) mount되고, loadLayout()의 실제 저장된 레이아웃은 이후 비동기로 도착해 layout prop만 갱신한다. 이미 마운트 시점에 내부 state가 고정되어, 사용자가 이전에 저장한 커스텀 레이아웃이…
  - 권장 조치: Add a useEffect(() => setWidgets(layout.widgets), [layout]) in DashboardCustomizer.tsx so the internal widgets state resyncs when the parent's async-loaded layout prop arrives after mount; fix together with item 11 in the same file.

- [ ] **BUG-192** [버그 / 수정위험도:낮음] DashboardCustomizer 드래그 정렬이 위젯 객체를 직접 mutate해 부모의 layout.widgets까지 오염시키고 '취소'해도 되돌아가지 않음
  - 위치: `components/dashboard/DashboardCustomizer.tsx:50-66,84-86`
  - handleDragOver는 배열만 얕은 복사([...widgets])하고 내부 Widget 객체는 부모 admin/page.tsx의 layout.widgets와 동일한 참조를 공유한다. 이어서 newWidgets.forEach(w => { w.order = i+1 })가 그 공유 객체를 직접 mutate한다. widgets state 초기값이 layout.widgets 그 자체(참조 공유, L37)이므로, 드래그만 하고 저장하지 않아도 부모의 layout.widgets 원소들의 order가…
  - 권장 조치: In DashboardCustomizer.tsx's handleDragOver (L54-62), build newWidgets via .map((w,i)=>({...w, order:i+1})) instead of mutating the shared widget objects in place, so an unsaved drag never leaks into the parent's layout.widgets reference; bundle with item 8's fix in the same file.

- [ ] **BUG-193** [버그 / 수정위험도:낮음] 영업 인입 차트 요약이 일별 집계 구간에서 '월평균'으로 잘못 표시됨
  - 위치: `components/dashboard/charts/MonthlyLeadsChart.tsx:526-528`
  - 요약 카드 라벨이 aggLevel === 'weekly' ? '주평균 인입' : '월평균 인입'으로 daily 레벨을 처리하지 않는다. FilterPanel 기간지정 모드로 7일 이하 범위(예: '오늘' 빠른 필터)를 선택하면 determineAggregationLevel이 'daily'를 반환하고, 서버(monthly-leads/route.ts L177)는 totalLeads / (months || finalData.length)로 실질적인 '일평균'을 계산하는데 UI는 이를 '월평균…
  - 권장 조치: Extend the ternary at MonthlyLeadsChart.tsx L526-528 to branch on aggLevel === 'daily' as well, showing '일평균 인입'/'건/일' for daily-aggregation periods -- purely a UI label fix, the underlying server-computed average is already correct.

- [ ] **BUG-196** [버그 / 수정위험도:낮음] 매출 API 평균 이익률이 적자(0% 이하) 월을 평균 계산에서 제외해 실제보다 낙관적으로 산출됨
  - 위치: `app/api/dashboard/revenue/route.ts:492,496-498`
  - validProfitRates = dataArray.filter(d => d.profitRate > 0) 이후 avgProfitRate를 이 부분집합의 평균으로 계산한다. profitRate가 0 이하(적자)인 달은 평균 계산에서 완전히 제외되므로, 적자 달이 있을수록 화면(RevenueChart 요약 카드)에 노출되는 '평균 이익률'이 실제 전체 평균보다 높게 표시된다. (evidence: revenue/route.ts L492: `const validProfitRates =…
  - 권장 조치: Get a quick product decision on whether loss months should count as their true negative rate rather than being excluded, then remove/adjust the `.filter(d => d.profitRate > 0)` at revenue/route.ts L492 accordingly -- isolated to one summary figure.

- [ ] **BUG-197** [버그 / 수정위험도:낮음] 미수금 API 평균 회수율이 회수금 0원인 기간을 평균 계산에서 제외해 실제보다 낙관적으로 산출됨
  - 위치: `app/api/dashboard/receivables/route.ts:254-257`
  - validCollectionRates = dataArray.filter(d => d.collectionRate > 0)로 필터링 후 평균을 낸다. 미수 잔액(outstanding)은 있지만 그 기간에 회수금이 전혀 없었던(collected=0) 버킷도 실질 데이터가 있는데 평균 계산에서 제외되어, revenue/route.ts의 avgProfitRate와 동일한 패턴으로 회수 부진 기간일수록 '평균 회수율'이 실제보다 낙관적으로 표시된다. (evidence: receivables/route.ts…
  - 권장 조치: Apply the same fix and same stakeholder decision as item 15 to receivables/route.ts L254-257's avgCollectionRate filter, so the two dashboards' averaging semantics stay consistent.

- [ ] **BUG-203** [버그 / 수정위험도:낮음] Google OAuth 'state' parameter received but never validated on the callback GET handler (login CSRF)
  - 위치: `app/api/auth/social/google/route.ts:260-264`
  - The GET handler reads `state` from the query string and only console.logs it with a comment admitting a real implementation would compare it to a session-stored value -- no such comparison exists. Combined with the route accepting `code` unconditionally, a classic OAuth…
  - 권장 조치: Store a random state value in an httpOnly cookie when the Google OAuth redirect is initiated and compare it to the callback's state query param before exchanging the code; contained to this route and no live UI currently drives the flow.

- [ ] **BUG-204** [버그 / 수정위험도:낮음] app/change-password page never sends the Authorization header the API requires
  - 위치: `app/change-password/page.tsx:48-59`
  - The fetch() call only sets Content-Type and sends {email, currentPassword, newPassword, confirmPassword} in the body -- no Authorization header. app/api/auth/change-password/route.ts:12-16 (getUserFromToken) only reads the authorization header, no cookie/body fallback, so it…
  - 권장 조치: Add an Authorization: Bearer header (read via TokenManager/localStorage) to the fetch call in app/change-password/page.tsx, mirroring the working pattern in app/admin/page.tsx:80-88 — single-file change on an already-nonfunctional page.

- [ ] **BUG-205** [버그 / 수정위험도:낮음] app/api/employees/[id]/route.ts GET/PUT/DELETE are unreachable due to verifyToken() return-shape mismatch
  - 위치: `app/api/employees/[id]/route.ts:24-27, 74-79, 211-217`
  - All three handlers do `const authResult = await verifyToken(token); if (!authResult.success) {...}`, but verifyToken imported from @/utils/auth (utils/auth.ts) is synchronous and returns either the raw decoded JWT payload or null -- never {success,data}. With a valid token,…
  - 권장 조치: Change the GET/PUT/DELETE handlers' `if (!authResult.success)` checks to `if (!authResult)` and use authResult directly, copying the already-correct pattern from app/api/employees/route.ts:21-24; confirmed dead code today (no frontend caller), so no live regression risk.

- [ ] **BUG-206** [버그 / 수정위험도:낮음] POST /api/employees has the identical verifyToken() shape mismatch
  - 위치: `app/api/employees/route.ts:105-116`
  - Same bug as the [id] route: `if (!authResult.success)` against a verifyToken() that returns the raw payload or null, so a valid admin token always yields a 401 that echoes the decoded token before reaching the insert logic. Grep found only GET usages of /api/employees in the…
  - 권장 조치: Apply the identical `if (!authResult)` fix to the POST handler in app/api/employees/route.ts:105-116, reusing the same pattern as the working GET handler in the same file; confirmed no live caller currently hits this path.

- [ ] **BUG-207** [버그 / 수정위험도:낮음] GET /api/auth/me primarily reads a cookie name ('auth_token') the standard login flow never sets
  - 위치: `app/api/auth/me/route.ts:14`
  - request.cookies.get('auth_token') is checked first; app/api/auth/login/route.ts:196 sets 'session_token' (plus 'auth_ready'), never 'auth_token'. The route does fall back to an Authorization header (lines 17-22), and in the one confirmed live caller (app/admin/page.tsx:80-88)…
  - 권장 조치: Have GET /api/auth/me additionally accept the 'session_token' cookie (in addition to the current 'auth_token' check and the working Authorization-header fallback) so the primary cookie check isn't silently dead for standard-login users; additive change, unlikely to disturb the header path that already works.

- [ ] **BUG-215** [버그 / 수정위험도:낮음] Google login popup calls a route with no POST handler, guaranteeing a 405 on every attempt
  - 위치: `app/api/auth/social/google/route.ts:231`
  - app/api/auth/social/google/callback/route.ts:63-69's popup script does `fetch('/api/auth/social/google', {method:'POST', body: JSON.stringify({code})})`, but app/api/auth/social/google/route.ts only exports a GET handler (confirmed via grep -- no `export async function POST` or…
  - 권장 조치: Add an `export async function POST` to app/api/auth/social/google/route.ts that performs the code exchange the popup callback already expects; no live UI currently opens this popup so there's nothing to regress.

- [ ] **BUG-216** [버그 / 수정위험도:낮음] Kakao GET-flow callback sets only a cookie name ('auth_token') the page-auth middleware doesn't recognize, redirecting successfully-logged-in users straight back to /login
  - 위치: `app/api/auth/social/kakao/callback/route.ts:270-283, 299-312`
  - After a successful Kakao exchange this callback sets only response.cookies.set('auth_token', jwtToken, {httpOnly:true,...}) and redirects to /admin. middleware.ts's checkPageAuthentication (lines ~185-215) only accepts 'session_token' or the JS-readable 'auth_ready' cookie for…
  - 권장 조치: Have the Kakao GET-flow callback also set a 'session_token' cookie (what middleware.ts actually checks) instead of only 'auth_token', matching app/api/auth/login/route.ts; isolated single file with no confirmed live caller of the entry point today.

- [ ] **BUG-223** [버그 / 수정위험도:낮음] Data-history restore confirmation renders two overlapping modals bound to the same state
  - 위치: `app/admin/data-history/page.tsx:599-666`
  - A hand-rolled `fixed inset-0` modal (lines 599-648, own textarea + '복구 실행' button calling handleRestore) and the reusable `<ConfirmModal isOpen={isRestoreModalOpen} onConfirm={handleRestore} .../>` (lines 650-666) both mount whenever isRestoreModalOpen && selectedHistoryItem is…
  - 권장 조치: Delete the hand-rolled fixed inset-0 modal block (lines 599-648) and keep only the <ConfirmModal> instance, wiring its textarea/reason input into ConfirmModal's props if needed.

- [ ] **BUG-226** [버그 / 수정위험도:낮음] Notification settings page skips AdminLayout, bypassing login redirect and department page restrictions
  - 위치: `app/admin/settings/notifications/page.tsx:1-473`
  - The page never imports AdminLayout or useAuth and renders its own root div directly. AdminLayout.tsx is where the real auth redirect (`router.push('/login?redirect=...')` at line 588 when !user) and DEPARTMENT_MENU_RESTRICTIONS enforcement (`router.replace(restrictedHrefs[0])`…
  - 권장 조치: Wrap the page's root content in <AdminLayout> and pull in useAuth like the other admin pages (data-history, users, social-login) so the login redirect and DEPARTMENT_MENU_RESTRICTIONS logic apply.

- [ ] **BUG-228** [버그 / 수정위험도:낮음] Social login admin page reads localStorage under the wrong key and redirects to a non-existent route
  - 위치: `app/admin/social-login/page.tsx:62-68`
  - loadData() calls `localStorage.getItem('auth-token')` (hyphen) while the shared TokenManager (lib/api-client.ts) stores the JWT under `'auth_token'` (underscore). Because the key never matches, `token` is always null and the function does `router.push('/admin/login')`, a route…
  - 권장 조치: Change the localStorage key from 'auth-token' to 'auth_token' (matching TokenManager.TOKEN_KEY) and redirect to '/login' instead of the nonexistent '/admin/login'.

- [ ] **BUG-233** [버그 / 수정위험도:낮음] 사용자 관리 페이지의 handleApprovalAction이 실패 시 아무 피드백 없이 조용히 종료
  - 위치: `app/admin/users/page.tsx:610-627`
  - handleApprovalAction은 response.ok일 때만 alert로 성공 메시지를 띄우고, response.ok가 false인 경우 else 분기나 throw가 없어 catch 블록으로도 넘어가지 않는다. (evidence: 함수 전체를 직접 읽음: `if (response.ok) { alert(...) }` 뒤에 else가 없고, catch는 네트워크 예외만 처리함을 확인.)
  - 권장 조치: Add an else branch to handleApprovalAction that surfaces the failure response via alert(), consistent with other handlers on this page.

- [ ] **BUG-234** [버그 / 수정위험도:낮음] handlePasswordReset이 서버가 success:false를 반환해도 조용히 아무 반응 없음
  - 위치: `app/admin/users/page.tsx:555-579`
  - handlePasswordReset은 response.ok가 true인 경우에만 data.success를 확인하고, data.success가 false인 케이스는 어떤 분기도 처리하지 않는다(모달을 닫지도, 오류 알림을 띄우지도 않음). response.ok가 false인 경우만 throw로 catch되어 alert가 뜬다. (evidence: 함수 전체를 직접 읽음: `if (response.ok) { ...; if (data.success) { 모달닫기+alert } }` 구조에서…
  - 권장 조치: Add explicit handling for the response.ok && !data.success case in handlePasswordReset (alert the failure reason, leave the modal open) instead of silently doing nothing.

- [ ] **BUG-237** [버그 / 수정위험도:낮음] 조건부로 구성된 담당자 조회 배열이 filter(Boolean) 이후 위치가 밀려 알림/히스토리 메타데이터가 잘못된 사람으로 기록됨
  - 위치: `app/api/organization/task-assignments/route.ts:38-44`
  - userQueries는 oldAssigneeId/newAssigneeId/changedBy가 존재하는 경우에만 순서대로 push되지만, `const [oldAssignee, newAssignee, changer] = userResults.map(r => r.data).filter(Boolean)`로 고정된 3개 위치에 구조분해 할당한다. change_type이 'assigned'인 가장 흔한 신규 배정 케이스(old_assignee_id 없음)에서는 userQueries가…
  - 권장 조치: Replace the fixed-position array destructuring with named lookups (e.g., build an object keyed by 'old'/'new'/'changer' or query conditionally by id) so results aren't misassigned when old_assignee_id is absent.

- [ ] **BUG-239** [버그 / 수정위험도:낮음] 소셜계정 연결해제·주계정 설정·세션 강제종료 실패 시 관리자에게 아무 피드백도 없음
  - 위치: `app/admin/users/page.tsx:674-745`
  - handleDisconnectSocialAccount, handleSetPrimarySocialAccount, handleTerminateSession 세 핸들러 모두 `if (response.ok) { ...; alert('...되었습니다.'); }` 형태로만 작성되어 있고 else 분기가 없다. 서버가 403/404/500 등 정상 HTTP 응답으로 실패를 반환하면 catch 블록도 타지 않아 아무 알림도 뜨지 않는다. 특히 handleTerminateSession에서 관리자가 세션 강제…
  - 권장 조치: Add else branches with alert() to handleDisconnectSocialAccount, handleSetPrimarySocialAccount, and handleTerminateSession so non-ok responses give the admin visible feedback.

- [ ] **BUG-242** [버그 / 수정위험도:낮음] 전달사항 모달도 동일하게 하드코딩된 가짜 작성자 정보를 저장함
  - 위치: `components/modals/MessageModal.tsx:77-79`
  - `// TODO: 실제 사용자 정보 가져오기` 주석과 함께 `const authorId = 'temp_user_id'; const authorName = '사용자';`가 하드코딩되어 있고 생성 요청 body(line 89-90)에 그대로 전송된다. AnnouncementModal과 동일한 결함으로, 어느 직원이 작성해도 실제 작성자를 구분할 수 없다. (evidence: components/modals/MessageModal.tsx:77-79 authorId/authorName 하드코딩 및…
  - 권장 조치: Import and call useAuth() in MessageModal.tsx to replace the hardcoded 'temp_user_id'/'사용자' with the real user.id/name, matching the same fix applied to AnnouncementModal.tsx.

- [ ] **BUG-243** [버그 / 수정위험도:낮음] FacilityEditModal의 +/- 스테퍼 버튼이 입력값을 비운 뒤 클릭하면 'NaN' 문자열을 저장함
  - 위치: `components/modals/FacilityEditModal.tsx:304-449`
  - pH센서(304,319), 차압계(335,350), 온도계(366,381), 펌프CT(397,412), 송풍CT(428,443)의 +/- 버튼이 모두 `parseInt(현재상태값)`을 직접 사용한다. 사용자가 입력창을 지워 상태값이 빈 문자열이 되면 다음 클릭에서 `parseInt('') + 1` = NaN이 되어 `setX(String(NaN))` = 'NaN'이 상태에 저장된다. handleSave(line 92-99)는 이 값을 검증 없이 그대로 updateData.ph 등에 담아 PUT…
  - 권장 조치: In each +/- handler, guard with `const n = parseInt(state) || 0` before incrementing/decrementing, and add a Number.isFinite/regex check in handleSave (and defensively on the API route) before writing to facility-measurement.

- [ ] **BUG-245** [버그 / 수정위험도:낮음] components/projects/ 디렉토리 전체(프로젝트 관리 UI)가 어떤 페이지에서도 사용되지 않는 죽은 코드
  - 위치: `components/projects/ProjectDashboard.tsx:1`
  - ProjectDashboard.tsx가 자신의 하위 모듈 ProjectCard/ProjectModal을 import하는 것 외에는, 이 4개 컴포넌트(ProjectCard, ProjectDashboard, ProjectDetail, ProjectModal)를 프로젝트 전체(app/, components/ 전체)에서 import하는 곳이 없다. app/ 하위에도 'project' 관련 페이지 라우트가 전혀 없다(app/api/projects, app/api/project-templates 같은…
  - 권장 조치: Confirm with the user whether components/projects/ is intentionally shelved before deleting; if approved, remove the 4 unused files (backend API routes can stay) since nothing imports them.

- [ ] **BUG-249** [버그 / 수정위험도:낮음] survey-events POST generates event IDs with underscore separators that mismatch the hyphenated convention used everywhere else in the codebase
  - 위치: `app/api/survey-events/route.ts:113`
  - POST builds `const eventId = `${survey_type}-${business_id}`` where survey_type is one of the underscore-separated values ('estimate_survey', 'pre_construction_survey', 'completion_survey'), producing IDs like `estimate_survey-<uuid>` instead of the hyphenated…
  - 권장 조치: Change eventId construction in the POST handler to use the hyphenated prefixes ('estimate-survey-', 'pre-construction-survey-', 'completion-survey-') to match the DB trigger and all other prefix checks in the codebase; low impact today since no frontend caller uses this POST path yet.

- [ ] **BUG-253** [버그 / 수정위험도:낮음] businesses/[id] GET/PUT/DELETE check a `.success` property that lib/supabase-business.ts never returns, so every successful call reports failure
  - 위치: `app/api/businesses/[id]/route.ts:44 (GET), 103 (PUT), 162 (DELETE)`
  - The route does `const businessResult = await getBusinessById(businessId); if (!(businessResult as any).success) ...` (and analogous checks for updateBusiness/deleteBusiness/getAirPermitsByBusinessId/getBusinessMemos). Reading lib/supabase-business.ts directly confirms…
  - 권장 조치: Remove the incorrect `.success` checks in GET/PUT/DELETE of app/api/businesses/[id]/route.ts (wrap the lib/supabase-business.ts calls in try/catch instead, since they throw rather than return {success}); safe since grep confirms no live frontend caller of this base path today.

- [ ] **BUG-259** [버그 / 수정위험도:낮음] SubsidyActiveBadge post-application suppression list uses legacy unprefixed status codes, never matches live prefixed statuses
  - 위치: `components/tasks/SubsidyActiveBadge.tsx:47-71`
  - POST_APPLICATION_STATUSES lists bare strings like 'document_supplement', 'product_order', 'installation', but live subsidy task statuses (lib/task-steps.ts subsidySteps, confirmed by call sites passing task.status directly) are all prefixed with 'subsidy_' (e.g.…
  - 권장 조치: Update POST_APPLICATION_STATUSES in SubsidyActiveBadge.tsx to use the actual 'subsidy_' prefixed status values from lib/task-steps.ts (e.g. 'subsidy_document_supplement', 'subsidy_product_order', 'subsidy_installation') so the includes() check matches live task statuses.

- [ ] **BUG-266** [버그 / 수정위험도:낮음] installation-closing transfers/[transferId]/payments GET — 권한 레벨(permissionLevel) 검증 누락
  - 위치: `app/api/installation-closing/transfers/[transferId]/payments/route.ts:16-27`
  - GET 핸들러는 Authorization 헤더 존재 및 verifyTokenString 성공 여부만 확인하고 permissionLevel 검사를 하지 않는다. 같은 폴더의 형제 라우트(transfers/route.ts, transfers/[transferId]/reconcile/route.ts, history/route.ts, summary/route.ts, forecast/route.ts, final/route.ts)는 모두 `if (!permissionLevel ||…
  - 권장 조치: Add the same `if (!permissionLevel || permissionLevel < 3)` guard used in every sibling route under installation-closing/ (transfers, reconcile, history, summary, forecast, final) to this payments GET handler.

- [ ] **BUG-271** [버그 / 수정위험도:낮음] FacilityEditModal의 증감(+/-) 버튼이 빈 입력값에서 클릭되면 상태값이 문자열 'NaN'이 되어 저장이 실패함 (원 신고 내용의 '조용히 DB에 저장된다'는 설명은 부정확 — 실제로는 정수 컬럼 타입 불일치로 저장 자체가 에러로 실패함)
  - 위치: `components/modals/FacilityEditModal.tsx:304, 319, 335, 350, 366, 381, 397, 412`
  - pH/차압계/온도계/펌프CT 입력의 onChange는 `setPh(e.target.value)` 등으로 원본 문자열을 그대로 저장하므로 필드를 지우면 상태가 빈 문자열이 된다. 이 상태에서 증감 버튼을 누르면 `parseInt('')`가 NaN이 되고 `Math.max(0, NaN)`도 NaN이므로 `String(NaN)` = 'NaN'이 입력창에 표시된다. 저장 시 95행 `updateData.ph = ph;`로 이 'NaN' 문자열이 그대로 PUT…
  - 권장 조치: Guard the +/- handlers so they no-op (or clamp to 0) when parseInt returns NaN instead of writing `String(NaN)` back into state, and have the API validate/reject non-numeric measurement strings the same way it already normalizes ''.

- [ ] **BUG-272** [버그 / 수정위험도:낮음] FacilityEditModal이 실제 로그인 관리자 대신 고정 문자열 '관리자'를 last_updated_by로 저장
  - 위치: `components/modals/FacilityEditModal.tsx:83`
  - handleSave()에서 `last_updated_by: '관리자'`가 무조건 고정값으로 PUT /api/facility-measurement에 전송된다. 이 파일은 useAuth나 다른 인증 컨텍스트를 전혀 import하지 않는다(grep 결과 0건 확인). 서버(app/api/facility-measurement/route.ts:152)도 `last_updated_by || '관리자'`로 클라이언트가 보낸 값을 그대로 신뢰하므로, 시설 측정기기 정보를 실제로 누가 마지막에 수정했는지 추적할…
  - 권장 조치: Same fix pattern as MessageModal/AnnouncementModal: pull `last_updated_by` from the authenticated session instead of the hardcoded '관리자' literal.

- [ ] **BUG-281** [버그 / 수정위험도:낮음] 실사 이벤트 POST가 생성하는 ID 형식이 DB 트리거가 생성하는 표준 ID 형식과 불일치
  - 위치: `app/api/survey-events/route.ts:113, 287-296`
  - POST 핸들러는 eventId = `${survey_type}-${business_id}`로 ID를 만드는데 survey_type='estimate_survey'이므로 결과는 'estimate_survey-{uuid}'(estimate와 survey 사이 언더스코어)가 된다. 반면 sql/resync_survey_events.sql:18, sql/update_survey_sync_triggers_with_time.sql:26/48 등 실제 DB 트리거가 만드는 표준 ID는…
  - 권장 조치: In the POST handler, build eventId using the same hyphenated format the DB triggers use (e.g. `estimate-survey-${business_id}` instead of `${survey_type}-${business_id}`), so it matches the DELETE handler's startsWith('estimate-survey-') check; isolated to one unused-by-frontend file.

- [ ] **BUG-283** [버그 / 수정위험도:낮음] 택배 주소 사용 횟수 증가가 미실행 Supabase 쿼리 빌더 객체를 컬럼 값으로 대입해 항상 실패함
  - 위치: `app/api/delivery-addresses/route.ts:192-206`
  - 196행 `use_count: supabaseAdmin.rpc('increment', { x: 1 })`는 await/then되지 않은 PostgrestFilterBuilder 객체를 그대로 update() payload의 필드 값으로 넣는다. 실제로 Node REPL에서 supabase-js의 .rpc()가 반환하는 객체를 확인한 결과 { shouldThrowOnError, method, url, headers, schema, body, signal, isMaybeSingle, fetch }…
  - 권장 조치: Replace the unawaited `supabaseAdmin.rpc('increment', ...)` object literal with either a real Postgres increment function called and awaited via `.rpc()`, or fetch current use_count first and pass `use_count + 1` as a plain number.

- [ ] **BUG-284** [버그 / 수정위험도:낮음] 캘린더 보드 클라이언트 측 권한 게이팅이 하드코딩되어 무력화됨
  - 위치: `components/boards/CalendarBoard.tsx:66, 843`
  - 66행 `const [userLevel, setUserLevel] = useState<number>(1); // TODO: 실제 사용자 권한 레벨 가져오기`이며 파일 전체를 grep해도 setUserLevel을 호출하는 곳이 없어 userLevel은 세션 내내 1로 고정된다. 843행 `{userLevel >= 1 && (...)}`은 '일정 추가' 버튼 노출 조건인데 항상 참이 되므로 로그인 여부와 무관하게 모든 방문자에게 버튼이 노출된다. 서버 API(app/api/calendar/*)에도…
  - 권장 조치: Replace the hardcoded `useState<number>(1)` with the real permission level from the app's existing auth hook (e.g. `useAuth()`, already used elsewhere in the codebase), removing the dead TODO.

- [ ] **BUG-287** [버그 / 수정위험도:낮음] 업무 생성 페이지가 project_id를 전송하지 않아 저장이 항상 400으로 실패
  - 위치: `app/admin/tasks/create/page.tsx:46-58, 162-177`
  - TaskFormData(line 46-58)와 submitData(line 162-168)에 project_id 필드가 전혀 없이 '/api/tasks'로 POST하는데(line 170), 그 핸들러(app/api/tasks/route.ts line 155)는 `if (!title || !project_id) return 400 '작업명과 프로젝트는 필수입니다.'`로 project_id를 필수로 요구한다. 따라서 이 폼을 통해 업무 생성을 시도하면 항상 400 오류만 반환된다. 다만 이 페이지는…
  - 권장 조치: Either add a `project_id` selector to the create-task form's submitData, or delete this orphaned unlinked page since task creation already works via the modal in `app/admin/tasks/page.tsx`.

- [ ] **BUG-288** [버그 / 수정위험도:낮음] SubsidyActiveBadge의 신청 이후 상태 제외 목록이 접두사 없는 구버전 status와 매칭되어 신청 완료 후에도 배지가 계속 노출됨
  - 위치: `components/tasks/SubsidyActiveBadge.tsx:47-69`
  - POST_APPLICATION_STATUSES(line 47-67)는 'document_supplement', 'pre_construction_inspection', 'installation', 'completion_inspection' 등 접두사 없는 값들로 구성되어 있으나, 실제 task.status는 lib/task-steps.ts의 TaskStatus 타입에 정의된 'subsidy_' 접두사 버전('subsidy_document_supplement',…
  - 권장 조치: Update `POST_APPLICATION_STATUSES` in `SubsidyActiveBadge.tsx` to use the actual `subsidy_`-prefixed status values from `lib/task-steps.ts` instead of the unprefixed legacy strings.

- [ ] **BUG-291** [버그 / 수정위험도:낮음] 권한레벨 3 사용자의 업무 목록 조회가 PostgREST .or() 필터에 리터럴 SQL 서브쿼리 문자열을 넣어 무효한 필터가 됨
  - 위치: `app/api/tasks/route.ts:74`
  - permissionLevel===3 사용자에 대해 line 74 `query.or(\`assigned_to.eq.${user.id},project_id.in.(select id from projects where manager_id = ${user.id})\`)`를 사용한다. PostgREST의 `.in.()`은 실제 SQL 서브쿼리를 지원하지 않고 리터럴 값 목록만 받으므로, 이 문자열은 project_id(UUID 컬럼)를 'select id from projects where…
  - 권장 조치: Replace the PostgREST `.in.(select ...)` literal-subquery string with a two-step query: first fetch the manager's project ids, then pass that array to `.in('project_id', ids)`.

- [ ] **BUG-300** [버그 / 수정위험도:낮음] InspectorInfoSection 연락처 입력이 공용 포맷터 대신 3-4-4 고정 로직을 재구현해 02/070 등 비휴대폰 번호를 잘못 표시·저장
  - 위치: `components/sections/InspectorInfoSection.tsx:98-110`
  - onChange 핸들러(98-110행)가 utils/phone-formatter.ts의 formatBusinessPhone/formatLandlinePhone을 쓰지 않고, 숫자 길이만 보고 3-4-4로 나누는 로직을 인라인으로 재구현했다. 이 컴포넌트는 app/business/[businessName]/BusinessContent.tsx(1007, 1056행)에서 실사자·AS담당자 정보 입력에 실제로 사용되며, 저장 시(handleSave→onSave) 편집된 문자열이 그대로 DB에 저장된다.…
  - 권장 조치: Replace the inline 3-4-4 formatting logic in `InspectorInfoSection.tsx`'s onChange handler with the existing `formatLandlinePhone`/`formatBusinessPhone` utilities from `utils/phone-formatter.ts`, matching the fix already applied elsewhere in commit d52d77c.

- [ ] **BUG-008** [버그 / 수정위험도:중간] 라우터 할당 해제 보호 로직('installed' 상태 체크)이 절대 발동하지 않는 데드코드
  - 위치: `app/api/router-inventory/assign/route.ts:192`
  - DELETE handler rejects unassignment only `if (router.status === 'installed')`, but RouterStatus (types/router-inventory.ts:7) is typed as only `'in_stock' | 'assigned'`, and a project-wide grep found zero code paths anywhere that ever set status to 'installed' — the only…
  - 권장 조치: Confirm with the router-inventory product owner whether 'installed' should be a reachable state; if not, delete the dead `status === 'installed'` check, and if so, add the missing transition that actually sets status to 'installed' during field-install confirmation.

- [ ] **BUG-009** [버그 / 수정위험도:중간] 라우터 일괄 등록(paste) 시 같은 요청 내 중복 S/N이 있으면 배치 전체가 500으로 실패
  - 위치: `app/api/router-inventory/route.ts:323-364`
  - routersToUpsert is built via body.routers.map with no de-duplication of serial_number within the request. Two new (not-yet-in-DB) rows sharing a serial_number both go into the array without an id, and the subsequent `.upsert(routersToUpsert, { onConflict: 'serial_number',…
  - 권장 조치: De-duplicate routersToUpsert by serial_number before calling .upsert() (reject the batch with a clear 400 listing the duplicate S/Ns, rather than letting Postgres fail the whole request with an opaque ON CONFLICT error).

- [ ] **BUG-024** [버그 / 수정위험도:중간] Business list search can never match by manager name/contact/address
  - 위치: `app/admin/air-permit/page.tsx:276-286, 429-453`
  - The search filters on manager_name/manager_contact/address, but loadBusinessesWithPermits hardcodes those fields to empty strings for every business, so the search box's advertised 담당자명 search always returns zero results. (evidence: filteredBusinessesWithPermits (279-284)…
  - 권장 조치: Populate manager_name/manager_contact/address in loadBusinessesWithPermits from actual business_info data (e.g. the same bi.address-returning query used by business-list) instead of hardcoding empty strings, verifying those columns exist for manager_name/manager_contact before wiring them in.

- [ ] **BUG-034** [버그 / 수정위험도:중간] 첨부파일 삭제 API가 문서 소유권/결재선 소속 여부를 검증하지 않음
  - 위치: `app/api/approvals/attachments/route.ts:108-135`
  - DELETE 핸들러는 인증 토큰 검증만 수행하고, 삭제하려는 path가 요청자 본인 문서에 속하는지 전혀 확인하지 않는다. (evidence: app/api/approvals/attachments/route.ts 108-135줄을 직접 확인: 토큰 디코딩(114-117줄) 이후 곧바로 `storageClient.storage.from(BUCKET).remove([path])`(124줄)를 호출하며, path가 속한 approval_documents 레코드를 조회하거나 요청자 ID와 비교하는…
  - 권장 조치: In the DELETE handler of app/api/approvals/attachments/route.ts, look up the approval_documents row for the attachment's document_id and verify the requester is the author or on the approval line (same check used for viewing) before calling storage.remove().

- [ ] **BUG-035** [버그 / 수정위험도:중간] 휴가원 반차 항목을 '기간으로' 전환 시 leave_type을 무시하고 무조건 재계산해 0.5일이 1일로 바뀜
  - 위치: `components/approvals/forms/LeaveRequestForm.tsx:191-198`
  - handleConvertToPeriod()가 item.leave_type이 half_am/half_pm인지 확인하지 않고 무조건 countWorkingDays(item.date, item.date, holidays)로 새 days를 계산해 덮어쓴다. 평일이면 이 함수는 1을 반환하므로 0.5일이던 반차가 전환 즉시 1일로 바뀐다. (evidence: components/approvals/forms/LeaveRequestForm.tsx 191-198줄 확인: `if (item.end_date)…
  - 권장 조치: In handleConvertToPeriod() (LeaveRequestForm.tsx), only recompute `days` via countWorkingDays when item.leave_type is a full-day type; for half_am/half_pm items either preserve 0.5 or block/prompt before converting to a period, since this value feeds recorded leave-day totals.

- [ ] **BUG-038** [버그 / 수정위험도:중간] 첨부파일 업로드 API가 대상 문서에 대한 접근 권한을 검증하지 않음
  - 위치: `app/api/approvals/attachments/route.ts:33-101`
  - POST /api/approvals/attachments는 유효한 인증 토큰만 확인하고, 클라이언트가 보낸 document_id에 대해 호출자가 작성자이거나 결재선에 포함되어 있는지 검증하지 않은 채 해당 document_id를 폴더명으로 사용해 파일을 업로드한다. signed-url 라우트의 POST도 동일한 documentId 소유권 미검증 문제를 갖는다. (evidence: app/api/approvals/attachments/route.ts 33-101줄 확인: 39-43줄 토큰 디코딩…
  - 권장 조치: Apply the same document ownership/approval-line check as item 13 to the attachments POST upload handler and to signed-url/route.ts's POST, rejecting the request if the caller isn't the author or on the approval line for the given document_id.

- [ ] **BUG-044** [버그 / 수정위험도:중간] AS 목록의 유상/무상 필터가 delivery_date_override를 무시해 배지 표시와 필터 결과가 어긋남
  - 위치: `app/api/as-records/route.ts:80-94`
  - paidStatus='paid'/'free'/'unknown' WHERE 조건은 ar.is_paid_override와 bi.delivery_date만 검사하고 delivery_date_override는 확인하지 않는다. 반면 같은 파일 144-149의 is_paid SELECT 컬럼은 delivery_date_override까지 폴백에 포함시킨다. delivery_date_override만 설정된 미등록 사업장 건은 목록에서 '유상' 배지로 표시되지만 '유상' 필터에서는 빠지고 '미확인'…
  - 권장 조치: Update the paidStatus 'paid'/'free'/'unknown' WHERE conditions (as-records/route.ts L80-94) to use the same is_paid_override > delivery_date_override > bi.delivery_date precedence as the is_paid SELECT column (L144-149), ideally by reusing one shared expression in both places to keep the filter and the displayed badge in sync.

- [ ] **BUG-046** [버그 / 수정위험도:중간] 제조사 필드를 '선택 안 함'으로 지워도 실제로는 지워지지 않음
  - 위치: `app/api/as-records/[id]/route.ts:157-160, 181, 204`
  - manufacturer는 COALESCE($18, manufacturer)로 저장된다. 사용자가 제조사를 '선택 안 함'으로 바꾸면 프런트에서 manufacturer: null이 전송되고, safeManufacturer 계산 결과도 null(undefined 아님)이 되어 COALESCE(null, manufacturer)가 기존 값을 그대로 유지한다. 사용자가 '지우기'를 의도해도 서버는 항상 성공 응답을 주지만 DB 값은 변경되지 않는다. (evidence:…
  - 권장 조치: Distinguish 'field omitted' from 'field explicitly cleared' by checking `'manufacturer' in body` (as already done for date fields in order-management's PUT handler) instead of relying on COALESCE($18, manufacturer), so an explicit null actually clears the column instead of being coalesced back to the old value.

- [ ] **BUG-049** [버그 / 수정위험도:중간] AS 엑셀 일괄 업로드가 안내문구와 달리 사업장 매칭 실패 행을 실패 처리하지 않고 관리코드 숫자를 사업장명으로 저장함
  - 위치: `app/api/as-records/bulk-upload/route.ts:166-231`
  - AsExcelUpload.tsx의 안내 시트에는 '사업장을 찾지 못하면 해당 행은 실패 처리됩니다'라고 명시돼 있지만, 실제 처리 루프는 businessId를 못 찾아도 항상 business_name_raw로 저장해 success로 응답한다. 사업장명(B열)이 비어 있고 관리코드(A열)만 있는 행에서 매칭 실패 시 관리코드 문자열 자체가 AS건의 사업장명으로 저장된다. (evidence: AsExcelUpload.tsx:156 '• 사업장을 찾지 못하면 해당 행은 실패 처리됩니다.' 문구 확인.…
  - 권장 조치: Remove the mgmtCodeRaw fallback for business_name_raw (bulk-upload/route.ts L167) so a management code is never stored as a business name, then decide and align code + upload-instructions text on whether unmatched-business rows should actually be rejected (as AsExcelUpload.tsx currently claims) or accepted with an explicit '(사업장 미매칭)' placeholder.

- [ ] **BUG-058** [버그 / 수정위험도:중간] Assignee filter only filters the current paginated page (max 7 rows), is never sent to the API, and its dropdown options come from that same limited page
  - 위치: `app/admin/order-management/page.tsx:41, 89-102, 108-115, 396-404`
  - assigneeFilter (line 41) is applied client-side via orders.filter(...) (lines 396-404) against `orders`, which is only the current server page (limit: '7', line 114). loadOrders()'s URLSearchParams (lines 108-115) never include assignee, and I confirmed…
  - 권장 조치: Add a server-side `assignee` filter to GET /api/order-management applied before pagination, have loadOrders() send it instead of filtering the paginated `orders` array client-side, and populate the assignee dropdown from a full-dataset query (or dedicated endpoint) rather than from the current page's results.

- [ ] **BUG-060** [버그 / 수정위험도:중간] 검색 디바운스와 탭/필터 변경이 서로 다른 useEffect로 분리되어 있어 경쟁 상태 발생 (오래된 검색 응답이 최신 탭 선택을 덮어씀)
  - 위치: `app/admin/order-management/page.tsx:63-74`
  - 검색어 변경(300ms 디바운스, deps=[searchTerm])과 탭/필터/정렬/페이지 변경(즉시 실행, deps=[manufacturerFilter, activeTab, sortBy, currentPage])이 독립된 두 useEffect로 loadOrders()를 호출하며, AbortController나 응답 순서 보장이 전혀 없다. loadOrders는 useCallback으로 감싸여 있지 않아 매 렌더마다 재생성되고, setTimeout 콜백은 effect가 스케줄된 시점 렌더의…
  - 권장 조치: Merge the search-debounce effect (L63-69) and the filter/tab/sort/page effect (L72-74) into a single effect that debounces only when searchTerm changed, and pass an AbortController into loadOrders so any in-flight request is cancelled before a newer one starts, guaranteeing the latest user action always wins regardless of response order.

- [ ] **BUG-061** [버그 / 수정위험도:중간] 발주완료 처리 시 order_management 상태 업데이트 실패를 확인하지 않아 business_info와 order_management 상태가 어긋날 수 있음
  - 위치: `app/api/order-management/[businessId]/complete/route.ts:97-112`
  - business_info.order_date 업데이트(86-94행)는 updateError를 확인해 실패 시 500을 반환하지만, 바로 이어지는 order_management.status/completed_at/updated_by 업데이트(103-111행)는 결과를 구조분해할당조차 하지 않고 실행만 한다 - 에러가 나도 완전히 무시된다. 이 두 번째 업데이트가 실패하면 business_info.order_date는 이미 설정되어 목록에서는 '완료'로 집계되지만, GET /[businessId]는…
  - 권장 조치: Reorder the two updates: update order_management.status first (when orderRecord exists) and check its error, only committing business_info.order_date after that succeeds (or wrap both in a single Postgres RPC transaction) so the two tables can never diverge.

- [ ] **BUG-066** [버그 / 수정위험도:중간] 발주 목록 조회 SQL의 제조사 필터가 manufacturer 값을 trim하지 않아 공백 포함 데이터가 필터에서 누락됨
  - 위치: `app/api/order-management/route.ts:342-349, 393-401, 444-451`
  - not_started/completed/all 세 분기 모두 제조사 필터를 `conditions.push('manufacturer = $N')`로 정확 일치 비교하며 params에는 trim되지 않은 MANUFACTURER_REVERSE_MAP 값을 그대로 넣는다. 반면 같은 파일의 다른 곳(282, 364, 416, 467행, 위 last_updated 버그 근처에서도 확인)에서는 `bi.manufacturer?.trim() || ''`로 명시적으로 trim한 뒤…
  - 권장 조치: Trim the manufacturer value pulled from MANUFACTURER_REVERSE_MAP before pushing it into params in all three branches (not_started/completed/all), or change the SQL condition to `TRIM(manufacturer) = $N`, matching the trim() pattern already used elsewhere in this same file for reading manufacturer.

- [ ] **BUG-070** [버그 / 수정위험도:중간] 계약서 번호(contract_number) 생성이 읽기-후-쓰기 방식이라 동시 요청 시 중복 번호가 발급될 수 있음
  - 위치: `app/api/document-automation/contract/route.ts:189-203`
  - 당일 최대 contract_number를 SELECT로 조회(190-195행) 후 애플리케이션에서 +1하여 contractNumber를 계산(197-203행)하고, 별도의 원자적 증가나 유니크 제약 위반 재시도 없이 바로 INSERT(256-293행)한다. 두 요청이 거의 동시에 같은 날짜에 대해 실행되면 동일한 todayContracts 조회 결과를 읽어 동일한 sequenceNumber를 계산할 수 있다. (evidence: 189-203행에 SELECT → JS로 sequenceNumber…
  - 권장 조치: Replace the SELECT-max-then-increment logic with either a Postgres sequence/unique constraint plus retry-on-conflict, or an atomic RPC (e.g. a Postgres function using SELECT ... FOR UPDATE or INSERT ... ON CONFLICT) so concurrent requests can't compute the same contract_number; this touches the contract creation path shared by all contract types so test subsidy and self-pay flows after the change.

- [ ] **BUG-074** [버그 / 수정위험도:중간] 견적서 관리 탭에서 다운로드한 PDF에는 대기배출시설 허가증 섹션이 누락됨
  - 위치: `app/admin/document-automation/components/EstimateManagement.tsx:205-397`
  - downloadPDF(205-238행)가 호출하는 자체 generatePDFFromPreview(241-397행)는 품목표/합계/안내사항만 HTML로 그려 PDF를 생성하며 air_permit 처리 로직이 전혀 없다. 반면 같은 데이터 소스를 쓰는 EstimatePreviewModal.tsx의 동명 함수(307-397행)는 460-461행에서 estimateData.air_permit이 있으면 addAirPermitToPdf()를 호출해 허가증 페이지를 추가한다.…
  - 권장 조치: In EstimateManagement.tsx's generatePDFFromPreview, add the same `if (estimateData.air_permit) { await addAirPermitToPdf(...) }` call that EstimatePreviewModal.tsx already uses (line 460-461), or better, refactor both components to share one PDF-generation function to prevent this kind of drift recurring.

- [ ] **BUG-083** [버그 / 수정위험도:중간] CSV row-validation index misalignment lets rows with recorded errors slip into the DB as 'valid'
  - 위치: `app/api/subsidy-crawler/direct-urls/upload/route.ts:212-214,305-359`
  - parseAndValidateCsv only pushes a row into rows[] when its column count matches the header (continues past mismatches without pushing, lines 311-318), but records URL/region_name validation errors keyed by the true 1-based CSV line number for rows that DO get pushed (no continue…
  - 권장 조치: Push {row, lineNumber} pairs (not bare row objects) into the rows array in parseAndValidateCsv so the POST handler's validRows filter compares against the true CSV line number instead of the post-skip array index.

- [ ] **BUG-093** [버그 / 수정위험도:중간] 설치비 마감 계산의 EQUIPMENT_FIELDS에서 레거시 'gateway' 필드가 누락되어 해당 장비 설치비가 계산에서 빠짐
  - 위치: `lib/installation-closing.ts:6-14`
  - lib/revenue-calculator.ts(55행 'gateway' // deprecated but kept for backward compatibility)와 lib/receivables-engine.ts(14-21행) EQUIPMENT_FIELDS는 모두 레거시 'gateway'를 포함하지만, lib/installation-closing.ts의 EQUIPMENT_FIELDS(6-14행)와 app/api/installation-closing/forecast/route.ts에 동일 복제된…
  - 권장 조치: Add the legacy 'gateway' field to EQUIPMENT_FIELDS in both lib/installation-closing.ts and the inline duplicate in app/api/installation-closing/forecast/route.ts, matching revenue-calculator.ts and receivables-engine.ts; before deploying, query for any business_info rows with gateway > 0 to gauge how many pending/paid closings this will change.

- [ ] **BUG-102** [버그 / 수정위험도:중간] business-summary API의 자체 매출계산 로직이 gateway_1_2/gateway_3_4 필드를 누락해 게이트웨이 분리형 설비의 매출을 빠뜨림
  - 위치: `app/api/revenue/business-summary/route.ts:456-619`
  - 이 파일의 로컬 함수 calculateBusinessRevenue()는 lib/revenue-calculator.ts와 별개로 구현된 매출 계산 로직으로, equipmentFields 목록에 'gateway'만 있고 'gateway_1_2'/'gateway_3_4'가 빠져 있어 해당 필드가 있는 사업장의 장비 매출·매입·설치비가 0으로 계산된다. 코드베이스 내 프런트엔드에서 이 라우트를 호출하는 곳은 없지만, POST 핸들러는 permission_level 3 이상 토큰으로 직접 호출 가능한…
  - 권장 조치: Replace the duplicated calculateBusinessRevenue() in business-summary/route.ts with a call into the shared lib/revenue-calculator.ts (which already includes gateway_1_2/gateway_3_4) rather than patching the local equipmentFields list, and audit/recalculate any RevenueCalculationCache rows already produced by this endpoint.

- [ ] **BUG-109** [버그 / 수정위험도:중간] GET /api/meeting-templates returns every template including private ones, contradicting its own comment
  - 위치: `app/api/meeting-templates/route.ts:84-96`
  - The comment at line 84 states '템플릿 조회 (공개 템플릿 + 본인 템플릿)' (public + own templates), but the query built at lines 85-96 (`supabase.from('meeting_templates').select('*')...`) applies no is_public or created_by filter — only an optional meeting_type filter (92-94). Any authenticated…
  - 권장 조치: Add `.or(`is_public.eq.true,created_by.eq.${user.id}`)` to the query in meeting-templates/route.ts GET, but first check existing is_public values in the table since enforcing this could suddenly hide templates users currently see.

- [ ] **BUG-117** [버그 / 수정위험도:중간] PresentationMode's comment autosave uses one shared debounce timer for all agenda items
  - 위치: `components/meeting-minutes/PresentationMode.tsx:562, 577-581`
  - debounceRef (line 562, `useRef<...>(null)`) is a single ref shared across every agenda slide's comment box, not keyed per agenda item. handleCommentChange (577-581) always clears whatever timer is currently pending and sets a new one for the item just typed in. If the user types…
  - 권장 조치: Replace the single debounceRef in PresentationMode.tsx with a per-itemId map of timers (e.g. useRef<Record<string, Timeout>>({})) so switching agenda slides doesn't cancel a still-pending save for a different item, and clear all pending timers on unmount.

- [ ] **BUG-131** [버그 / 수정위험도:중간] hasWrongClassification cache-invalidation heuristic false-positives on legitimate all-completed reports, defeating the DB cache
  - 위치: `app/api/weekly-reports/route.ts:134-144`
  - `hasWrongClassification = completed_tasks > 0 && in_progress_tasks === 0 && total_tasks > 0` is meant to detect corrupted legacy rows, but also matches a perfectly valid state: a user whose whole weekly workload is finished (all subsidy_payment, 0 in_progress). For such a user,…
  - 권장 조치: Replace the `hasWrongClassification` heuristic with a check that actually distinguishes corrupted legacy rows from legitimate all-completed reports (e.g. a schema/version flag on the cached row, or checking for a specific known-bad column value) rather than `completed_tasks>0 && in_progress_tasks===0`, since the current condition matches a normal fully-completed week and forces unnecessary regeneration on every request.

- [ ] **BUG-132** [버그 / 수정위험도:중간] average_completion_time_days is computed with a different formula in /api/weekly-reports than in /api/weekly-reports/realtime
  - 위치: `app/api/weekly-reports/route.ts:264-272`
  - route.ts (and generate-all/route.ts:88-98, verified identical) computes each task's duration as a raw float in days, averages, then rounds to 1 decimal (`Math.round(x*10)/10`). realtime/route.ts (lines 298-309) instead does `Math.ceil()` on each task's duration first (rounding…
  - 권장 조치: Pick one average_completion_time_days formula (raw float duration averaged then rounded to 1 decimal, as in route.ts/generate-all, or the realtime endpoint's per-task ceil-then-round-to-integer) and apply it consistently across route.ts, generate-all/route.ts, and realtime/route.ts, ideally via one shared function.

- [ ] **BUG-136** [버그 / 수정위험도:중간] realtime endpoint's 'pending' bucket checks a task-status literal that no real task ever has, so it's permanently empty and 'in progress' is over-counted
  - 위치: `app/api/weekly-reports/realtime/route.ts:75-77, 246, 292`
  - isTaskInProgress() returns `!isTaskCompleted(task) && task.status !== 'pending'`, and pendingTasks/pendingTaskDetails are computed via `t.status === 'pending'`. Although 'pending' is a declared value in the TaskStatus union type (app/admin/tasks/types.ts:10), no code path in the…
  - 권장 조치: Align isTaskInProgress/pendingTasks in realtime/route.ts with route.ts's correct pending definition (`['customer_contact','consultation_scheduled'].includes(status)`) instead of checking for the never-assigned literal 'pending', then re-verify in_progress_tasks/completion_rate/pending-tab counts on the realtime-backed pages after the change.

- [ ] **BUG-137** [버그 / 수정위험도:중간] extractAssigneeInfo() looks for a non-existent `isPrimary` field on assignees, so multi-assignee tasks are always attributed to array index 0 instead of the real primary assignee
  - 위치: `app/api/weekly-reports/realtime/route.ts:33-49`
  - extractAssigneeInfo() does `task.assignees.find((a: any) => a.isPrimary)` before falling back to `assignees[0]`. The real `SelectedAssignee` shape (components/ui/MultiAssigneeSelector.tsx:27-32: `{id, name, position, email}`) has no `isPrimary` property, and the objects written…
  - 권장 조치: Pass the task's `primary_assignee_id` into extractAssigneeInfo and use it to find the matching entry in `assignees` (by id) instead of the nonexistent `isPrimary` field, falling back to assignees[0] only when primary_assignee_id is null/unmatched; confirm the id types (uuid vs string) compare correctly.

- [ ] **BUG-142** [버그 / 수정위험도:중간] 차량 검색에 요청 취소/순서 보장이 없어 느린 이전 검색 응답이 최신 검색 결과를 덮어쓸 수 있음
  - 위치: `app/dpf/page.tsx:34-56`
  - search() 함수(34-47행)는 AbortController나 요청 순번 검사 없이 fetch 후 곧바로 setResult(await res.json())를 호출한다. triggerSearch의 300ms 디바운스(49-52행)는 아직 발동하지 않은 타이머만 취소할 뿐 이미 전송된 fetch는 취소하지 못한다. 넓은 조건 검색 직후 좁은 조건으로 재검색하면 두 요청이 겹쳐 발생하고, 먼저 보낸 넓은 조건 요청의 응답이 서버 처리 지연으로 나중에 도착하면 setResult가 마지막에 실행되어…
  - 권장 조치: In app/dpf/page.tsx's search(), keep an AbortController ref, abort the previous in-flight fetch before starting a new one, and ignore/catch AbortError so only the latest request's response calls setResult.

- [ ] **BUG-144** [버그 / 수정위험도:중간] 차량 검색 API가 사용자 입력을 이스케이프 없이 PostgREST .or() 필터에 삽입해 쉼표 포함 검색어에서 파싱 오류 발생
  - 위치: `app/api/dpf/search/route.ts:25-29`
  - query 파라미터를 이스케이프 없이 `.or(\`vin.ilike.%${query}%,...\`)` 문자열에 직접 삽입한다(26-28행). PostgREST의 .or() 문법은 쉼표를 조건 구분자로 해석하므로 사용자가 쉼표가 포함된 검색어(예: '김철수, 대표')를 입력하면 생성된 필터 문자열의 구문이 깨져 500과 함께 '서버 오류'가 반환된다. 프론트(app/dpf/page.tsx 42-43행)는 console.error만 남기고 조용히 실패해 사용자에게는 검색이 그냥 안 되는 것처럼…
  - 권장 조치: Escape commas and parentheses in `query` (PostgREST requires `\,`/`\(`/`\)` for literal characters) before interpolating it into the `.or()` filter string in app/api/dpf/search/route.ts, and surface the resulting error to the user instead of only console.error in app/dpf/page.tsx.

- [ ] **BUG-145** [버그 / 수정위험도:중간] 차량 상세 페이지에서 벤더 변경 후 activeTab이 필터링된 탭 목록과 동기화되지 않아 도달 불가능한 탭이 계속 렌더링됨
  - 위치: `app/dpf/[vin]/page.tsx:142, 245-270, 274-307`
  - 탭 바는 142행 `tabs = ALL_TABS.filter(t => t.vendors.includes(vehicle.vendor ?? 'fujino'))`로 필터링되지만, 274-307행 탭 콘텐츠 렌더링은 `activeTab === 'installation'` 등 activeTab 값만 직접 비교하며 tabs 목록과 무관하게 동작한다. 후지노 차량 상세에서 '설치이력' 탭을 연 뒤(activeTab='installation') 수정 모달로 벤더를 '엠즈'로 바꿔 저장하면…
  - 권장 조치: Add a useEffect in app/dpf/[vin]/page.tsx that resets activeTab to tabs[0].key whenever the recomputed `tabs` array (derived from vehicle.vendor) no longer contains the current activeTab.

- [ ] **BUG-147** [버그 / 수정위험도:중간] process_dpf_staging() 벌크 임포트 오류 카운트가 항상 0으로 반환됨
  - 위치: `supabase/migrations/20260514_dpf_staging_new_columns.sql:8-9 (v_errors 선언), 72-75 (오류 처리 및 RETURN QUERY)`
  - 이 마이그레이션이 process_dpf_staging()을 CREATE OR REPLACE로 재정의하며(초기 20260424 버전과 달리) v_errors를 0으로 선언한 뒤 어디에서도 증가시키지 않는다. VIN이 없는 스테이징 행은 72-73행에서 status='error'로 마킹되지만 v_errors는 그대로 0이고, 75행 RETURN QUERY SELECT v_processed, v_errors는 항상 error_count=0을 반환한다.…
  - 권장 조치: Add a new migration that inserts `GET DIAGNOSTICS v_errors = ROW_COUNT;` right after the 'VIN 없음' UPDATE statement in process_dpf_staging() (before RETURN QUERY), and test it against a staging batch containing known VIN-less rows before deploying to production.

- [ ] **BUG-159** [버그 / 수정위험도:중간] POST /api/wiki/forms/[code]/submit has no authentication, allowing spoofed form submissions
  - 위치: `app/api/wiki/forms/[code]/submit/route.ts:8-47`
  - The handler inserts into form_submissions using whatever vehicleId/businessId/values the caller supplies in the JSON body, with no session/JWT check and no verification that the caller is associated with the given business/vehicle. (evidence:…
  - 권장 조치: Confirm with the product owner whether this form must accept unauthenticated/public submissions; if not, add the standard verifyToken auth check and verify the submitted businessId/vehicleId belong to the authenticated caller's scope.

- [ ] **BUG-175** [버그 / 수정위험도:중간] Test-notification cleanup action deletes any notification containing the word "테스트", including legitimate business notifications
  - 위치: `app/api/notifications/cleanup/route.ts:110-134`
  - action=remove_test_notifications unconditionally deletes every row in notifications/task_notifications matching `title.ilike.%테스트%` or `message.ilike.%테스트%` (line 117, similarly line 122), with no scoping to a specific creator, date range, or explicit test-marker. "테스트" is a…
  - 권장 조치: Replace the broad `title/message ilike '%테스트%'` matching with a narrower, explicit test-marker (e.g. a dedicated `is_test` flag set at creation time, or restrict by created_by_name/date range only) so the admin cleanup action can't delete legitimate notifications that happen to contain the word '테스트'; requires a product decision on how test notifications are tagged going forward.

- [ ] **BUG-185** [버그 / 수정위험도:중간] admin/page.tsx가 전달하는 initialData/loading을 각 차트 컴포넌트가 받지 않아 API가 이중 호출됨
  - 위치: `app/admin/page.tsx:272-303`
  - renderWidget이 RevenueChart/ReceivableChart/InstallationChart/MonthlyLeadsChart에 initialData, loading prop을 전달하지만, 4개 컴포넌트 모두 props 인터페이스가 filters만 선언한다. 부모가 Promise.all로 미리 가져온 데이터는 버려지고, 각 차트는 자신의 useEffect(loadData)로 동일 4개 엔드포인트를 다시 호출한다. (evidence: admin/page.tsx L272-276,…
  - 권장 조치: Add initialData/loading to the props interfaces of RevenueChart, ReceivableChart, InstallationChart, and MonthlyLeadsChart and have their loadData useEffect skip the first fetch when initialData is present (usage is confined to admin/page.tsx, so blast radius is limited to that one page).

- [ ] **BUG-208** [버그 / 수정위험도:중간] forgot-password page never calls any API and always shows a fake success message
  - 위치: `app/forgot-password/page.tsx:13-28`
  - handleSubmit contains a TODO and just does setTimeout(() => setSuccess(true), 1000) -- it never calls /api/auth/forgot-password (which is itself hard-disabled and always 405s, app/api/auth/forgot-password/route.ts:14-25) or any other endpoint. Any email, valid or not, is told a…
  - 권장 조치: Immediately replace the fake setTimeout success with an honest 'feature unavailable' message so users aren't told a reset email was sent when none was, and treat building the real forgot-password flow (token issuance, email delivery, expiry) as a separate follow-up requiring a product decision on the email-sending mechanism.

- [ ] **BUG-218** [버그 / 수정위험도:중간] Google/kakao-simple/google-simple/naver-simple hardcode a typo'd production domain in redirect_uri ('bluon-iot.com' vs the real 'blueon-iot.com')
  - 위치: `app/api/auth/social/google/route.ts:13`
  - GOOGLE_REDIRECT_URI (and the equivalent constants in google-simple/route.ts:14, kakao-simple/route.ts:29, naver-simple/route.ts:14) hardcode 'https://facility.bluon-iot.com/...' in production, but every other part of the codebase that whitelists the app's real domain…
  - 권장 조치: Correct 'bluon-iot.com' to 'blueon-iot.com' in the four hardcoded redirect_uri constants, but first check the Google/Kakao/Naver developer-console redirect URI registrations to confirm which spelling is actually registered, since blindly flipping it could break a currently-functioning provider config if the typo'd domain happens to be the one that's registered.

- [ ] **BUG-230** [버그 / 수정위험도:중간] canManageOrganization() looks up the fake stub user id, so legitimate team-scoped org actions are incorrectly denied
  - 위치: `app/api/organization/members/route.ts:26-55, 137-139`
  - POST with action='assign_team' or 'remove_team' passes `user.id` (the hardcoded 'admin-user' string from checkUserPermission) into canManageOrganization(userId, 'team', team_id), which queries `v_organization_full.eq('id', userId).single()`. Since 'admin-user' never matches a…
  - 권장 조치: Pass the real authenticated employee UUID (not the 'admin-user' stub from checkUserPermission) into canManageOrganization for the assign_team/remove_team actions, and also add the missing check to the 'promote' and 'transfer_team' branches.

- [ ] **BUG-244** [버그 / 수정위험도:중간] DateInput이 자릿수만 검사하고 월의 실제 범위(1~12)를 검증하지 않아 잘못된 날짜를 그대로 전파함
  - 위치: `components/ui/DateInput.tsx:68-78`
  - handleMonthChange(68-78)에서 monthNum이 1~12 범위인지 확인하는 코드(72-76)는 day 필드로 포커스를 옮길지 여부만 결정하며, 바로 다음 줄 `updateDate(year, val, day)`(77)는 이 검사와 무관하게 항상 실행된다. updateDate(48-57)는 `newMonth.length === 2`인지만 확인하므로 '13', '00', '99' 같은 2자리 값도 그대로 상위 onChange로 'YYYY-13-DD' 형태의 문자열이 전달된다. 같은…
  - 권장 조치: Add a 1-12 month range clamp/reject and a day-of-month range check inside updateDate itself (not just the focus-advance branch) so invalid values never reach onChange; re-test all 9 call sites (CalendarModal, admin/business, air-permit pages, etc.) after the change.

- [ ] **BUG-248** [버그 / 수정위험도:중간] delivery-addresses 'increment_usage' action does not actually increment use_count
  - 위치: `app/api/delivery-addresses/route.ts:196`
  - PATCH's increment_usage branch sets `use_count: supabaseAdmin.rpc('increment', { x: 1 })` inside the object passed to `.update()`. `rpc()` returns a synchronous, unresolved PostgrestFilterBuilder instance (a thenable, not a Promise value or raw SQL fragment), so it is never…
  - 권장 조치: Replace the un-awaited `.rpc('increment', ...)` with either a real Postgres RPC function (create via migration, e.g. `increment_use_count(row_id uuid)`) or a read-then-write `use_count: currentValue + 1` inside the PATCH handler.

- [ ] **BUG-250** [버그 / 수정위험도:중간] Estimate generation silently prices equipment at ₩0 when government_pricing lookup errors, error is discarded
  - 위치: `app/api/estimates/generate/route.ts:75-84`
  - For each equipment field with quantity > 0, only `data` is destructured from the government_pricing query result (`const { data: pricing } = await supabase...single()`); any error object (including the error `.single()` produces when zero rows match) is silently dropped, and…
  - 권장 조치: Destructure the error from the government_pricing query, log/console.warn on failure, and either skip the item with a flagged 'pricing unavailable' status or return a warning in the API response instead of silently defaulting to ₩0.

- [ ] **BUG-260** [버그 / 수정위험도:중간] Task-edit permission check in handleOpenEditModal is a hardcoded no-op
  - 위치: `app/admin/tasks/page.tsx:1755-1772`
  - currentUser is hardcoded to '관리자' and isAdmin is hardcoded to true (both marked TODO), so `if (!isAssignee && !isAdmin)` can never evaluate true — the apparent assignee/admin-only edit restriction is dead code and every user who can open the task list can open the edit modal for…
  - 권장 조치: In handleOpenEditModal, replace the hardcoded currentUser/isAdmin with the already-available `user` from useAuth() (user?.name and user?.permission_level, consistent with the level-4 check already used at line 1961), and confirm with the team what permission level should count as 'admin' before restricting existing editors.

- [ ] **BUG-273** [버그 / 수정위험도:중간] DateInput이 월/일 범위를 검증하지 않아 '2025-13-45' 같은 무의미한 날짜 문자열이 그대로 onChange로 전파됨
  - 위치: `components/ui/DateInput.tsx:48-57, 68-78`
  - updateDate()(48-57행)는 `newYear.length===4 && newMonth.length===2 && newDay.length===2`만 확인하고 값의 의미(월 1-12, 일 1-31)는 검증하지 않은 채 `onChange(`${year}-${month}-${day}`)`를 호출한다. handleMonthChange(68-78행)에서 monthNum 범위 검사(73행)는 오직 다음 필드(day)로 자동 포커스를 옮길지 결정하는 데만 쓰이고, 그 아래 77행에서는 검사 결과와…
  - 권장 조치: Add month(1-12)/day(1-31) bounds validation before `updateDate()` calls `onChange`, since DateInput is a shared component consumed by CalendarModal and other pages — test each call site after the change to confirm no existing valid-date flow regresses.

- [ ] **BUG-294** [버그 / 수정위험도:중간] 새 문서 작성 중 문서 유형을 변경해도 첨부파일 누적 ref/savedId가 초기화되지 않아 이전 유형의 첨부파일이 새 문서에 섞여 저장됨
  - 위치: `app/admin/approvals/new/page.tsx:75-81, 91-164`
  - handleDocTypeChange()(75-81줄)는 formData와 title만 초기화하고 pendingAttachmentsRef.current, savedId는 그대로 둔다. 지출결의서에서 파일 A를 드롭하면 handleFileUpload가 문서를 자동 저장(savedId=docX)하고 pendingAttachmentsRef=[A]를 만든 뒤 PUT으로 저장한다. 이어서 구매요청서로 전환하면 formData는 재초기화되지만 savedId=docX,…
  - 권장 조치: In `handleDocTypeChange`, reset `pendingAttachmentsRef.current = []` and the saved document id so attachments from a previously-selected document type aren't merged into the newly-selected type's saved document.

- [ ] **BUG-295** [버그 / 수정위험도:중간] 전결(express-approve) 처리가 approve/reject와 달리 낙관적 락/트랜잭션 없이 step·문서 상태를 갱신해 중복 처리 시 알림이 이중 발송될 수 있음
  - 위치: `app/api/approvals/[id]/express-approve/route.ts:352-357, 377-388`
  - approve/route.ts(344-350줄)는 `UPDATE approval_steps ... WHERE id=$2 AND status='pending' RETURNING *`로 낙관적 락을 걸고, reject/route.ts(159-180줄)는 이를 transaction()으로 묶는다. express-approve/route.ts는 doc.is_express_approved를 328-330줄에서 확인만 하고, 352-357줄의 `UPDATE approval_steps SET…
  - 권장 조치: Mirror `approve/route.ts`'s pattern in `express-approve/route.ts` — add a `WHERE status = 'pending'` guard on the step UPDATE and wrap both updates in `transaction()` to prevent duplicate processing and duplicate notifications.

- [ ] **BUG-297** [버그 / 수정위험도:중간] 휴가원 기간 항목의 시작/종료일 수정 시 다른 항목과의 날짜 중복 검사가 빠져 total_days가 이중 계산될 수 있음
  - 위치: `components/approvals/forms/LeaveRequestForm.tsx:160-167, 201-215`
  - handleItemDate(201-204줄)와 handleAddItem/handleAddRange(169-231줄)는 모두 isDateUsed(160-167줄)로 다른 항목과의 날짜 겹침을 확인 후 차단한다. 그러나 handlePeriodDate(207-215줄, 기간 항목의 시작일/종료일 수정)는 start<=end 유효성만 확인할 뿐 isDateUsed 호출이 전혀 없다. 예: 단일 항목(08-10, 1일)과 별도 기간 항목(08-12~08-14)이 있는 상태에서 기간 항목의 시작일을…
  - 권장 조치: Add the same `isDateUsed`-style overlap check (excluding the item's own original range) to `handlePeriodDate` that `handleItemDate` already performs, to prevent resized periods from double-counting days claimed by other items.

- [ ] **MODULE-03** [모듈 선택 불일치 / 수정위험도:중간] Destructive actions confirm via native window.confirm() instead of the shared danger ConfirmModal
  - 위치: `components/ui/Modal.tsx`, `app/admin/air-permit-detail/page.tsx`, `components/business/MemoSection.tsx`, `app/admin/tasks/page.tsx` 외 3곳
  - components/ui/Modal.tsx ships a ConfirmModal helper with a `variant='danger'` styling, and it is proven out in air-permit (permit-level delete) and consistently across dpf (VehicleFormModal/SubRecordFormModal delete flows). But most delete/cancel flows across the codebase…
  - 권장 조치: Route destructive confirmations through the existing ConfirmModal (already validated in dpf and air-permit's permit-delete flow) instead of window.confirm(). Remove the dead ConfirmModal import in document-automation/page.tsx by actually wiring it up, or delete the unused import if the team decides otherwise.

- [ ] **BUG-057** [버그 / 수정위험도:높음] '발주 필요' (in_progress) and '진행 전' (not_started) tabs use non-exclusive criteria, double-counting businesses and listing the same business in both tabs
  - 위치: `app/api/order-management/route.ts:115-327 (in_progress branch), 328-379 (not_started branch), 556-594 (summary)`
  - The in_progress tab is populated from facility_tasks where status IN (self_product_order, subsidy_product_order, product_order) (lines 118-122). The not_started tab is populated from business_info where order_date IS NULL (line 330). I confirmed via…
  - 권장 조치: Make the not_started query exclude business_ids already present in an active facility_tasks product-order row (and vice versa exclude businesses with order_date already set from in_progress), then compute total_orders as one deduplicated count instead of summing three independently-queried branches — validate against a handful of known businesses in each stage before deploying, since this changes the stats every order-management user sees daily.

- [ ] **BUG-135** [버그 / 수정위험도:높음] getWeekRange() computes week boundaries in server-local (UTC) time, not KST, misattributing early-morning tasks to the wrong week
  - 위치: `app/api/weekly-reports/route.ts:64-80`
  - getWeekRange() (duplicated verbatim across route.ts, admin/route.ts, generate-all/route.ts, and realtime/route.ts) derives week start/end via date.getDay()/getDate()/setHours(0,0,0,0), all resolved in the JS runtime's local timezone. No TZ env var is set anywhere in the repo…
  - 권장 조치: Compute week boundaries in KST explicitly (e.g. apply a fixed +9h offset before deriving day-of-week/date, or use an Intl/date-fns-tz based calculation) instead of relying on the server runtime's local timezone, and extract getWeekRange into one shared, tested utility used by all four routes; treat this as a data-correctness fix requiring careful before/after validation since already-cached weekly_reports rows may have been computed with the wrong boundaries.

- [ ] **BUG-176** [버그 / 수정위험도:높음] Notification settings are never persisted — GET always returns hardcoded defaults and PUT never writes to the database
  - 위치: `app/api/notifications/settings/route.ts:56-117`
  - GET (lines 67-76) always returns the hardcoded `defaultSettings` object regardless of what the user previously saved (comment: "EMERGENCY FIX: 테이블이 존재하지 않으므로 항상 기본 설정 반환"), and PUT (lines 98-108) accepts the client's settings and echoes them back as `success:true` without…
  - 권장 조치: Create a `user_notification_settings` table via a Supabase migration and update GET/PUT to actually read/write per-user rows instead of returning hardcoded defaults/echoing input, since this needs a schema change and currently silently discards every user's saved preference.

- [ ] **BUG-265** [버그 / 수정위험도:높음] revenue/business-summary API 내부에 세 번째로 발산된 매출/원가/영업비 계산 로직
  - 위치: `app/api/revenue/business-summary/route.ts:456-619`
  - calculateBusinessRevenue()는 lib/services/revenue-calculator.ts(정본)와 세 가지 지점에서 발산한다. (1) 560-561행에서 government_pricing.manufacturer_price/installation_cost를 직접 읽는데, 이 컬럼들은 sql/revenue_management_schema.sql 11-12행에 'DEFAULT 0 -- 추후 설정'으로 정의된 사실상 미사용 레거시 컬럼이며, 실제 제조사별 원가/설치비는 별도…
  - 권장 조치: Retire this route's standalone `calculateBusinessRevenue()` and delegate to the canonical lib/services/revenue-calculator.ts (which already sources manufacturer/installation cost from manufacturer_pricing tables, nets negotiation discount into the commission base, and applies the adjustment fields) rather than patching the three divergences independently.

- [ ] **BUG-282** [버그 / 수정위험도:높음] 계산서 레코드 PUT 수정 시 record_type='revised' 레코드는 business_info 동기화가 스킵됨(POST와 상반)
  - 위치: `app/api/invoice-records/route.ts:138, 267`
  - POST의 동기화 조건(138행)은 `invoice_stage !== 'extra' && record_type !== 'cancelled'`로 'revised' 레코드도 포함해 business_info를 동기화한다. 반면 PUT의 동기화 조건(267행)은 `existing.record_type === 'original'`로 'revised' 레코드는 명시적으로 제외한다. 시나리오: subsidy_1st 원본 발행(동기화됨) → 금액 오류로 record_type='revised' 신규 레코드…
  - 권장 조치: Get a product decision on whether 'revised' invoice records should sync business_info on edit (as POST already does on creation), then align the PUT condition at line 267 accordingly — this is a financial-data consistency call, not a pure bug fix.

- [ ] **BUG-296** [버그 / 수정위험도:높음] 결재완료 탭의 '미처리/처리완료' 배지가 서버 limit=100에 의해 잘린 부분집합으로 계산되어 전체 건수와 불일치
  - 위치: `app/admin/approvals/page.tsx:282, 454-455, 532`
  - fetchDocs()는 결재완료 탭에서도 282줄 `params.set('limit', '100')`으로 100건까지만 조회하고, 그 total은 서버가 별도로 계산한 전체 COUNT(*)를 반환한다(app/api/approvals/route.ts 125-153줄: LIMIT과 무관하게 전체 카운트). renderCompletedTab()의 unprocessedCount/processedCount(454-455줄)는 서버 total이 아니라 화면에 로드된 docs(최대 100건)만 필터링한다.…
  - 권장 조치: Compute unprocessed/processed counts from a dedicated server-side aggregate query rather than the capped 100-row page, likely requiring a new count endpoint or extension of the existing total-COUNT query.

- [ ] **DESIGN-06** [디자인 일관성 / 수정위험도:높음] Three incompatible techniques solve the same 'table doesn't fit on mobile' problem across domains
  - 위치: `app/admin/air-permit-detail/page.tsx`, `app/admin/order-management/components/RouterInventoryList.tsx`, `app/admin/weekly-reports/[userId]/page.tsx`, `app/admin/as-management/page.tsx` 외 4곳
  - (a) Full duplicate-JSX dual-render — a separate `hidden md:block` desktop `<table>` plus a fully independent `md:hidden` mobile card-list markup fed by the same data — is used in air-permit-detail's outlet/facility table, tasks (TaskCard/TaskCardList), order-management…
  - 권장 조치: Adopt components/ui/DataTable (already noted as having a well-tuned responsive breakpoint ladder in the shared-ui review) as the canonical responsive-table pattern, and migrate the scroll-only tables (as-management, dpf's vehicle table, subsidy's monitoring pages) and the hand-duplicated dual-JSX lists (tasks, order-management, weekly-reports) onto it rather than each maintaining a bespoke mobile strategy.

- [ ] **MODULE-10** [모듈 선택 불일치 / 수정위험도:높음] Data table: canonical components/ui/DataTable.tsx has near-zero adoption outside admin-misc/data-history
  - 위치: `components/ui/DataTable.tsx`, `app/admin/data-history/page.tsx`, `components/business/InstallationBreakdownModal.tsx`, `app/admin/air-permit/page.tsx` 외 5곳
  - components/ui/DataTable.tsx offers built-in sort/search/pagination/selection and, per the shared-ui audit, is genuinely used in 9 files, but the only domain-review-confirmed real adopter is app/admin/data-history/page.tsx. Every other domain that renders tabular data hand-writes…
  - 권장 조치: Treat components/ui/DataTable.tsx as the default for any admin listing that needs sort/search/pagination, and migrate the raw-<table> implementations that already reinvent pagination by hand (dpf/DpfVehicleTable, order-management's page.tsx, subsidy's monitoring pages) first since they get the most direct benefit. Where a table also needs virtualization (revenue/page.tsx), consider extending DataTable with a virtualized mode rather than maintaining a separate @tanstack/react-virtual implementation.

- [ ] **MODULE-12** [모듈 선택 불일치 / 수정위험도:높음] Business/site search-and-select is solved by 4 divergent canonical components plus at least 4 more fully ad-hoc reimplementations
  - 위치: `components/ui/BusinessAutocomplete.tsx`, `components/inputs/BusinessAutocomplete.tsx`, `components/ui/AutocompleteInput.tsx`, `components/ui/AutocompleteSelectInput.tsx` 외 4곳
  - The shared-ui review already flags that 4 independent canonical autocomplete components coexist: components/ui/AutocompleteInput.tsx, components/ui/AutocompleteSelectInput.tsx, components/ui/BusinessAutocomplete.tsx, and components/inputs/BusinessAutocomplete.tsx (same name,…
  - 권장 조치: Before adding any more reimplementations, first collapse the two BusinessAutocomplete components (components/ui/ vs components/inputs/) into one, then migrate the fully ad-hoc reimplementations in air-permit, tasks, as-management, and document-automation's ContractManagement onto that single canonical component — all four are solving the identical 'search businesses, arrow-key navigate, select' problem with independently-written and independently-buggy keyboard handling.

- [ ] **MODULE-14** [모듈 선택 불일치 / 수정위험도:높음] Manager/assignee picker logic is reimplemented per-domain instead of reusing MultiAssigneeSelector/AdminManagerPicker
  - 위치: `components/ui/MultiAssigneeSelector.tsx`, `components/ui/AdminManagerPicker.tsx`, `app/admin/tasks/page.tsx`, `components/approvals/ApproverSelector.tsx` 외 3곳
  - components/ui/MultiAssigneeSelector.tsx and components/ui/AdminManagerPicker.tsx are the canonical pickers against the employees API, correctly used together in tasks/page.tsx. Elsewhere, the same underlying need — pick one or more people from the employee/approver list — is…
  - 권장 조치: Where the picker is choosing from the same employees/approvers pool (dev-work-log, CollectionManagerCell), migrate onto AdminManagerPicker rather than re-fetching and re-rendering the list independently. ApproverSelector has a genuinely different data shape (grouped approval-chain roles) so a full merge may not be warranted, but its dropdown/list rendering could still share the AdminManagerPicker search UI instead of a bare grouped <select>.

- [ ] **MODULE-17** [모듈 선택 불일치 / 수정위험도:높음] File upload widgets: the one shared UploadQueue/ProgressUploadCard/SmartFloatingProgress combo isn't reused by any bulk-upload feature reviewed
  - 위치: `components/ui/UploadQueue.tsx`, `components/ui/ProgressUploadCard.tsx`, `components/ui/SmartFloatingProgress.tsx`, `components/tasks/BulkUploadModal.tsx` 외 4곳
  - Per shared-ui, components/ui/UploadQueue.tsx + ProgressUploadCard.tsx + SmartFloatingProgress.tsx are combined for facility-photo uploads (ImprovedFacilityPhotoSection). Every other file-upload feature reviewed reimplements its own raw <input type="file"> handling with no shared…
  - 권장 조치: Standardize bulk-upload UI (dropzone + progress) on the UploadQueue/ProgressUploadCard combo already proven in the facility-photo flow; migrate wiki's admin PDF uploader first since it currently has no real progress feedback at all (just static text), then dpf's DpfImportUploader (which hand-rolls a percentage bar that ProgressUploadCard already provides).

## 🟢 Low (59건)

- [ ] **BUG-007** [버그 / 수정위험도:낮음] ExportDialog 다운로드 진행률 바가 항상 0%로 표시됨
  - 위치: `components/facility/ExportDialog.tsx:34-48`
  - handleExport only ever calls setProgress(0) (once at start, once in finally). Traced the onExport prop to ExportButtons.tsx's handleExport, which has no callback or shared state that could update ExportDialog's local progress state. No code path anywhere sets progress to a…
  - 권장 조치: Wire a real progress callback from ExportButtons.handleExport (or fetch/XHR progress events) into ExportDialog's setProgress instead of only ever calling setProgress(0).

- [ ] **BUG-025** [버그 / 수정위험도:낮음] Permit search predicate ignores the facility/location/pollutant fields its placeholder advertises
  - 위치: `app/admin/air-permit/page.tsx:290-306, 1157`
  - filterAirPermits only checks permit.id, permit.business_type, and a nonexistent permit.business_name field; facility name, installation location, and pollutant are never inspected despite the placeholder claiming otherwise. (evidence: filterAirPermits (290-306) checks…
  - 권장 조치: Update filterAirPermits to read permit.business?.business_name (matching the actual nested API shape) and add facility_name/location/pollutant checks so the search behaves as the placeholder text advertises.

- [ ] **BUG-026** [버그 / 수정위험도:낮음] Green link code casing is inconsistent between mobile and desktop discharge-facility inputs
  - 위치: `app/admin/air-permit-detail/page.tsx:1775, 1935, 2076, 2190`
  - Three of the four green-link-code onChange handlers call .toUpperCase(); the mobile discharge-facility one omits it, so the same field normalizes differently depending on device/facility type. (evidence: grep confirms: desktop discharge (line 1775) `.toUpperCase()`, desktop…
  - 권장 조치: Add .toUpperCase() to the mobile discharge-facility green-link-code onChange handler at line 2076 to match the other three handlers.

- [ ] **BUG-027** [버그 / 수정위험도:낮음] Unauthenticated leftover migration endpoint operates on columns that don't exist on air_permit_info
  - 위치: `app/api/add-pdf-fields/route.ts:13-159`
  - POST has no auth check and attempts blind writes/index creation against facility_number/green_link_code/memo, which are not real top-level columns in this schema (they live inside additional_info JSONB) — currently near-inert but still a reachable, unauthenticated production…
  - 권장 조치: Delete the unused add-pdf-fields route entirely (it targets non-existent top-level columns and has no callers), or at minimum add the same auth check used by other admin routes if it must stay.

- [ ] **BUG-037** [버그 / 수정위험도:낮음] 연장근무일지 요일 자동계산이 UTC 파싱을 사용해 UTC보다 뒤인 시간대에서 요일이 하루 밀림
  - 위치: `components/approvals/forms/OvertimeLogForm.tsx:30-35`
  - getDayOfWeek(dateStr)가 `new Date(dateStr)`로 'YYYY-MM-DD'를 파싱하는데, 날짜 전용 문자열은 ECMAScript 스펙상 UTC 자정으로 해석된다. 이후 `.getDay()`는 로컬 타임존 기준이므로 브라우저 타임존이 UTC보다 뒤(미국/유럽 등)면 요일이 하루 앞당겨진 값으로 계산되어 items[].day_of_week에 저장된다. (evidence: components/approvals/forms/OvertimeLogForm.tsx 30-35줄:…
  - 권장 조치: In getDayOfWeek(), parse dateStr by splitting 'YYYY-MM-DD' into numeric parts and constructing the Date with those local components (or use noon UTC) instead of `new Date(dateStr)`, avoiding UTC-based day-shift in timezones behind UTC.

- [ ] **BUG-050** [버그 / 수정위험도:낮음] 무상(free) AS건의 '금액 조정' 탭이 실제 매출집계(as-revenue)와 다른 자재원가/매출 금액을 표시
  - 위치: `app/admin/as-management/components/AsRecordModal.tsx:282-294, 926-941, 1083-1096`
  - '사용자재' 탭은 무상 건에서 단가/금액 컬럼을 숨기지만, totalMaterialCost/totalMaterialRevenue는 paid 여부와 무관하게 항상 계산되어 그대로 AsPricingAdjustmentTab에 전달된다. 반면 as-revenue/route.ts는 무상 건의 material_cost/material_revenue를 서버에서 강제로 0으로 계산한다. 담당자가 '금액 조정' 탭에서 잘못된 기준금액을 참고하게 된다. (evidence:…
  - 권장 조치: Zero out totalMaterialCost/totalMaterialRevenue when displayedPaidStatus is free (AsRecordModal.tsx L282-294) before passing them into AsPricingAdjustmentTab, mirroring the is_free CASE logic already used server-side in as-revenue/route.ts.

- [ ] **BUG-052** [버그 / 수정위험도:낮음] 엑셀 일괄 업로드에서 출동횟수에 숫자로 변환 불가능한 값을 입력하면 NaN이 INSERT 파라미터로 전달되어 행 전체가 원인 불명의 실패로 처리됨
  - 위치: `app/api/as-records/bulk-upload/route.ts:197-200`
  - dispatchCount는 Math.max(1, Math.round(Number(dispatchCountRaw)))로 계산된다. '출동횟수' 컬럼에 순수 숫자가 아닌 값("2회", "두번" 등)을 입력하면 Number()가 NaN을 반환하고 Math.max/Math.round 모두 NaN을 그대로 전파해 dispatchCount가 NaN이 된다. 이 값이 INSERT 파라미터로 전달되면 정수 컬럼 바인딩 실패로 예외가 발생해 해당 행 전체가 '저장 실패'로 처리되며, 실제 원인(출동횟수 값…
  - 권장 조치: Validate dispatchCountRaw with `Number.isFinite(Number(dispatchCountRaw))` before computing dispatchCount (bulk-upload/route.ts L197-200); on invalid input default to 1 and record a specific per-row warning instead of letting NaN propagate into a generic '저장 실패'.

- [ ] **BUG-055** [버그 / 수정위험도:낮음] PurchaseOrderModal is rendered twice; the second instance is missing the required isOpen prop (currently dead/no-op, but a landmine for future edits)
  - 위치: `app/admin/order-management/components/OrderDetailModal.tsx:650-657, 711-717`
  - When showPurchaseOrderModal is true, two separate JSX blocks both render <PurchaseOrderModal>: lines 650-657 (correctly passing isOpen={showPurchaseOrderModal}) and lines 711-717 (omitting isOpen entirely). Confirmed PurchaseOrderModal.tsx requires isOpen: boolean (line 12, not…
  - 권장 조치: Delete the duplicate, dead <PurchaseOrderModal> block at OrderDetailModal.tsx L711-717 (missing the required isOpen prop); the correctly-wired instance at L650-657 already renders this modal.

- [ ] **BUG-063** [버그 / 수정위험도:낮음] PUT /api/order-management/[businessId]에서 5개 알려진 필드가 하나도 없으면 SET 절이 비어 SQL 문법 오류로 이어짐 (현재는 위의 TDZ 크래시가 더 먼저 발생해 도달 불가능하지만 별개의 실결함)
  - 위치: `app/api/order-management/[businessId]/route.ts:249-289`
  - updateFields 배열은 body에 layout_date/order_form_date/ip_request_date/greenlink_ip_setting_date/router_request_date 중 하나라도 있을 때만 채워진다. 이 5개 키가 전혀 없는 요청 본문이 오면 updateFields.join(', ')가 빈 문자열이 되어 `UPDATE order_management SET  WHERE business_id = $1 RETURNING *`라는 문법 오류 SQL이 만들어진다. 현재…
  - 권장 조치: Add a guard right after building updateFields in the PUT handler: if updateFields.length === 0, return a 400 'no fields to update' response before constructing the SQL string, mirroring the empty-body validation pattern used elsewhere in the file.

- [ ] **BUG-064** [버그 / 수정위험도:낮음] BusinessQuickView의 z-60/z-61 Tailwind 클래스는 대괄호 없는 임의값이라 CSS가 생성되지 않음
  - 위치: `app/admin/order-management/components/BusinessQuickView.tsx:50, 53`
  - Tailwind 기본 z-index 스케일은 0/10/20/30/40/50/auto뿐이며 tailwind.config.js에 zIndex 확장이 없음을 확인했다(grep 결과 없음). z-60(line 50), z-61(line 53)은 대괄호 문법(z-[60]) 없이 그대로 사용되어 어떤 CSS 규칙도 생성하지 않는다. z-61이 붙은 내부 div(line 53)는 position 관련 클래스가 전혀 없어 static이므로 z-index가 애초에 적용될 수 없는 요소이기도 하다. 현재는…
  - 권장 조치: Replace z-60/z-61 with bracket syntax (z-[60]/z-[61]) or the nearest standard scale value (z-50/z-40 relative to the parent's z-50), and ensure the line-53 div actually needs stacking (it's currently position:static so also add a position class if the layer is meant to be controlled).

- [ ] **BUG-065** [버그 / 수정위험도:낮음] 발주 상세 모달 헤더의 진행률/단계 완료 수가 실시간 입력을 반영하지 않고 저장 전까지 정체됨
  - 위치: `app/admin/order-management/components/OrderDetailModal.tsx:362-368, 379-392, 554-555`
  - 헤더의 'N/M 단계 완료' 텍스트(362-368행)와 진행률 바(379-392행)는 최초 로드시 서버에서 받은 data.workflow.completed_steps/total_steps/progress_percentage를 그대로 렌더링하며 loadOrderDetail() 재호출 전까지 갱신되지 않는다. 반면 각 단계 카드의 체크 아이콘/테두리(line 555, isStepCompleted = !!stepDates[step.field])는 로컬 state stepDates를 실시간 참조한다.…
  - 권장 조치: Compute completed_steps/total_steps/progress_percentage for the header from the local stepDates state (e.g. Object.values(stepDates).filter(Boolean).length) instead of the stale data.workflow snapshot, so the header updates in lockstep with the per-step check icons.

- [ ] **BUG-071** [버그 / 수정위험도:낮음] 타 제조사 발주서 생성 시 이력 저장 API의 응답 상태를 확인하지 않아 실패해도 성공 메시지가 표시됨
  - 위치: `app/admin/document-automation/components/PurchaseOrderModal.tsx:241-269`
  - 244-260행의 fetch('/api/document-automation/history', ...) 호출은 response.ok를 검사하지 않는다. fetch는 401/500 등 HTTP 오류 상태에서 예외를 던지지 않으므로 261-263행의 catch(console.error만 수행)는 실행되지 않고, 곧바로 265행에서 '발주서 PDF가 생성되었습니다.' 성공 알림이 무조건 표시된다. (evidence: 244-260행에서 fetch 응답을 await만 하고…
  - 권장 조치: Check response.ok (or response.status) on the history-save fetch before showing the '발주서 PDF가 생성되었습니다' alert, and show an error alert instead when it fails, matching the existing catch-block pattern already present just below.

- [ ] **BUG-076** [버그 / 수정위험도:낮음] 제5조 품질보증 비율의 fallback 기본값('5')이 신규 착공신고서 폼의 기본값('10')과 불일치
  - 위치: `app/admin/document-automation/components/construction-report/ContractGovernmentTemplate.tsx:251`
  - ConstructionReportManagement.tsx는 새 착공신고서 작성 시 contract_bond_rate 초기값을 항상 '10'으로 설정한다(147, 352행). 반면 ContractGovernmentTemplate.tsx(251행)와 ContractBusinessTemplate.tsx(300행)의 제5조는 `data.contract_bond_rate || '5'`로 폴백 기본값을 '5'로 사용한다. 이 필드가 없는(도입 이전) report_data를 이력에서 재조회하여…
  - 권장 조치: Change the fallback in both templates' 제5조 (`data.contract_bond_rate || '5'`) to `|| '10'` to match the form's actual default in ConstructionReportManagement.tsx (lines 147, 352); this is a one-word fallback-value fix in two files, low risk since it only affects records with an unset contract_bond_rate.

- [ ] **BUG-095** [버그 / 수정위험도:낮음] 죽은 코드 lib/invoice-receivables.ts가 'Single Source of Truth'를 자처하지만 실제로는 미사용이며 receivables-engine.ts와 로직이 갈라져 있음
  - 위치: `lib/invoice-receivables.ts:119-150`
  - 헤더 주석(1-11행)은 '테이블과 모달 모두 이 함수를 사용'한다고 주장하나 grep 결과 저장소 어디에서도 import되지 않는 완전한 죽은 코드다. computeReceivables()는 contractAmount>0으로 호출되면(122행 if(!baseAmount) 스킵) extra 계산서 금액을 baseAmount에 더하지 않아(149행에서만 fallback 분기 한정 반영), receivables-engine.ts의 computeBusinessReceivableNow(항상…
  - 권장 조치: Since grep confirms lib/invoice-receivables.ts has zero importers, either delete the dead file or fix its header comment and extra-invoice handling to match receivables-engine.ts — either way there are no live call sites to regress.

- [ ] **BUG-101** [버그 / 수정위험도:낮음] 매출 계산 조회 API가 limit/offset 파라미터를 파싱만 하고 실제 쿼리에는 적용하지 않음
  - 위치: `app/api/revenue/calculate/route.ts:180-219, 264-273`
  - GET 핸들러는 limit/offset을 쿼리 파라미터에서 읽지만(180-181행) 실제 SQL은 LIMIT/OFFSET 절 없이 전체 필터 결과를 반환한다(214-219행). 응답의 pagination.has_more: calculations.length === limit(272행)도 실제 페이지네이션과 무관하게 계산되어 부정확하다. 현재 프런트(app/admin/revenue/page.tsx)는 limit/offset을 보내지 않아 당장은 영향이 적다. (evidence:…
  - 권장 조치: Append parameterized LIMIT/OFFSET clauses to the raw SQL in app/api/revenue/calculate/route.ts and compute has_more by fetching limit+1 rows (or a separate COUNT) instead of comparing calculations.length to limit.

- [ ] **BUG-118** [버그 / 수정위험도:낮음] Participant role fallback order differs between create and edit pages for the same feature
  - 위치: `app/admin/meeting-minutes/create/page.tsx:143`
  - toggleInternalParticipant in create/page.tsx sets `role: employee.position || employee.department || ''` (position preferred), while the equivalent function in app/admin/meeting-minutes/[id]/edit/page.tsx sets `role: employee.department || employee.position || ''` (department…
  - 권장 조치: Pick one canonical fallback order (position || department, matching create/page.tsx) and apply it in both create/page.tsx and edit/page.tsx's participant-role-assignment code.

- [ ] **BUG-120** [버그 / 수정위험도:낮음] Negative days-elapsed produces a nonsensical '-N일 전' label for future-dated regular meetings
  - 위치: `app/api/meeting-minutes/recurring-issues/route.ts:132-134`
  - daysElapsed = Math.floor((today.getTime() - meetingDate.getTime()) / (1000*60*60*24)) has no clamp at 0 and no guard for meetings scheduled in the future. A pre-created future-dated 정기회의 (status draft, not archived) with an incomplete business issue or sub-100% agenda item…
  - 권장 조치: Clamp daysElapsed with Math.max(0, ...) in recurring-issues/route.ts and add a matching negative-value guard to getDaysElapsedLabel/getDaysElapsedColor in both RecurringIssuesPanel.tsx and RecurringIssueCard.tsx.

- [ ] **BUG-127** [버그 / 수정위험도:낮음] Third StatCard on the detail page shows in_progress_tasks count under an "average days" label
  - 위치: `app/admin/weekly-reports/[userId]/page.tsx:305`
  - `<StatCard icon={Clock} label={`평균 ${report.average_completion_time_days}일`} value={report.in_progress_tasks} color="yellow" />`. StatCard (lines 98-125) renders `value` as the large headline number and `label` as the small caption. So the big number shown is the in-progress…
  - 권장 조치: Swap the StatCard props so `value={report.in_progress_tasks}` is paired with a '진행중' label, and give the average-completion-time metric its own StatCard with `value={report.average_completion_time_days}`.

- [ ] **BUG-141** [버그 / 수정위험도:낮음] 임포트 오류 행 번호가 실제 청크 크기(200)와 다른 상수(1000)로 계산됨
  - 위치: `app/api/dpf/import/route.ts:30`
  - components/dpf/DpfImportUploader.tsx 28행의 CHUNK_SIZE는 200인데, app/api/dpf/import/route.ts 30행은 row_index: chunkIndex * 1000 + i 로 계산한다. 두 번째 청크(chunkIndex=1, 실제 행 201~400번)에서 오류가 나면 row_index가 1000~1199 값으로 저장되어 DpfImportUploader.tsx 303행의 오류 내역("행 {e.rowIndex}")에 잘못된 행 번호가 그대로…
  - 권장 조치: Change app/api/dpf/import/route.ts:30 to use `chunkIndex * 200 + i` (or import a shared CHUNK_SIZE constant) so row_index matches the client's actual 200-row chunk size.

- [ ] **BUG-143** [버그 / 수정위험도:낮음] 'prev_plate' 렌더링 분기가 COLUMNS 목록에 없어 절대 표시되지 않는 죽은 코드
  - 위치: `components/dpf/DpfVehicleTable.tsx:22-42, 95, 209-213`
  - cellValue()의 switch문 95행에 case 'prev_plate'가 정의되어 있지만, 실제 렌더링에 쓰이는 COLUMNS 배열(22-42행)에는 'prev_plate' 키가 없다. 209-213행은 COLUMNS.map(col => cellValue(v, col.key))만 호출하므로 이 case는 절대 실행되지 않으며, raw_data의 '이전 차량번호' 값을 목록 화면에서 볼 방법이 없다. (evidence:…
  - 권장 조치: Decide with the product owner whether '이전 차량번호' should be visible, then either add a 'prev_plate' entry to the COLUMNS array in DpfVehicleTable.tsx or delete the unreachable case 'prev_plate' branch.

- [ ] **BUG-146** [버그 / 수정위험도:낮음] 차량 생성/수정 API가 vendor 값을 'fujino'|'mz'로 검증하지 않음
  - 위치: `app/api/dpf/vehicles/route.ts, app/api/dpf/vehicles/[vin]/route.ts:vehicles/route.ts:33, vehicles/[vin]/route.ts:32`
  - POST의 `vendor: vendor || 'fujino'`(vehicles/route.ts 33행)와 PUT의 `if (vendor !== undefined) updateData.vendor = vendor;`(vehicles/[vin]/route.ts 32행) 모두 vendor 값이 'fujino'|'mz' 두 값인지 검증하지 않는다. app/dpf/[vin]/page.tsx의 ALL_TABS 필터(`tabs.vendors.includes(vehicle.vendor ??…
  - 권장 조치: In both app/api/dpf/vehicles/route.ts (POST) and app/api/dpf/vehicles/[vin]/route.ts (PUT), validate vendor is one of ['fujino','mz'] and return 400 otherwise, matching the UI's radio-button restriction.

- [ ] **BUG-148** [버그 / 수정위험도:낮음] 임포트 처리 전 카운트 쿼리 오류가 무시되고 '처리할 데이터 없음'으로 오표시됨
  - 위치: `app/api/dpf/import/process/route.ts:19-27`
  - batchId에 해당하는 대기 행 수를 조회하는 supabaseAdmin.from('dpf_import_staging').select(...).eq(...).eq('status','pending') 호출(19-23행)에서 반환값 중 error가 구조분해되지 않고 버려진다. 쿼리 자체가 실패하면 count는 null이 되고 `if (!count)`(25행)가 참이 되어 실제 원인과 무관한 '처리할 데이터가 없습니다' 메시지가 노출되며 실제 DB 오류는 로그에도 남지 않는다. (evidence:…
  - 권장 조치: In app/api/dpf/import/process/route.ts, destructure and log `error` from the pending-count query, and only return the '처리할 데이터가 없습니다' message when error is null and count is exactly 0.

- [ ] **BUG-158** [버그 / 수정위험도:낮음] Sidebar tree 'active' highlighting uses substring match, causing the parent root node to always be highlighted alongside any open chapter
  - 위치: `components/wiki/WikiNodeTree.tsx:24`
  - `const isActive = pathname.includes(node.slug ?? node.id)` uses substring containment. Because chapter slugs are generated as `${rootSlug}-ch${i+1}-${titleSlug}` (app/api/wiki/upload-guideline/route.ts line 233), the root node's slug is structurally always a literal prefix of…
  - 권장 조치: Replace the substring check `pathname.includes(node.slug ?? node.id)` in WikiNodeTree.tsx with an exact match like `pathname === `/wiki/${node.slug ?? node.id}`` so the root node no longer highlights alongside its open chapters.

- [ ] **BUG-164** [버그 / 수정위험도:낮음] Unauthenticated diagnostic endpoint triggers real embedding API calls and leaks internal DB counts
  - 위치: `app/api/wiki/debug/route.ts:9-91`
  - POST /api/wiki/debug has no authentication check despite the file's own comment calling it a temporary diagnostic endpoint. Every call generates a live Gemini embedding and performs Supabase RPC + raw fetch calls with the service-role key, returning internal…
  - 권장 조치: Either delete this diagnostic route entirely (it's explicitly labeled temporary) or gate it behind the same JWT + permission_level>=4 check used elsewhere in the wiki API, to stop unauthenticated callers from triggering billed embedding calls and leaking node counts.

- [ ] **BUG-174** [버그 / 수정위험도:낮음] Notification history search/type/priority/days filters are parsed but never applied to the query
  - 위치: `app/api/notifications/history/route.ts:51-98, 92-98, 127-195`
  - GET parses search, type, priority, and days from query params (lines 54-57) and computes startDate, but the actual task_notifications query at lines 92-98 (`.eq('user_id', user.id).order('created_at', {ascending:false})`) applies none of them — no date range, no text search, no…
  - 권장 조치: Apply the already-parsed search/type/priority/days filters to the task_notifications query (ilike on title/message, .eq on type/priority, and a computed startDate .gte on created_at) instead of only returning them unused in the response metadata.

- [ ] **BUG-177** [버그 / 수정위험도:낮음] /api/notifications/simple GET excludes notifications with no expiration date (NULL expires_at)
  - 위치: `app/api/notifications/simple/route.ts:96-118`
  - The general-notifications query uses `.gte('expires_at', new Date().toISOString())` (line 116). In PostgREST/Postgres, a NULL column value never satisfies a `>=` comparison, so any notification row with expires_at = NULL is silently excluded from results — every other live…
  - 권장 조치: Change `.gte('expires_at', now)` to `.or('expires_at.is.null,expires_at.gt.' + now)` to match the null-inclusive pattern already used in app/api/notifications/route.ts, so never-expiring notifications aren't silently dropped if this endpoint is ever wired up.

- [ ] **BUG-178** [버그 / 수정위험도:낮음] /api/notifications/simple read/delete endpoints report success even when zero rows were actually affected
  - 위치: `app/api/notifications/simple/route.ts:346-367, 420-441`
  - POST (individual read) and DELETE both treat a Promise.allSettled 'fulfilled' status as success (lines 363, 434), but a Supabase update()/delete() whose WHERE clause matches 0 rows (e.g. wrong id, or a notification owned by a different user) still resolves as 'fulfilled' with…
  - 권장 조치: Check the actual `data`/row count returned by each Promise.allSettled result (not just its 'fulfilled' status) before incrementing updatedCount or setting deleteSuccess, so a 0-row match doesn't get reported as a successful read/delete.

- [ ] **BUG-179** [버그 / 수정위험도:낮음] Default tier-notification category 'general' is not a recognized NotificationCategory, so its label renders blank
  - 위치: `app/api/notifications/route.ts:481`
  - createTierNotification's caller defaults `category: category || 'general'` (line 481) when POST /api/notifications is called with notification_tier set but no category. 'general' is not a member of the NotificationCategory union in contexts/NotificationContext.tsx:12-19, nor a…
  - 권장 조치: Change the default category fallback from 'general' to an existing member of the NotificationCategory union (and matching key in categoryLabels), and apply this alongside the fix for finding #7 so the corrected insert path doesn't immediately introduce a blank-label regression.

- [ ] **BUG-180** [버그 / 수정위험도:낮음] Push subscription settings panel would show "Invalid Date" for last update (field never returned by the API) — currently dead code
  - 위치: `components/notifications/PushNotificationSettings.tsx:176-181`
  - PushNotificationSettings renders `formatDate(subscriptionInfo.updated_at)` (line 179) for '마지막 업데이트', but GET /api/push-subscription (app/api/push-subscription/route.ts:171-181) only ever returns `{created_at, last_used_at, endpoint}` on subscriptionInfo — there is no updated_at…
  - 권장 조치: Either add `updated_at` to the GET /api/push-subscription response or change the component to display the already-returned `last_used_at`/`created_at` field instead, and add an undefined guard in formatDate so it never renders the literal 'Invalid Date' string.

- [ ] **BUG-181** [버그 / 수정위험도:낮음] Push subscription status check can under-report as unsubscribed due to an unawaited init race — currently dead code
  - 위치: `lib/push-notifications.ts:226-233, 258-283, 308-319`
  - isSubscribed() returns false immediately if `this.registration` is still null (line 227-229), and registration is only set inside requestPermission() or ensureSubscription() (line 266). components/providers/ClientProviders.tsx:25-27 fires…
  - 권장 조치: In lib/push-notifications.ts, make isSubscribed() await service-worker readiness (or an explicit init Promise set by ensureSubscription()/requestPermission()) before reading this.registration, and address it opportunistically since usePushNotifications currently has no live renderer.

- [ ] **BUG-187** [버그 / 수정위험도:낮음] 차트 loadData()에 요청 취소/순서 보장이 없어 빠른 연속 클릭 시 오래된 응답이 최신 응답을 덮어쓸 수 있음
  - 위치: `components/dashboard/charts/RevenueChart.tsx:46-74`
  - RevenueChart/ReceivableChart/InstallationChart/MonthlyLeadsChart/WeeklyScorecard의 loadData()는 모두 AbortController나 요청 세대 체크 없이 fetch→setState 패턴을 쓴다. periodPreset 버튼을 빠르게 연속 클릭하면 여러 fetch가 동시에 진행되어, 네트워크 타이밍에 따라 마지막 클릭이 아닌 마지막 도착 응답이 최종 화면을 결정할 수 있다. (evidence: grep 결과…
  - 권장 조치: Add an AbortController (or an incrementing request-id ref checked before setState) to loadData() in RevenueChart, ReceivableChart, InstallationChart, MonthlyLeadsChart, and WeeklyScorecard so a stale response from a rapid preset click can't overwrite a newer one; this is purely additive and doesn't change existing business logic.

- [ ] **BUG-213** [버그 / 수정위험도:낮음] Social account unlink API reads a cookie name ('auth-token') no live login path sets, making it always 401
  - 위치: `app/api/auth/social/unlink/route.ts:13`
  - DELETE reads only request.cookies.get('auth-token') (hyphen) with no Authorization header fallback. The standard login sets 'session_token'; the Kakao callback sets 'auth_token' (underscore). Only the kakao-simple/google-simple/naver-simple routes set 'auth-token' (hyphen). Grep…
  - 권장 조치: Change the DELETE handler to read 'session_token' (or accept an Authorization header) instead of the unused 'auth-token' cookie name; confirmed dead code with no frontend caller today.

- [ ] **BUG-227** [버그 / 수정위험도:낮음] handleUserToggle silently does nothing on failure
  - 위치: `app/admin/users/page.tsx:583-608`
  - handleUserToggle only has `if (response.ok) { ...update state...; alert(success) }` with no else branch, unlike handleUserEdit and handleApprovalAction-adjacent handlers in the same file that alert() on failure paths. (evidence: Read the function directly: after the fetch, only…
  - 권장 조치: Add an else branch to handleUserToggle that alert()s the error text on non-ok responses, matching the pattern used elsewhere on this page.

- [ ] **BUG-238** [버그 / 수정위험도:낮음] 담당자 변경 히스토리 삭제 시 count 옵션 누락으로 삭제 건수가 항상 null로 표시됨
  - 위치: `app/api/organization/task-assignments/route.ts:376-400`
  - DELETE 핸들러는 `.delete()`에 count 옵션(`{ count: 'exact' }`)을 지정하지 않고 `const { error, count } = await query`로 count를 사용해 응답 메시지와 deleted_count를 채운다. supabase-js는 count 옵션 없이는 count를 항상 null로 반환하므로 삭제 자체는 정상 수행되지만 응답은 항상 'null개의 담당자 변경 히스토리가 정리되었습니다.'와 deleted_count: null을 반환한다.…
  - 권장 조치: Add `{ count: 'exact' }` to the .delete() call in the DELETE handler so the returned count reflects actual deleted rows instead of always being null.

- [ ] **BUG-254** [버그 / 수정위험도:낮음] InvoiceManagement.tsx gates invoice-card rendering on business_category instead of progress_status, so cards never render for real data (dead code)
  - 위치: `components/business/InvoiceManagement.tsx:273, 308`
  - Lines 273 and 308 render subsidy/self-pay invoice cards via `business.business_category === '보조금'` / `=== '자비'`. app/api/business-invoices/route.ts (the actual data source, line 70) contains the explicit comment 'progress_status(진행구분)를 사용 (business_category는 대기필증 종별이므로 무관)' --…
  - 권장 조치: Change the two gating conditions in InvoiceManagement.tsx to check business.progress_status === '보조금'/'자비' instead of business_category, per the comment in business-invoices/route.ts; low impact since the component is currently unused/unimported anywhere.

- [ ] **BUG-255** [버그 / 수정위험도:낮음] business-contacts POST upserts business_info using Korean keys that are not real column names (always fails, dead code)
  - 위치: `app/api/business-contacts/route.ts:160-176`
  - The POST handler upserts into `business_info` using keys 주소, 담당자명, 담당자연락처, 사업장연락처, 사업자등록번호, 대표자, 업종 (lines 164-170). Confirmed via lib/supabase-business.ts, business-info-direct/route.ts's selectFields, and the db-schema skill that business_info's real columns are the English…
  - 권장 조치: Rename the Korean upsert keys in business-contacts/route.ts POST to the real English column names (address, manager_name, manager_contact, business_contact, business_registration_number, representative_name, business_type); safe since the route has no current callers.

- [ ] **BUG-256** [버그 / 수정위험도:낮음] business-equipment-counts PUT overwrites additional_info wholesale instead of merging (currently unreferenced by frontend)
  - 위치: `app/api/business-equipment-counts/route.ts:25-49`
  - The update object sets `additional_info: { equipment_summary: {...} }` directly (lines 38-44) as the entire new column value, without first reading and spreading the existing additional_info JSONB. Confirmed that other live code paths store/read other keys under the same column:…
  - 권장 조치: In business-equipment-counts/route.ts PUT, first read the existing additional_info for the business and spread it before overwriting, e.g. `additional_info: {...existing, equipment_summary: {...}}`; safe since the route is currently unreferenced by any frontend caller.

- [ ] **BUG-261** [버그 / 수정위험도:낮음] Bulk-upload chunk progress message is set but never rendered; type mismatch on setIsUploading
  - 위치: `components/tasks/BulkUploadModal.tsx:26, 266, 511`
  - isUploading is declared as boolean state (useState(false)) but line 266 calls setIsUploading with a template-literal progress string during sequential chunk upload. Reproduced with `npx tsc --noEmit`: TS2345 'string' not assignable to 'SetStateAction<boolean>'. Confirmed…
  - 권장 조치: Split state into `isUploading: boolean` plus a separate `uploadProgress: string` state, set the latter during chunk upload, and render `uploadProgress` in the button text instead of the static '업로드 중...' label.

- [ ] **BUG-262** [버그 / 수정위험도:낮음] SSE /api/tasks/stream never removes disconnected clients due to wrong `this` binding in cancel()
  - 위치: `app/api/tasks/stream/route.ts:111-115`
  - cancel() is a shorthand method on the object literal passed to new ReadableStream({...}), so `this` refers to that source object, not the controller instance added to the module-level clients Set inside start(controller). `clients.delete(this as any)` is therefore always a no-op…
  - 권장 조치: Capture the controller in a local closure variable inside `start(controller)` and reference that variable (not `this`) inside `cancel()` so `clients.delete(...)` actually removes the disconnected client.

- [ ] **BUG-267** [버그 / 수정위험도:낮음] lib/invoice-receivables.ts — 참조되지 않는 죽은 코드에 'Single Source of Truth' 주석이 오도됨
  - 위치: `lib/invoice-receivables.ts:1-15, 51`
  - 파일 헤더(1-12행)는 '미수금 계산 핵심 로직 — 단일 진실 공급원(SSOT)... 테이블(revenue page)과 모달(business-invoices API) 모두 이 함수를 사용합니다'라고 명시하지만, export async function computeReceivables()(51행)는 app/, lib/, components/ 전체에서 어디에서도 import되지 않는 완전한 dead code다. 실제 SSOT는 lib/receivables-engine.ts의…
  - 권장 조치: Delete the unused `computeReceivables()` export (and file, if nothing else lives in it) since grep confirms zero importers and lib/receivables-engine.ts is the actual consumed SSOT; safe to remove with no functional impact.

- [ ] **BUG-275** [버그 / 수정위험도:낮음] ProjectCard의 ⋮ 드롭다운 메뉴에 외부 클릭 닫기 핸들러가 없어 메뉴가 계속 열려있음
  - 위치: `components/projects/ProjectCard.tsx:29, 134-176`
  - showMenu 상태(29행)를 토글하는 드롭다운(134-176행)이 외부 클릭을 감지해 닫는 useEffect+mousedown 리스너를 전혀 갖고 있지 않다. 같은 프로젝트의 components/inputs/BusinessAutocomplete.tsx(89-103행)나 components/ui/BusinessAutocomplete.tsx(62행 이하)는 동일한 패턴을 useRef+document.addEventListener('mousedown', ...)로 구현하고 있어 이 컴포넌트에서만…
  - 권장 조치: Add a useRef + document mousedown listener to close the ⋮ dropdown on outside click, copying the existing pattern from components/inputs/BusinessAutocomplete.tsx.

- [ ] **BUG-289** [버그 / 수정위험도:낮음] BulkUploadModal의 청크 업로드 진행률 텍스트가 boolean state에 저장되어 화면에 표시되지 않음
  - 위치: `components/tasks/BulkUploadModal.tsx:28, 266, 511`
  - line 28 `useState(false)`로 isUploading을 boolean으로 선언했는데, 청크 업로드 루프의 line 266에서 `setIsUploading(\`업로드 중... (${chunkNumber}/${chunks.length})\`)`처럼 문자열을 대입한다. 렌더링부인 line 511은 `{isUploading ? '업로드 중...' : ...}`로 값이 아닌 truthy 여부만 사용하므로, 계산된 청크 진행률 문자열('업로드 중... (2/5)' 등)은 화면에 전혀…
  - 권장 조치: Change `isUploading` to a `string | boolean` type (or add a separate `uploadProgress` string state) and render that value in the progress UI instead of only checking truthiness.

- [ ] **BUG-290** [버그 / 수정위험도:낮음] AmountInput에서 금액을 0으로 입력하면 저장 후 재렌더링 시 표시값이 빈 문자열로 초기화됨
  - 위치: `components/tasks/BusinessInfoPanel.tsx:148-156, 496-508`
  - AmountInput의 초기 state(line 148-151)와 value prop 동기화 useEffect(line 153-156)가 모두 `value && !isNaN(n) ? n.toLocaleString() : ''` 형태로 truthy 체크를 사용한다. 사용자가 '0'을 입력하면 setAmount(line 496-498)가 `v ? parseInt(v) : null`로 저장하는데 문자열 '0'은 truthy이므로 draft에 숫자 0이 저장된다. getAmt(line 505-508)가…
  - 권장 조치: In `AmountInput`, replace the `value && !isNaN(n)` truthy checks with explicit null/undefined/empty-string checks so a saved amount of 0 doesn't render as a blank field.

- [ ] **BUG-293** [버그 / 수정위험도:낮음] 결재라인 미리보기가 대표이사(ceo) 작성 문서에서도 팀장/중역/부사장 칸을 표시함
  - 위치: `components/approvals/ApprovalLineHeader.tsx:44-52`
  - steps가 없는 draft 미리보기 상태에서 showTeamLeader/showExecutive/showVicePresident 계산식이 'ceo' role을 제외 목록에서 빠뜨렸다. requesterRole='ceo'일 때 showTeamLeader = ('ceo'!=='executive' && 'ceo'!=='team_leader' && 'ceo'!=='vice_president') = true, showExecutive/showVicePresident도 동일 로직으로 true가 된다.…
  - 권장 조치: Add `'ceo'` to the exclusion conditions in `ApprovalLineHeader.tsx` alongside `'vice_president'`, matching the already-correct logic in `lib/approval-line.ts` and `ApproverSelector.tsx`.

- [ ] **BUG-301** [버그 / 수정위험도:낮음] components/ui/ 내 8개 컴포넌트가 앱 어디에서도 사용되지 않는 죽은 코드
  - 위치: `components/ui/StableNotificationButton.tsx:1`
  - app/, components/, lib/, hooks/ 전체(worktree 제외)에서 파일명 문자열로 grep한 결과 AdvancedUploadProgress.tsx, GoogleSheetsImporter.tsx, InlineProgressIndicator.tsx, MobileStickyProgress.tsx, NotificationButton.tsx, OptimizedUploadDemo.tsx, SmartLoadingStates.tsx, StableNotificationButton.tsx…
  - 권장 조치: Delete all 8 files (AdvancedUploadProgress.tsx, GoogleSheetsImporter.tsx, InlineProgressIndicator.tsx, MobileStickyProgress.tsx, NotificationButton.tsx, OptimizedUploadDemo.tsx, SmartLoadingStates.tsx, StableNotificationButton.tsx) from components/ui/ in one commit — grep confirms zero external imports (including tests/stories) and no barrel index.ts re-exports them, so removal cannot affect any runtime code path.

- [ ] **BUG-302** [버그 / 수정위험도:낮음] components/sections/ 내 5개 컴포넌트가 앱 어디에서도 사용되지 않는 죽은 코드
  - 위치: `components/sections/FacilityOverviewSection.tsx:1`
  - grep으로 확인한 결과 EquipmentFieldCheckSection.tsx, FacilityOverviewSection.tsx, FacilityPhotoUploadSection.tsx, GatewayInfoSection.tsx, SupabasePhotoUploadSection.tsx 5개 컴포넌트는 어느 페이지에서도 import되지 않는다. EquipmentFieldCheckSection은 EnhancedFacilityInfoSection.tsx 안에서 60번째 줄과 207번째 줄에…
  - 권장 조치: Delete all 5 files (EquipmentFieldCheckSection.tsx, FacilityOverviewSection.tsx, FacilityPhotoUploadSection.tsx, GatewayInfoSection.tsx, SupabasePhotoUploadSection.tsx) from components/sections/ in one commit — the only hit for EquipmentFieldCheckSection is a plain-text comment in EnhancedFacilityInfoSection.tsx (not an import), and grep confirms no other file, test, or barrel index references any of the five, so removal is functionally inert.

- [ ] **MODULE-05** [모듈 선택 불일치 / 수정위험도:낮음] Currency display: dominant '원'-suffix convention vs a minority Intl.NumberFormat '₩'-symbol style, plus duplicated local formatters
  - 위치: `utils/formatters.ts`, `components/business/InstallationBreakdownModal.tsx`, `components/business/InvoiceDisplayCard.tsx`, `app/admin/revenue/test/page.tsx` 외 4곳
  - The overwhelming convention across the codebase is `Number(x).toLocaleString() + '원'` — used in business-core's InvoiceDisplayCard/InvoiceRecordForm/InvoiceManagement, as-management's revenue and pricing views, tasks (via a shared formatCurrency + literal '원' suffix), and most…
  - 권장 조치: Standardize on toLocaleString()+'원' via the existing utils/formatters helper (it already matches the dominant convention and is already consumed by tasks/EstimateManagement); migrate InstallationBreakdownModal and revenue/test/page.tsx off the Intl currency-symbol format, and replace the locally-duplicated date/currency helpers in the document-automation templates with the shared one.

- [ ] **DESIGN-07** [디자인 일관성 / 수정위험도:낮음] order-management inverts the primary-action color convention used everywhere else (green instead of blue)
  - 위치: `app/admin/order-management/components/OrderDetailModal.tsx`, `app/admin/order-management/components/RouterInventoryList.tsx`, `app/admin/order-management/components/RouterAddModal.tsx`, `app/admin/tasks/page.tsx` 외 1곳
  - Every other reviewed domain treats blue-600 as the primary/confirm action color: business-core, facility, air-permit, tasks ('새 업무'), approvals, as-management, document-automation, subsidy, revenue-closing, meeting-minutes, weekly-reports, dpf, wiki, notifications, dashboard,…
  - 권장 조치: Either align order-management's primary CTA color to blue-600 to match the rest of the admin shell, or — if green is intentionally meant as this module's brand accent (as blueon-ai-misc already documents purple for the schedule sub-feature) — document that decision explicitly so it isn't mistaken for drift in a future pass.

- [ ] **DESIGN-08** [디자인 일관성 / 수정위험도:낮음] facility page uses raw emoji as its icon system while every other domain uses lucide-react
  - 위치: `app/facility/page.tsx`, `components/facility/ExportButtons.tsx`, `components/facility/ExportDialog.tsx`, `app/admin/air-permit/page.tsx` 외 1곳
  - app/facility/page.tsx, components/facility/ExportButtons.tsx, and components/facility/ExportDialog.tsx render plain emoji characters directly in JSX (🔄 새로고침, 📥 다운로드, 🔍 검색결과없음, 📋) with no lucide-react import anywhere in those files. Every other domain reviewed — business-core,…
  - 권장 조치: Replace the emoji in app/facility/page.tsx, ExportButtons.tsx, and ExportDialog.tsx with equivalent lucide-react icons (RefreshCw, Download, Search, ClipboardList) to match the icon language used across the rest of the admin pages.

- [ ] **MODULE-16** [모듈 선택 불일치 / 수정위험도:낮음] Loading spinner: canonical components/ui/LoadingSpinner.tsx is used in ~3 places while every domain reinvents its own animate-spin markup
  - 위치: `components/ui/LoadingSpinner.tsx`, `app/business/[businessName]/BusinessContent.tsx`, `app/facility/page.tsx`, `app/admin/air-permit/page.tsx` 외 5곳
  - Per the shared-ui audit, components/ui/LoadingSpinner.tsx is a full-screen branded spinner but is only actually used in 3 places in the entire app. Every other domain reviewed independently reinvents a loading indicator, in one of two recurring but non-shared forms: a…
  - 권장 조치: Add a small inline/sized variant to components/ui/LoadingSpinner.tsx (most reimplementations are inline button/panel spinners, not full-screen ones, which is likely why it wasn't reused) and sweep the repeated animate-spin div markup — this is high-volume but low-risk, mechanical enough for a codemod (Morphllm-style bulk pattern replacement) rather than manual migration per file.

- [ ] **BUG-051** [버그 / 수정위험도:중간] Realtime 이벤트로 트리거되는 목록 재조회에 취소/디바운스가 없어 응답 역전 가능
  - 위치: `app/admin/as-management/page.tsx:162-183, 210-215`
  - useAsRecordsRealtime은 as_records의 모든 INSERT/UPDATE/DELETE 이벤트마다 signal 없이 fetchRecords()를 호출한다. fetchRecords는 signal이 없으면 취소 로직이 동작하지 않으므로, 짧은 시간에 여러 이벤트가 연달아 발생하면(대량 엑셀 업로드 등) 여러 fetch가 동시에 인플라이트 상태가 되고, 응답 순서가 역전되면 오래된 응답이 최신 상태를 일시적으로 덮어쓸 수 있다. (evidence: page.tsx:210-215…
  - 권장 조치: Thread an AbortController (or a monotonically increasing request-id guard) through fetchRecords and have onInsert/onUpdate/onDelete cancel any in-flight fetch before triggering a new one, so a burst of realtime events (e.g. bulk upload) can't let a stale response overwrite newer list state.

- [ ] **BUG-119** [버그 / 수정위험도:중간] meeting_templates.usage_count increment is a non-atomic fire-and-forget read-then-write
  - 위치: `app/api/meeting-templates/[id]/route.ts:95-100`
  - `supabase.from('meeting_templates').update({ usage_count: template.usage_count + 1 }).eq('id', id).then()` reads template.usage_count from the earlier SELECT (line 82-86) and writes back +1 without awaiting the result or checking for errors, and without an atomic increment (RPC…
  - 권장 조치: Replace the read-then-write usage_count update in meeting-templates/[id]/route.ts with an atomic Postgres increment (a small RPC function added via migration), and await/log its result instead of firing-and-forgetting; low urgency since usage_count is only a soft display stat.

- [ ] **BUG-229** [버그 / 수정위험도:중간] Telegram webhook accepts unauthenticated POSTs with no verification the caller is Telegram
  - 위치: `app/api/telegram/webhook/route.ts:17-68`
  - The handler trusts any POST body shaped like a Telegram update; for '/start <token>' it binds the caller-supplied chat.id to whichever employee holds that telegram_connect_token, with no X-Telegram-Bot-Api-Secret-Token check or signature verification, and middleware.ts lists…
  - 권장 조치: Add an X-Telegram-Bot-Api-Secret-Token check against an env-configured secret registered via Telegram's setWebhook call, coordinating the secret rotation with the live webhook so notifications aren't interrupted.

- [ ] **BUG-274** [버그 / 수정위험도:중간] components/modals/* 7개 파일이 공용 Modal.tsx를 재사용하지 않아 Escape 닫기·배경 스크롤 잠금이 누락됨
  - 위치: `components/modals/MessageModal.tsx:165`
  - components/ui/Modal.tsx는 Escape 키 닫기(41-50행)와 body scroll lock(53-63행)을 제공하지만, MessageModal, AnnouncementModal, AllAnnouncementsModal, AllMessagesModal, DayEventsModal, FilteredEventsListModal, FacilityEditModal 7개 파일 모두 `@/components/ui/Modal`을 import하지 않고 자체 오버레이 div를 직접…
  - 권장 조치: Add a local Escape-key listener and body-scroll lock to each of the 7 modal files (mirroring components/ui/Modal.tsx's implementation) rather than attempting a full migration to the shared Modal component, to limit regression surface across the many places these modals are used.

- [ ] **BUG-276** [버그 / 수정위험도:중간] 동일한 이름 'BusinessAutocomplete'로 export되는 서로 다른 두 컴포넌트가 공존(components/ui vs components/inputs)하며 각각 다른 곳에서 실제 사용 중
  - 위치: `components/inputs/BusinessAutocomplete.tsx:1-38`
  - components/ui/BusinessAutocomplete.tsx는 `value(business_id)/onChange(businessId,businessName)/businessList(외부주입)/allowCreate` props 계약을 갖고, components/inputs/BusinessAutocomplete.tsx는 `value(사업장명 문자열)/businessId/onChange(businessId,businessName)` props 계약을 가지며 내부에서 자체적으로…
  - 권장 조치: Rename one of the two same-named components (e.g. components/ui/BusinessAutocomplete.tsx → BusinessSelector.tsx) and update its single import site in RouterEditModal.tsx to remove the naming collision; do not attempt to merge the two differing prop contracts, since that would require reworking both consumers' logic.

- [ ] **BUG-292** [버그 / 수정위험도:중간] handleOpenEditModal의 담당자/관리자 권한 체크가 isAdmin 하드코딩(true)으로 항상 무력화되는 죽은 코드
  - 위치: `app/admin/tasks/page.tsx:1755-1772`
  - line 1757 `const currentUser = '관리자' // TODO`, line 1758 `isAssignee = task.assignee === currentUser`, line 1759 `const isAdmin = true // TODO`로 계산한 뒤, line 1761 `if (!isAssignee && !isAdmin) { alert(...); return }`로 게이트한다. isAdmin이 항상 true이므로 이 조건은 절대 참이 될 수 없어 alert/return…
  - 권장 조치: Replace the hardcoded `currentUser`/`isAdmin = true` in `handleOpenEditModal` with the real `user` object already available from `useAuth()` in this heavily-used page, matching the intended assignee-or-admin check.

- [ ] **MODULE-04** [모듈 선택 불일치 / 수정위험도:중간] Loading-state visuals differ by domain despite a shared LoadingSpinner component existing
  - 위치: `components/ui/LoadingSpinner.tsx`, `app/facility/page.tsx`, `app/admin/air-permit/page.tsx`, `app/login/page.tsx` 외 4곳
  - components/ui/LoadingSpinner.tsx is described in the shared-ui review as the 'branded' full-screen loader but is used in only about three places codebase-wide. Nearly every other domain hand-rolls its own spinner div with a different border treatment each time: facility uses…
  - 권장 조치: Consolidate the spinner-based cases (the majority) onto components/ui/LoadingSpinner with a size/inline prop, rather than each page defining its own border-width combination. For list-heavy pages that currently show a blank state before data arrives, adopt the skeleton pattern already proven in dashboard/tasks/dpf rather than leaving that decision per-page.

- [ ] **MODULE-15** [모듈 선택 불일치 / 수정위험도:중간] Filter panels use canonical MultiSelectDropdown/TwoStageDropdown in one domain but raw <select> or a third reimplementation elsewhere for the same filter shape
  - 위치: `components/ui/MultiSelectDropdown.tsx`, `components/ui/TwoStageDropdown.tsx`, `app/admin/revenue/page.tsx`, `components/dashboard/FilterPanel.tsx` 외 2곳
  - revenue-closing's app/admin/revenue/page.tsx uses the canonical components/ui/MultiSelectDropdown and components/ui/TwoStageDropdown for its 영업점/카테고리/연도 (sales-office/category/year) filters. dashboard's components/dashboard/FilterPanel.tsx solves the structurally identical…
  - 권장 조치: Migrate components/dashboard/FilterPanel.tsx's branch/manufacturer/sales-office selects onto MultiSelectDropdown/TwoStageDropdown to match revenue-closing's already-working pattern (both are admin dimension-filter panels with the same UX need). Then replace the bespoke checkbox-popover implementations in tasks/page.tsx and as-management/page.tsx with MultiSelectDropdown to eliminate three independently-maintained multi-select popovers.

- [ ] **BUG-298** [버그 / 수정위험도:높음] 일반 승인(approve) 처리가 step 갱신과 문서 상태 갱신을 트랜잭션으로 묶지 않아 중간 실패 시 결재가 멈출 수 있음
  - 위치: `app/api/approvals/[id]/approve/route.ts:344-353, 369-374`
  - reject/route.ts는 step 반려와 문서 상태 변경을 transaction()으로 원자적으로 처리한다(159-180줄). approve/route.ts는 동일한 2단계 쓰기(approval_steps UPDATE 후 approval_documents UPDATE)를 각각 독립된 queryOne 호출로 순차 실행하며 transaction()으로 묶지 않는다(344-350줄과 369-374줄이 별개의 non-transactional 쿼리). 두 쿼리 사이에 DB 커넥션 오류나 서버…
  - 권장 조치: Wrap the `approval_steps` and `approval_documents` UPDATE statements in `approve/route.ts` in `transaction()`, mirroring `reject/route.ts` — this is the single most-traveled path in the whole approval workflow, so any partial-write inconsistency stalls every subsequent approver across the live system.
