# Complete Prefix Migration - 모든 Status에 Type별 Prefix 적용

## 📋 작업 개요

**목적**: 공통 단계를 포함한 모든 업무 상태에 type별 prefix를 적용하여 완전한 단일소스 원칙(SSOT) 구현

**작업일**: 2025-02-03

**작업 범위**:
- 기존: 663개 타입별 전용 status 마이그레이션 완료 (product_order, installation 등)
- 추가: 공통 status 마이그레이션 필요 (customer_contact, site_inspection, quotation, contract)

## 🎯 변경 사항

### 1. TaskStatus Type 업데이트

#### 추가된 Status
```typescript
// 자비 공통 단계
| 'self_customer_contact' | 'self_site_inspection' | 'self_quotation' | 'self_contract'

// 보조금 공통 단계
| 'subsidy_customer_contact' | 'subsidy_site_inspection' | 'subsidy_quotation' | 'subsidy_contract'
```

#### 기존 유지 (레거시 호환성)
```typescript
// AS는 이미 prefix 적용됨
| 'as_customer_contact' | 'as_site_inspection' | 'as_quotation' | 'as_contract'

// dealer, outsourcing, etc는 공통 단계 사용 안 함 (각자의 전용 단계만 존재)
```

### 2. lib/task-steps.ts 변경

#### selfSteps (자비)
```typescript
export const selfSteps: TaskStep[] = [
  { status: 'self_needs_check', label: '확인필요', color: 'red' },
  { status: 'self_customer_contact', label: '고객 상담', color: 'blue' }, // ✅ 변경
  { status: 'self_site_inspection', label: '현장 실사', color: 'yellow' }, // ✅ 변경
  { status: 'self_quotation', label: '견적서 작성', color: 'orange' }, // ✅ 변경
  { status: 'self_contract', label: '계약 체결', color: 'purple' }, // ✅ 추가
  { status: 'self_deposit_confirm', label: '계약금 확인', color: 'indigo' },
  // ... 나머지 단계
]
```

#### subsidySteps (보조금)
```typescript
export const subsidySteps: TaskStep[] = [
  { status: 'subsidy_needs_check', label: '확인필요', color: 'red' },
  { status: 'subsidy_customer_contact', label: '고객 상담', color: 'blue' }, // ✅ 변경
  { status: 'subsidy_site_inspection', label: '현장 실사', color: 'yellow' }, // ✅ 변경
  { status: 'subsidy_quotation', label: '견적서 작성', color: 'orange' }, // ✅ 변경
  { status: 'subsidy_contract', label: '계약 체결', color: 'purple' }, // ✅ 추가
  { status: 'subsidy_document_preparation', label: '신청서 작성 필요', color: 'amber' },
  // ... 나머지 단계
]
```

#### asSteps (AS) - 변경 없음
```typescript
export const asSteps: TaskStep[] = [
  { status: 'as_needs_check', label: '확인필요', color: 'red' },
  { status: 'as_customer_contact', label: 'AS 고객 상담', color: 'blue' }, // 이미 prefix 있음
  { status: 'as_site_inspection', label: 'AS 현장 확인', color: 'yellow' }, // 이미 prefix 있음
  { status: 'as_quotation', label: 'AS 견적 작성', color: 'orange' }, // 이미 prefix 있음
  { status: 'as_contract', label: 'AS 계약 체결', color: 'purple' }, // 이미 prefix 있음
  // ... 나머지 단계
]
```

#### dealerSteps, outsourcingSteps, etcSteps - 변경 없음
이 타입들은 공통 단계를 사용하지 않고 각자의 전용 단계만 사용

### 3. lib/task-status-utils.ts 변경

#### TASK_STATUS_KR 매핑 추가
```typescript
export const TASK_STATUS_KR: { [key: string]: string } = {
  // ... 기존 매핑

  // 자비 공통 단계 (self_ prefix) - ✅ 추가
  'self_customer_contact': '고객 상담',
  'self_site_inspection': '현장 실사',
  'self_quotation': '견적서 작성',
  'self_contract': '계약 체결',

  // 보조금 공통 단계 (subsidy_ prefix) - ✅ 추가
  'subsidy_customer_contact': '고객 상담',
  'subsidy_site_inspection': '현장 실사',
  'subsidy_quotation': '견적서 작성',
  'subsidy_contract': '계약 체결',

  // 공통 단계 (레거시 호환성) - 유지
  'customer_contact': '고객 상담',
  'site_inspection': '현장 실사',
  'quotation': '견적서 작성',
  'contract': '계약 체결',

  // ...
}
```

