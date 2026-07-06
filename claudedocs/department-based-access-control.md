# 부서/권한 기반 화면 접근 제어 — 기술 레퍼런스

이 문서는 2026-07-06 "기술개발부는 E-PTO·전자결재만 이용 가능" 작업 중 확인된 내용을 정리한 것이다. 비슷한 요청(신규 부서 추가 시 메뉴 제한, 특정 부서 전용 메뉴 노출 등)이 다시 들어올 때, 처음부터 코드를 다시 뒤지지 않고 이 문서를 먼저 참고할 것.

## 1. 접근 제어는 두 축으로 되어 있다

1. **`permission_level` 기반** (1=일반, 2=매출조회, 3=관리자, 4=시스템관리자) — 오래된 기본 축. 메뉴 항목마다 `requiredLevel`을 걸어서 표시 여부를 결정.
2. **부서(department) 기반** — 2026-07-06에 추가한 새 축. 특정 부서 소속이면 지정된 메뉴만 쓰게 제한.

두 축은 독립적으로 함께 적용된다 (`components/ui/AdminLayout.tsx`의 `isItemVisible`에서 부서 제한을 먼저 체크하고, 없으면 permission_level 체크로 넘어감).

## 2. 부서 판별의 진짜 소스: `employees.department` (text 컬럼)

이 프로젝트에는 부서를 나타내는 스키마가 두 갈래로 존재한다.

| 스키마 | 실제 사용처 |
|---|---|
| `employees.department` / `employees.team` (text 컬럼) | **실제 운영 기준.** `/admin/users`(사용자 관리) 편집 모달에서 직원 부서를 바꾸면 이 컬럼이 갱신된다. 메뉴 표시/부서 제한, `/api/employees/me/department-info`가 전부 이 컬럼을 읽는다. |
| `teams`(id, name, department_id) + `departments`(id, name) + `employee_team_memberships` + `v_organization_full` 뷰 | 조직도 시각화(`InteractiveOrganizationChart.tsx`), `/api/organization/members` 등 더 새로운 id 기반 스키마. **직원 편집 UI(사용자 관리)에서의 부서 배정과는 연결되어 있지 않다** — 즉 여기 값을 바꿔도 실제 접근 제어에는 반영되지 않는다. |

**결론**: 부서 기반으로 뭔가를 판단하는 코드를 새로 짤 때는 반드시 `employees.department`(및 `employees.team`) 문자열 값을 기준으로 해야 실제로 동작한다. id 기반 스키마만 보고 구현하면 화면에 반영되지 않는다.

## 3. 메뉴 제한 구현 위치: `components/ui/AdminLayout.tsx`

### 3-1. 이미 있던 패턴 — `departmentOnly` (allow-list 추가형)

```ts
interface NavigationItem {
  ...
  departmentOnly?: string  // 특정 부서명 포함 시에만 표시 (예: '개발')
}
```

`requiredLevel`을 통과한 상태에서, 특정 부서 소속일 때만 **추가로** 보여주는 항목("개발 업무 일지" → `departmentOnly: '시스템개발팀'`). `userDeptName.includes(item.departmentOnly)`로 매칭하고, `permLevel >= 4`면 부서 무관하게 통과시킨다.

> **주의**: 이 항목은 `userDeptName`(=`employees.department`)과 비교하는데, 실제 예시(`시스템개발팀`)는 team 값이지 department 값이 아니다. 최문호 계정은 `department='개발부', team='시스템개발팀'`이라 이 조건은 사실 항상 거짓이고, permLevel>=4 우회 덕분에 우연히 정상 동작하는 것처럼 보인다. 건드리지 않았지만 잠재적 버그로 인지해둘 것.

### 3-2. 이번에 추가한 패턴 — `DEPARTMENT_MENU_RESTRICTIONS` (완전 제한형)

```ts
// 특정 부서는 지정된 메뉴만 이용 가능 (그 외 메뉴는 숨김 처리 및 접근 차단)
const DEPARTMENT_MENU_RESTRICTIONS: Record<string, string[]> = {
  '기술개발부': ['/admin/e-pto', '/admin/approvals'],
}
```

