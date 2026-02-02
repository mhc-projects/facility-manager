# 업무 타입별 "확인필요" 단계 추가

## 개요

각 업무 타입별로 "확인필요" 단계를 첫 번째 단계로 추가했습니다. 이를 통해 업무가 등록된 직후 담당자가 확인해야 하는 상태를 명확히 관리할 수 있습니다.

## 수정 내용

### 파일: `app/admin/tasks/page.tsx`

#### 1. TaskStatus 타입에 확인필요 상태 추가 (Lines 55-59)

```typescript
type TaskStatus =
  // 공통 단계
  | 'pending' | 'site_survey' | 'customer_contact' | 'site_inspection' | 'quotation' | 'contract'
  // 확인필요 단계 (각 업무 타입별)
  | 'self_needs_check' | 'subsidy_needs_check' | 'as_needs_check' | 'dealer_needs_check' | 'outsourcing_needs_check' | 'etc_needs_check'
  // 자비 단계
  | 'deposit_confirm' | 'product_order' | 'product_shipment' | 'installation_schedule'
  ...
```

#### 2. 자비 단계에 확인필요 추가 (Line 141)

```typescript
const selfSteps: Array<{status: TaskStatus, label: string, color: string}> = [
  { status: 'self_needs_check', label: '확인필요', color: 'red' },  // 추가
  { status: 'customer_contact', label: '고객 상담', color: 'blue' },
  { status: 'site_inspection', label: '현장 실사', color: 'yellow' },
  ...
]
```

#### 3. 보조금 단계에 확인필요 추가 (Line 157)

```typescript
const subsidySteps: Array<{status: TaskStatus, label: string, color: string}> = [
  { status: 'subsidy_needs_check', label: '확인필요', color: 'red' },  // 추가
  { status: 'customer_contact', label: '고객 상담', color: 'blue' },
  { status: 'site_inspection', label: '현장 실사', color: 'yellow' },
  ...
]
```

#### 4. AS 단계에 확인필요 추가 (Line 198)

```typescript
const asSteps: Array<{status: TaskStatus, label: string, color: string}> = [
  { status: 'as_needs_check', label: '확인필요', color: 'red' },  // 추가
  { status: 'as_customer_contact', label: 'AS 고객 상담', color: 'blue' },
  { status: 'as_site_inspection', label: 'AS 현장 확인', color: 'yellow' },
  ...
]
```

#### 5. 대리점 단계에 확인필요 추가 (Line 209)

```typescript
const dealerSteps: Array<{status: TaskStatus, label: string, color: string}> = [
  { status: 'dealer_needs_check', label: '확인필요', color: 'red' },  // 추가
  { status: 'dealer_order_received', label: '발주 수신', color: 'blue' },
  { status: 'dealer_invoice_issued', label: '계산서 발행', color: 'yellow' },
  ...
]
```

#### 6. 외주설치 단계에 확인필요 추가 (Line 217)

```typescript
const outsourcingSteps: Array<{status: TaskStatus, label: string, color: string}> = [
  { status: 'outsourcing_needs_check', label: '확인필요', color: 'red' },  // 추가
  { status: 'outsourcing_order', label: '외주 발주', color: 'blue' },
  { status: 'outsourcing_schedule', label: '일정 조율', color: 'yellow' },
  ...
]
```

#### 7. 기타 단계에 확인필요 추가 (Line 195)

```typescript
const etcSteps: Array<{status: TaskStatus, label: string, color: string}> = [
  { status: 'etc_needs_check', label: '확인필요', color: 'red' },  // 추가
  { status: 'etc_status', label: '기타', color: 'gray' }
]
```

## 특징

### 각 업무 타입별 독립적인 확인필요 상태

- **자비**: `self_needs_check`
- **보조금**: `subsidy_needs_check`
- **AS**: `as_needs_check`
- **대리점**: `dealer_needs_check`
- **외주설치**: `outsourcing_needs_check`
- **기타**: `etc_needs_check`

### 공통 특성

