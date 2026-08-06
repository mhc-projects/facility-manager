---
name: task-management
description: Facility Manager 프로젝트의 업무관리(facility_tasks, task_status_history) 도메인 참조. 칸반 업무 흐름, status/task_type 파생 로직, 담당자(assignees) 구조, 주간 브리핑 계약 지표 수정 시 사용한다.
---

# 업무 관리 (facility_tasks / task_status_history)

## task_type: 원본 컬럼은 사실상 죽은 값, 뷰가 진짜 소스
- `facility_tasks.task_type` 컬럼은 INSERT 시 아예 값을 넣지 않아 DEFAULT `'etc'`로 고정되고 이후 어떤 UPDATE도 건드리지 않는다(전체 코드베이스 grep 확인 — `SET task_type` 하는 곳 없음). 실제 task_type은 `facility_tasks_with_business` 뷰(`ftb` 별칭, `app/api/facility-tasks/route.ts`가 항상 이 뷰를 조회)가 매번 `business_info.progress_status` 문자열을 `ILIKE` 매칭해 실시간 파생한다(`supabase/migrations/20260518_add_online_receipt_date_to_tasks_view.sql`이 최신 정의). 원본 테이블 컬럼을 직접 읽으면 전부 'etc'로 보인다.
- ⚠️ 매핑 규칙은 뷰 안에 `WHEN progress_status ILIKE '%보조금%' THEN 'subsidy'` 식으로 하드코딩돼 있다. `progress_categories.task_type` 컬럼(`20260430_add_task_type_to_progress_categories.sql`)이 나중에 추가돼 관리자설정 UI에서 카테고리별 task_type을 편집할 수 있게 됐지만, 뷰는 이 컬럼을 참조하지 않는다 — 두 개의 독립된 매핑이 존재하는 상태라 관리자가 이름 패턴에 안 맞는 새 진행구분을 추가하면 설정 화면과 실제 칸반 결과가 어긋날 수 있다.
- ⚠️ DB 함수 `advance_task_to_next_step`(칸반 "다음 단계" 완료 버튼, `app/api/facility-tasks/advance/route.ts`가 RPC 호출)는 이 뷰를 거치지 않고 `facility_tasks.task_type` **원본 컬럼**을 직접 읽어 self/subsidy CASE 분기를 탄다(`sql/update_advance_function_with_approval.sql`). 원본 컬럼이 사실상 항상 'etc'이므로, 이 함수가 마지막으로 정의된 이후(2025-11) 생성된 업무에서는 self/subsidy 분기가 의도대로 안 탈 가능성이 있다 — 코드상 추론이며 런타임 미검증, 이 함수를 다시 손볼 일이 있으면 먼저 확인할 것.

## status: DB CHECK가 아니라 task_stages 테이블이 기준
- db-schema 스킬의 "67개 CHECK값"은 과거 스냅샷이다. CHECK 제약은 `supabase/migrations/20260430_relax_task_status_check.sql`에서 `TRIM(status) <> '' AND LENGTH(status) <= 100`으로 완화됐다 — DB는 더 이상 특정 값 목록을 강제하지 않는다.
- 실제 유효 단계 목록은 `task_stages` 테이블이다(`progress_categories` 1:N `task_stages`, 관리자설정에서 자유 편집 가능, `app/api/settings/task-stages/route.ts`). 단계 key를 안 정하고 추가하면 `custom_${Date.now()}` 형태로 자동 생성된다(예: `custom_1777968825327`) — status 문자열을 하드코딩해 집계/필터링하는 코드(주간 브리핑 등)는 이런 custom key 누락 여부를 `task_stages` 실데이터로 매번 재확인해야 한다.
- `lib/task-steps.ts`(selfSteps/subsidySteps/asSteps/dealerSteps/outsourcingSteps/etcSteps)는 초기 시드 + 폴백용 하드코딩 목록일 뿐, 현재 UI 소스는 아니다. 라벨 조회는 DB(`task_stages.stage_label`) 우선, 없으면 `TASK_STATUS_KR`(`lib/task-status-utils.ts`) 폴백 순서다(`contexts/AdminDataContext.tsx`의 `getStageLabel`).
- 타입별 흐름 성격: `self`(자비)는 상담→실사→견적→계약→계약금확인→발주→출고→설치→준공서류→잔금의 단선 흐름. `subsidy`(보조금)는 self 흐름에 신청서 접수/승인·탈락/착공 전 실사/착공신고/준공 실사/보완(1~3차)/보조금지급신청서/입금대기가 추가된 훨씬 긴 흐름. `as`는 AS 접수→부품발주→완료의 단순 흐름. `dealer`/`outsourcing`은 설치를 대리점·외주업체가 수행하므로 발주-일정-완료 위주로 단계 수가 적다. 모든 타입 공통으로 `{type}_needs_check`(확인필요) 상태가 있다.