- `isItemVisible()`에서 이 맵에 사용자 부서가 있으면, 허용된 href 목록에 없는 항목은 **전부** 숨긴다 (대시보드 포함, requiredLevel 무관하게 우선 적용).
- **메뉴 숨김만으로는 부족하다** — 직접 URL로 들어가면 우회 가능. 그래서 `AdminLayout` 최상위 컴포넌트에 별도 `useEffect`를 추가해서, 허용되지 않은 pathname이면 `router.replace(허용된 첫 페이지)`로 강제 이동시킨다.
- 하위 경로도 허용되도록 `isPathAllowedForRestrictedDept()`는 `pathname === href || pathname.startsWith(href + '/')`로 비교한다 (예: `/admin/approvals/new`, `/admin/approvals/[id]`).

### 3-3. 부서명 조회는 공용 훅으로

```ts
function useUserDepartmentName(user: unknown): string | null {
  // /api/employees/me/department-info 호출, employees.department 반환
}
```

`NavigationItems`(사이드바)와 `AdminLayout`(리다이렉트 가드) 양쪽에서 각자 이 훅을 호출한다 (컴포넌트가 분리돼 있어 상태 공유가 안 되므로 훅을 두 번 호출 — 약간의 중복 fetch가 있지만 페이로드가 작아 무시 가능한 수준).

### 3-4. 새 부서 제한을 추가하려면

1. `DEPARTMENT_MENU_RESTRICTIONS`에 `'부서명': ['/admin/xxx', ...]` 한 줄 추가.
2. 부서명 문자열은 **`departments` 테이블의 `name`과 정확히 일치**해야 하며, 이게 곧 `employees.department`에 저장되는 값이다 (Supabase에서 실제 값 확인 후 넣을 것 — 오타 나면 조용히 무동작).
3. 코드 수정은 이걸로 끝. `AdminLayout`을 쓰는 모든 페이지에 자동 적용된다.
4. **적용 안 되는 예외 페이지**: `app/admin/first-setup`, `app/admin/organization`(단, 이건 `/admin/settings?tab=organization`로 즉시 redirect하는 스텁이라 실질적으로는 보호됨). 이 두 페이지 정도만 `AdminLayout`을 안 쓴다 — 신규 제한 부서 직원이 이 URL을 직접 알고 접근하면 이 가드를 우회할 수 있다는 뜻이지만, 둘 다 원래 레벨3+ 전용이라 실질 위험은 낮다.

## 4. 검증 시 반드시 겪는 함정들

### 4-1. 브라우저 캐시 — dev 서버 재시작 후 반드시 하드 리로드

`/_next/static/chunks/**`가 `Cache-Control: public, max-age=31536000, immutable`로 응답된다. dev 서버를 껐다 켜도 브라우저가 이미 로드한 청크는 URL이 그대로라 **일반 새로고침으로는 절대 재검증되지 않는다**. 코드를 고쳤는데 반영이 안 되거나, 있어야 할 UI가 안 보이면 먼저 하드 리로드(Cmd+Shift+R)부터 해볼 것 — 이번 세션에서 "검색창이 안 보이는 버그"로 착각했던 게 실은 이 캐시 문제였다.

### 4-2. 실제 계정처럼 로그인해서 검증하는 법 (비밀번호 없이)

1. `.env.local`의 `JWT_SECRET`을 읽어서, 로그인 라우트(`app/api/auth/login/route.ts`)와 동일한 payload 구조(`{ id, userId, email, permission_level, name }`)로 `jsonwebtoken`을 이용해 단기(예: 1시간) 토큰을 직접 서명한다.
2. 브라우저에서 `localStorage.setItem('auth_token', token)` 후, `fetch('/api/auth/verify', {headers:{Authorization:'Bearer '+token}})`를 한 번 호출하면 서버가 `session_token`(httpOnly)/`auth_ready` 쿠키를 Set-Cookie로 내려준다 — 미들웨어의 페이지 인증 게이트를 정상적으로 통과하게 된다.
3. 이 방법으로 실제 비밀번호 없이 임의 계정으로 로그인한 것처럼 테스트할 수 있다. **사내 계정을 이렇게 흉내낼 때는 반드시 로컬 dev 서버에서만** 하고, 테스트 후 `/api/auth/logout` 호출 + localStorage 정리로 흔적을 지울 것.
4. 실제 사람 계정으로 결재 승인 체인 등을 끝까지 테스트해야 한다면, 텔레그램/웹푸시 실알림이 나갈 위험이 있는지 먼저 확인(`employees.telegram_chat_id`)하고, 필요하면 임시 테스트 계정(`test@test.com`, `test1@test.com` 등 기존 비활성 테스트 계정)을 활용할 것 — 자세한 내용은 memory의 `project_approval_pending_fixes` 참고.

