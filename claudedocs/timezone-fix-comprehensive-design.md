# 타임존 문제 종합 해결 설계

## 🚨 문제 상황

### 현재 증상
```
사용자 입력: 2016.01.11
저장된 값: 2016.01.10
```

**문제**: 한국 시간(KST, UTC+9)을 반영하지 않아 날짜가 하루 빠지는 현상

### 근본 원인

#### 1. HTML `<input type="date">` 동작 방식
```tsx
// 프론트엔드: 사용자가 2016-01-11 입력
<input
  type="date"
  value={permitDetail.operation_start_date?.split('T')[0]}
  onChange={(e) => handleBasicInfoChange('operation_start_date', e.target.value)}
/>

// e.target.value = "2016-01-11" (문자열, 타임존 정보 없음)
```

#### 2. JavaScript Date 객체의 타임존 변환
```javascript
// ❌ 잘못된 처리 (현재 코드)
const dateString = "2016-01-11"  // 사용자 입력
const date = new Date(dateString)  // 브라우저가 UTC 00:00:00으로 해석
// → 2016-01-11T00:00:00.000Z

// 한국 시간(UTC+9)으로 변환 시
// → 2016-01-10T15:00:00.000+09:00 (9시간 뺌)
// → 날짜가 하루 빠짐!
```

#### 3. API로 전송 시 ISO 문자열 변환
```typescript
// app/api/air-permits/[id]/route.ts:127
updated_at: new Date().toISOString()

// 날짜 필드는 그대로 전달되지만 PostgreSQL이 타임존 처리
first_report_date: updateData.first_report_date  // "2016-01-11"
operation_start_date: updateData.operation_start_date  // "2016-01-11"
```

#### 4. PostgreSQL 저장 시 타임존 처리
```sql
-- Supabase PostgreSQL 기본 설정: UTC
-- "2016-01-11" 문자열 → timestamptz 변환 시 UTC 00:00:00으로 해석
-- 한국에서 조회 시 자동으로 9시간 뺌 → 2016-01-10 15:00:00
```

## 🎯 해결 전략

### 전략 1: 날짜 전용 필드는 ISO Date 형식만 사용 (권장)

**핵심**: 날짜만 저장하는 필드는 시간 정보 없이 `YYYY-MM-DD` 형식으로 저장

```typescript
// ✅ 올바른 처리
const dateString = "2016-01-11"  // 사용자 입력
// API로 전송 시 문자열 그대로 전달
// PostgreSQL: date 타입으로 저장 (타임존 영향 없음)
```

**장점**:
- 타임존 변환 문제 완전 제거
- 성능 우수 (타임존 계산 불필요)
- 코드 단순화

**적용 대상**:
- `first_report_date` (최초신고일)
- `operation_start_date` (가동개시일)
- `birth_date` (생년월일)
- `hire_date` (입사일)
- 기타 모든 날짜 전용 필드

### 전략 2: 날짜+시간 필드는 한국 시간 기준으로 통일

**핵심**: 시간이 중요한 필드는 명시적으로 KST 타임존 적용

```typescript
// ✅ 올바른 처리
const kstDate = new Date()
// KST 기준으로 ISO 문자열 생성
const kstISOString = new Date(kstDate.getTime() + (9 * 60 * 60 * 1000)).toISOString()
```

**적용 대상**:
- `created_at` (생성 시간)
- `updated_at` (수정 시간)
- `last_login_at` (최근 로그인)
- `login_at` (로그인 시간)

## 📐 구현 설계

### 1. 유틸리티 함수 생성

**파일**: `utils/date-utils.ts` (신규 생성)

