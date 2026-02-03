# 대기필증 편집 페이지 날짜 필드 출력 문제 해결 방안

## 문제 요약

**증상**: 최초신고일, 가동개시일 데이터가 편집 페이지에 출력되지 않음

**가장 가능성 높은 원인**: HTML `<input type="date">`는 **정확히 `YYYY-MM-DD` 형식**만 허용하는데, 데이터베이스에서 타임스탬프 형식(`2024-01-15T00:00:00.000Z`)으로 저장되어 있을 가능성

## Quick Fix (즉시 적용 가능)

### 해결 방법: 날짜 형식 변환 추가

**파일**: `app/admin/air-permit-detail/page.tsx`

**변경 위치 1** - Line 1459 (최초신고일):
```typescript
// ❌ Before
value={permitDetail.first_report_date || ''}

// ✅ After (타임스탬프 대응)
value={permitDetail.first_report_date ? permitDetail.first_report_date.split('T')[0] : ''}
```

**변경 위치 2** - Line 1482 (가동개시일):
```typescript
// ❌ Before
value={permitDetail.operation_start_date || ''}

// ✅ After (타임스탬프 대응)
value={permitDetail.operation_start_date ? permitDetail.operation_start_date.split('T')[0] : ''}
```

## 작동 원리

### HTML input type="date" 요구사항

**허용되는 형식**: `YYYY-MM-DD`만 허용
```html
<input type="date" value="2024-01-15" />  ✅ 정상 표시
<input type="date" value="2024-01-15T00:00:00.000Z" />  ❌ 표시 안 됨 (빈 칸)
<input type="date" value="15/01/2024" />  ❌ 표시 안 됨
<input type="date" value="2024.01.15" />  ❌ 표시 안 됨
```

### 변환 로직

```typescript
// 데이터베이스 값: "2024-01-15T00:00:00.000Z" (ISO 8601 타임스탬프)
const dbValue = "2024-01-15T00:00:00.000Z"

// .split('T')[0]: 'T' 문자 기준으로 분리 후 첫 번째 부분 추출
const dateOnly = dbValue.split('T')[0]  // "2024-01-15"

// HTML input에 사용
<input type="date" value="2024-01-15" />  // ✅ 정상 표시!
```

### 옵셔널 체이닝 사용 이유

```typescript
permitDetail.first_report_date?.split('T')[0]
```

**이유**:
- `permitDetail.first_report_date`가 `null` 또는 `undefined`일 때 `.split()` 호출 시 에러 방지
- `?.` 연산자는 값이 `null`/`undefined`면 즉시 `undefined` 반환

**동작 예시**:
```typescript
// 값이 있을 때
"2024-01-15T00:00:00.000Z"?.split('T')[0]  // "2024-01-15"

// 값이 null일 때
null?.split('T')[0]  // undefined (에러 없음)

// 최종 값 (|| '' 사용)
null?.split('T')[0] || ''  // "" (빈 문자열)
```

## 구현 코드

### 최종 코드 (수정 후)

```typescript
{/* 최초신고일 */}
<div>
  <span className="text-gray-500 text-xs">최초신고일</span>
  <input
    type="date"
    value={permitDetail.first_report_date?.split('T')[0] || ''}
    onChange={(e) => handleBasicInfoChange('first_report_date', e.target.value)}
    min="1000-01-01"
    max="9999-12-31"
    onInput={(e) => {
      const input = e.target as HTMLInputElement
      const value = input.value
      if (value) {
        const year = parseInt(value.split('-')[0])
        if (year < 1000 || year > 9999) {
          input.setCustomValidity('연도는 4자리 숫자(1000-9999)로 입력해주세요')
        } else {
          input.setCustomValidity('')
        }
      }
    }}
    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
  />
</div>

{/* 가동개시일 */}
<div>
  <span className="text-gray-500 text-xs">가동개시일</span>
  <input
    type="date"
    value={permitDetail.operation_start_date?.split('T')[0] || ''}
    onChange={(e) => handleBasicInfoChange('operation_start_date', e.target.value)}
    min="1000-01-01"
    max="9999-12-31"
    onInput={(e) => {
      const input = e.target as HTMLInputElement
      const value = input.value
      if (value) {
        const year = parseInt(value.split('-')[0])
        if (year < 1000 || year > 9999) {
          input.setCustomValidity('연도는 4자리 숫자(1000-9999)로 입력해주세요')
        } else {
          input.setCustomValidity('')
        }
      }
    }}
    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
  />
</div>
```

## 테스트 시나리오

### 시나리오 1: 타임스탬프 형식 데이터
```
데이터베이스 값: "2024-01-15T00:00:00.000Z"
변환 후: "2024-01-15"
결과: ✅ 입력 필드에 "2024년 1월 15일" 표시됨
```

### 시나리오 2: 이미 올바른 형식
```
데이터베이스 값: "2024-01-15"
변환 후: "2024-01-15" (변화 없음)
결과: ✅ 입력 필드에 "2024년 1월 15일" 표시됨
```

