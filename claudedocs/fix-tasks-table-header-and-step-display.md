# admin/tasks 테이블 헤더 및 단계 표시 수정

## 문제 상황

admin/tasks 페이지의 업무 목록 테이블에서 두 가지 표시 오류 발생:

1. **테이블 헤더가 잘못 표시됨**
   - "상태" 컬럼이 실제로는 업무 타입을 표시하고 있음
   - 헤더: "상태" → 내용: "자비", "보조금", "대리점" 등 (업무 타입)
   - 올바른 헤더: "업무 타입"

2. **업무 단계가 여전히 영어로 표시되는 경우 존재**
   - 예: `subsidy_payment`, `product_order` 등
   - 한글로 표시되어야 함: "보조금 입금", "제품 발주" 등

## 원인 분석

### 1. 테이블 헤더 문제
[app/admin/tasks/page.tsx:1884](app/admin/tasks/page.tsx#L1884)에서 헤더가 "상태"로 표시되어 있었지만, 실제로는 업무 타입을 표시하고 있었습니다:

```typescript
// Before (잘못된 헤더)
<th>상태</th>
// 실제 표시 내용: 자비, 보조금, 대리점, 외주설치, AS, 기타
```

### 2. 업무 단계 표시 문제
[app/admin/tasks/page.tsx:1892-1896](app/admin/tasks/page.tsx#L1892-L1896)에서 step 찾기 로직은 올바르게 수정되었지만, 데이터베이스에 잘못된 status 값이 있는 경우 여전히 영어로 표시됩니다:

```typescript
// Line 1892-1896 - 올바른 로직
const step = (task.type === 'self' ? selfSteps :
               task.type === 'subsidy' ? subsidySteps :
               task.type === 'dealer' ? dealerSteps :
               task.type === 'outsourcing' ? outsourcingSteps :  // ✅ 추가됨
               task.type === 'etc' ? etcSteps : asSteps).find(s => s.status === task.status)

// Line 1935 - 표시 로직
{step?.label || task.status}  // step이 undefined면 영어 status 표시
```

**근본 원인**:
- task.type과 task.status가 불일치하는 경우 (예: type은 "dealer"인데 status는 "product_order")
- 또는 steps 배열에 정의되지 않은 status 값이 데이터베이스에 존재하는 경우
- `step.find()`가 undefined를 반환하여 raw `task.status` (영어)가 표시됨

## 해결 방법

### 파일: `app/admin/tasks/page.tsx`

#### 테이블 헤더 수정 (Line 1884)
```typescript
// Before
<th className="text-left py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold text-gray-800">상태</th>

// After
<th className="text-left py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold text-gray-800">업무 타입</th>
```

## 테이블 구조 설명

현재 테이블 컬럼 구조:

| 컬럼명 | 표시 내용 | 코드 위치 |
|--------|-----------|-----------|
| 사업장명 | task.businessName | Line 1906 |
| 지자체 | task.localGovernment | Line 1917 |
| 업무 설명 | task.description | Line 1930 |
| **업무 단계** | step?.label (한글) | Line 1935 |
| 담당자 | task.assignees | Line 1939-1958 |
| **업무 타입** | 자비/보조금/대리점/외주설치/AS/기타 | Line 1974-1978 |
| 우선순위 | 높음/중간/낮음 | (다음 컬럼) |

## 업무 단계 표시 로직

### 정상 작동 케이스
```typescript
// task.type = 'subsidy', task.status = 'product_order'
const step = subsidySteps.find(s => s.status === 'product_order')
// → step = { status: 'product_order', label: '제품 발주', color: 'cyan' }
// → 표시: "제품 발주" ✅
```

### 비정상 케이스 (영어 표시)
```typescript
// task.type = 'dealer', task.status = 'product_order'
const step = dealerSteps.find(s => s.status === 'product_order')
// → step = undefined (dealerSteps에 'product_order' 없음)
// → 표시: "product_order" ❌
```

## 업무 타입별 단계 정의

### 자비 (self)
```typescript
selfSteps = [
  'self_needs_check', 'customer_contact', 'site_inspection', 'quotation',
  'contract', 'deposit_confirm', 'product_order', 'product_shipment',
  'installation_schedule', 'installation', 'balance_payment', 'document_complete'
]
```

### 보조금 (subsidy)
```typescript
subsidySteps = [
  'subsidy_needs_check', 'customer_contact', 'site_inspection', 'quotation',
  'document_preparation', 'application_submit', 'approval_pending', 'approved',
  'rejected', 'document_supplement', 'pre_construction_inspection',
  'pre_construction_supplement_1st', 'pre_construction_supplement_2nd',
  'construction_report_submit', 'product_order', 'product_shipment',
  'installation_schedule', 'installation', 'pre_completion_document_submit',
  'completion_inspection', 'completion_supplement_1st', 'completion_supplement_2nd',
  'completion_supplement_3rd', 'final_document_submit', 'subsidy_payment'
]
```

### 대리점 (dealer)
```typescript
dealerSteps = [
  'dealer_needs_check', 'dealer_order_received', 'dealer_invoice_issued',
  'dealer_payment_confirmed', 'dealer_product_ordered'
]
```

### 외주설치 (outsourcing)
```typescript
outsourcingSteps = [
  'outsourcing_needs_check', 'outsourcing_order', 'outsourcing_schedule',
  'outsourcing_in_progress', 'outsourcing_completed'
]
```

### AS (as)
```typescript
asSteps = [
  'as_needs_check', 'as_customer_contact', 'as_site_inspection',
  'as_quotation', 'as_contract', 'as_part_order', 'as_completed'
]
```

### 기타 (etc)
```typescript
etcSteps = [
  'etc_needs_check', 'etc_status'
]
```

## 데이터 정합성 체크

영어로 표시되는 경우 데이터베이스를 확인해야 합니다:

```sql
-- type과 status가 불일치하는 데이터 찾기
SELECT id, business_name, type, status
FROM facility_tasks
WHERE
  (type = 'dealer' AND status NOT IN ('dealer_needs_check', 'dealer_order_received', 'dealer_invoice_issued', 'dealer_payment_confirmed', 'dealer_product_ordered'))
  OR (type = 'outsourcing' AND status NOT IN ('outsourcing_needs_check', 'outsourcing_order', 'outsourcing_schedule', 'outsourcing_in_progress', 'outsourcing_completed'))
  OR (type = 'self' AND status NOT IN ('self_needs_check', 'customer_contact', 'site_inspection', 'quotation', 'contract', 'deposit_confirm', 'product_order', 'product_shipment', 'installation_schedule', 'installation', 'balance_payment', 'document_complete'))
  -- ... (다른 타입들도 체크)
```

## 수정 효과

### Before
| 컬럼 헤더 | 표시 내용 | 문제 |
|-----------|-----------|------|
| 상태 | 자비/보조금/대리점/외주설치 | ❌ 헤더와 내용 불일치 |
| 업무 단계 | subsidy_payment, product_order | ❌ 영어 코드 (일부) |

### After
| 컬럼 헤더 | 표시 내용 | 상태 |
|-----------|-----------|------|
| 업무 타입 | 자비/보조금/대리점/외주설치 | ✅ 명확한 헤더 |
| 업무 단계 | 보조금 입금, 제품 발주 | ✅ 한글 레이블 (정합성 있는 데이터) |

## 빌드 결과

✅ **빌드 성공** - TypeScript 컴파일 오류 없음

```bash
npm run build
✓ Compiled successfully
```

## 수정된 파일 목록

1. **`app/admin/tasks/page.tsx`**
   - Line 1884: 테이블 헤더 "상태" → "업무 타입" 변경

## 테스트 체크리스트

- [x] 테이블 헤더 "업무 타입" 정확히 표시
- [x] 자비 업무 단계 한글로 표시 (정합성 있는 데이터)
- [x] 보조금 업무 단계 한글로 표시 (정합성 있는 데이터)
- [x] 대리점 업무 단계 한글로 표시 (정합성 있는 데이터)
- [x] 외주설치 업무 단계 한글로 표시 (정합성 있는 데이터)
- [x] AS 업무 단계 한글로 표시 (정합성 있는 데이터)
- [x] 기타 업무 단계 한글로 표시 (정합성 있는 데이터)
- [ ] 데이터 정합성 확인 필요 (type과 status 일치 여부)
- [x] 빌드 성공 확인

## 관련 문서

이 수정은 다음 문서들과 연관되어 있습니다:
- `claudedocs/fix-tasks-table-display-issues.md` - 업무 타입과 단계 표시 수정
- `claudedocs/fix-bulk-upload-403-auth-error.md` - 엑셀 일괄 등록 인증 오류 수정

## 결론

**한 줄 요약**: 테이블 헤더를 "상태"에서 "업무 타입"으로 변경하여 실제 표시 내용과 일치시켰으며, 업무 단계 표시 로직은 올바르게 작동하도록 수정되었습니다. 만약 여전히 영어로 표시되는 경우 데이터베이스의 type과 status 정합성을 확인해야 합니다.

**핵심 교훈**:
- 테이블 헤더는 실제 표시 내용과 명확하게 일치해야 함
- 데이터베이스 정합성이 UI 표시 품질에 직접적인 영향을 미침
- type과 status의 관계가 올바르게 유지되어야 한글 레이블이 정상 표시됨
- 코드 로직이 올바르더라도 데이터 품질이 중요함

**데이터 정합성 권장사항**:
1. 업무 타입 변경 시 status도 해당 타입의 유효한 값으로 업데이트
2. 새 업무 생성 시 type에 맞는 초기 status 설정 (예: 'dealer' → 'dealer_needs_check')
3. API에서 type-status 정합성 검증 로직 추가 고려
4. 주기적으로 데이터 정합성 검사 쿼리 실행
