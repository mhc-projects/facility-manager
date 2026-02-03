# Status Migration 및 수정 작업 요약

## 📅 작업 일자
2026-02-03

## 🎯 작업 개요

사용자 요청에 따라 "공통업무라고 해도 진행구분에 따라 prefix로 단계를 모두 구분"하는 완전한 prefix 마이그레이션을 진행하고, 이 과정에서 발견된 여러 문제들을 수정했습니다.

## 📋 작업 단계 및 결과

### 1단계: 공통 Status에 Prefix 적용 ✅

**목표**: 모든 status에 task_type별 prefix 적용 (공통 단계 포함)

**변경된 파일**:
- [lib/task-steps.ts](lib/task-steps.ts)
- [lib/task-status-utils.ts](lib/task-status-utils.ts)
- [sql/update_facility_tasks_constraints.sql](sql/update_facility_tasks_constraints.sql)

**추가된 Status**:
```typescript
// 자비 공통 단계
'self_customer_contact' | 'self_site_inspection' | 'self_quotation' | 'self_contract'

// 보조금 공통 단계
'subsidy_customer_contact' | 'subsidy_site_inspection' | 'subsidy_quotation' | 'subsidy_contract'
```

**생성된 스크립트**:
- `scripts/migrate-common-statuses.js` - 공통 status 마이그레이션
- `claudedocs/complete-prefix-migration.md` - 마이그레이션 문서

### 2단계: 엑셀 일괄등록 Task Type 매핑 오류 수정 ✅

**문제**: 34개 대리점 업무가 `subsidy_payment` status로 잘못 저장됨

**원인**: `getStatusCodeFromKorean` 함수가 task_type을 고려하지 않아 첫 번째 매칭만 반환

**해결**:
- [app/api/admin/tasks/bulk-upload/route.ts](app/api/admin/tasks/bulk-upload/route.ts:63-103) 수정
  - Priority 1: `{task_type}_` prefix가 있는 status 검색
  - Priority 2: 공통 단계 검색 (dealer/outsourcing/etc 제외)
  - Priority 3: 일반 매핑 (레거시 동작 유지)

**생성된 스크립트**:
- `scripts/fix-dealer-wrong-status.js` - 34개 대리점 업무 수정
- `claudedocs/fix-bulk-upload-task-type-mapping.md` - 문제 분석 문서

### 3단계: admin/business 페이지 Status 표시 문제 수정 ✅

**문제**: admin/tasks 페이지에서 업무 검색이 안되고, 사업장관리 상세모달과 다르게 표시

**원인**: admin/business 페이지의 로컬 `getStatusDisplayName`과 `getStatusColor` 함수가 새로운 prefix status를 처리하지 못함

**해결**:
- [app/admin/business/page.tsx](app/admin/business/page.tsx:838-957) 수정
  - `getStatusDisplayName`: 모든 prefixed status 매핑 추가
  - `getStatusColor`: 하드코딩된 switch → 패턴 매칭 방식으로 변경

**생성된 문서**:
- `claudedocs/fix-admin-business-status-display.md` - 수정 내역 문서

## 🔗 관련 문서 및 스크립트

### 생성된 문서
1. `claudedocs/complete-prefix-migration.md` - 완전한 prefix 마이그레이션 가이드
2. `claudedocs/fix-bulk-upload-task-type-mapping.md` - 엑셀 일괄등록 버그 수정
3. `claudedocs/fix-admin-business-status-display.md` - admin/business 표시 수정
4. `claudedocs/session-summary-status-migration-fixes.md` - 본 문서 (작업 요약)

### 생성된 스크립트
1. `scripts/migrate-common-statuses.js` - 공통 status prefix 적용 마이그레이션
2. `scripts/fix-dealer-wrong-status.js` - 대리점 업무 status 수정
3. `scripts/fix-remaining-legacy.js` - (기존) 남은 레거시 status 수정

### 수정된 핵심 파일
1. `lib/task-steps.ts` - SSOT: 모든 task step 정의
2. `lib/task-status-utils.ts` - Status 유틸리티 함수 및 매핑
3. `app/api/admin/tasks/bulk-upload/route.ts` - 엑셀 일괄등록 API
4. `app/admin/business/page.tsx` - 사업장 관리 페이지
5. `sql/update_facility_tasks_constraints.sql` - DB constraint

