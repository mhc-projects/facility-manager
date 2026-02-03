# 대기필증 수정 페이지 용량 단위 자동 입력 기능 추가 설계

## 📋 요구사항

### 현재 상황
- **신규 대기필증 추가 페이지** (`app/admin/air-permit/page.tsx`): `UnitInput` 컴포넌트를 사용하여 용량 단위 자동 입력 기능 제공
  - 배출시설: `m³` 단위 자동 추가
  - 방지시설: `m³/분` 단위 자동 추가
- **대기필증 수정 페이지** (`app/admin/air-permit-detail/page.tsx`): 일반 `input` 태그 사용, 단위 자동 입력 없음

### 목표
대기필증 수정 페이지에도 신규 추가 페이지와 동일한 용량 단위 자동 입력 기능 적용

## 🔍 현재 구현 분석

### 1. UnitInput 컴포넌트 (신규 추가 페이지)

**위치**: `app/admin/air-permit/page.tsx` (144-200번 라인)

**주요 기능**:
```typescript
const UnitInput = ({ value, onChange, placeholder, unit, className }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  unit: string  // 자동으로 추가할 단위
  className?: string
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value
    // 단위가 붙어있는 경우 제거
    if (inputValue.endsWith(unit)) {
      inputValue = inputValue.slice(0, -unit.length).trim()
    }
    onChange(inputValue)
  }

  const handleBlur = () => {
    // 값이 있고 단위가 없으면 자동으로 단위 추가
    if (value && value.trim() && !value.trim().endsWith(unit)) {
      const numericValue = value.trim()
      // 순수 숫자만 허용 (정수, 소수점, 쉼표)
      const isPureNumeric = /^[\d.,\s]+$/.test(numericValue)
      if (isPureNumeric) {
        onChange(`${numericValue} ${unit}`)
      }
    }
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // 포커스 시 단위 제거하여 순수 숫자만 편집 가능
    if (value && value.endsWith(unit)) {
      const numericValue = value.slice(0, -unit.length).trim()
      onChange(numericValue)
      // 커서를 끝으로 이동
      setTimeout(() => {
        e.target.setSelectionRange(numericValue.length, numericValue.length)
      }, 0)
    }
  }

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={className}
    />
  )
}
```

**사용 예시** (1791-1797번 라인):
```tsx
{/* 배출시설 용량 - m³ 단위 */}
<UnitInput
  value={facility.capacity}
  onChange={(value) => updateFacility(outletIndex, 'discharge', facilityIndex, 'capacity', value)}
  placeholder="용량"
  unit="m³"
  className="w-12 sm:w-16 md:w-20 px-1 sm:px-2 py-1 text-[9px] sm:text-[10px] md:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
/>

{/* 방지시설 용량 - m³/분 단위 */}
<UnitInput
  value={facility.capacity}
  onChange={(value) => updateFacility(outletIndex, 'prevention', facilityIndex, 'capacity', value)}
  placeholder="용량"
  unit="m³/분"
  className="w-12 sm:w-16 md:w-20 px-1 sm:px-2 py-1 text-[9px] sm:text-[10px] md:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
/>
```

### 2. 수정 페이지 현재 구현

**위치**: `app/admin/air-permit-detail/page.tsx`

**용량 입력 필드 위치**:
1. **테이블 뷰** (1628-1633번 라인, 1787번 라인):
   ```tsx
   <input
     type="text"
     value={dischargeFacility.capacity || ''}
     onChange={(e) => handleFacilityEdit(outlet.id, 'discharge', dischargeFacility.id, 'capacity', e.target.value)}
     className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
   />
   ```

2. **모바일 뷰** (배출시설, 방지시설 각각):
   ```tsx
   <input
     type="text"
     value={facility.capacity || ''}
     onChange={(e) => handleFacilityEdit(outlet.id, 'discharge', facility.id, 'capacity', e.target.value)}
     placeholder="용량"
     className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded"
   />
   ```

## 🎯 설계 방안

### Option 1: UnitInput 컴포넌트 공용화 (권장)

**장점**:
- 코드 중복 제거
- 일관된 사용자 경험
- 유지보수 용이

**단점**:
- 공용 컴포넌트 파일 필요

**구현 방법**:
1. `UnitInput` 컴포넌트를 별도 파일로 분리
   - 위치: `components/ui/UnitInput.tsx`
2. 신규 추가 페이지와 수정 페이지에서 모두 import하여 사용

### Option 2: 수정 페이지에 UnitInput 컴포넌트 복사 (간단)

**장점**:
- 빠른 구현
- 파일 구조 변경 최소화

**단점**:
- 코드 중복
- 향후 수정 시 두 곳 모두 수정 필요

**구현 방법**:
1. `UnitInput` 컴포넌트를 수정 페이지에 복사
2. 기존 `input` 태그를 `UnitInput`으로 교체

## ✅ 추천 구현 방안: Option 1 (공용 컴포넌트)

### 1단계: UnitInput 컴포넌트 분리

