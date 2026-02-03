# Status Prefix 완전 마이그레이션 문서

## 📋 작업 개요

**목적**: 모든 업무 타입별 status에 prefix를 적용하여 단일소스 원칙(SSOT) 준수 및 명확한 업무 구분

**작업일**: 2025-02-03

**영향 범위**:
- 전체 활성 업무: 3,114개
- 마이그레이션 대상: 663개 (21.3%)
- 코드 변경: 2개 파일 (lib/task-steps.ts, lib/task-status-utils.ts)

## 🎯 문제 상황

### 발견된 문제
1. **미니 칸반보드 표시 누락**: admin/business 페이지 상세 모달에서 dealer/outsourcing 업무 단계 미표시
2. **업무 중복 표시 혼동**: 동일 사업장에 대해 legacy status(prefix 없음)와 new status(prefix 있음)가 혼재되어 중복처럼 보임
3. **SSOT 원칙 위반**: lib/task-steps.ts에 일부 status는 prefix 적용, 일부는 미적용 상태

### 근본 원인
- 초기 시스템: `product_order`, `installation` 등 공통 status 사용
- 개선 시스템: `dealer_product_ordered`, `self_product_order` 등 타입별 prefix 추가
- **문제점**: 마이그레이션 불완전 → 198개 legacy status 잔존 (전체의 6.4%)

## 🔧 해결 방안

### Option 1: 완전 마이그레이션 (선택됨)
**전략**: 모든 타입별 status에 prefix 적용

**대상 status 매핑**:
```yaml
자비(self):
  deposit_confirm → self_deposit_confirm
  product_order → self_product_order
  product_shipment → self_product_shipment
  installation_schedule → self_installation_schedule
  installation → self_installation
  balance_payment → self_balance_payment
  document_complete → self_document_complete

보조금(subsidy):
  document_preparation → subsidy_document_preparation
  application_submit → subsidy_application_submit
  approval_pending → subsidy_approval_pending
  approved → subsidy_approved
  rejected → subsidy_rejected
  document_supplement → subsidy_document_supplement
  pre_construction_inspection → subsidy_pre_construction_inspection
  pre_construction_supplement_1st → subsidy_pre_construction_supplement_1st
  pre_construction_supplement_2nd → subsidy_pre_construction_supplement_2nd
  construction_report_submit → subsidy_construction_report_submit
  product_order → subsidy_product_order
  product_shipment → subsidy_product_shipment
  installation_schedule → subsidy_installation_schedule
  installation → subsidy_installation
  pre_completion_document_submit → subsidy_pre_completion_document_submit
  completion_inspection → subsidy_completion_inspection
  completion_supplement_1st → subsidy_completion_supplement_1st
  completion_supplement_2nd → subsidy_completion_supplement_2nd
  completion_supplement_3rd → subsidy_completion_supplement_3rd
  final_document_submit → subsidy_final_document_submit
  subsidy_payment → subsidy_payment (이미 prefix 있음)

대리점(dealer):
  product_order → dealer_product_ordered
  product_shipment → dealer_product_shipped
  installation_schedule → dealer_installation_schedule
  installation → dealer_installation
  deposit_confirm → dealer_deposit_confirm
  balance_payment → dealer_balance_payment
  document_complete → dealer_document_complete

공통 status (prefix 없음 유지):
  - pending
  - customer_contact
  - site_inspection
  - quotation
  - contract
```

## 📊 마이그레이션 통계

### 검증 결과 (scripts/verify-migration.js 실행)
```
전체 활성 업무: 3,114개
마이그레이션 대상: 663개 (21.3%)
마이그레이션 불필요: 2,451개 (78.7%)

타입별 분포:
- dealer: 49개
  - product_order → dealer_product_ordered: 49개

- subsidy: 603개
  - subsidy_payment → subsidy_payment: 468개 (이미 prefix)
  - approval_pending → subsidy_approval_pending: 16개
  - pre_completion_document_submit → subsidy_pre_completion_document_submit: 5개
  - product_order → subsidy_product_order: 28개
  - final_document_submit → subsidy_final_document_submit: 41개
  - completion_supplement_1st → subsidy_completion_supplement_1st: 6개
  - completion_supplement_2nd → subsidy_completion_supplement_2nd: 9개
  - rejected → subsidy_rejected: 10개
  - document_preparation → subsidy_document_preparation: 12개
  - installation_schedule → subsidy_installation_schedule: 8개

- self: 11개
  - document_complete → self_document_complete: 10개
  - installation_schedule → self_installation_schedule: 1개
```

## 🛠️ 구현 내역

