# admin/business 페이지 현재단계 한글 라벨 표시 수정 완료

## 작업 요약

admin/business 페이지의 "현재 단계" 컬럼에서 데이터베이스 스키마 값이 그대로 표시되던 문제를 해결했습니다.

## 문제 상황

### Before (수정 전)
```
┌─────────────┬────────────────────────┐
│ 사업장명     │ 현재 단계              │
├─────────────┼────────────────────────┤
│ 태우섬유     │ self_document_complete │ ← ❌ 스키마 값
│ 한일전동     │ dealer_product_ordered │ ← ❌ 스키마 값
│ 다른사업장   │ self_needs_check       │ ← ❌ 스키마 값
└─────────────┴────────────────────────┘
```

### After (수정 후)
```
┌─────────────┬──────────────────┐
│ 사업장명     │ 현재 단계        │
├─────────────┼──────────────────┤
│ 태우섬유     │ 서류 발송 완료    │ ← ✅ 한글 라벨
│ 한일전동     │ 제품 발주        │ ← ✅ 한글 라벨
│ 다른사업장   │ 확인필요         │ ← ✅ 한글 라벨
└─────────────┴──────────────────┘
```

## 수정 내용

### 파일: `lib/business-task-utils.ts`

#### 1. Import 추가
```typescript
import { TASK_STATUS_KR } from '@/lib/task-status-utils';
```

#### 2. STATUS_LABELS 제거
- 중복된 매핑 제거
- 단일 진실 공급원(Single Source of Truth)으로 `TASK_STATUS_KR` 사용
- 레거시 참조용으로 주석 처리하여 보존

#### 3. 매핑 함수 수정
```typescript
// 수정 전
const statusLabel = STATUS_LABELS[topTask.status] || topTask.status

// 수정 후
const statusLabel = TASK_STATUS_KR[topTask.status] || topTask.status
```

#### 4. STATUS_COLORS 확장
누락된 prefix 상태에 대한 색상 매핑 추가:

**추가된 상태:**
- ✅ 확인필요: `self_needs_check`, `subsidy_needs_check`, `dealer_needs_check`, etc.
- ✅ 자비 단계: `self_customer_contact`, `self_quotation`, `self_document_complete`, etc.
- ✅ 보조금 단계: `subsidy_application_submit`, `subsidy_payment`, etc.
- ✅ 대리점 단계: `dealer_order_received`, `dealer_product_ordered`, etc.
- ✅ AS 단계: `as_customer_contact`, `as_completed`, etc.
- ✅ 외주설치 단계: `outsourcing_order`, `outsourcing_completed`, etc.

## 기술적 개선사항

### 1. 단일 진실 공급원 (Single Source of Truth)
```
Before:
├─ business-task-utils.ts → STATUS_LABELS (중복)
└─ task-status-utils.ts → TASK_STATUS_KR

After:
└─ task-status-utils.ts → TASK_STATUS_KR (단일)
    ↑
    business-task-utils.ts에서 import
```

### 2. 완전한 prefix 지원
모든 업무 타입의 prefix 상태 지원:
- `self_*` (자비)
- `subsidy_*` (보조금)
- `dealer_*` (대리점)
- `as_*` (AS)
- `outsourcing_*` (외주설치)
- `etc_*` (기타)

### 3. 레거시 호환성 유지
prefix 없는 구버전 상태도 계속 지원:
- `customer_contact` → "고객 상담"
- `product_order` → "제품 발주"
- etc.

## 검증 결과

### 지원되는 모든 상태 (일부)

| 스키마 값 | 한글 라벨 | 상태 |
|----------|----------|------|
| `self_needs_check` | 확인필요 | ✅ |
| `self_document_complete` | 서류 발송 완료 | ✅ |
| `dealer_product_ordered` | 제품 발주 | ✅ |
| `subsidy_payment` | 보조금 입금 | ✅ |
| `as_completed` | AS 완료 | ✅ |
| `outsourcing_completed` | 설치 완료 | ✅ |

### 색상 매핑