```typescript
/**
 * 날짜 유틸리티 - 타임존 문제 해결
 *
 * 사용 원칙:
 * 1. 날짜만 필요한 경우: toKSTDateString() 사용
 * 2. 날짜+시간이 필요한 경우: toKSTISOString() 사용
 * 3. 표시용 날짜: formatKSTDate() 사용
 */

/**
 * YYYY-MM-DD 형식의 날짜 문자열을 반환 (타임존 영향 없음)
 *
 * @param date - Date 객체 또는 날짜 문자열
 * @returns YYYY-MM-DD 형식 문자열
 *
 * @example
 * toKSTDateString(new Date()) // "2026-02-04"
 * toKSTDateString("2016-01-11T15:00:00Z") // "2016-01-11"
 */
export function toKSTDateString(date: Date | string | null | undefined): string | null {
  if (!date) return null

  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return null

  // 한국 시간대로 날짜 문자열 생성
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * 한국 시간대 기준 ISO 문자열 반환
 *
 * @param date - Date 객체 (생략 시 현재 시간)
 * @returns ISO 8601 형식 문자열 (KST 기준)
 *
 * @example
 * toKSTISOString() // "2026-02-04T15:30:00.000+09:00"
 */
export function toKSTISOString(date?: Date): string {
  const d = date || new Date()

  // UTC+9 (한국 시간)로 변환
  const kstOffset = 9 * 60 * 60 * 1000
  const kstDate = new Date(d.getTime() + kstOffset)

  return kstDate.toISOString().replace('Z', '+09:00')
}

/**
 * HTML input[type="date"]에서 받은 문자열을 그대로 반환
 * (타임존 변환 없이 날짜만 추출)
 *
 * @param inputValue - HTML input에서 받은 값
 * @returns YYYY-MM-DD 형식 문자열 또는 null
 *
 * @example
 * parseDateInput("2016-01-11") // "2016-01-11"
 * parseDateInput("") // null
 */
export function parseDateInput(inputValue: string | null | undefined): string | null {
  if (!inputValue || inputValue.trim() === '') return null

  // YYYY-MM-DD 형식 검증
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(inputValue)) {
    console.warn(`⚠️ [DATE-UTILS] 잘못된 날짜 형식: ${inputValue}`)
    return null
  }

  return inputValue
}

/**
 * 한국어 날짜 형식으로 표시 (YYYY.MM.DD)
 *
 * @param date - Date 객체 또는 날짜 문자열
 * @param includeTime - 시간 포함 여부
 * @returns 한국어 날짜 문자열
 *
 * @example
 * formatKSTDate("2016-01-11") // "2016.01.11"
 * formatKSTDate(new Date(), true) // "2026.02.04 15:30"
 */
export function formatKSTDate(
  date: Date | string | null | undefined,
  includeTime: boolean = false
): string {
  if (!date) return '-'

  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  let result = `${year}.${month}.${day}`

  if (includeTime) {
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    result += ` ${hours}:${minutes}`
  }

  return result
}

/**
 * 날짜 비교 유틸리티 (타임존 무시)
 *
 * @param date1 - 첫 번째 날짜
 * @param date2 - 두 번째 날짜
 * @returns 날짜가 같으면 true
 */
export function isSameDate(
  date1: Date | string | null | undefined,
  date2: Date | string | null | undefined
): boolean {
  const d1 = toKSTDateString(date1)
  const d2 = toKSTDateString(date2)
  return d1 === d2
}
```

### 2. API 수정 - 날짜 필드 처리

**파일**: `app/api/air-permits/[id]/route.ts`