**파일 생성**: `components/ui/UnitInput.tsx`

```typescript
// components/ui/UnitInput.tsx
import React from 'react'

interface UnitInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  unit: string
  className?: string
}

/**
 * 숫자 입력 시 자동으로 단위를 추가하는 Input 컴포넌트
 *
 * @example
 * // 배출시설 용량 (m³)
 * <UnitInput
 *   value={capacity}
 *   onChange={setCapacity}
 *   placeholder="용량"
 *   unit="m³"
 * />
 *
 * // 방지시설 용량 (m³/분)
 * <UnitInput
 *   value={capacity}
 *   onChange={setCapacity}
 *   placeholder="용량"
 *   unit="m³/분"
 * />
 */
export const UnitInput: React.FC<UnitInputProps> = ({
  value,
  onChange,
  placeholder,
  unit,
  className
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value

    // 단위가 붙어있는 경우 제거
    if (inputValue.endsWith(unit)) {
      inputValue = inputValue.slice(0, -unit.length).trim()
    }

    onChange(inputValue)
  }

  const handleBlur = () => {
    // 값이 있고 단위가 없으면 자동으로 단위 추가
    if (value && value.trim() && !value.trim().endsWith(unit)) {
      const numericValue = value.trim()

      // 순수 숫자만 허용 (정수, 소수점, 쉼표만 허용, 알파벳 불허)
      // 예: "100", "100.5", "1,200" → 단위 추가
      // 예: "75HP", "abc", "100kW" → 단위 추가 안함
      const isPureNumeric = /^[\d.,\s]+$/.test(numericValue)

      // 순수 숫자일 때만 단위 추가
      if (isPureNumeric) {
        onChange(`${numericValue} ${unit}`)
      }
      // 알파벳이나 다른 문자가 섞여있으면 단위 추가하지 않음
    }
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // 포커스 시 단위 제거하여 순수 숫자만 편집 가능
    if (value && value.endsWith(unit)) {
      const numericValue = value.slice(0, -unit.length).trim()
      onChange(numericValue)
      // 커서를 끝으로 이동
      setTimeout(() => {
        e.target.setSelectionRange(numericValue.length, numericValue.length)
      }, 0)
    }
  }

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={className}
    />
  )
}
```

### 2단계: 신규 추가 페이지 수정

**파일**: `app/admin/air-permit/page.tsx`

**변경 사항**:
1. Import 추가:
   ```typescript
   import { UnitInput } from '@/components/ui/UnitInput'
   ```

2. 기존 UnitInput 컴포넌트 정의 제거 (144-200번 라인)

3. 사용 방법은 동일 (변경 없음)

### 3단계: 수정 페이지에 적용

**파일**: `app/admin/air-permit-detail/page.tsx`

**변경 사항**:

#### 1) Import 추가
```typescript
import { UnitInput } from '@/components/ui/UnitInput'
```

#### 2) 테이블 뷰 - 배출시설 용량 (1628-1633번 라인)
```tsx
{/* Before */}
<input
  type="text"
  value={dischargeFacility.capacity || ''}
  onChange={(e) => handleFacilityEdit(outlet.id, 'discharge', dischargeFacility.id, 'capacity', e.target.value)}
  className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
/>

{/* After */}
<UnitInput
  value={dischargeFacility.capacity || ''}
  onChange={(value) => handleFacilityEdit(outlet.id, 'discharge', dischargeFacility.id, 'capacity', value)}
  placeholder="용량"
  unit="m³"
  className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
/>
```

#### 3) 테이블 뷰 - 방지시설 용량 (1787번 라인 근처)
```tsx
{/* Before */}
<input
  type="text"
  value={preventionFacility.capacity || ''}
  onChange={(e) => handleFacilityEdit(outlet.id, 'prevention', preventionFacility.id, 'capacity', e.target.value)}
  className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
/>

{/* After */}
<UnitInput
  value={preventionFacility.capacity || ''}
  onChange={(value) => handleFacilityEdit(outlet.id, 'prevention', preventionFacility.id, 'capacity', value)}
  placeholder="용량"
  unit="m³/분"
  className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
/>
```

#### 4) 모바일 뷰 - 배출시설 용량
```tsx
{/* Before */}
<input
  type="text"
  value={facility.capacity || ''}
  onChange={(e) => handleFacilityEdit(outlet.id, 'discharge', facility.id, 'capacity', e.target.value)}
  placeholder="용량"
  className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded"
/>

{/* After */}
<UnitInput
  value={facility.capacity || ''}
  onChange={(value) => handleFacilityEdit(outlet.id, 'discharge', facility.id, 'capacity', value)}
  placeholder="용량"
  unit="m³"
  className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded"
/>
```