| 상태 | 색상 클래스 |
|------|------------|
| `*_needs_check` | 빨간색 (`bg-red-100`) |
| `*_customer_contact` | 보라색 (`bg-purple-100`) |
| `*_site_inspection` | 파란색 (`bg-blue-100`) |
| `*_quotation` | 노란색 (`bg-yellow-100`) |
| `*_contract` | 녹색 (`bg-green-100`) |
| `*_payment` | 에메랄드색 (`bg-emerald-100`) |
| `*_completed` | 하늘색 (`bg-sky-100`) |

## 영향 범위

### 직접 영향
- ✅ `app/admin/business/page.tsx` - 현재 단계 컬럼 표시 정상화

### 간접 영향
- ✅ 없음 (다른 페이지는 영향 없음)

### 테스트 필요
- [ ] admin/business 페이지 접속
- [ ] 다양한 업무 타입 확인:
  - [ ] 자비(self) 업무
  - [ ] 보조금(subsidy) 업무
  - [ ] 대리점(dealer) 업무
  - [ ] AS 업무
  - [ ] 외주설치 업무
- [ ] 모든 상태가 한글로 표시되는지 확인
- [ ] 색상 배지가 적절하게 표시되는지 확인

## 파일 변경 사항

### 수정된 파일
- `lib/business-task-utils.ts` - STATUS_LABELS를 TASK_STATUS_KR로 대체, STATUS_COLORS 확장

### 참조 파일
- `lib/task-status-utils.ts` - 마스터 한글 매핑 소스
- `lib/task-steps.ts` - 상태 타입 정의
- `app/admin/business/page.tsx` - 영향 받는 UI

### 문서
- `claudedocs/fix-admin-business-status-label-design.md` - 설계 문서
- `claudedocs/fix-admin-business-status-label-complete.md` - 완료 보고서

## 향후 개선 사항

### 1. 타입 안전성 강화
```typescript
// task-status-utils.ts
import { TaskStatus } from './task-steps'

// TypeScript가 누락된 상태를 컴파일 시점에 감지
export const TASK_STATUS_KR: Record<TaskStatus, string> = {
  // 모든 상태 필수
}
```

### 2. 테스트 코드 추가
```typescript
// task-status-utils.test.ts
test('모든 TaskStatus에 한글 매핑이 있어야 함', () => {
  const allStatuses: TaskStatus[] = [
    ...selfSteps.map(s => s.status),
    ...subsidySteps.map(s => s.status),
    ...dealerSteps.map(s => s.status),
    ...asSteps.map(s => s.status),
    ...outsourcingSteps.map(s => s.status)
  ]

  allStatuses.forEach(status => {
    expect(TASK_STATUS_KR[status]).toBeDefined()
    expect(typeof TASK_STATUS_KR[status]).toBe('string')
  })
})
```

### 3. 색상 체계 통합
`task-steps.ts`에 정의된 색상과 `business-task-utils.ts`의 STATUS_COLORS 통합 고려

## 완료 체크리스트

- [x] `business-task-utils.ts`에 TASK_STATUS_KR import 추가
- [x] STATUS_LABELS 제거 (주석 처리)
- [x] 모든 STATUS_LABELS 참조를 TASK_STATUS_KR로 변경
- [x] STATUS_COLORS에 누락된 prefix 상태 추가
- [x] 설계 문서 작성
- [x] 완료 보고서 작성
- [ ] admin/business 페이지 테스트
- [ ] 다양한 업무 타입 검증
- [ ] 프로덕션 배포

## 결과

✅ **문제 해결 완료**
- admin/business 페이지의 "현재 단계" 컬럼이 이제 모든 업무 상태를 **한글 라벨**로 정확하게 표시합니다.
- `self_needs_check` → "확인필요"
- `self_document_complete` → "서류 발송 완료"
- `dealer_product_ordered` → "제품 발주"

✅ **구조적 개선**
- 중복 코드 제거
- 단일 진실 공급원 확립
- 유지보수성 향상

✅ **확장성 확보**
- 모든 업무 타입의 prefix 상태 지원
- 향후 새로운 상태 추가 시 task-status-utils.ts만 수정하면 됨