- **색상**: 모든 확인필요 단계는 `red` 색상 사용
- **위치**: 각 업무 타입의 첫 번째 단계
- **라벨**: 통일된 "확인필요" 라벨 사용

## 사용 시나리오

### 1. 업무 등록 직후
```
업무 생성 → 확인필요 상태로 자동 설정 → 담당자가 확인 후 다음 단계로 이동
```

### 2. 담당자 확인 프로세스
```
1. 새 업무 알림 수신
2. 업무 상세 내용 확인
3. 필요한 정보 수집
4. 확인 완료 후 적절한 다음 단계로 변경
   - 자비: "고객 상담"
   - 보조금: "고객 상담"
   - AS: "AS 고객 상담"
   - 대리점: "발주 수신"
   - 외주설치: "외주 발주"
   - 기타: "기타"
```

### 3. 칸반보드 시각화
```
확인필요 칼럼에서 모든 신규 업무를 한눈에 확인 가능
→ 빨간색 배지로 즉시 식별 가능
→ 우선적으로 처리해야 할 업무 명확화
```

## 개선 효과

### Before
- ❌ 업무 등록 시 바로 첫 번째 작업 단계로 시작
- ❌ 담당자 확인 여부 불명확
- ❌ 신규 업무와 진행 중 업무 구분 어려움

### After
- ✅ 모든 신규 업무는 "확인필요" 상태로 시작
- ✅ 담당자가 명시적으로 확인 후 다음 단계로 이동
- ✅ 빨간색 배지로 신규 업무 즉시 식별 가능
- ✅ 업무 타입별로 독립적인 확인필요 상태 관리

## 향후 활용 방안

### 1. 자동 알림 시스템
- 확인필요 상태인 업무가 24시간 이상 방치될 경우 담당자에게 알림
- 주간/월간 확인 대기 중인 업무 리포트 생성

### 2. 업무 통계
- 확인 소요 시간 분석
- 업무 타입별 확인 처리 속도 비교
- 담당자별 확인 효율성 측정

### 3. 워크플로우 개선
- 확인필요 → 다음 단계 자동 제안
- 업무 타입별 확인 체크리스트 제공
- 확인 완료 시 자동으로 적절한 다음 단계로 이동

## 빌드 결과

✅ **빌드 성공** - TypeScript 컴파일 오류 없음

```bash
npm run build
✓ Compiled successfully
Route (app)                              Size     First Load JS
├ ○ /admin/tasks                         11.6 kB        169 kB
```

## 관련 파일

### 수정된 파일
- `app/admin/tasks/page.tsx`

### 영향받는 컴포넌트
- 업무 생성 모달 - 현재 단계 드롭다운
- 업무 수정 모달 - 현재 단계 드롭다운
- 칸반보드 - 단계별 칼럼 표시
- 진행률 계산 - 확인필요 단계 포함

## 데이터베이스 마이그레이션

### 고려사항
현재 데이터베이스에 기존 업무가 있는 경우, 다음 중 하나를 선택:

1. **기존 업무 유지**: 기존 업무는 현재 상태 유지, 새 업무만 확인필요로 시작
2. **일괄 변경**: 특정 조건의 업무들을 확인필요 상태로 일괄 변경

```sql
-- 예시: 최근 3일 이내 생성된 "고객 상담" 상태 자비 업무를 확인필요로 변경
UPDATE facility_tasks
SET current_status = 'self_needs_check'
WHERE task_type = 'self'
  AND current_status = 'customer_contact'
  AND created_at >= NOW() - INTERVAL '3 days';
```

## 테스트 체크리스트

- [x] 각 업무 타입별 확인필요 상태 정의 완료
- [x] 업무 생성 모달에서 확인필요 선택 가능
- [x] 업무 수정 모달에서 확인필요 선택 가능
- [x] 칸반보드에서 확인필요 칼럼 표시
- [x] 확인필요 배지 빨간색으로 표시
- [x] 모든 업무 타입에서 첫 번째 단계로 위치
- [x] TypeScript 타입 안전성 확보
- [x] 빌드 성공 확인
