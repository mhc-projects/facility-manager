# admin/business 페이지 현재단계 한글 라벨 표시 수정

## 문제 상황

### 현상
admin/business 페이지의 테이블 "현재 단계" 컬럼에서 **데이터베이스 스키마 값이 그대로 표시**되고 있음

**예시:**
- ❌ `self_needs_check` (스키마 값)
- ❌ `self_document_complete` (스키마 값)
- ❌ `dealer_product_ordered` (스키마 값)
- ✅ `확인필요` (올바른 한글 라벨)
- ✅ `서류 발송 완료` (올바른 한글 라벨)
- ✅ `제품 발주` (올바른 한글 라벨)

### 원인 분석

#### 1. 파일 위치 및 역할
```
lib/business-task-utils.ts (문제 파일)
├─ STATUS_LABELS: 업무 상태 한글 매핑
├─ STATUS_COLORS: 업무 상태 색상 매핑
└─ getBusinessTaskStatus(): admin/business 페이지용 상태 조회 함수

lib/task-status-utils.ts (정상 파일)
├─ TASK_STATUS_KR: 완전한 업무 상태 한글 매핑
├─ getTaskStatusKR(): 한글 변환 함수
└─ task-steps.ts와 동기화됨
```

#### 2. 근본 원인
`business-task-utils.ts`의 `STATUS_LABELS`가 **prefix 마이그레이션 이전 구조**로 작성됨:

```typescript
// ❌ 문제: prefix 없는 구버전 매핑만 존재
const STATUS_LABELS: Record<string, string> = {
  customer_contact: '고객 상담',
  site_inspection: '현장 실사',
  quotation: '견적서 작성',
  contract: '계약 체결',
  deposit_confirm: '계약금 확인',
  product_order: '제품 발주',
  // ...
  // self_, subsidy_, dealer_ prefix 상태 없음!
}
```

#### 3. 코드 흐름
```
admin/business/page.tsx
  ↓
getBusinessTaskStatus(businessName) 호출
  ↓
STATUS_LABELS[topTask.status] 조회 ← ❌ 매핑 없음!
  ↓
매핑 실패 시 원본 status 반환 (231번 라인)
  ↓
화면에 스키마 값 그대로 표시
```

231번 라인:
```typescript
const statusLabel = STATUS_LABELS[topTask.status] || topTask.status
//                                                   ^^^^^^^^
//                                                   매핑 없으면 원본 반환
```

## 해결 방안

### 목표
`business-task-utils.ts`의 `STATUS_LABELS`를 `task-status-utils.ts`의 `TASK_STATUS_KR`과 동일하게 업데이트

### 수정 전략

#### Option 1: 직접 매핑 추가 (선택)
`STATUS_LABELS`에 모든 prefix 상태 추가

**장점:**
- 독립성 유지 (다른 파일 의존하지 않음)
- 명확한 매핑 구조

**단점:**
- 중복 코드 (TASK_STATUS_KR과 동일 내용)
- 유지보수 부담 (두 곳 수정 필요)

#### Option 2: TASK_STATUS_KR 재사용 (권장)
`task-status-utils.ts`의 `TASK_STATUS_KR` import하여 사용

**장점:**
- 단일 진실 공급원 (Single Source of Truth)
- 유지보수 용이 (한 곳만 수정)
- 일관성 보장

**단점:**
- 파일 간 의존성 추가

## 구현 설계

### Option 2 적용 (권장)

#### 1. import 추가
```typescript
// lib/business-task-utils.ts
import { TASK_STATUS_KR } from '@/lib/task-status-utils'
```

#### 2. STATUS_LABELS 제거 또는 대체
```typescript
// ❌ 기존 코드 제거
const STATUS_LABELS: Record<string, string> = { ... }

// ✅ 새 코드: TASK_STATUS_KR 사용
// STATUS_LABELS 완전 제거하고 TASK_STATUS_KR 직접 사용
```

#### 3. 사용처 변경
```typescript
// 231번 라인
// ❌ 기존
const statusLabel = STATUS_LABELS[topTask.status] || topTask.status

// ✅ 수정
const statusLabel = TASK_STATUS_KR[topTask.status] || topTask.status
```

### Option 1 적용 (대안)

`STATUS_LABELS`에 누락된 prefix 상태 추가:

```typescript
const STATUS_LABELS: Record<string, string> = {
  // 확인필요 단계 (각 업무 타입별) - 추가
  'self_needs_check': '확인필요',
  'subsidy_needs_check': '확인필요',
  'as_needs_check': '확인필요',
  'dealer_needs_check': '확인필요',
  'outsourcing_needs_check': '확인필요',
  'etc_needs_check': '확인필요',

  // 자비 공통/전용 단계 - 추가
  'self_customer_contact': '고객 상담',
  'self_site_inspection': '현장 실사',
  'self_quotation': '견적서 작성',
  'self_contract': '계약 체결',
  'self_deposit_confirm': '계약금 확인',
  'self_product_order': '제품 발주',
  'self_product_shipment': '제품 출고',
  'self_installation_schedule': '설치 협의',
  'self_installation': '제품 설치',
  'self_balance_payment': '잔금 입금',
  'self_document_complete': '서류 발송 완료',

  // 보조금 단계 - 추가 (subsidy_ prefix 전체)
  'subsidy_customer_contact': '고객 상담',
  'subsidy_site_inspection': '현장 실사',
  // ... (70개 이상)

  // 대리점 단계 - 추가
  'dealer_order_received': '발주 수신',
  'dealer_invoice_issued': '계산서 발행',
  'dealer_payment_confirmed': '입금 확인',
  'dealer_product_ordered': '제품 발주',

  // AS, 외주설치, 기타 - 추가
  'as_customer_contact': 'AS 고객 상담',
  'as_site_inspection': 'AS 현장 확인',
  // ...

  // 기존 레거시 호환 매핑 유지
  customer_contact: '고객 상담',
  site_inspection: '현장 실사',
  // ...
}
```

## 영향 범위 분석

### 수정 대상 파일
- `lib/business-task-utils.ts` (1개 파일만)

### 영향 받는 UI
- `app/admin/business/page.tsx`의 "현재 단계" 컬럼

### 다른 페이지 영향
- ✅ admin/tasks 페이지: 영향 없음 (`getStatusLabel` 사용, 이미 정상 작동)
- ✅ business 상세 페이지: 영향 없음 (별도 로직)
- ✅ 기타 페이지: 영향 없음

## 색상 매핑 추가

`STATUS_COLORS`도 동일한 문제가 있을 수 있으므로 확인 필요:

```typescript
// 누락된 prefix 상태에 대한 색상 매핑 추가
const STATUS_COLORS: Record<string, string> = {
  // 확인필요 (빨간색 계열)
  'self_needs_check': 'bg-red-100 text-red-800',
  'subsidy_needs_check': 'bg-red-100 text-red-800',
  'dealer_needs_check': 'bg-red-100 text-red-800',
  'as_needs_check': 'bg-red-100 text-red-800',
  'outsourcing_needs_check': 'bg-red-100 text-red-800',
  'etc_needs_check': 'bg-red-100 text-red-800',

  // 자비 단계 (기존 패턴과 동일)
  'self_customer_contact': 'bg-purple-100 text-purple-800',
  'self_site_inspection': 'bg-blue-100 text-blue-800',
  'self_quotation': 'bg-yellow-100 text-yellow-800',
  'self_contract': 'bg-green-100 text-green-800',
  'self_deposit_confirm': 'bg-emerald-100 text-emerald-800',
  'self_product_order': 'bg-indigo-100 text-indigo-800',
  'self_product_shipment': 'bg-cyan-100 text-cyan-800',
  'self_installation_schedule': 'bg-amber-100 text-amber-800',
  'self_installation': 'bg-orange-100 text-orange-800',
  'self_balance_payment': 'bg-teal-100 text-teal-800',
  'self_document_complete': 'bg-sky-100 text-sky-800',

  // 보조금 단계 (subsidy_ prefix)
  'subsidy_customer_contact': 'bg-purple-100 text-purple-800',
  'subsidy_site_inspection': 'bg-blue-100 text-blue-800',
  // ... (전체 subsidy_ 상태)

  // 대리점 단계
  'dealer_order_received': 'bg-blue-100 text-blue-800',
  'dealer_invoice_issued': 'bg-green-100 text-green-800',
  'dealer_payment_confirmed': 'bg-emerald-100 text-emerald-800',
  'dealer_product_ordered': 'bg-indigo-100 text-indigo-800',

  // AS, 외주설치 단계
  // ...

  // 기존 레거시 매핑 유지
  customer_contact: 'bg-purple-100 text-purple-800',
  site_inspection: 'bg-blue-100 text-blue-800',
  // ...
}
```

## 구현 순서