## 5. 인접 지뢰: `teams.id` vs `departments.id` 충돌

`teams`와 `departments`는 서로 독립된 정수 시퀀스다. 업무품의서의 `form_data.department_id`/`cooperative_team_id`는 **항상 `teams.id`를 저장**하는데, 과거 코드 일부에 이 값을 `departments.id`로도 매칭해보는 "구버전 호환용" 폴백 조건이 섞여 있었다(`app/api/approvals/route.ts`, 2026-07-06 수정 완료). 두 시퀀스가 우연히 같은 숫자를 가지면(예: A/S팀 `teams.id=6` == 기술개발부 `departments.id=6`), 전혀 무관한 부서에 문서가 노출되는 버그로 이어진다.

**원칙**: `department_id`/`cooperative_team_id` 류의 값을 다룰 때는 그 값이 `teams.id`인지 `departments.id`인지 타입 태그 없이 두 테이블 모두에 매칭을 걸지 말 것. 실제 데이터(현재 모든 업무품의서 약 100건)는 전부 `teams.id` 기준이었다.

## 6. 결재선 role-skip 로직 (참고, 부서 제한과는 별개지만 같이 건드리게 될 가능성 높음)

`components/approvals/ApproverSelector.tsx`의 `getRequiredSteps(requesterRole)`가 작성자의 `approval_role`(staff/team_leader/executive/vice_president/ceo)에 따라 결재선 입력란(팀장/중역/부사장)을 숨기거나 필수 해제한다. `app/api/approvals/[id]/submit/route.ts`도 동일한 규칙을 서버에서 한 번 더 검증한다.

**미해결 위험**: `submit` 라우트는 "role상 스킵 대상인 필드(예: team_leader_id)가 어쩌다 값이 채워져 있어도 그대로 결재 단계를 생성"한다 — role 검증은 "필수인데 비어있는가"만 체크하고 "불필요한데 채워져 있는가"는 체크하지 않는다. 기능적으로 막히진 않지만(본인과 동일 id면 자동승인) 결재라인 표시에 중복 항목이 뜬다. 실제 사례 2건을 데이터로 정정했으나(2026-07-06), 코드 방어 로직은 아직 추가 안 함 — `needTeamLeader(requesterRole)===false`일 때 `team_leader_id`를 무시하고 step 생성도 스킵하도록 보강하는 걸 고려할 것.

## 7. alert() 안티패턴 — 페이지 접근 거부 시 올바른 처리법

`app/admin/page.tsx`가 권한 부족 시 네이티브 `alert()`를 띄운 뒤 `router.push('/')`하던 코드가 있었다 (2026-07-06 수정). `alert()`는 그걸 닫기 전까지 페이지 전체 JS 실행을 멈춰버려서, 특히 자동화 도구로 테스트할 때 응답이 없는 것처럼 보이는 원인이 된다.

이 코드베이스의 올바른 패턴은 `app/admin/users/page.tsx`처럼, `AdminLayout`으로 감싼 **인라인 "접근 권한이 없습니다" 카드**를 렌더링하는 것이다 (`alert`/`confirm` 없이):

```tsx
if (!user || user.permission_level < 3) {
  return (
    <AdminLayout title="접근 권한 없음" description="...">
      <div className="flex items-center justify-center min-h-96">
        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h3>접근 권한이 없습니다</h3>
      </div>
    </AdminLayout>
  )
}
```

새 페이지에 권한 체크를 넣을 때는 이 패턴을 따를 것 — `alert()`/`confirm()`은 절대 페이지 로드 흐름에 넣지 말 것.

## 8. 관련 커밋 (2026-07-06)

- `f6b4195` feat(approval): 기술개발부는 E-PTO·전자결재 메뉴만 이용하도록 제한
- `4f5dad1` fix(admin): 대시보드 권한 부족 시 alert() 대신 바로 리다이렉트
- `b05b9cc` fix(approval): 전체 탭에서 무관한 타 부서 업무품의서가 노출되던 버그 수정
