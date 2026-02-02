# 데이터베이스 체크 제약 조건 오류 수정

## 문제 상황

엑셀 일괄 업로드로 "대리점" 타입 업무를 등록한 후, 해당 업무를 수정하려고 할 때 다음 오류 발생:

```
❌ [PG] Query failed: {
  error: 'new row for relation "facility_tasks" violates check constraint "facility_tasks_status_check"'
}
🔴 [FACILITY-TASKS] PUT 오류: new row for relation "facility_tasks" violates check constraint "facility_tasks_status_check"
PUT /api/facility-tasks 500 in 798ms
```

**증상**:
- ❌ "대리점" 타입 업무 생성/수정 실패
- ❌ "외주설치" 타입 업무 생성/수정 실패
- ❌ "AS" 타입 업무 생성/수정 실패
- ❌ "기타" 타입 업무 생성/수정 실패
- ✅ "자비", "보조금" 타입만 정상 작동

## 원인 분석

### 데이터베이스 스키마 문제
[sql/tasks_table.sql:19-28](sql/tasks_table.sql#L19-L28)의 기존 제약 조건이 구식입니다:

```sql
-- ❌ 기존 제약 조건 (구식)
task_type VARCHAR(20) NOT NULL CHECK (task_type IN ('self', 'subsidy')),
status VARCHAR(50) NOT NULL CHECK (status IN (
  'customer_contact', 'site_inspection', 'quotation', 'contract',
  'deposit_confirm', 'product_order', 'product_shipment', 'installation_schedule',
  'installation', 'balance_payment', 'document_complete',
  -- 보조금 전용 단계
  'application_submit', 'document_supplement', 'pre_construction_inspection',
  'pre_construction_supplement', 'completion_inspection', 'completion_supplement',
  'final_document_submit', 'subsidy_payment'
))
```

### 프론트엔드와 데이터베이스 불일치

**프론트엔드** ([app/admin/tasks/page.tsx:54](app/admin/tasks/page.tsx#L54)):
```typescript
type TaskType = 'self' | 'subsidy' | 'etc' | 'as' | 'dealer' | 'outsourcing'
// ✅ 6가지 타입 지원
```

**데이터베이스**:
```sql
task_type IN ('self', 'subsidy')
-- ❌ 2가지 타입만 허용
```

### 누락된 Status 값들

**프론트엔드에서 사용 중**:
- dealer_order_received, dealer_invoice_issued, dealer_payment_confirmed, dealer_product_ordered
- outsourcing_order, outsourcing_schedule, outsourcing_in_progress, outsourcing_completed
- as_customer_contact, as_site_inspection, as_quotation, as_contract, as_part_order, as_completed
- self_needs_check, subsidy_needs_check, as_needs_check, dealer_needs_check, outsourcing_needs_check, etc_needs_check
- etc_status

**데이터베이스**:
- ❌ 위 status 값들이 제약 조건에 없음
- → INSERT/UPDATE 시 제약 조건 위반 오류 발생

## 해결 방법

### 파일: `sql/update_facility_tasks_constraints.sql`

데이터베이스 제약 조건을 업데이트하는 마이그레이션 SQL을 작성했습니다.

#### 1. 기존 제약 조건 삭제
```sql
ALTER TABLE facility_tasks DROP CONSTRAINT IF EXISTS facility_tasks_task_type_check;
ALTER TABLE facility_tasks DROP CONSTRAINT IF EXISTS facility_tasks_status_check;
```

#### 2. 새로운 task_type 제약 조건 추가
```sql
ALTER TABLE facility_tasks ADD CONSTRAINT facility_tasks_task_type_check
  CHECK (task_type IN ('self', 'subsidy', 'dealer', 'outsourcing', 'as', 'etc'));
```

#### 3. 새로운 status 제약 조건 추가 (전체 단계 포함)
```sql
ALTER TABLE facility_tasks ADD CONSTRAINT facility_tasks_status_check
  CHECK (status IN (
    -- 공통 단계
    'pending', 'site_survey', 'customer_contact', 'site_inspection', 'quotation', 'contract',

    -- 확인필요 단계 (각 업무 타입별)
    'self_needs_check', 'subsidy_needs_check', 'as_needs_check',
    'dealer_needs_check', 'outsourcing_needs_check', 'etc_needs_check',

    -- 자비 전용 단계
    'deposit_confirm', 'product_order', 'product_shipment', 'installation_schedule',
    'installation', 'balance_payment', 'document_complete',

    -- 보조금 전용 단계
    'approval_pending', 'approved', 'rejected', 'application_submit',
    'document_supplement', 'document_preparation', 'pre_construction_inspection',
    'pre_construction_supplement_1st', 'pre_construction_supplement_2nd',
    'construction_report_submit', 'pre_completion_document_submit',
    'completion_inspection', 'completion_supplement_1st', 'completion_supplement_2nd',
    'completion_supplement_3rd', 'final_document_submit', 'subsidy_payment',

    -- AS 전용 단계
    'as_customer_contact', 'as_site_inspection', 'as_quotation',
    'as_contract', 'as_part_order', 'as_completed',

    -- 대리점 전용 단계
    'dealer_order_received', 'dealer_invoice_issued',
    'dealer_payment_confirmed', 'dealer_product_ordered',

    -- 외주설치 전용 단계
    'outsourcing_order', 'outsourcing_schedule',
    'outsourcing_in_progress', 'outsourcing_completed',

    -- 기타 단계
    'etc_status'
  ));
```

#### 4. 주석 업데이트
```sql
COMMENT ON COLUMN facility_tasks.task_type IS '업무 타입: self(자비), subsidy(보조금), dealer(대리점), outsourcing(외주설치), as(AS), etc(기타)';
COMMENT ON COLUMN facility_tasks.status IS '업무 진행 단계 - 각 업무 타입별 워크플로우 단계';
```

## 적용 방법

### Supabase SQL Editor에서 실행

1. **Supabase Dashboard 접속**
   - https://app.supabase.com 로그인
   - 프로젝트 선택

2. **SQL Editor 열기**
   - 왼쪽 메뉴에서 "SQL Editor" 클릭
   - "New query" 버튼 클릭

3. **마이그레이션 SQL 실행**
   ```sql
   -- sql/update_facility_tasks_constraints.sql 내용 복사 후 붙여넣기
   -- "Run" 버튼 클릭
   ```

4. **실행 결과 확인**
   ```
   ✅ ALTER TABLE (기존 제약 조건 삭제)
   ✅ ALTER TABLE (새로운 task_type 제약 조건 추가)
   ✅ ALTER TABLE (새로운 status 제약 조건 추가)
   ✅ COMMENT ON COLUMN (주석 업데이트)
   ```

5. **검증 쿼리 실행** (선택사항)
   ```sql
   -- 제약 조건 확인
   SELECT
     conname AS constraint_name,
     pg_get_constraintdef(oid) AS constraint_definition
   FROM pg_constraint
   WHERE conrelid = 'facility_tasks'::regclass
     AND conname LIKE '%_check';
   ```

## 업무 타입별 Status 매핑

### 자비 (self)
```
self_needs_check → customer_contact → site_inspection → quotation → contract
→ deposit_confirm → product_order → product_shipment → installation_schedule
→ installation → balance_payment → document_complete
```

### 보조금 (subsidy)
```
subsidy_needs_check → customer_contact → site_inspection → quotation
→ document_preparation → application_submit → approval_pending → approved/rejected
→ document_supplement → pre_construction_inspection
→ pre_construction_supplement_1st → pre_construction_supplement_2nd
→ construction_report_submit → product_order → product_shipment
→ installation_schedule → installation → pre_completion_document_submit
→ completion_inspection → completion_supplement_1st/2nd/3rd
→ final_document_submit → subsidy_payment
```

### 대리점 (dealer)
```
dealer_needs_check → dealer_order_received → dealer_invoice_issued
→ dealer_payment_confirmed → dealer_product_ordered
```

### 외주설치 (outsourcing)
```
outsourcing_needs_check → outsourcing_order → outsourcing_schedule
→ outsourcing_in_progress → outsourcing_completed
```

### AS (as)
```
as_needs_check → as_customer_contact → as_site_inspection → as_quotation
→ as_contract → as_part_order → as_completed
```

### 기타 (etc)
```
etc_needs_check → etc_status
```

## 데이터 정합성 확인

마이그레이션 실행 후 기존 데이터 확인:

```sql
-- 제약 조건을 위반하는 데이터가 있는지 확인
SELECT
  task_type,
  status,
  COUNT(*) as count
FROM facility_tasks
WHERE
  task_type NOT IN ('self', 'subsidy', 'dealer', 'outsourcing', 'as', 'etc')
  OR status NOT IN (
    -- (전체 status 목록 나열)
  )
GROUP BY task_type, status;
```

만약 위반 데이터가 발견되면 수동으로 수정:

```sql
-- 예: 'self' 타입인데 보조금 전용 status를 가진 경우
UPDATE facility_tasks
SET task_type = 'subsidy'
WHERE task_type = 'self' AND status IN ('application_submit', 'document_supplement', 'subsidy_payment');
```

## 수정 효과

### Before (제약 조건 위반)
```
task_type: 'dealer'
status: 'dealer_order_received'
→ ❌ ERROR: new row violates check constraint "facility_tasks_status_check"
```

### After (정상 작동)
```
task_type: 'dealer'
status: 'dealer_order_received'
→ ✅ SUCCESS: Row inserted/updated successfully
```

## 테스트 체크리스트

### 마이그레이션 실행 후 확인

- [ ] Supabase SQL Editor에서 마이그레이션 SQL 실행
- [ ] 제약 조건 정상 업데이트 확인
- [ ] 기존 데이터 정합성 확인 (위반 데이터 없음)

### 업무 생성/수정 테스트

- [ ] 자비 타입 업무 생성/수정 성공
- [ ] 보조금 타입 업무 생성/수정 성공
- [ ] 대리점 타입 업무 생성/수정 성공
- [ ] 외주설치 타입 업무 생성/수정 성공
- [ ] AS 타입 업무 생성/수정 성공
- [ ] 기타 타입 업무 생성/수정 성공

### 엑셀 일괄 업로드 테스트

- [ ] "대리점" 타입으로 일괄 업로드 성공
- [ ] "외주설치" 타입으로 일괄 업로드 성공
- [ ] "기타" 타입으로 일괄 업로드 성공
- [ ] 업로드 후 업무 수정 성공

## 관련 파일

### 마이그레이션 SQL
- `sql/update_facility_tasks_constraints.sql` - 제약 조건 업데이트 스크립트 (신규 생성)

### 기존 스키마
- `sql/tasks_table.sql` - 기존 테이블 생성 스크립트 (참고용)

### 프론트엔드 코드
- `app/admin/tasks/page.tsx` - TaskType 및 TaskStatus 정의
- `components/tasks/BulkUploadModal.tsx` - 엑셀 일괄 업로드

## 관련 문서

이 수정은 다음 문서들과 연관되어 있습니다:
- `claudedocs/fix-excel-bulk-upload-validation.md` - 엑셀 업로드 유효성 검사 수정
- `claudedocs/fix-tasks-table-display-issues.md` - 테이블 표시 오류 수정
- `claudedocs/fix-tasks-table-header-and-step-display.md` - 테이블 헤더 수정

## 결론

**한 줄 요약**: 데이터베이스 제약 조건이 프론트엔드 코드와 동기화되지 않아 발생한 문제로, 새로운 업무 타입(dealer, outsourcing, as, etc)과 해당 단계(status)를 제약 조건에 추가하여 해결했습니다.

**핵심 교훈**:
- 데이터베이스 제약 조건과 프론트엔드 타입 정의는 항상 동기화되어야 함
- 새로운 기능 추가 시 데이터베이스 스키마 업데이트 필수
- 마이그레이션 스크립트를 통한 체계적인 스키마 변경 관리 중요
- 제약 조건 위반 오류는 프론트엔드가 아닌 데이터베이스 레벨에서 발생

**향후 개선 방안**:
1. **자동화된 검증**: CI/CD에서 프론트엔드 타입과 DB 제약 조건 일치 여부 자동 검증
2. **마이그레이션 관리**: Prisma, TypeORM 등 ORM 도구로 스키마 변경 자동 관리
3. **타입 안전성**: DB 스키마에서 TypeScript 타입 자동 생성 (codegen)
4. **문서화**: 스키마 변경 시 자동으로 문서 업데이트
