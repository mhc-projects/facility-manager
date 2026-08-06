---
name: approval
description: Facility Manager 프로젝트의 전자결재 시스템(승인 라인, 상태 전이, 권한) 참조. 결재 로직 수정, 신규 결재 단계/문서유형 추가, 알림/권한 버그 조사 시 사용한다.
---

# 전자결재 시스템

## 핵심 테이블
- `approval_documents` — 결재 문서 (`document_number`: BLUEON-{TYPE}-YYYYMMDD-{SEQ3}, `document_type`, `status`: draft/pending/approved/rejected/returned/cancelled, `current_step`: 0~5, `requester_id`, `team_leader_id`/`executive_id`/`vice_president_id`/`ceo_id`, `form_data` JSONB, `rejection_history` JSONB, `submitted_at`/`resubmitted_at`/`completed_at`)
- `approval_steps` — 단계별 이력 (`document_id`, `step_order`: 1~5, `role_label`, `approver_id`, `status`: pending/approved/rejected/skipped, `approved_at`, `comment`) — `UNIQUE(document_id, step_order)`

## 5단계 결재 라인
`1=담당(자동승인) → 2=팀장 → 3=중역 → 4=부사장 → 5=대표이사`. `current_step` = "진행 중인 step_order − 1" (0=미상신, 5=완료). 작성자 `employees.role`에 따라 상위 단계가 스킵된다 — 판정 로직은 `lib/approval-line.ts`의 `getRequiredApprovalSteps(role)` 단일 소스(프론트 `ApproverSelector.tsx`와 백엔드가 공유).
- ⚠️ `normalizeApproverIds(role, ids)`를 문서 생성(POST)·수정(PUT)·상신(submit) **세 곳 모두**에서 호출해야 한다 — role상 불필요한 결재자 id가 남아있으면 결재라인에 본인이 중복 표시되는 버그가 있었다(2026-07-16 수정, 이 유틸 신설로 통합).

## 상태 전이
`draft → (submit) → pending → (approve×N) → approved` / `pending → (reject) → rejected` / `rejected|returned → (resubmit) → pending`. 액션 라우트: `app/api/approvals/[id]/{submit,approve,reject,express-approve,process}/route.ts`.
- `approve`: 낙관적 락(`WHERE status='pending'`)으로 동시 처리 방지, 마지막 step 통과 시 `status='approved'`.
- **전결(express-approve)**: 중역이 나머지 단계를 건너뛰고 즉시 완료 처리. `is_express_approved`/`express_approved_by`/`express_approved_at`, 건너뛴 step은 `approval_steps.skipped_reason='express_approval'`.
- **처리확인(process)**: 결재 완료(approved)와는 별개 단계다. 총무팀(`teams.is_management_support=TRUE`) 또는 권한4가 `is_processed`/`processed_at`/`processed_by`로 사후 확인 처리 — 승인 자체와 혼동하지 말 것.

## 최종 승인 시 부수효과 (`approve/route.ts`)
- `leave_request` → `calendar_events`에 '연차' 라벨로 자동 등록(연속 날짜는 하나의 이벤트로 그룹핑)
- `installation_closing` → `installation_payments` status를 pending→paid로 전환
- `commission_closing` → `commission_payments` status를 pending_approval→approved로 전환
- 총무팀 전원에게 완료 통보 알림(`notifyManagementSupportDept`)

## 접근 제어
- `lib/approval-access.ts` — 열람 전용 화이트리스트: `APPROVAL_FULL_ACCESS_EMAILS`(결재라인 미포함이어도 전체 열람), `APPROVAL_COMPLETED_TAB_ACCESS_EMAILS`(결재완료 탭). 권한4와 달리 강제취소/처리확인 등 관리 기능은 없다.
- 총무팀 여부는 `teams.is_management_support`로 판정한다(부서 단위 아님 — 2026-07 부서→팀 단위로 권한 이관됨).
- ⚠️ 업무품의서(`business_proposal`)의 `form_data.department_id`/`cooperative_team_id`는 **항상 `teams.id`를 저장**한다(`departments.id`가 아님). `teams`와 `departments`는 서로 독립된 정수 시퀀스라 값이 우연히 겹칠 수 있다 — 과거 `departments.id` 폴백 매칭 때문에 무관한 타 부서 문서가 노출되는 버그가 있었다(2026-07-06 수정, `app/api/approvals/route.ts` GET 전체 탭). 새 쿼리에서 이 필드를 조인할 땐 `teams.id`로만 매칭할 것.

## 트랜잭션 안전성 (2026-08-06 기준 부분 완료)
- `reject/route.ts`는 `lib/supabase-direct`의 `transaction()`으로 step 갱신 + 문서 상태 갱신을 하나의 트랜잭션으로 묶는다(완료).
- `approve/route.ts`, `submit/route.ts`는 **아직 트랜잭션 미적용** — step UPDATE와 documents UPDATE가 별도 쿼리라, 중간 예외 시 부분 업데이트 상태가 남을 수 있다. 리팩터 시 reject와 동일 패턴 적용 권장(알림/broadcast 등 부수효과는 커밋 이후로 분리).

## 알림
결재 액션마다 `notifications` DB insert + Supabase broadcast(`approval-notify:{userId}`) + Web Push + 텔레그램, 4개 채널을 각 라우트가 개별 구현한 헬퍼로 중복 발송한다(`sendApprovalNotification`/`sendNotification` — 파일마다 이름·구현이 조금씩 다르고 공통화돼 있지 않음).