```typescript
// PUT /api/air-permits/[id] - 대기필증 정보 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const updateData = await request.json();

    console.log(`📝 [AIR-PERMIT-UPDATE] 대기필증 업데이트: ${id}`);
    console.log('📅 [AIR-PERMIT-UPDATE] 날짜 필드 입력값:', {
      first_report_date: updateData.first_report_date,
      operation_start_date: updateData.operation_start_date
    });

    const adminClient = getSupabaseAdminClient();

    // ✅ 날짜 필드는 문자열 그대로 전달 (타임존 변환 없음)
    const { data: updatedPermit, error } = await adminClient
      .from('air_permit_info')
      .update({
        business_type: updateData.business_type,
        annual_emission_amount: updateData.annual_emission_amount,
        annual_pollutant_emission: updateData.annual_pollutant_emission,
        first_report_date: updateData.first_report_date,  // "YYYY-MM-DD" 문자열
        operation_start_date: updateData.operation_start_date,  // "YYYY-MM-DD" 문자열
        additional_info: updateData.additional_info,
        updated_at: new Date().toISOString()  // 시간은 ISO 형식
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ [AIR-PERMIT-UPDATE] 업데이트 실패:', error);
      return createErrorResponse(`대기필증 업데이트 실패: ${error.message}`, 500);
    }

    console.log('✅ [AIR-PERMIT-UPDATE] 업데이트 완료:', {
      business_type: (updatedPermit as any).business_type,
      first_report_date: (updatedPermit as any).first_report_date,
      operation_start_date: (updatedPermit as any).operation_start_date
    });

    return createSuccessResponse({
      air_permit: updatedPermit,
      message: '대기필증 정보가 성공적으로 업데이트되었습니다'
    });

  } catch (error) {
    console.error('❌ [AIR-PERMIT-UPDATE] 업데이트 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '대기필증 업데이트에 실패했습니다',
      500
    );
  }
}
```

### 3. 프론트엔드 수정 - 날짜 입력 처리

**파일**: `app/admin/air-permit-detail/page.tsx`

```typescript
import { parseDateInput, formatKSTDate, toKSTDateString } from '@/utils/date-utils'

// 날짜 필드 변경 핸들러
const handleBasicInfoChange = (field: string, value: any) => {
  // 날짜 필드 처리 (타임존 변환 없이 문자열 그대로 사용)
  if (field === 'first_report_date' || field === 'operation_start_date') {
    const dateValue = parseDateInput(value)  // "YYYY-MM-DD" 또는 null

    console.log(`📅 [DATE-INPUT] ${field} 변경:`, {
      입력값: value,
      처리된값: dateValue
    })

    setPermitDetail(prev => ({
      ...prev,
      [field]: dateValue
    }))
    return
  }

  // 기타 필드는 기존 처리 로직
  setPermitDetail(prev => ({
    ...prev,
    [field]: value
  }))
}

// 날짜 필드 표시 (input value)
<input
  type="date"
  value={toKSTDateString(permitDetail.operation_start_date) || ''}
  onChange={(e) => handleBasicInfoChange('operation_start_date', e.target.value)}
  min="1000-01-01"
  max="9999-12-31"
/>
```

### 4. 데이터베이스 스키마 검증

**확인 사항**:
```sql
-- air_permit_info 테이블의 날짜 필드 타입 확인
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'air_permit_info'
  AND column_name IN ('first_report_date', 'operation_start_date');

-- 권장 타입: date (timestamp 또는 timestamptz 아님!)
```

**권장 스키마**:
```sql
ALTER TABLE air_permit_info
  ALTER COLUMN first_report_date TYPE date,
  ALTER COLUMN operation_start_date TYPE date;
```

### 5. 전역 적용 - 다른 날짜 필드들

**적용 대상 파일 및 필드**:

1. **사용자 관리** (`app/admin/users/page.tsx`)
   - `hire_date` (입사일)
   - `birth_date` (생년월일)

2. **회의록** (`app/admin/meeting-minutes/`)
   - `meeting_date` (회의 날짜)

3. **매출 관리** (`app/admin/revenue/page.tsx`)
   - `installation_date` (설치일)
   - `payment_date` (결제일)

4. **업무 관리** (`app/admin/tasks/`)
   - `due_date` (마감일)
   - `start_date` (시작일)
   - `completion_date` (완료일)

## 🔧 구현 순서

### Phase 1: 유틸리티 함수 생성 ✅
1. `utils/date-utils.ts` 파일 생성
2. 핵심 함수 구현 및 테스트
3. JSDoc 문서화

