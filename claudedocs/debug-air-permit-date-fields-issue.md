# 대기필증 편집 페이지 날짜 필드 출력 문제 분석

## 문제 상황

**증상**: 대기필증 편집 페이지에서 최초신고일(first_report_date), 가동개시일(operation_start_date) 데이터가 출력되지 않음

**위치**: `/app/admin/air-permit-detail?permitId=xxx&edit=true`

## 코드 분석

### 1. UI 렌더링 부분

**파일**: `app/admin/air-permit-detail/page.tsx`

**Line 1456-1499**: 날짜 입력 필드
```typescript
<div>
  <span className="text-gray-500 text-xs">최초신고일</span>
  <input
    type="date"
    value={permitDetail.first_report_date || ''}
    onChange={(e) => handleBasicInfoChange('first_report_date', e.target.value)}
    min="1000-01-01"
    max="9999-12-31"
    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
  />
</div>

<div>
  <span className="text-gray-500 text-xs">가동개시일</span>
  <input
    type="date"
    value={permitDetail.operation_start_date || ''}
    onChange={(e) => handleBasicInfoChange('operation_start_date', e.target.value)}
    min="1000-01-01"
    max="9999-12-31"
    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
  />
</div>
```

**문제점**:
- UI 렌더링은 정상: `permitDetail.first_report_date`, `permitDetail.operation_start_date` 사용
- `value` 속성이 올바르게 바인딩되어 있음
- onChange 핸들러도 정상

### 2. 데이터 로딩 부분

**Line 188-189**: 초기 데이터 로딩
```typescript
first_report_date: result.data.first_report_date,
operation_start_date: result.data.operation_start_date
```

**Line 570-571**: 저장 시 데이터 전송 (PUT)
```typescript
first_report_date: updatedPermitDetail.first_report_date,
operation_start_date: updatedPermitDetail.operation_start_date,
```

**Line 640-641**: 새 필증 생성 시 (POST)
```typescript
first_report_date: updatedPermitDetail.first_report_date,
operation_start_date: updatedPermitDetail.operation_start_date,
```

### 3. API 처리 부분

**파일**: `app/api/air-permit/route.ts`

**Line 14-15**: TypeScript 인터페이스
```typescript
interface AirPermitInfo {
  id?: string;
  business_id: string;
  business_type: string | null;
  first_report_date: string | null;  // ✅ 정의됨
  operation_start_date: string | null;  // ✅ 정의됨
  additional_info: any;
  is_active: boolean;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}
```

**Line 36-51**: GET 요청 - 데이터베이스 조회
```typescript
const permit = await queryOne(
  `SELECT
    api.*,  // ✅ air_permit_info 테이블의 모든 컬럼 (first_report_date, operation_start_date 포함)
    json_build_object(
      'business_name', bi.business_name,
      // ...
    ) as business
   FROM air_permit_info api
   LEFT JOIN business_info bi ON api.business_id = bi.id
   WHERE api.id = $1 AND api.is_active = true AND api.is_deleted = false`,
  [permitId]
);
```

**Line 259-260, 474-475**: 날짜 검증
```typescript
// POST 생성 시
const validatedFirstReportDate = validateDate(body.first_report_date, 'first_report_date');
const validatedOperationStartDate = validateDate(body.operation_start_date, 'operation_start_date');

// PUT 업데이트 시
const validatedFirstReportDate = validateDate(rawUpdateData.first_report_date, 'first_report_date');
const validatedOperationStartDate = validateDate(rawUpdateData.operation_start_date, 'operation_start_date');
```

**Line 488-498**: PUT 업데이트 쿼리
```typescript
const updateQuery = `
  UPDATE air_permit_info
  SET
    business_type = $1,
    first_report_date = $2,  // ✅ 업데이트됨
    operation_start_date = $3,  // ✅ 업데이트됨
    additional_info = $4,
    updated_at = NOW()
  WHERE id = $5 AND is_active = true AND is_deleted = false
  RETURNING *
`;
```

## 근본 원인 추정

### 가능성 1: 데이터베이스에 데이터가 없음

**확인 방법**:
```sql
SELECT id, business_type, first_report_date, operation_start_date, created_at, updated_at
FROM air_permit_info
WHERE id = 'your-permit-id'
  AND is_active = true
  AND is_deleted = false;
```