### 1. 코드 변경

#### lib/task-steps.ts (완전 교체)
**백업**: lib/task-steps.backup.ts

**주요 변경**:
```typescript
// 변경 전 (일부만 prefix)
export const selfSteps: TaskStep[] = [
  { status: 'product_order', label: '제품 발주', color: 'cyan' }, // ❌ prefix 없음
  // ...
];

export const dealerSteps: TaskStep[] = [
  { status: 'dealer_product_ordered', label: '제품 발주', color: 'emerald' }, // ✅ prefix 있음
  // ...
];

// 변경 후 (모두 prefix)
export const selfSteps: TaskStep[] = [
  { status: 'self_product_order', label: '제품 발주', color: 'cyan' }, // ✅ prefix 추가
  { status: 'self_installation', label: '제품 설치', color: 'green' }, // ✅ prefix 추가
  // ...
];

export const subsidySteps: TaskStep[] = [
  { status: 'subsidy_product_order', label: '제품 발주', color: 'cyan' }, // ✅ prefix 추가
  { status: 'subsidy_installation', label: '설치완료', color: 'green' }, // ✅ prefix 추가
  // ...
];
```

#### lib/task-status-utils.ts (매핑 업데이트)
**주요 추가**:
```typescript
export const TASK_STATUS_KR: { [key: string]: string } = {
  // 공통 단계 (prefix 없음)
  'customer_contact': '고객 상담',
  'site_inspection': '현장 실사',
  'quotation': '견적서 작성',
  'contract': '계약 체결',

  // 자비 전용 단계 (self_ prefix)
  'self_deposit_confirm': '계약금 확인',
  'self_product_order': '제품 발주',
  'self_product_shipment': '제품 출고',
  'self_installation_schedule': '설치 협의',
  'self_installation': '제품 설치',
  'self_balance_payment': '잔금 입금',
  'self_document_complete': '서류 발송 완료',

  // 보조금 전용 단계 (subsidy_ prefix)
  'subsidy_document_preparation': '신청서 작성 필요',
  'subsidy_application_submit': '신청서 제출',
  'subsidy_product_order': '제품 발주',
  'subsidy_installation': '설치완료',
  // ... 모든 subsidy status 추가

  // 외주설치 단계 (outsourcing_ prefix)
  'outsourcing_order': '외주 발주',
  'outsourcing_schedule': '일정 조율',
  'outsourcing_in_progress': '설치 진행 중',
  'outsourcing_completed': '설치 완료',

  // 레거시 호환성 (마이그레이션 전까지 유지)
  'product_order': '제품 발주',
  'installation': '설치완료',
  // ... 기존 status 유지
};
```

**색상 매핑 추가**:
```typescript
export function getStatusColor(status: string): string {
  const colorMap: { [key: string]: string } = {
    // 확인필요 단계 (모든 타입)
    'self_needs_check': 'bg-red-100 text-red-800',
    'subsidy_needs_check': 'bg-red-100 text-red-800',
    'dealer_needs_check': 'bg-red-100 text-red-800',
    'outsourcing_needs_check': 'bg-red-100 text-red-800',

    // 자비 전용
    'self_product_order': 'bg-indigo-100 text-indigo-800',
    'self_installation': 'bg-green-100 text-green-800',

    // 보조금 전용
    'subsidy_product_order': 'bg-cyan-100 text-cyan-800',
    'subsidy_installation': 'bg-green-100 text-green-800',

    // 외주설치
    'outsourcing_order': 'bg-blue-100 text-blue-800',
    'outsourcing_completed': 'bg-green-100 text-green-800',

    // 레거시 호환성
    'product_order': 'bg-indigo-100 text-indigo-800',
    'installation': 'bg-green-100 text-green-800'
  };

  return colorMap[status] || 'bg-gray-100 text-gray-800';
}
```

### 2. 데이터베이스 마이그레이션

#### 실행 스크립트
- **검증**: `scripts/verify-migration.js` - 마이그레이션 계획 확인
- **실행**: `scripts/execute-migration.js` - 실제 데이터 변경

#### 실행 방법
```bash
# 1. 검증 (마이그레이션 영향 확인)
node scripts/verify-migration.js

# 2. 실행 (5초 대기 후 자동 시작)
node scripts/execute-migration.js
```

#### 안전 장치
1. **5초 대기**: 실행 전 확인 시간
2. **배치 처리**: 10개씩 나눠서 처리
3. **진행률 표시**: 실시간 처리 상황 확인
4. **오류 로깅**: 실패한 항목 개별 기록
5. **되돌리기 불가**: 실행 전 신중 검토 필수