#### getStatusProgress 함수 업데이트
```typescript
export function getStatusProgress(status: string): number {
  const progressMap: { [key: string]: number } = {
    // 자비 공통 단계 - ✅ 추가
    'self_customer_contact': 5,
    'self_site_inspection': 15,
    'self_quotation': 25,
    'self_contract': 35,

    // 공통 단계 - 레거시 (유지)
    'customer_contact': 5,
    'site_inspection': 15,
    'quotation': 25,
    'contract': 35,

    // ...
  }
}
```

#### getStatusColor 함수 업데이트
```typescript
export function getStatusColor(status: string): string {
  const colorMap: { [key: string]: string } = {
    // 자비 공통 단계 - ✅ 추가
    'self_customer_contact': 'bg-blue-100 text-blue-800',
    'self_site_inspection': 'bg-yellow-100 text-yellow-800',
    'self_quotation': 'bg-orange-100 text-orange-800',
    'self_contract': 'bg-purple-100 text-purple-800',

    // 보조금 공통 단계 - ✅ 추가
    'subsidy_customer_contact': 'bg-blue-100 text-blue-800',
    'subsidy_site_inspection': 'bg-yellow-100 text-yellow-800',
    'subsidy_quotation': 'bg-orange-100 text-orange-800',
    'subsidy_contract': 'bg-purple-100 text-purple-800',

    // 공통 단계 - 레거시 (유지)
    'customer_contact': 'bg-gray-100 text-gray-800',
    'site_inspection': 'bg-blue-100 text-blue-800',
    'quotation': 'bg-yellow-100 text-yellow-800',
    'contract': 'bg-orange-100 text-orange-800',

    // ...
  }
}
```

### 4. SQL Constraint 업데이트

#### sql/update_facility_tasks_constraints.sql
```sql
ALTER TABLE facility_tasks
ADD CONSTRAINT facility_tasks_status_check
CHECK (status IN (
  -- 기존 공통 (레거시 호환성)
  'pending', 'customer_contact', 'site_inspection', 'quotation', 'contract',

  -- 확인필요 단계
  'self_needs_check', 'subsidy_needs_check', 'as_needs_check', 'dealer_needs_check', 'outsourcing_needs_check', 'etc_needs_check',

  -- 자비 공통 단계 (✅ 추가)
  'self_customer_contact', 'self_site_inspection', 'self_quotation', 'self_contract',

  -- 자비 전용 단계
  'self_deposit_confirm', 'self_product_order', 'self_product_shipment', 'self_installation_schedule', 'self_installation', 'self_balance_payment', 'self_document_complete',

  -- 보조금 공통 단계 (✅ 추가)
  'subsidy_customer_contact', 'subsidy_site_inspection', 'subsidy_quotation', 'subsidy_contract',

  -- 보조금 전용 단계
  'subsidy_document_preparation', 'subsidy_application_submit', 'subsidy_approval_pending', 'subsidy_approved', 'subsidy_rejected', 'subsidy_document_supplement',
  'subsidy_pre_construction_inspection', 'subsidy_pre_construction_supplement_1st', 'subsidy_pre_construction_supplement_2nd', 'subsidy_construction_report_submit',
  'subsidy_product_order', 'subsidy_product_shipment', 'subsidy_installation_schedule', 'subsidy_installation',
  'subsidy_pre_completion_document_submit', 'subsidy_completion_inspection', 'subsidy_completion_supplement_1st', 'subsidy_completion_supplement_2nd', 'subsidy_completion_supplement_3rd',
  'subsidy_final_document_submit', 'subsidy_payment',

  -- AS 단계
  'as_customer_contact', 'as_site_inspection', 'as_quotation', 'as_contract', 'as_part_order', 'as_completed',

  -- 대리점 단계
  'dealer_order_received', 'dealer_invoice_issued', 'dealer_payment_confirmed', 'dealer_product_ordered',

  -- 외주설치 단계
  'outsourcing_order', 'outsourcing_schedule', 'outsourcing_in_progress', 'outsourcing_completed',

  -- 기타 단계
  'etc_status',

  -- 레거시 호환성 (구버전 status)
  'deposit_confirm', 'product_order', 'product_shipment', 'installation_schedule', 'installation', 'balance_payment', 'document_complete',
  'application_submit', 'document_supplement', 'document_preparation', 'pre_construction_inspection', 'pre_construction_supplement',
  'pre_construction_supplement_1st', 'pre_construction_supplement_2nd', 'construction_report_submit',
  'completion_inspection', 'completion_supplement', 'completion_supplement_1st', 'completion_supplement_2nd', 'completion_supplement_3rd',
  'pre_completion_document_submit', 'final_document_submit', 'approval_pending', 'approved', 'rejected'
));
```

## 🛠️ 마이그레이션 실행 방법