**예상 결과**:
- `first_report_date` = NULL
- `operation_start_date` = NULL

**원인**: 과거에 생성된 대기필증 데이터에 날짜 필드가 NULL로 저장됨

### 가능성 2: 날짜 형식 불일치

**HTML input type="date" 요구사항**:
- 형식: `YYYY-MM-DD` (ISO 8601 형식)
- 예시: `2024-01-15`

**데이터베이스 저장 형식**:
```typescript
// validateDate 함수에서 처리
const validatedFirstReportDate = validateDate(body.first_report_date, 'first_report_date');
```

**확인 필요**:
- 데이터베이스에 저장된 날짜가 `YYYY-MM-DD` 형식인가?
- 아니면 타임스탬프 형식(`2024-01-15T00:00:00.000Z`)인가?

### 가능성 3: API 응답 데이터 누락

**현재 GET 쿼리**:
```sql
SELECT api.*, json_build_object(...) as business
FROM air_permit_info api
```

**문제점**: `api.*`는 모든 컬럼을 선택하지만, `json_build_object`로 인해 응답 구조가 복잡할 수 있음

**확인 방법**:
브라우저 개발자 도구 → Network → `/api/air-permit?id=xxx&details=true` 응답 확인

**예상 응답 구조**:
```json
{
  "data": {
    "id": "uuid",
    "business_id": "uuid",
    "business_type": "제조업",
    "first_report_date": "2023-01-15",  // ← 이 값이 있는가?
    "operation_start_date": "2023-02-01",  // ← 이 값이 있는가?
    "additional_info": {...},
    "business": {...},
    "outlets": [...]
  }
}
```

### 가능성 4: React State 업데이트 문제

**Line 188-189**: 데이터 로딩 시
```typescript
first_report_date: result.data.first_report_date,
operation_start_date: result.data.operation_start_date
```

**확인 필요**:
- `result.data.first_report_date`가 실제로 존재하는가?
- `undefined` 또는 `null`인가?

## 디버깅 단계

### 1단계: 데이터베이스 직접 확인

```sql
-- Supabase SQL Editor에서 실행
SELECT
  id,
  business_type,
  first_report_date,
  operation_start_date,
  additional_info,
  created_at,
  updated_at
FROM air_permit_info
WHERE is_active = true
  AND is_deleted = false
ORDER BY created_at DESC
LIMIT 10;
```

**확인 사항**:
- `first_report_date`, `operation_start_date` 컬럼에 값이 있는가?
- NULL인가, 아니면 날짜 값인가?
- 날짜 형식은 무엇인가? (`YYYY-MM-DD` vs `timestamp`)

### 2단계: API 응답 확인

**브라우저 개발자 도구**:
1. F12 → Network 탭
2. 편집 페이지 진입: `/admin/air-permit-detail?permitId=xxx&edit=true`
3. `/api/air-permit?id=xxx&details=true` 요청 확인
4. Response 탭에서 `first_report_date`, `operation_start_date` 값 확인

**콘솔 로그 추가** (임시 디버깅):
```typescript
// Line 188 근처에 추가
console.log('🔍 [DEBUG] API 응답 데이터:', result.data);
console.log('🔍 [DEBUG] first_report_date:', result.data.first_report_date);
console.log('🔍 [DEBUG] operation_start_date:', result.data.operation_start_date);
```

### 3단계: React State 확인

**콘솔 로그 추가**:
```typescript
// Line 1456, 1479 근처에 추가
console.log('🔍 [DEBUG] permitDetail.first_report_date:', permitDetail.first_report_date);
console.log('🔍 [DEBUG] permitDetail.operation_start_date:', permitDetail.operation_start_date);
```

**React DevTools 사용**:
1. React DevTools 설치
2. Components 탭 → AirPermitDetailContent 컴포넌트 선택
3. Hooks → permitDetail State 확인
4. `first_report_date`, `operation_start_date` 값 확인

### 4단계: 날짜 형식 검증

**HTML input type="date" 테스트**:
```html
<!-- 브라우저 콘솔에서 테스트 -->
<input type="date" value="2024-01-15" />  ✅ 정상 표시
<input type="date" value="2024-01-15T00:00:00.000Z" />  ❌ 표시 안 됨
<input type="date" value="15/01/2024" />  ❌ 표시 안 됨
```