#### 5) 모바일 뷰 - 방지시설 용량
```tsx
{/* Before */}
<input
  type="text"
  value={facility.capacity || ''}
  onChange={(e) => handleFacilityEdit(outlet.id, 'prevention', facility.id, 'capacity', e.target.value)}
  placeholder="용량"
  className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded"
/>

{/* After */}
<UnitInput
  value={facility.capacity || ''}
  onChange={(value) => handleFacilityEdit(outlet.id, 'prevention', facility.id, 'capacity', value)}
  placeholder="용량"
  unit="m³/분"
  className="w-full px-1 py-0.5 text-[10px] border border-gray-300 rounded"
/>
```

## 🔍 적용 위치 상세

### air-permit-detail/page.tsx에서 수정할 위치

#### 1. 테이블 뷰 (Desktop)

**배출시설 용량 필드**:
- 라인 번호: ~1628-1633
- 단위: `m³`
- 조건: `isEditing && dischargeFacility`

**방지시설 용량 필드**:
- 라인 번호: ~1787
- 단위: `m³/분`
- 조건: `isEditing && preventionFacility`

#### 2. 모바일 뷰

**배출시설 용량 필드**:
- 위치: 배출시설 카드 내부
- 단위: `m³`
- 조건: `isEditing`

**방지시설 용량 필드**:
- 위치: 방지시설 카드 내부
- 단위: `m³/분`
- 조건: `isEditing`

## 📊 영향 분석

### 변경 파일
1. ✅ **신규**: `components/ui/UnitInput.tsx` - 공용 컴포넌트
2. ✏️ **수정**: `app/admin/air-permit/page.tsx` - import 변경, 로컬 컴포넌트 제거
3. ✏️ **수정**: `app/admin/air-permit-detail/page.tsx` - UnitInput 적용 (4~6개 위치)

### 사용자 경험 개선
- ✅ 용량 입력 시 자동으로 단위 추가
- ✅ 포커스 시 단위 제거 → 편집 용이
- ✅ 블러 시 단위 자동 추가
- ✅ 순수 숫자만 단위 추가 (기존 "75HP" 같은 값은 그대로 유지)

### 데이터 일관성
- ✅ 배출시설: 모두 `m³` 단위로 통일
- ✅ 방지시설: 모두 `m³/분` 단위로 통일
- ✅ 신규/수정 페이지 간 일관된 데이터 형식

## 🧪 테스트 시나리오

### 1. 배출시설 용량 입력 테스트
```
입력: "100"
포커스 아웃 → "100 m³"

입력: "75.5"
포커스 아웃 → "75.5 m³"

입력: "1,200"
포커스 아웃 → "1,200 m³"

입력: "75HP"
포커스 아웃 → "75HP" (단위 추가 안함)
```

### 2. 방지시설 용량 입력 테스트
```
입력: "200"
포커스 아웃 → "200 m³/분"

입력: "150.8"
포커스 아웃 → "150.8 m³/분"
```

### 3. 기존 값 편집 테스트
```
기존 값: "100 m³"
포커스 인 → "100" (단위 제거)
편집: "150"
포커스 아웃 → "150 m³" (단위 자동 추가)
```

### 4. 반응형 테스트
- [ ] Desktop 테이블 뷰 정상 작동
- [ ] Mobile 카드 뷰 정상 작동
- [ ] 터치 입력 정상 작동

## 📝 구현 체크리스트

- [ ] `components/ui/UnitInput.tsx` 파일 생성
- [ ] `app/admin/air-permit/page.tsx` import 변경 및 로컬 컴포넌트 제거
- [ ] `app/admin/air-permit-detail/page.tsx` import 추가
- [ ] 테이블 뷰 - 배출시설 용량 필드에 UnitInput 적용
- [ ] 테이블 뷰 - 방지시설 용량 필드에 UnitInput 적용
- [ ] 모바일 뷰 - 배출시설 용량 필드에 UnitInput 적용
- [ ] 모바일 뷰 - 방지시설 용량 필드에 UnitInput 적용
- [ ] 개발 서버에서 테스트
  - [ ] 숫자 입력 → 단위 자동 추가 확인
  - [ ] 기존 값 편집 → 단위 유지 확인
  - [ ] 반응형 동작 확인
- [ ] 코드 리뷰 및 최종 검증

## 🎯 예상 효과

### 사용성 개선
- ✅ 용량 입력 시 단위를 일일이 입력할 필요 없음
- ✅ 일관된 데이터 형식으로 가독성 향상
- ✅ 신규/수정 페이지 간 동일한 UX 제공

### 코드 품질
- ✅ 중복 코드 제거 (DRY 원칙)
- ✅ 재사용 가능한 컴포넌트로 유지보수 용이
- ✅ 타입 안전성 확보

### 데이터 품질
- ✅ 표준화된 단위 형식
- ✅ 입력 오류 감소
- ✅ 데이터 일관성 향상

## 🔗 관련 파일

- `components/ui/UnitInput.tsx` - 공용 컴포넌트 (신규)
- `app/admin/air-permit/page.tsx` - 신규 대기필증 추가 페이지
- `app/admin/air-permit-detail/page.tsx` - 대기필증 수정 페이지
