# Supabase 서울 리전 이전 런북

상태. 미실행. 참고용.
작성일. 2026-08-16.
목적. 운영 DB를 싱가폴(`ap-southeast-1`)에서 서울(`ap-northeast-2`)로 옮길 때 그대로 따라가기 위한 절차서.

공식 문서.
- [Change Project Region](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z)
- [Migrating within Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase)
- [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

---

## 1. 한 줄 요약

리전은 프로젝트에 고정되어 있어서 제자리 변경이 불가능하다. 서울에 새 프로젝트를 만들고, 점검 창을 잡은 뒤 dump/restore → Storage 복사 → 환경변수·pooler 호스트 교체로 컷오버한다. Vercel은 이미 서울이므로 DB만 맞추면 서버 API와 브라우저 Realtime/Storage 둘 다 빨라진다.

---

## 2. 현재 상태 (2026-08-16 기준)

| 구분 | 프로젝트 | ref | 리전 | 상태 |
|---|---|---|---|---|
| 현재 운영 | facility-manager | `uvdvfsjekqshxtxthxeq` | 싱가폴 `ap-southeast-1` | ACTIVE_HEALTHY |
| 예전 프로젝트 | facility-manager | `qdfqoykhmuiambtrrlnf` | 서울 `ap-northeast-2` | INACTIVE (중지) |
| 조직 | mhc853@gmail.com's Org | `satzynzpqvkwjgzqxdhg` | Pro 플랜 | — |
| 앱 호스팅 | Vercel | — | 서울 (`icn1`) | 이미 서울 |

앱 연결 방식.
- 브라우저. `NEXT_PUBLIC_SUPABASE_URL` + anon key (`lib/supabase.ts`). Realtime·Storage.
- 서버 API. `lib/supabase-direct.ts`가 Transaction pooler(`6543`)로 Postgres에 직접 연결. 호스트가 싱가폴로 하드코딩되어 있다.
- 인증. Supabase Auth가 아니라 `employees` 테이블 + 자체 JWT(`JWT_SECRET`). JWT 시크릿은 이전과 무관하게 그대로 둔다.

---

## 3. 하지 말 것

- 중지된 서울 프로젝트(`qdfqoykhmuiambtrrlnf`)를 다시 켜서 쓰지 말 것. 2025-12-31 이전 데이터만 있다.
- 대시보드의 **Restore to a new project**를 리전 변경용으로 쓰지 말 것. 같은 리전으로만 복제된다.
- 서비스가 돌아가는 채로 dump하지 말 것. 그 사이 쓰여진 행·파일이 빠진다.
- 컷오버 직후 싱가폴 프로젝트를 삭제하지 말 것. 최소 1~2주는 pause만 하고 롤백 창을 남긴다.
- Transaction pooler(포트 `6543`)로 dump/restore 하지 말 것. Session pooler(포트 `5432`)를 쓴다.
- `.env.migration`과 덤프 파일, 비밀번호를 git에 커밋하지 말 것.
- 프로덕션에서 DROP/TRUNCATE 하지 말 것.

---

## 4. 가져가는 것 / 직접 다시 맞춰야 하는 것

CLI dump/restore가 가져가는 것.
- public 스키마의 테이블·뷰·함수·트리거·인덱스
- 데이터(행)
- 롤·권한
- `auth` 스키마 사용자 레코드(이 프로젝트는 주 인증이 아니라 부가적)
- `storage` 스키마의 버킷 메타데이터(실제 파일은 아님)

직접 다시 맞춰야 하는 것.
- Storage 실제 객체(사진, 첨부, PDF)
- Realtime publication
- Auth 대시보드 설정(사이트 URL, 리다이렉트). 소셜 로그인은 UI에서 꺼져 있음
- 확장(extension), Database Webhook
- 프로젝트 URL / anon key / service role / DB 비밀번호
- 코드의 싱가폴 pooler 호스트
- Vercel·로컬·Lambda 환경변수

Edge Functions는 현재 운영 프로젝트에 없다. 이전 대상 아님.

---

## 5. 지난번 이전에서 배운 것 (2025-12 서울 → 싱가폴)

기록. `claudedocs/sql-migration-final-status.md`, `.env.migration`.

그때 막혔던 지점.
- `business_info`의 `business_info_history` 트리거가 `data_history`를 참조해서, 트리거를 안 끄면 복원이 실패했다.
- `pg_restore --disable-triggers`와 `ALTER TABLE DISABLE TRIGGER ALL`은 Supabase에서 시스템 트리거 권한 때문에 통하지 않았다.
- 그 결과 `business_info`와 그에 매달린 테이블이 비어 있었다.

이번에 쓰는 공식 CLI 복원 명령은 `SET session_replication_role = replica`로 트리거를 끈다. 지난번 실패를 피하려면 이 한 줄을 빼면 안 된다.

그 밖에 이미 한 번 겪은 실수.
- URL·anon key만 바꾸고 `SUPABASE_SERVICE_ROLE_KEY`를 옛 프로젝트 키로 남겨 두었다 (`claudedocs/SUPABASE_SERVICE_ROLE_KEY_UPDATE.md`).
- `SUPABASE_DB_PASSWORD`를 Vercel에 안 넣어서 로그인 전면 장애가 났다 (2026-07-25).
- 비밀번호에 `#`이 있으면 `.env.local`에서 따옴표 없이 쓰면 잘린다. 반드시 `"..."`로 감싼다.

---

## 6. 사전 준비

도구.
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- Docker Desktop (`supabase db dump`가 사용)
- `psql` (`brew install postgresql@17`)
- Node.js (Storage 복사 스크립트)

정보. 대시보드에서 적어 둘 것. 이 문서에는 비밀번호·키를 적지 않는다.

- 현재(싱가폴) Session pooler URI. 포트 5432
- 현재 DB 비밀번호
- 현재 service role key
- 새 서울 프로젝트 Session pooler URI
- 새 DB 비밀번호
- 새 URL / anon key / service role

연결 문자열 위치. Dashboard → Connect → Session pooler.
형식은 `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-1-[REGION].pooler.supabase.com:5432/postgres` 이다.
비밀번호에 `#`이 있으면 URL 인코딩은 `%23`.

로컬 작업 디렉터리 예.

```bash
mkdir -p ~/supabase-seoul-migration/{backups,logs}
cd ~/supabase-seoul-migration
```

점검 창.
- 사용자에게 쓰기 중지 공지
- 가능하면 앱을 점검 페이지로
- dump 시작부터 컷오버 검증 끝까지 쓰기를 받지 않는 것이 안전

---

## 7. 실행 순서

### 7.1 서울에 빈 프로젝트 만들기

1. [database.new](https://database.new) 에서 New project.
2. 이름 예. `facility-manager-seoul`.
3. Region은 반드시 **Northeast Asia (Seoul) `ap-northeast-2`**.
4. DB 비밀번호를 기록한다. `# $ &` 같은 문자가 있으면 나중에 URL 인코딩과 `.env` 따옴표를 잊지 말 것.
5. 예전 서울 프로젝트는 재사용하지 않는다.

새 프로젝트에서 먼저 켤 것.
- Database Webhooks (원본에서 쓰고 있으면)
- 원본과 같은 Extensions
- 컴퓨트 크기는 원본과 같거나 그 이상

### 7.2 원본 행 수·파일 수 스냅샷

dump 직전에 원본에서 찍어 둔다. 복원 후 같은 숫자여야 한다.

```sql
SELECT 'business_info' AS t, count(*) FROM business_info
UNION ALL SELECT 'business_memos', count(*) FROM business_memos
UNION ALL SELECT 'employees', count(*) FROM employees
UNION ALL SELECT 'facility_tasks', count(*) FROM facility_tasks
UNION ALL SELECT 'task_status_history', count(*) FROM task_status_history
UNION ALL SELECT 'invoice_records', count(*) FROM invoice_records
UNION ALL SELECT 'as_records', count(*) FROM as_records
UNION ALL SELECT 'installation_payments', count(*) FROM installation_payments
UNION ALL SELECT 'eungyeol_transfers', count(*) FROM eungyeol_transfers
UNION ALL SELECT 'closing_records', count(*) FROM closing_records
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'task_notifications', count(*) FROM task_notifications
UNION ALL SELECT 'air_permit_info', count(*) FROM air_permit_info
UNION ALL SELECT 'discharge_outlets', count(*) FROM discharge_outlets
UNION ALL SELECT 'discharge_facilities', count(*) FROM discharge_facilities
UNION ALL SELECT 'prevention_facilities', count(*) FROM prevention_facilities
UNION ALL SELECT 'uploaded_files', count(*) FROM uploaded_files
UNION ALL SELECT 'approval_documents', count(*) FROM approval_documents
ORDER BY 1;
```

Realtime publication 목록도 찍어 둔다.

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY 1, 2;
```

Storage 버킷·파일 수는 대시보드 또는 아래 8장의 스크립트로 센다.

### 7.3 dump

쓰기를 멈춘 뒤, 현재(싱가폴) Session pooler URI로 실행한다.

```bash
export OLD_DB_URL='postgresql://postgres.uvdvfsjekqshxtxthxeq:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
export NEW_DB_URL='postgresql://postgres.[NEW-REF]:[PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

# CLI 마이그레이션 이력을 새 프로젝트에서도 쓰려면
supabase db dump --db-url "$OLD_DB_URL" -f history_schema.sql --schema supabase_migrations
supabase db dump --db-url "$OLD_DB_URL" -f history_data.sql --use-copy --data-only --schema supabase_migrations
```

파일이 비정상적으로 작으면 중단한다. 예전 `business_info` 덤프만 빠져도 전체 복원이 의미 없다.

### 7.4 restore

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DB_URL"
```

`SET session_replication_role = replica` 를 빼면 지난번처럼 히스토리 트리거에서 실패할 수 있다.

마이그레이션 이력까지 옮기려면.

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file history_schema.sql \
  --file history_data.sql \
  --dbname "$NEW_DB_URL"
```

자주 나오는 오류와 대처. 공식 가이드와 동일하다.

- `ALTER ... OWNER TO "supabase_admin"` 권한 오류. `schema.sql`에서 해당 줄을 주석 처리.
- `GRANT "postgres" TO "cli_login_postgres"` 오류. `roles.sql`에서 해당 줄을 주석 처리.
- Vault / pgsodium을 쓰는 경우에만 루트 암호화 키를 옛 프로젝트에서 새 프로젝트로 복사. 이 코드베이스에는 Vault 사용 흔적이 없다. 쓰는지 복원 전에 대시보드에서 한 번 확인.

### 7.5 Realtime publication 다시 켜기

복원 후 대시보드 Database → Publications, 또는 SQL.

코드가 구독하는 테이블.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS business_info;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS business_memos;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS facility_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS uploaded_files;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS as_records;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS task_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS employees;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS manufacturers;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS progress_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS task_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS approval_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS approval_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS subsidy_announcements;
```

원본 스냅샷에 더 있으면 그것도 추가한다.

### 7.6 Storage 파일 복사

DB 복원은 버킷 메타데이터만 가져온다. 실제 파일은 별도다.

코드에서 확인된 버킷.

| 버킷 | 용도 | public |
|---|---|---|
| `facility-files` | 사업장 사진, 캘린더, 발주서 등. 가장 큼 | public |
| `announcement-attachments` | 공지 첨부 | private |
| `approval-attachments` | 전자결재 첨부 | (설정 확인) |
| `dpf-documents` | 위키 지침서 PDF | public |

공식 Storage 이전 스크립트는 [Backup and Restore 가이드의 Migrating storage objects](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) 에 있다. 양 프로젝트의 URL과 service role을 넣고 실행한다.

파일 URL은 DB에 절대경로로 저장하지 않는다. `file_path`만 저장하고, 앱이 `NEXT_PUBLIC_SUPABASE_URL`로 public URL을 만든다. 키만 바꾸면 기존 경로는 그대로 열린다.

복사 후 버킷별 파일 수가 원본과 같은지 확인한다.

### 7.7 코드 수정 (필수)

운영 경로에서 리전이 박혀 있는 곳은 여기다.

파일. `lib/supabase-direct.ts`

```ts
host: `aws-1-ap-southeast-1.pooler.supabase.com`,
```

를 아래로 바꾼다.

```ts
host: `aws-1-ap-northeast-2.pooler.supabase.com`,
```

같은 문자열이 로그용으로 한 번 더 있다. 둘 다 바꾼다.

더 안전하게 가려면 호스트를 환경변수로 빼는 편이 좋다. 예. `SUPABASE_POOLER_HOST`. 필수 작업은 아니고, 이번 이전 때 같이 하면 다음 리전 변경이 편하다.

운영에 영향 있는 하드코딩(여유 있으면 같이).

| 파일 | 내용 |
|---|---|
| `app/api/subsidy-crawler/direct/route.ts` | 쿠키 이름 `sb-uvdvfsjekqshxtxthxeq-auth-token` |
| `app/api/subsidy-crawler/direct-urls/upload/route.ts` | 위와 동일 |

주 로그인은 자체 JWT라 이 쿠키는 폴백이다. 크롤러 직접 URL 화면을 쓰면 새 project ref에 맞게 고친다.

일회성 스크립트(`scripts/*.js` 안의 옛 URL)는 운영과 무관하다. 급하면 건드리지 않아도 된다.

### 7.8 환경변수 교체

세 곳을 같은 값으로 맞춘다. 하나라도 옛 프로젝트면 로그인 또는 대시보드가 죽는다.

바꿀 것.

- `NEXT_PUBLIC_SUPABASE_URL` = `https://[NEW-REF].supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD` (새 프로젝트 비밀번호. `#` 포함 시 `.env.local`은 반드시 따옴표)

바꾸지 말 것.

- `JWT_SECRET` / `JWT_SECRET_V2`. 로그인 토큰은 DB가 아니라 이 시크릿으로 검증한다.
- 카카오/네이버/구글 클라이언트 ID. 소셜 로그인을 다시 켤 때만 Auth 대시보드에 복사.

대상.

1. 로컬 `.env.local`
2. Vercel Project Settings → Environment Variables. Production / Preview / Development 모두
3. Lambda `subsidy-crawler` 를 아직 쓰고 있으면 그쪽 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Vercel에 값을 넣은 뒤 **재배포**해야 서버가 새 값을 읽는다. env만 저장하고 재배포를 빼먹으면 이전 장애와 같다.

`.env.local` 비밀번호 예.

```bash
SUPABASE_DB_PASSWORD="여기에#특수문자포함비번"
```

### 7.9 검증 후에만 컷오버

권장 순서.

1. 로컬 `.env.local`만 새 프로젝트로 바꾸고 `npm run dev`로 먼저 확인.
2. Vercel Preview에 새 env를 넣고 프리뷰 URL로 한 번 더 확인.
3. 통과하면 Production env 교체 + `lib/supabase-direct.ts` 커밋 배포.
4. 싱가폴 프로젝트는 Settings에서 pause. 삭제는 1~2주 뒤.

컷오버 순간부터 싱가폴 DB에 쓰기가 들어가면 그 데이터는 서울에 없다. 점검 창을 유지한 채 전환한다.

---

## 8. 컷오버 후 확인

데이터.

```sql
-- 7.2에서 찍은 숫자와 비교
```

앱 (로컬 → 프리뷰 → 프로덕션 순).

- 로그인 (테스트 계정)
- 대시보드 주간 브리핑·매출 숫자
- 사업장 목록 / 상세 / 사진
- 업무 칸반, 메모 실시간 반영
- AS 목록
- 전자결재 첨부 열기
- 공지 첨부 열기
- 알림 벨
- 파일 업로드 한 건 (새 파일이 서울 버킷에 생기는지)

빌드.

```bash
npm run build
```

문제 없이 끝나면 싱가폴 프로젝트는 pause만 한다.

---

## 9. 롤백

서울 쪽에서 데이터가 비거나 로그인이 안 되면, 코드를 되돌리고 환경변수를 싱가폴 값으로 복구한 뒤 재배포한다. 싱가폴 프로젝트를 지우지 않은 동안은 이것으로 즉시 복구된다.

롤백 후 서울 프로젝트에만 들어간 신규 쓰기는 버린다. 그래서 점검 창이 필요하다.

---

## 10. 체크리스트

준비.

- [ ] 점검 창 일정 확정, 사용자 공지
- [ ] Supabase CLI / Docker / psql 설치
- [ ] 서울에 **새** 프로젝트 생성 (`ap-northeast-2`)
- [ ] 예전 서울 프로젝트(`qdfqoykhmuiambtrrlnf`)를 쓰지 않기로 확인
- [ ] 원본·대상 Session pooler URI, 비밀번호, 키를 로컬 메모에만 기록
- [ ] 원본 행 수 스냅샷
- [ ] 원본 Realtime publication 스냅샷
- [ ] 원본 Storage 버킷·파일 수 스냅샷

데이터.

- [ ] 쓰기 중지
- [ ] `roles.sql` / `schema.sql` / `data.sql` dump
- [ ] dump 파일 크기·행 수가 비정상적으로 작지 않은지 확인
- [ ] `session_replication_role = replica` 포함 restore
- [ ] (선택) `supabase_migrations` 이력 restore
- [ ] 대상 행 수가 원본과 일치
- [ ] Realtime publication 재등록
- [ ] Storage 4버킷 파일 복사, 개수 일치

앱.

- [ ] `lib/supabase-direct.ts` pooler 호스트를 `ap-northeast-2`로 변경
- [ ] (해당되면) 크롤러 쿠키의 옛 project ref 수정
- [ ] `.env.local` 4개 값 교체. 비밀번호는 따옴표
- [ ] Vercel Production / Preview / Development 동일 교체
- [ ] Lambda를 쓰면 그쪽 URL·service role 교체
- [ ] `JWT_SECRET`은 그대로
- [ ] 로컬 로그인 → 대시보드 → 사업장 → 파일 → 실시간
- [ ] 프리뷰 동일 확인
- [ ] `npm run build` 통과
- [ ] Production 재배포
- [ ] 프로덕션에서 같은 경로 재확인

마무리.

- [ ] 싱가폴 프로젝트 pause (삭제 금지)
- [ ] 1~2주 문제 없으면 싱가폴 프로젝트 정리
- [ ] `.env.migration`·덤프 파일을 git에 올리지 않았는지 확인
- [ ] 이 문서 상단 상태를 `완료`로 바꾸고 새 project ref를 기록

---

## 11. 나중에 문서만 고치면 되는 칸

이전을 끝낸 뒤 아래를 채운다.

- 새 프로젝트 ref.
- 새 프로젝트 URL.
- 컷오버 일시.
- 실제 다운타임.
- 행 수 대조 결과 요약.
- Storage 파일 수 대조 결과.
- 발생한 오류와 해결.