## ✅ 검증 체크리스트

### 코드 검증
- [x] TypeScript 컴파일 성공 (`npm run build`)
- [x] lib/task-steps.ts 모든 status에 prefix 적용
- [x] lib/task-status-utils.ts 매핑 완료
- [x] 색상 매핑 함수 업데이트
- [x] 진행률 계산 함수 업데이트
- [ ] 데이터베이스 마이그레이션 실행
- [ ] 실제 화면 테스트

### 데이터베이스 검증
- [x] 마이그레이션 검증 스크립트 실행
- [x] 마이그레이션 대상 663개 확인
- [ ] 마이그레이션 실행 완료
- [ ] 실행 후 재검증 (legacy status 0개 확인)

### 기능 검증
- [ ] admin/business 상세 모달 - 미니 칸반보드 정상 표시
- [ ] admin/tasks 페이지 - 칸반보드 정상 동작
- [ ] dealer/outsourcing 업무 단계 모두 표시
- [ ] 업무 진행률 정상 계산
- [ ] 업무 상태 변경 정상 동작

## 🚀 마이그레이션 실행

### 실행 전 확인사항
1. ✅ 코드 변경 완료 (lib/task-steps.ts, lib/task-status-utils.ts)
2. ✅ TypeScript 컴파일 성공
3. ✅ 검증 스크립트 실행 완료
4. ⏳ 데이터베이스 백업 (선택사항 - Supabase는 자동 백업)

### 실행 명령
```bash
# 마이그레이션 실행
node scripts/execute-migration.js
```

### 예상 결과
```
🚀 [MIGRATION] 마이그레이션 실행 시작...
⚠️  주의: 이 작업은 되돌릴 수 없습니다!

5초 후 시작합니다...

✅ 전체 활성 업무 조회 완료: 3114개

📊 마이그레이션 대상: 663개

🔄 배치 1/67 처리 중... (10개)
  ✅ ㈜그린풋웨어: product_order → dealer_product_ordered
  ✅ 한일전동지게차: product_order → dealer_product_ordered
  ...

  진행률: 100% (663/663)

=============================================================
📊 마이그레이션 완료 요약

  ✅ 성공: 663개
  ❌ 실패: 0개
  📊 전체: 663개
=============================================================

✅ 모든 마이그레이션이 성공적으로 완료되었습니다!
```

## 📝 이후 작업

### 즉시
1. 마이그레이션 실행 및 결과 확인
2. admin/business 상세 모달 테스트
3. admin/tasks 칸반보드 테스트

### 후속 정리
1. 레거시 호환성 코드 제거 (lib/task-status-utils.ts의 'product_order' 등)
2. 검증 스크립트 재실행으로 legacy status 0개 확인
3. 임시 파일 삭제:
   - scripts/check-legacy-status.js
   - scripts/debug-tasks.js
   - scripts/verify-migration.js
   - scripts/execute-migration.js
   - lib/task-steps.backup.ts
   - lib/task-steps-new.ts

## 🎓 교훈

### 설계 원칙
1. **SSOT (Single Source of Truth)**: 모든 정의는 한 곳에서 관리
2. **타입 안전성**: TypeScript enum/union type으로 허용 값 제한
3. **명명 규칙 일관성**: prefix 패턴 초기부터 적용
4. **점진적 마이그레이션 계획**: 데이터 변경 전 호환성 계층 필수

### 개선 사항
1. ✅ 모든 task type의 status에 일관된 prefix 적용
2. ✅ 공통 status와 타입별 status 명확히 구분
3. ✅ 레거시 호환성 계층으로 안전한 전환
4. ✅ 검증 → 실행 → 확인 3단계 프로세스

## 🔗 관련 파일

### 변경된 파일
- `lib/task-steps.ts` - 업무 단계 정의 (완전 교체)
- `lib/task-status-utils.ts` - 상태 코드 매핑 (매핑 추가)

### 생성된 파일
- `lib/task-steps.backup.ts` - 원본 백업
- `lib/task-steps-new.ts` - 새 버전 (임시)
- `scripts/verify-migration.js` - 마이그레이션 검증
- `scripts/execute-migration.js` - 마이그레이션 실행
- `claudedocs/status-prefix-migration-complete.md` - 본 문서

### 기존 참조 파일
- `scripts/check-legacy-status.js` - 레거시 상태 점검
- `scripts/debug-tasks.js` - 업무 중복 디버깅
- `sql/migrate-status-prefix.sql` - SQL 기반 마이그레이션 (미사용)