### 시나리오 3: 값이 없는 경우
```
데이터베이스 값: null
변환 후: "" (빈 문자열)
결과: ✅ 입력 필드가 비어있음 (정상)
```

### 시나리오 4: 사용자가 날짜 입력
```
사용자 입력: "2024년 3월 10일" (브라우저 UI에서 선택)
onChange 이벤트 값: "2024-03-10" (자동으로 YYYY-MM-DD 형식)
handleBasicInfoChange 호출: first_report_date = "2024-03-10"
저장 시 전송: "2024-03-10" (API로 전송됨)
결과: ✅ 정상 저장
```

## 다른 가능한 문제들

### 문제 1: 데이터베이스에 실제 데이터가 없음

**확인 방법** (Supabase SQL Editor):
```sql
SELECT id, business_type, first_report_date, operation_start_date
FROM air_permit_info
WHERE id = 'your-permit-id'
  AND is_active = true;
```

**결과가 NULL이면**:
- 날짜 필드 변환과 무관한 문제
- 데이터베이스에 애초에 날짜 정보가 저장되지 않음
- 사용자가 직접 입력해야 함

### 문제 2: API 응답에 날짜 필드 누락

**확인 방법** (브라우저 개발자 도구):
1. F12 → Network 탭
2. `/api/air-permit?id=xxx&details=true` 요청 확인
3. Response에서 `first_report_date`, `operation_start_date` 존재 여부 확인

**없으면**:
- API 쿼리 문제 (`SELECT api.*`가 제대로 작동하지 않음)
- 명시적 컬럼 선택으로 변경 필요

### 문제 3: React State 업데이트 문제

**확인 방법** (콘솔 로그 추가):
```typescript
// Line 188 근처
console.log('🔍 API 응답:', result.data);
console.log('🔍 first_report_date:', result.data.first_report_date);
console.log('🔍 operation_start_date:', result.data.operation_start_date);
```

**콘솔에 값이 없으면**:
- API 응답 자체에 데이터가 없음 (문제 2)
- 데이터베이스에 데이터가 없음 (문제 1)

## 추가 개선사항 (옵션)

### 개선 1: 유틸리티 함수 생성

```typescript
// app/admin/air-permit-detail/page.tsx 상단
const formatDateForInput = (dateValue: string | null): string => {
  if (!dateValue) return '';
  return dateValue.split('T')[0];
};

// 사용
value={formatDateForInput(permitDetail.first_report_date)}
value={formatDateForInput(permitDetail.operation_start_date)}
```

### 개선 2: API 응답 정규화

```typescript
// API에서 날짜 형식을 YYYY-MM-DD로 강제
// app/api/air-permit/route.ts

const formatDate = (date: string | null): string | null => {
  if (!date) return null;
  return date.split('T')[0];
};

// 응답 전 처리
permit.first_report_date = formatDate(permit.first_report_date);
permit.operation_start_date = formatDate(permit.operation_start_date);
```

## 검증 방법

1. **코드 수정 적용**:
   ```typescript
   value={permitDetail.first_report_date?.split('T')[0] || ''}
   value={permitDetail.operation_start_date?.split('T')[0] || ''}
   ```

2. **개발 서버 재시작**:
   ```bash
   npm run dev
   ```

3. **브라우저 테스트**:
   - 편집 페이지 접속
   - 날짜 필드에 값이 표시되는지 확인
   - 새 날짜 입력 및 저장
   - 저장 후 페이지 새로고침하여 날짜 유지 확인

4. **브라우저 콘솔 확인**:
   ```javascript
   // F12 → Console
   // 날짜 값이 출력되는지 확인
   ```

## 예상 결과

### Before (문제)
```
입력 필드: [ ] (비어있음)
데이터베이스: "2024-01-15T00:00:00.000Z" (값 존재)
```

### After (해결)
```
입력 필드: [2024년 1월 15일] (정상 표시)
데이터베이스: "2024-01-15T00:00:00.000Z" (값 동일)
```

## 구현 완료 체크리스트

- [ ] `first_report_date` value 수정 (Line 1459)
- [ ] `operation_start_date` value 수정 (Line 1482)
- [ ] 개발 서버 재시작
- [ ] 브라우저 테스트 - 날짜 표시 확인
- [ ] 날짜 입력 테스트
- [ ] 저장 후 재진입 테스트
- [ ] 다른 대기필증에서도 테스트

## 추가 디버깅 (필요 시)

만약 위 수정으로도 해결되지 않으면:

1. **콘솔 로그 추가**:
   ```typescript
   console.log('🔍 permitDetail:', permitDetail);
   console.log('🔍 first_report_date 원본:', permitDetail.first_report_date);
   console.log('🔍 first_report_date 변환:', permitDetail.first_report_date?.split('T')[0]);
   ```

2. **Network 탭 확인**:
   - API 응답에 날짜 데이터가 있는가?

3. **데이터베이스 직접 확인**:
   - Supabase에서 실제 값 확인

4. **React DevTools**:
   - permitDetail State 확인
