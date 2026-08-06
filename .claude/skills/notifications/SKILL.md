---
name: notifications
description: Facility Manager 프로젝트의 알림 시스템(notifications/task_notifications, 4채널 발송, NotificationBell 연결상태) 참조. 알림 발송 안 됨/실시간 안 됨 버그 조사, 새 알림 발생 지점 추가, NotificationBell/NotificationContext 수정 시 사용한다.
---

# 알림 시스템

## 테이블 구조 — notifications는 사실 3-tier, task_notifications는 별개
- `notifications` — `notification_tier`: personal/team/company. team/company는 DB 트리거가 대상자별 `user_notifications`(join, `is_read`/`read_at`) 행을 자동 fan-out한다. personal은 `target_user_id`로 직접 꽂히는 경우가 많은데(결재 알림 등) 이때는 `user_notifications` row가 생기지 않으므로 읽음 처리는 `user_notification_reads`(notification_id+user_id upsert)로 별도 관리한다 — `app/api/notifications/[id]/read/route.ts`가 이 두 경로를 분기 처리.
- `task_notifications` — 업무 담당자 배정 전용, `is_read` 컬럼 직접 보유. `app/api/facility-tasks/route.ts` → `lib/task-notification-service.ts` → Supabase RPC `create_task_assignment_notifications`(SQL 함수, `expires_at`=생성+30일 하드코딩)가 담당.
- db-schema 스킬엔 `notifications` 컬럼이 축약 기재돼 있음 — 실제로는 `notification_tier`/`target_user_id`/`target_team_id`/`target_department_id`/`created_by`/`related_url`/`metadata`도 있다.

## 4채널 발송 패턴은 결재(approvals)에만 온전히 적용된다
- `app/api/approvals/[id]/{submit,approve,reject,express-approve}/route.ts` 전부: `notifications` insert(`target_user_id`) → Broadcast(`approval-notify:{userId}` 채널, event `new_notification`) → `sendWebPushToUser`(`lib/send-push.ts`) → `sendTelegramToUser`(`lib/send-telegram.ts`). 라우트마다 `sendNotification` 헬퍼를 각자 재구현(approval 스킬에 기술된 중복과 동일 사실).
- ⚠️ `task_notifications` 배정 알림은 위 RPC가 DB insert만 하고 broadcast/push/telegram 전부 없음. 벨은 이 알림을 실시간으로 못 받고 최초 로드 또는 60초 폴링에서만 반영된다.
- `app/api/organization/task-assignments/route.ts`(담당자 변경)는 `notifications`에 `target_user_id`로 직접 insert하지만 broadcast 없이 push+telegram만 호출한다. `NotificationContext`의 `postgres_changes` 구독은 `target_user_id`가 있는 행을 명시적으로 무시(broadcast 채널의 몫으로 설계됨) → 이 경로는 broadcast가 없으므로 사실상 실시간 전달이 안 되고 폴링/새로고침에만 의존한다.
- 일반 알림 생성 API(`app/api/notifications/route.ts` POST `createTierNotification`)도 push+telegram만 보내고 broadcast는 안 한다 — broadcast 채널 전송은 approvals 라우트들에만 인라인으로 존재.

## NotificationBell 연결상태 — 과거 메모 3건 모두 현재 코드에 반영되어 있음 확인
(참고: `.claude/../memory/project_notification_bell_debug.md`, 2026-04-26 작성, 101일 경과. 아래는 2026-08-06 기준 재검증 결과.)
- `setAuth` 타이밍 버그(수정 완료로 기록됨) — 여전히 미호출 상태 유지. `contexts/NotificationContext.tsx:245~246` 주석에 이유 명시.
- auto-reconnect가 실제로 재연결 안 하던 버그(메모엔 "수정 방안"만 제시, 미확인 상태였음) — 현재는 반영되어 있다. 자동 재연결 useEffect(`NotificationContext.tsx:302~338`)와 수동 `reconnectRealtime()`(`:950~969`) 둘 다 `setReconnectTrigger` 호출 전에 `broadcastChannelRef`/`globalNotifChannelRef`/`userIdRef`를 명시적으로 초기화한다.
- "이중 상태 인디케이터" 계획(메모엔 다음 계획으로만 존재) — 구현 완료. `isApiReachable` 상태(`:114`)가 추가되어 `isConnected = realtimeConnectionState.isConnected || isApiReachable`(`:341`), `fetchNotifications()` 성공 시 `setIsApiReachable(true)`. WebSocket이 끊겨도 REST 폴링이 되면 벨은 녹색으로 표시된다(별도의 두 번째 점을 그리는 방식은 아니고, 계산된 단일 `isConnected` 값에 두 신호를 합침).
- ⚠️ 실제 렌더링되는 벨은 `components/notifications/NotificationBell.tsx` 하나뿐(`components/ui/AdminLayout.tsx`가 import, 64개 페이지가 AdminLayout 사용). `TierNotificationBell.tsx`/`RealtimeNotificationBell.tsx`/`NotificationButton.tsx`/`StableNotificationButton.tsx`는 어디서도 import되지 않는 죽은 코드 — 수정 시 착각하지 말 것. 단 `TierNotificationContext.tsx`(다른 컨텍스트)는 `app/admin/notifications/page.tsx`(전체 알림 페이지)에서 살아있게 쓰인다.

## 채널/폴링 요약
| 채널 | 목적 | 구독 위치 |
|---|---|---|
| `approval-notify:{userId}` (broadcast) | 결재 승인/반려 즉시 수신 | `NotificationContext.tsx` `broadcastChannelRef`, 연결상태 인디케이터를 이 채널이 제어 |
| `notif-personal:{userId}` (postgres_changes, `notifications` INSERT) | `target_user_id` 없는 전체 공지 fallback | `globalNotifChannelRef`, 보조 채널이라 인디케이터에 영향 없음 |
| 60초 setInterval 폴링 | 위 두 채널이 못 받는 personal 알림 보정 | `NotificationContext.tsx:1067~1136` |