**문제 발견 시 해결 방법**:
```typescript
// 타임스탬프를 YYYY-MM-DD로 변환
value={permitDetail.first_report_date ? permitDetail.first_report_date.split('T')[0] : ''}
```

## 해결 방안

### 방안 1: 데이터베이스에 데이터가 없는 경우

**원인**: 과거에 생성된 대기필증에 날짜 필드가 NULL

**해결책 A - 마이그레이션 스크립트**:
```sql
-- 기본값 설정 (created_at을 기준으로)
UPDATE air_permit_info
SET
  first_report_date = COALESCE(first_report_date, DATE(created_at)),
  operation_start_date = COALESCE(operation_start_date, DATE(created_at) + INTERVAL '7 days')
WHERE is_active = true
  AND is_deleted = false
  AND (first_report_date IS NULL OR operation_start_date IS NULL);
```

**해결책 B - UI에서 수동 입력**:
- 사용자가 편집 페이지에서 직접 날짜 입력
- 저장 버튼 클릭 시 API로 전송됨

### 방안 2: 날짜 형식 불일치 문제

**현재 코드**:
```typescript
value={permitDetail.first_report_date || ''}
```

**수정 코드** (타임스탬프 대응):
```typescript
value={permitDetail.first_report_date ? permitDetail.first_report_date.split('T')[0] : ''}
```

**적용 위치**:
- Line 1459: `value={permitDetail.first_report_date?.split('T')[0] || ''}`
- Line 1482: `value={permitDetail.operation_start_date?.split('T')[0] || ''}`

### 방안 3: API 응답 구조 검증

**확인 필요**:
```typescript
// API route.ts Line 36-51
const permit = await queryOne(`SELECT api.*, ...`);
```

**문제 발생 시 명시적 컬럼 선택**:
```typescript
const permit = await queryOne(
  `SELECT
    api.id,
    api.business_id,
    api.business_type,
    api.first_report_date,  // ✅ 명시적 선택
    api.operation_start_date,  // ✅ 명시적 선택
    api.annual_emission_amount,
    api.additional_info,
    api.is_active,
    api.is_deleted,
    api.created_at,
    api.updated_at,
    json_build_object(...) as business
   FROM air_permit_info api
   LEFT JOIN business_info bi ON api.business_id = bi.id
   WHERE api.id = $1 AND api.is_active = true AND api.is_deleted = false`,
  [permitId]
);
```

### 방안 4: forcePrimary 파라미터 확인

**현재 구현** (Line 178, 698):
```typescript
const response = await fetch(`/api/air-permit?id=${urlParams.permitId}&details=true&forcePrimary=true`)
```

**문제**: `forcePrimary` 파라미터가 API에서 처리되지 않음

**API 수정 필요** (route.ts Line 30-31):
```typescript
const includeDetails = searchParams.get('details') === 'true';
const forcePrimary = searchParams.get('forcePrimary') === 'true';  // ← 추가

// 쿼리 실행 시 Primary DB 사용
const permit = await queryOne(
  `/* forcePrimary: ${forcePrimary} */ SELECT api.*, ...`,
  [permitId]
);
```

## 권장 실행 순서

1. **1단계**: Supabase에서 SQL 직접 실행 → 데이터 존재 여부 확인
2. **2단계**: 브라우저 Network 탭 → API 응답 확인
3. **3단계**: 콘솔 로그 추가 → React State 확인
4. **4단계**: 날짜 형식 검증 → 필요 시 `.split('T')[0]` 추가

## 예상 결과

### 시나리오 A: 데이터베이스에 데이터 없음
```
✅ 해결: 마이그레이션 스크립트 실행 또는 사용자가 수동 입력
```

### 시나리오 B: 날짜 형식 불일치
```
✅ 해결: value={permitDetail.first_report_date?.split('T')[0] || ''}
```

### 시나리오 C: API 응답 구조 문제
```
✅ 해결: SELECT 쿼리를 명시적 컬럼 선택으로 변경
```

## 다음 단계

문제 원인 파악 후:
1. 해당하는 해결 방안 적용
2. 개발 서버 재시작 (`npm run dev`)
3. 브라우저 하드 새로고침 (Cmd+Shift+R)
4. 편집 페이지에서 날짜 필드 확인
5. 날짜 입력 후 저장 테스트
6. 저장 후 페이지 재진입하여 날짜 유지 확인