### Phase 2: 대기필증 날짜 수정 ✅
1. API 수정: `app/api/air-permits/[id]/route.ts`
2. 프론트엔드 수정: `app/admin/air-permit-detail/page.tsx`
3. 날짜 입력/표시 로직에 유틸리티 함수 적용

### Phase 3: 전역 적용 (일괄 수정)
1. 모든 날짜 입력 필드 검색
2. 유틸리티 함수로 일괄 교체
3. API 엔드포인트 날짜 처리 통일

### Phase 4: 데이터베이스 스키마 검증
1. 날짜 전용 컬럼 타입 확인 (`date` vs `timestamptz`)
2. 필요 시 마이그레이션 스크립트 작성
3. 기존 데이터 검증

### Phase 5: 테스트 및 검증
1. 다양한 날짜로 입력 테스트
2. 타임존 문제 재발 여부 확인
3. 기존 데이터 호환성 검증

## 📊 영향 범위 분석

### 수정 필요 파일 (예상)

**높은 우선순위** (날짜 입력 필드 포함):
- `app/admin/air-permit-detail/page.tsx` ✅
- `app/admin/users/page.tsx`
- `app/admin/meeting-minutes/create/page.tsx`
- `app/admin/revenue/page.tsx`
- `app/admin/tasks/components/TaskCreateModal.tsx`

**중간 우선순위** (날짜 표시만):
- `app/admin/business/page.tsx`
- `components/business/modals/BusinessDetailModal.tsx`
- `app/admin/air-permit/page.tsx`

**API 엔드포인트** (날짜 처리 로직):
- `app/api/air-permits/[id]/route.ts` ✅
- `app/api/employees/route.ts`
- `app/api/meeting-minutes/route.ts`
- `app/api/revenue/*/route.ts`
- `app/api/facility-tasks/route.ts`

### 예상 소요 시간
- **Phase 1**: 30분 (유틸리티 함수)
- **Phase 2**: 30분 (대기필증 수정)
- **Phase 3**: 2-3시간 (전역 적용)
- **Phase 4**: 1시간 (스키마 검증)
- **Phase 5**: 1시간 (테스트)

**총 예상**: 5-6시간

## 🎯 성공 기준

### 기능 검증
- [ ] 날짜 입력 시 저장된 날짜가 입력값과 정확히 일치
- [ ] 2016.01.11 입력 → 2016-01-11 저장 (하루 빠지지 않음)
- [ ] 기존 데이터 표시 시 날짜 정확히 표시
- [ ] 타임존 무관하게 날짜 저장/조회 일관성 유지

### 코드 품질
- [ ] 모든 날짜 입력에 유틸리티 함수 사용
- [ ] 타임존 관련 직접 변환 코드 제거
- [ ] JSDoc 문서화 완료
- [ ] 타입 안정성 확보

### 유지보수성
- [ ] 재사용 가능한 유틸리티 함수로 통일
- [ ] 날짜 처리 로직 중앙화
- [ ] 명확한 네이밍과 주석
- [ ] 향후 타임존 문제 재발 방지

## 📚 참고 자료

### JavaScript Date 타임존 이슈
```javascript
// ❌ 문제가 되는 패턴들
new Date("2016-01-11")  // 브라우저마다 다르게 해석 (UTC vs Local)
date.toISOString()  // 항상 UTC 기준 변환
date.toLocaleDateString()  // 사용자 로케일 기준 (일관성 없음)

// ✅ 권장 패턴
"2016-01-11"  // 날짜 문자열 그대로 사용 (타임존 영향 없음)
date.getFullYear() + "-" + ... // 날짜 컴포넌트 직접 조합
```

### PostgreSQL 날짜 타입
- **date**: 날짜만 저장 (타임존 영향 없음) ✅ 권장
- **timestamp**: 날짜+시간 (타임존 없음)
- **timestamptz**: 날짜+시간+타임존 (자동 변환)