## 📊 변경 통계

### Status 추가
- 새로운 prefixed status: **8개** (self 4개 + subsidy 4개)
- DB constraint 업데이트: 총 **60+개** status 지원

### 코드 수정
- 파일 수정: **5개**
- 스크립트 생성: **3개**
- 문서 생성: **4개**

### 데이터 수정 (예정)
- 공통 status 마이그레이션 대상: DB 조회 필요
- 대리점 업무 수정: **34개**

## 🛠️ 실행 필요 작업

### 필수 실행 스크립트

1. **DB Constraint 업데이트**
   ```bash
   # Supabase SQL Editor에서 실행
   sql/update_facility_tasks_constraints.sql
   ```

2. **공통 Status 마이그레이션**
   ```bash
   node scripts/migrate-common-statuses.js
   ```

3. **대리점 업무 수정**
   ```bash
   node scripts/fix-dealer-wrong-status.js
   ```

### 실행 순서
```
1. DB constraint 업데이트 (새로운 status 허용)
   ↓
2. 대리점 업무 수정 (34개)
   ↓
3. 공통 status 마이그레이션 (customer_contact → type별 prefix)
   ↓
4. 전체 시스템 테스트
```

## ✅ 검증 체크리스트

### 코드 검증
- [x] TypeScript 컴파일 테스트 통과
- [x] lib/task-steps.ts에 모든 새 status 추가
- [x] lib/task-status-utils.ts 매핑 업데이트
- [x] app/api/admin/tasks/bulk-upload/route.ts 수정
- [x] app/admin/business/page.tsx 수정
- [x] SQL constraint에 모든 새 status 추가

### 기능 검증 (실행 필요)
- [ ] DB constraint 업데이트 실행
- [ ] 데이터 마이그레이션 실행
- [ ] admin/tasks 칸반보드 정상 동작
- [ ] admin/business 미니 칸반보드 정상 표시
- [ ] 업무 상태 변경 정상 동작
- [ ] 진행률 계산 정상 동작
- [ ] 색상 표시 정상 동작
- [ ] 엑셀 일괄등록 정상 동작 (신규 데이터)

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

## 🚀 향후 개선 제안

### 1. 코드 중앙화
현재 status 매핑이 여러 곳에 중복:
- lib/task-steps.ts (SSOT)
- lib/task-status-utils.ts (TASK_STATUS_KR)
- app/admin/business/page.tsx (getStatusDisplayName)
- app/api/admin/tasks/bulk-upload/route.ts (getStatusCodeFromKorean)

**제안**: 모든 페이지가 lib/task-steps.ts의 함수 사용

### 2. Type Safety 강화
```typescript
// 현재
const status: string = 'self_customer_contact'

// 제안
type TaskStatus = 'self_customer_contact' | 'self_site_inspection' | ...
const status: TaskStatus = 'self_customer_contact'
```

### 3. 자동화된 마이그레이션
새로운 status 추가 시 필요한 모든 파일을 자동으로 업데이트하는 스크립트 작성

## 📝 참고사항

### 이전 세션에서 완료된 작업
- 663개 타입별 전용 status 마이그레이션 (product_order, installation 등)
- 미니 칸반보드 dealer/outsourcing 표시 문제 수정
- needs_check status 추가

### 이번 세션에서 추가된 작업
- 공통 단계 prefix 마이그레이션 (customer_contact, site_inspection, quotation, contract)
- 엑셀 일괄등록 task_type 매핑 버그 수정
- admin/business 페이지 status 표시 수정

## 🏁 결론

모든 status에 type별 prefix를 적용하여 완전한 단일소스 원칙(SSOT)을 구현했습니다. 이를 통해:

1. ✅ **명확한 업무 구분**: 각 task_type별로 독립적인 status 관리
2. ✅ **데이터 무결성**: task_type과 status의 일관성 보장
3. ✅ **유지보수성 향상**: 새로운 task_type 추가 시 충돌 최소화
4. ✅ **버그 수정**: 엑셀 일괄등록 및 화면 표시 문제 해결

남은 작업은 DB constraint 업데이트 및 데이터 마이그레이션 스크립트 실행입니다.
