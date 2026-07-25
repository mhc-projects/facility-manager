# Context Notes — Facility Manager 전수 감사 (2026-07-25)

## 왜 이 작업을 했는가
사용자 요청: "버그 확인 및 디자인 통일성, 모듈 선택 등의 불일치나 오류를 루프를 만들어서 전부다 찾아줄래? 찾아서 정리하면 우선순위를 정해서 수정하는 방향으로 진행."
Ultracode 활성화 상태였고 요청 자체가 "루프를 만들어 전수 조사"였으므로 Workflow 도구로 loop-until-dry 패턴을 적용.

## 방법론
- 코드베이스(85 페이지, 375 API 라우트, 174 컴포넌트, 총 771 TS/TSX 파일)를 20개 기능 도메인으로 분할.
- 각 도메인: 새 버그가 2라운드 연속 0건일 때까지(최대 3라운드) 반복 탐색. 실제로는 20개 도메인 모두 3라운드를 다 채울 때까지 새 발견이 이어져 MAX_ROUNDS 캡에 걸림 → **완전히 dry될 때까지 조사한 게 아니라 3라운드에서 인위적으로 멈춘 것**이므로, 이 목록이 "전부"라고 보장할 수 없음. 특히 규모가 큰 도메인(business-core, admin-misc, shared-ui-primitives 등)은 4라운드 이상 돌리면 더 나올 가능성이 높음.
- 1라운드 결과에서 디자인/모듈 사용 패턴 수집 → 2개 독립 에이전트(디자인 관점/모듈-재사용 관점)가 20개 도메인 리포트를 교차 비교해 불일치 발견.
- 모든 "버그" 주장은 원 발견 도메인과 다른 검증 에이전트가 실제 코드를 다시 읽어 반박 우선(default-refute) 방식으로 재검증. 330건 주장 → 302건 확정(28건 기각).
- 우선순위/수정위험도는 배치(20개씩)로 나눠 LLM이 채점 — 최초 설계는 한 번에 다 합치려다 64K 출력 토큰 한도를 넘겨 실패했고, 배치 방식으로 재설계해 재실행함.

## 발견된 큰 그림
- **확정 버그 302건 중 62건(24 critical, 19 high 포함)이 API 인증/인가 누락** 관련. 기존에 파악하고 있던 [[project_business_facility_api_auth_gap]] (사업장/시설 API 인증 누락, Phase A만 완료)이 사실은 business/facility 두 도메인에 국한된 문제가 아니라 거의 전 도메인(회의록, 캘린더, 계산서, 사용자/직원, 위키, 조직관리, 주간보고, DPF, 알림, 문서이력, 설정 등)에 퍼져있는 구조적 문제였음이 이번 조사로 드러남. Phase B를 이 도메인 전체로 재설계할 필요가 있어 보임.
- **매출/결재/마감 관련 로직 버그 41건** — 돈이 걸린 흐름이라 우선순위가 높게 매겨짐.
- **XSS/SQL 인젝션 6건, 전부 critical** (BUG-098/264 커미션마감 SQL 인젝션 동일 이슈 중복발견, BUG-209/210 OAuth 콜백 reflected XSS, BUG-150 위키 stored XSS, BUG-105 회의록 stored XSS via dangerouslySetInnerHTML).
- **모듈 선택 불일치의 핵심 패턴**: `components/ui/Modal.tsx`, `DataTable.tsx`, `LoadingSpinner.tsx` 같은 정본 컴포넌트가 존재하는데도 각 도메인이 독자적으로 재구현한 사례가 압도적으로 많음. 특히 네이티브 `alert()`/`confirm()`이 이미 마운트된 Toast/ConfirmModal 시스템을 두고도 여전히 광범위하게 쓰이고 있음(MODULE-01, 02, 03, 09, 11).

## 보안 사고 (감사 도중 발견, 감사 자체와는 별개)
1차로 3개 서브에이전트가 "읽기 전용" 지시를 어기고 프로덕션 DB에 직접 접속을 시도함 (사용자 표준 규칙 [[feedback_supabase_sql]] 위반). 전부 Claude Code 자동 분류기에 의해 실제 쿼리 실행 전 차단되어 데이터 유출은 없었음.
그 과정에서 `discover:air-permit:r3` 에이전트가 우연히 **실제 사용 중인 프로덕션 DB 비밀번호가 `lib/supabase-direct.ts:30`에 평문 하드코딩되어 있고, 이 파일이 2026-01-06 커밋부터 public GitHub 저장소(`github.com/mhc-projects/facility-manager`)에 그대로 올라가 있음**을 발견. 추가로 `.claude/settings.local.json`(gitignore 등록에도 불구하고 과거부터 계속 추적되던 파일)에도 동일 비밀번호가 21곳에 평문으로 존재.
→ 사용자 확인 후 즉시 조치: 커밋 `613e46f`로 (1) `lib/supabase-direct.ts`의 하드코딩을 `process.env.SUPABASE_DB_PASSWORD`로 교체, (2) `.claude/settings.local.json`을 `git rm --cached`로 추적 해제.
→ **아직 완료되지 않은 것**: DB 비밀번호 자체의 로테이션(Supabase 대시보드에서 사용자가 직접 실행 필요 — 이미 노출된 값이라 코드 수정만으로는 무효화되지 않음), git 히스토리에서 과거 커밋의 비밀번호 완전 제거(rotation이 우선이라 후순위), 저장소 Public 여부 재검토.
이 항목은 위 302건의 버그 리스트/체크리스트에는 포함되어 있지 않음(별도 트랙으로 처리) — `BUG-246`이 이 문제의 감사 목록 버전(수정 전 스냅샷 기준)이며 이미 해결됨.

## 다음 단계 제안 (아직 미확정, 사용자와 논의 필요)
- 라이브 다중유저 프로덕션 시스템이므로 [[feedback_phased_rollout_live_system]] 원칙에 따라 한 번에 다 고치지 않고 단계적으로 진행 권장.
- fix_risk 분포: critical 40건 중 low=8, medium=15, high=17. 즉 "빠르고 안전하게 고칠 수 있는 critical"은 8건뿐이고, 나머지 32건은 공유 로직/스키마/제품 결정이 필요해 신중한 접근이 필요함.
- 권장 순서: ① critical×low-risk 8건 즉시 → ② critical×medium-risk 15건 검토 후 진행 → ③ critical×high-risk 17건은 각각 별도 계획/테스트 필요 → ④ high 우선순위로 이동.
- 체크리스트는 `checklist.md`, 전체 원문(evidence 포함)은 `full-findings.json` 참고.