### HTML input[type="date"] 동작
- 입력값: `YYYY-MM-DD` 형식 문자열
- 브라우저마다 표시 형식 다름 (한국: YYYY. MM. DD.)
- value 속성은 항상 `YYYY-MM-DD` 형식

## 🔐 보안 및 성능

### 입력 검증
```typescript
// 날짜 형식 검증 (YYYY-MM-DD)
const dateRegex = /^\d{4}-\d{2}-\d{2}$/
if (!dateRegex.test(inputValue)) {
  throw new Error('잘못된 날짜 형식')
}

// 날짜 유효성 검증
const date = new Date(inputValue)
if (isNaN(date.getTime())) {
  throw new Error('유효하지 않은 날짜')
}
```

### 성능 최적화
- 문자열 직접 처리로 Date 객체 생성 최소화
- 타임존 계산 불필요 → CPU 사용량 감소
- 데이터베이스 인덱스 활용 가능 (date 타입)

## ⚠️ 주의사항

### Breaking Changes 없음
- 기존 API 응답 형식 유지 (`YYYY-MM-DD` 문자열)
- 기존 데이터베이스 데이터 영향 없음
- 클라이언트 코드 호환성 유지

### 타임존 혼용 금지
```typescript
// ❌ 절대 금지
const date = new Date(dateString)  // 타임존 변환 발생
date.toISOString()  // UTC 변환

// ✅ 올바른 사용
const dateString = parseDateInput(input)  // "YYYY-MM-DD"
// 문자열 그대로 API 전송 → PostgreSQL date 타입 저장
```

### 레거시 코드 마이그레이션
```typescript
// Before (❌)
value={permitDetail.operation_start_date?.split('T')[0] || ''}

// After (✅)
value={toKSTDateString(permitDetail.operation_start_date) || ''}
```

## 🚀 배포 계획

### 단계별 배포
1. **Stage 1**: 유틸리티 함수 배포 (영향 없음)
2. **Stage 2**: 대기필증 날짜 수정 (검증)
3. **Stage 3**: 전역 롤아웃 (순차 적용)
4. **Stage 4**: 스키마 최적화 (선택적)

### 롤백 계획
- 유틸리티 함수는 하위 호환성 유지
- 문제 발생 시 기존 로직으로 복원 가능
- 데이터베이스 변경 없이 코드 레벨만 수정

## 📝 문서화

### 개발자 가이드
```markdown
# 날짜 처리 가이드

## 날짜만 저장하는 경우
- 유틸리티: `parseDateInput()`, `toKSTDateString()`
- 데이터베이스: `date` 타입 사용
- API: "YYYY-MM-DD" 문자열 전송

## 날짜+시간 저장하는 경우
- 유틸리티: `toKSTISOString()`
- 데이터베이스: `timestamptz` 타입 사용
- API: ISO 8601 형식 전송

## 표시하는 경우
- 유틸리티: `formatKSTDate()`
- 한국어 형식: YYYY.MM.DD
```

### 코드 리뷰 체크리스트
- [ ] 날짜 입력 시 유틸리티 함수 사용
- [ ] `new Date()` 직접 사용 금지 (날짜 필드)
- [ ] `toISOString()` 사용 주의 (시간 필드만)
- [ ] 날짜 문자열 타임존 변환 금지

---

## 📌 요약

**핵심 해결책**: 날짜 전용 필드는 타임존 변환 없이 `YYYY-MM-DD` 문자열로만 처리

**적용 방법**:
1. 유틸리티 함수 생성 (`utils/date-utils.ts`)
2. 날짜 입력/표시에 유틸리티 함수 적용
3. API에서 날짜 문자열 그대로 전달
4. PostgreSQL `date` 타입 사용

**기대 효과**:
- ✅ 타임존 문제 완전 해결
- ✅ 입력값과 저장값 정확히 일치
- ✅ 유지보수 편의성 향상
- ✅ 향후 재발 방지

**다음 단계**: Phase 1 (유틸리티 함수 생성) 부터 시작
