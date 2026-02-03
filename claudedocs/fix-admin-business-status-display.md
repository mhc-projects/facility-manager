# admin/business 페이지 Status 표시 문제 수정

## 📋 문제 상황

**보고**: admin/tasks 페이지에서 업무 검색이 안되고, 사업장관리 상세모달과 다르게 표시됨

**원인**: admin/business 페이지의 로컬 `getStatusDisplayName`과 `getStatusColor` 함수가 새로운 prefix가 적용된 status 값들을 처리하지 못함

## 🔍 근본 원인 분석

### 문제 코드 위치
`app/admin/business/page.tsx:838-957`

### 문제 시나리오

1. **DB에는 이미 prefixed status 저장됨**: 예) `self_customer_contact`, `subsidy_site_inspection`
2. **admin/business 페이지의 hardcoded mapping**: 새로운 prefixed status가 없음
3. **결과**: statusMap에서 status를 찾지 못해 그대로 반환 → 라벨이 이상하게 표시

### 누락된 Status

```typescript
// 누락되어 있던 status들
'self_customer_contact': '고객 상담',
'self_site_inspection': '현장 실사',
'self_quotation': '견적서 작성',
'self_contract': '계약 체결',

'subsidy_customer_contact': '고객 상담',
'subsidy_site_inspection': '현장 실사',
'subsidy_quotation': '견적서 작성',
'subsidy_contract': '계약 체결',
```

## ✅ 해결 방안

### 1. getStatusDisplayName 함수 업데이트

**변경 사항**: 모든 prefix가 적용된 status 추가

```typescript
const statusMap: { [key: string]: string } = {
  // 확인필요 단계 (모든 타입)
  'self_needs_check': '확인필요',
  'subsidy_needs_check': '확인필요',
  'as_needs_check': '확인필요',
  'dealer_needs_check': '확인필요',
  'outsourcing_needs_check': '확인필요',
  'etc_needs_check': '확인필요',

  // 자비 공통 단계 (✅ 추가)
  'self_customer_contact': '고객 상담',
  'self_site_inspection': '현장 실사',
  'self_quotation': '견적서 작성',
  'self_contract': '계약 체결',

  // 자비 전용 단계
  'self_deposit_confirm': '계약금 확인',
  'self_product_order': '제품 발주',
  // ... 나머지 단계

  // 보조금 공통 단계 (✅ 추가)
  'subsidy_customer_contact': '고객 상담',
  'subsidy_site_inspection': '현장 실사',
  'subsidy_quotation': '견적서 작성',
  'subsidy_contract': '계약 체결',

  // 보조금 전용 단계
  'subsidy_document_preparation': '신청서 작성 필요',
  'subsidy_application_submit': '신청서 제출',
  // ... 나머지 단계

  // 레거시 호환성 (기존 매핑 유지)
  'customer_contact': '고객 상담',
  'site_inspection': '현장 실사',
  'quotation': '견적서 작성',
  'contract': '계약 체결',
  // ...
}
```

### 2. getStatusColor 함수 업데이트

**변경 방식**: 하드코딩된 switch 문 → 패턴 매칭 방식으로 변경

**Before**:
```typescript
const getStatusColor = (status: string) => {
  switch (status) {
    case 'quotation': return { bg: 'bg-amber-50', ... }
    case 'site_inspection': return { bg: 'bg-cyan-50', ... }
    case 'customer_contact': return { bg: 'bg-blue-50', ... }
    case 'contract': return { bg: 'bg-purple-50', ... }
    // ... 개별 케이스만 처리
  }
}
```

**After**:
```typescript
const getStatusColor = (status: string) => {
  // 확인필요 단계 (모든 prefix 처리)
  if (status.includes('needs_check')) {
    return { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-700', badge: 'bg-red-100' }
  }

  // 공통 단계 (prefix 포함한 모든 status 처리)
  if (status.includes('customer_contact')) {
    return { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', badge: 'bg-blue-100' }
  }
  if (status.includes('site_inspection')) {
    return { bg: 'bg-cyan-50', border: 'border-cyan-400', text: 'text-cyan-700', badge: 'bg-cyan-100' }
  }
  if (status.includes('quotation')) {
    return { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700', badge: 'bg-amber-100' }
  }
  // ... 패턴 매칭으로 처리
}
```

**장점**:
- `self_customer_contact`, `subsidy_customer_contact`, `customer_contact` 모두 동일한 색상으로 처리
- 새로운 prefix가 추가되어도 자동으로 처리됨
- 유지보수가 쉬움

## 🛠️ 실행 방법

### 코드 수정 확인
```bash
npm run build
```

## 🔗 관련 파일

### 수정된 파일
- [app/admin/business/page.tsx](app/admin/business/page.tsx:838-957)

### 참조 파일
- [lib/task-steps.ts](lib/task-steps.ts) - 정확한 status 정의 (SSOT)
- [lib/task-status-utils.ts](lib/task-status-utils.ts) - 전역 status 유틸리티

## 📝 참고사항

### admin/tasks vs admin/business 차이점

**admin/tasks 페이지**:
- `getStatusLabel(type, status)` 사용 (lib/task-steps.ts)
- 중앙화된 함수 사용 → 자동으로 모든 status 처리됨
- ✅ 문제 없음

**admin/business 페이지**:
- 로컬 `getStatusDisplayName(status)` 함수 사용
- 하드코딩된 매핑 → 새로운 status 수동 추가 필요
- ❌ 이번 수정으로 해결됨

### 향후 개선 제안

admin/business 페이지도 lib/task-steps.ts의 `getStatusLabel` 함수를 사용하도록 리팩토링하면, 중복 코드 제거 및 유지보수 용이성 향상 가능

```typescript
// 현재 (로컬 함수)
const statusLabel = getStatusDisplayName(status)

// 제안 (중앙화된 함수)
import { getStatusLabel } from '@/lib/task-steps'
const statusLabel = getStatusLabel(taskType, status)
```

## ✅ 검증 체크리스트

- [x] getStatusDisplayName에 모든 prefixed status 추가
- [x] getStatusColor를 패턴 매칭 방식으로 변경
- [x] TypeScript 컴파일 테스트 통과
- [ ] admin/business 상세모달에서 업무 표시 정상 동작 확인
- [ ] admin/tasks 페이지 검색 정상 동작 확인
- [ ] 모든 task type별 status 색상 정상 표시 확인

## 🎯 설계 원칙

### DRY (Don't Repeat Yourself) 위반
현재 status mapping이 여러 곳에 중복되어 있음:
- lib/task-steps.ts (SSOT)
- lib/task-status-utils.ts (TASK_STATUS_KR)
- app/admin/business/page.tsx (getStatusDisplayName) ← 이번 수정
- app/api/admin/tasks/bulk-upload/route.ts (getStatusCodeFromKorean)

### 향후 리팩토링 방향
1. 모든 페이지가 lib/task-steps.ts의 함수 사용
2. status 매핑 로직 중앙화
3. type-safe한 status 관리 (TypeScript enum 활용)