### Phase 1: 한글 라벨 수정 (긴급)
1. `business-task-utils.ts` import 추가
2. `STATUS_LABELS` → `TASK_STATUS_KR` 변경
3. 테스트 및 검증

### Phase 2: 색상 매핑 보완 (선택)
1. `STATUS_COLORS`에 누락된 prefix 상태 추가
2. 색상 일관성 확인
3. 테스트 및 검증

## 검증 방법

### 1. 코드 검증
```typescript
// business-task-utils.ts에서 확인
console.log(TASK_STATUS_KR['self_needs_check'])        // '확인필요'
console.log(TASK_STATUS_KR['self_document_complete'])  // '서류 발송 완료'
console.log(TASK_STATUS_KR['dealer_product_ordered'])  // '제품 발주'
```

### 2. UI 검증
admin/business 페이지에서:
- [ ] "태우섬유" 사업장 현재단계 확인
  - 예상: `서류 발송 완료` (한글)
  - 이전: `self_document_complete` (스키마)

- [ ] 다른 사업장들 현재단계 확인
  - 모든 상태가 한글로 표시되어야 함
  - 스키마 값이 보이면 안 됨

### 3. 다양한 업무 타입 확인
- [ ] 자비(self) 업무 상태 표시
- [ ] 보조금(subsidy) 업무 상태 표시
- [ ] 대리점(dealer) 업무 상태 표시
- [ ] AS 업무 상태 표시
- [ ] 외주설치 업무 상태 표시

## 예상 결과

### 수정 전
```
┌─────────────┬────────────────────────┐
│ 사업장명     │ 현재 단계              │
├─────────────┼────────────────────────┤
│ 태우섬유     │ self_document_complete │ ← ❌ 스키마 값
│ 한일전동     │ dealer_product_ordered │ ← ❌ 스키마 값
│ 다른사업장   │ self_needs_check       │ ← ❌ 스키마 값
└─────────────┴────────────────────────┘
```

### 수정 후
```
┌─────────────┬──────────────────┐
│ 사업장명     │ 현재 단계        │
├─────────────┼──────────────────┤
│ 태우섬유     │ 서류 발송 완료    │ ← ✅ 한글 라벨
│ 한일전동     │ 제품 발주        │ ← ✅ 한글 라벨
│ 다른사업장   │ 확인필요         │ ← ✅ 한글 라벨
└─────────────┴──────────────────┘
```

## 파일 목록

### 수정 대상
- `lib/business-task-utils.ts` - STATUS_LABELS를 TASK_STATUS_KR로 대체

### 참조 파일
- `lib/task-status-utils.ts` - 올바른 한글 매핑 소스
- `lib/task-steps.ts` - 상태 정의 소스
- `app/admin/business/page.tsx` - 영향 받는 UI

### 문서
- `claudedocs/fix-admin-business-status-label-design.md` - 설계 문서

## 체크리스트

- [ ] `business-task-utils.ts`에 import 추가
- [ ] `STATUS_LABELS` 제거 또는 주석 처리
- [ ] 모든 `STATUS_LABELS` 참조를 `TASK_STATUS_KR`로 변경
- [ ] (선택) `STATUS_COLORS`에 누락된 상태 추가
- [ ] admin/business 페이지 테스트
- [ ] 다양한 업무 타입 검증
- [ ] 모든 상태가 한글로 표시되는지 확인
- [ ] 콘솔 에러 없는지 확인

## 향후 개선 사항

### 1. 단일 진실 공급원 확립
모든 상태 라벨 매핑을 `task-status-utils.ts`로 통합:
- ✅ `task-status-utils.ts` - 마스터 매핑
- ✅ `task-steps.ts` - 타입 정의
- ❌ `business-task-utils.ts` - 중복 제거

### 2. 타입 안전성 강화
```typescript
// task-status-utils.ts
import { TaskStatus } from './task-steps'

export const TASK_STATUS_KR: Record<TaskStatus, string> = {
  // TypeScript가 누락된 상태 감지
}
```

### 3. 테스트 추가
```typescript
// task-status-utils.test.ts
import { TASK_STATUS_KR } from './task-status-utils'
import { TaskStatus, selfSteps, subsidySteps, dealerSteps } from './task-steps'

test('모든 상태에 한글 라벨이 있어야 함', () => {
  const allStatuses = [
    ...selfSteps.map(s => s.status),
    ...subsidySteps.map(s => s.status),
    ...dealerSteps.map(s => s.status)
  ]

  allStatuses.forEach(status => {
    expect(TASK_STATUS_KR[status]).toBeDefined()
  })
})
```