## assignees (JSONB) 구조
- `facility_tasks.assignees`는 `{id, name, position, email}` 객체의 **배열**이다(`sql/02_add_multiple_assignees_feature.sql`, 타입은 `lib/task-notification-service.ts`의 `TaskAssignee`). 레거시 단일 담당자 필드 `assignee`(TEXT)는 항상 `assignees[0].name`과 동기화된다(`app/api/facility-tasks/route.ts` PUT 핸들러).
- `primary_assignee_id` 컬럼이 별도로 있지만 실제로는 대부분 `assignees[0]`을 주 담당자로 취급한다 — 알림 발송 대상, `task_status_history` 기록 시 assignee_id/name 모두 `assignees[0]`에서 가져온다.
- 저장 시 `JSON.stringify`로 문자열화해 넣기 때문에, 읽을 때 문자열/배열 두 형태가 다 나올 수 있어 소비하는 쪽에서 파싱 방어가 필요하다(`parseAssignees` 헬퍼 패턴, `app/api/facility-tasks/route.ts`).

## task_status_history: 실제 컬럼과 기록 시점
- ⚠️ db-schema 스킬은 이 테이블 컬럼을 `old_status/new_status/changed_by`로 적어뒀지만 실제와 다르다. 진짜 컬럼은 `status`(그 단계 하나), `started_at`/`completed_at`(NULL이면 진행중), `duration_days`(트리거 자동계산), `assignee_id`/`assignee_name`/`primary_assignee_id`, `created_by`/`created_by_name`, `business_name`이다(`sql/task_status_history.sql`). "이전→다음 단계"는 같은 task_id의 여러 행을 시간순 정렬해서 유추하는 구조지, 한 행에 old/new를 같이 기록하는 구조가 아니다.
- 기록 시점: `facility_tasks` 생성/PUT에서 `status`가 실제로 바뀔 때만 `lib/task-status-history.ts`의 `startNewStatus()`가 호출돼, 이전 진행중 행을 `completed_at`으로 마감하고 새 행을 INSERT한다.
- ⚠️ 이력이 안 남는 경로: `advance_task_to_next_step` DB 함수(칸반 완료 버튼)는 `facility_tasks.status`를 직접 UPDATE만 하고 `task_status_history`엔 아무것도 안 남긴다(함수 정의에 INSERT 없음, 확인 완료). 수동 SQL/마이그레이션으로 status를 바꾸는 것도 동일하게 이력 누락. 이 테이블 기준으로 지표를 만들 땐 "완료 버튼 경로"와 "칸반 드래그(PUT) 경로"의 이력 신뢰도가 다르다는 점을 감안해야 한다.

## 주간 브리핑 "계약 건수" (`app/api/dashboard/weekly-scorecard/route.ts`)
- status 문자열이 아니라 `task_status_history`의 **최초 진입 시점**을 센다. 재진입(왕복) 중복을 막기 위해 `SELECT DISTINCT ON (h.task_id) ... ORDER BY h.task_id, h.started_at ASC` 패턴을 쓴다. `facility_tasks.is_deleted = false`로만 조인 필터하고(`is_active`는 안 봄), history 테이블엔 `business_id`가 없어 사업장 상세로 링크를 못 만든다(이름만 표시).
- 기본 매핑(`DEFAULT_CONTRACT_CRITERIA`, 2026-08-06 기준 코드와 일치 확인): 자비 계약체결=`self_contract` / 보조금 신청서접수=`subsidy_approval_pending`(⚠️ `subsidy_application_submit`은 "접수 필요" 상태라 의미가 다름) / 보조금 승인=`subsidy_approved` + `custom_1777968825327` + `custom_1778198486933`(같은 의미의 커스텀 키 합산). `subsidy_rejected`(탈락)는 실사용 거의 없어 의도적으로 제외.
- 이 매핑은 `settings` 테이블의 `weekly_briefing_criteria` 키로 관리자가 UI에서 편집 가능하다(`app/api/settings/weekly-briefing-criteria/route.ts`, `loadContractCriteria()`가 DB 값 우선·파싱 실패 시에만 위 하드코딩 기본값 폴백). 즉 위 매핑은 "기본값"일 뿐 실제 운영값이 아닐 수 있으니, 이 지표를 다시 건드릴 때는 코드의 기본값보다 `settings` 테이블 실데이터를 먼저 확인할 것.