### 1단계: DB Constraint 업데이트
```bash
# Supabase SQL Editor에서 실행
sql/update_facility_tasks_constraints.sql
```

### 2단계: 데이터 마이그레이션
```bash
# 공통 status에 type별 prefix 적용
node scripts/migrate-common-statuses.js
```

## 📊 예상 마이그레이션 대상

### 공통 Status 매핑 규칙
```yaml
customer_contact:
  self → self_customer_contact
  subsidy → subsidy_customer_contact
  as → as_customer_contact (이미 적용됨)
  dealer → customer_contact (유지, dealer는 공통 단계 미사용)
  outsourcing → customer_contact (유지)
  etc → customer_contact (유지)

site_inspection:
  self → self_site_inspection
  subsidy → subsidy_site_inspection
  as → as_site_inspection (이미 적용됨)
  dealer → site_inspection (유지)
  outsourcing → site_inspection (유지)
  etc → site_inspection (유지)

quotation:
  self → self_quotation
  subsidy → subsidy_quotation
  as → as_quotation (이미 적용됨)
  dealer → quotation (유지)
  outsourcing → quotation (유지)
  etc → quotation (유지)

contract:
  self → self_contract
  subsidy → subsidy_contract
  as → as_contract (이미 적용됨)
  dealer → contract (유지)
  outsourcing → contract (유지)
  etc → contract (유지)
```

## ✅ 검증 체크리스트

### 코드 검증
- [x] TaskStatus type에 모든 새 status 추가
- [x] lib/task-steps.ts의 selfSteps 업데이트
- [x] lib/task-steps.ts의 subsidySteps 업데이트
- [x] lib/task-status-utils.ts TASK_STATUS_KR 매핑 추가
- [x] lib/task-status-utils.ts getStatusProgress 함수 업데이트
- [x] lib/task-status-utils.ts getStatusColor 함수 업데이트
- [x] SQL constraint에 모든 새 status 추가
- [x] 마이그레이션 스크립트 작성
- [ ] TypeScript 컴파일 테스트
- [ ] DB constraint 업데이트 실행
- [ ] 데이터 마이그레이션 실행

### 기능 검증
- [ ] admin/tasks 칸반보드 정상 동작
- [ ] admin/business 미니 칸반보드 정상 표시
- [ ] 업무 상태 변경 정상 동작
- [ ] 진행률 계산 정상 동작
- [ ] 색상 표시 정상 동작

## 🎓 설계 원칙

### 완전한 SSOT 구현
1. **모든 status에 type prefix 적용**: 공통 단계도 예외 없이 type별로 구분
2. **명확한 업무 구분**: self, subsidy, as 각각의 공통 단계를 명확히 구분
3. **레거시 호환성 유지**: 기존 코드는 계속 작동하도록 매핑 유지
4. **점진적 마이그레이션**: 데이터 변경 전 코드 완료, constraint 업데이트 후 마이그레이션

### 타입별 Status 체계
```
📋 자비 (self):
  - 공통: self_customer_contact, self_site_inspection, self_quotation, self_contract
  - 전용: self_deposit_confirm, self_product_order, ..., self_document_complete

📋 보조금 (subsidy):
  - 공통: subsidy_customer_contact, subsidy_site_inspection, subsidy_quotation, subsidy_contract
  - 전용: subsidy_document_preparation, subsidy_application_submit, ..., subsidy_payment

📋 AS (as):
  - 공통: as_customer_contact, as_site_inspection, as_quotation, as_contract (이미 적용됨)
  - 전용: as_part_order, as_completed

📋 대리점 (dealer):
  - 전용만: dealer_order_received, dealer_invoice_issued, dealer_payment_confirmed, dealer_product_ordered
  - 공통 단계 사용 안 함

📋 외주설치 (outsourcing):
  - 전용만: outsourcing_order, outsourcing_schedule, outsourcing_in_progress, outsourcing_completed
  - 공통 단계 사용 안 함

📋 기타 (etc):
  - 전용만: etc_status
  - 공통 단계 사용 안 함
```

## 🔗 관련 파일

### 변경된 파일
- `/Users/mh.c/claude/facility-manager/lib/task-steps.ts`
- `/Users/mh.c/claude/facility-manager/lib/task-status-utils.ts`
- `/Users/mh.c/claude/facility-manager/sql/update_facility_tasks_constraints.sql`

### 생성된 파일
- `/Users/mh.c/claude/facility-manager/scripts/migrate-common-statuses.js`
- `/Users/mh.c/claude/facility-manager/claudedocs/complete-prefix-migration.md`

### 참조 문서
- `/Users/mh.c/claude/facility-manager/claudedocs/status-prefix-migration-complete.md` (이전 663개 마이그레이션)
