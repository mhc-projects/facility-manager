# 대기필증 추가 모달 날짜 입력 저장 문제 분석

## 🐛 문제 현상

**보고**: admin/air-permit 페이지에서 새 대기필증 추가 모달의 최초신고일, 가동개시일 입력 후 저장이 안 됨

**증상**:
- 사용자가 날짜를 입력했으나 저장 후 확인 시 값이 비어있음
- 대기필증 상세관리 페이지에서 수정 시에는 정상 저장됨

## 🔍 원인 분석

### DateInput 컴포넌트 구조 (Line 61-176)

```typescript
const DateInput = ({ value, onChange, placeholder = "YYYY-MM-DD" }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) => {
  const parts = value ? value.split('-') : ['', '', '']
  const [year, month, day] = parts

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.length <= 4 && /^\d*$/.test(val)) {
      const newValue = `${val}-${month}-${day}`  // ⚠️ 문제: 부분 입력 시 불완전한 문자열
      onChange(newValue)
      if (val.length === 4) {
        monthRef.current?.focus()
      }
    }
  }
  // ... 월, 일도 동일한 패턴
}
```

### 문제점

**불완전한 날짜 문자열 생성**:

| 입력 상태 | 생성되는 값 | 예상 동작 | 실제 결과 |
|----------|------------|----------|----------|
| 연도만 입력 | `"2024--"` | 저장 대기 | API 전송 시 null로 변환 |
| 연도+월 입력 | `"2024-01-"` | 저장 대기 | API 전송 시 null로 변환 |
| 빈 필드 | `"--"` | 빈 값 | API 전송 시 null로 변환 |
| 완전 입력 | `"2024-01-15"` | 정상 저장 | ✅ 정상 |

### API 처리 로직 (Line 263-264)

```typescript
// 날짜 검증
const validatedFirstReportDate = validateDate(body.first_report_date, 'first_report_date');
const validatedOperationStartDate = validateDate(body.operation_start_date, 'operation_start_date');
```

`validateDate` 함수는 불완전한 날짜 형식을 null로 변환하여 저장합니다.

### 데이터 흐름 분석

```
사용자 입력 → DateInput 컴포넌트
  ↓ (부분 입력: "2024--")
newPermitData.first_report_date = "2024--"
  ↓
handleCreatePermit() 호출 (Line 819-823)
  ↓
permitData.first_report_date = "2024--"?.trim() || null
  ↓
API POST /api/air-permit
  ↓
validateDate("2024--") → null (날짜 형식 불일치)
  ↓
DB에 null 저장 ❌
```

## 🎯 근본 원인

**DateInput 컴포넌트가 불완전한 날짜를 즉시 상위 상태에 반영**

- 각 필드 변경마다 `onChange` 호출
- 3개 필드(년/월/일)가 모두 채워지지 않아도 값 업데이트
- 불완전한 문자열(`"2024--"`)이 state에 저장됨
- 사용자가 모든 필드를 채우기 전에 제출 가능

## ✅ 해결 방안

### Option 1: 완전한 날짜만 상위로 전달 (권장)

```typescript
const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const val = e.target.value
  if (val.length <= 2 && /^\d*$/.test(val)) {
    let dayVal = val
    if (val !== '') {
      const numVal = parseInt(val)
      if (numVal > 31) {
        dayVal = '31'
      } else if (val.length === 2) {
        dayVal = numVal.toString().padStart(2, '0')
      } else {
        dayVal = val
      }
    }

    // ✅ 수정: 완전한 날짜일 때만 onChange 호출
    const newYear = year
    const newMonth = month
    const newDay = dayVal

    // 모든 필드가 유효한지 검증
    if (newYear && newYear.length === 4 &&
        newMonth && newMonth.length === 2 &&
        newDay && newDay.length === 2) {
      onChange(`${newYear}-${newMonth}-${newDay}`)
    } else {
      // 불완전한 경우 빈 문자열 전달
      onChange('')
    }
  }
}
```

**장점**:
- 불완전한 날짜가 state에 저장되지 않음
- 서버 검증 로직과 일치
- 사용자가 완전한 날짜를 입력해야만 제출 가능

**단점**:
- 입력 중간에 날짜 미리보기 불가
- 한 필드를 수정하면 전체 날짜가 초기화될 수 있음

### Option 2: 로컬 상태 분리 (복잡하지만 UX 개선)

```typescript
const DateInput = ({ value, onChange, placeholder = "YYYY-MM-DD" }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) => {
  // 내부 상태로 각 필드 관리
  const [localYear, setLocalYear] = useState('')
  const [localMonth, setLocalMonth] = useState('')
  const [localDay, setLocalDay] = useState('')

  // value prop이 변경되면 내부 상태 동기화
  useEffect(() => {
    if (value) {
      const parts = value.split('-')
      setLocalYear(parts[0] || '')
      setLocalMonth(parts[1] || '')
      setLocalDay(parts[2] || '')
    }
  }, [value])

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.length <= 4 && /^\d*$/.test(val)) {
      setLocalYear(val)

      // 완전한 날짜일 때만 onChange 호출
      if (val.length === 4 && localMonth.length === 2 && localDay.length === 2) {
        onChange(`${val}-${localMonth}-${localDay}`)
      }

      if (val.length === 4) {
        monthRef.current?.focus()
      }
    }
  }

  // 월, 일도 동일한 패턴
}
```

**장점**:
- 입력 중에도 각 필드 독립적으로 유지
- 완전한 날짜만 상위로 전달
- 최적의 UX

**단점**:
- 상태 관리 복잡도 증가
- 동기화 로직 필요

### Option 3: 제출 시점 검증 강화 (임시 방편)

```typescript
const handleCreatePermit = async () => {
  // 날짜 형식 검증 추가
  const isValidDate = (dateStr: string) => {
    if (!dateStr) return true // 빈 값은 허용
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
  }

  if (!isValidDate(newPermitData.first_report_date)) {
    alert('최초신고일 형식이 올바르지 않습니다. (YYYY-MM-DD)')
    return
  }

  if (!isValidDate(newPermitData.operation_start_date)) {
    alert('가동개시일 형식이 올바르지 않습니다. (YYYY-MM-DD)')
    return
  }

  // ... 기존 로직
}
```

**장점**:
- 간단한 수정
- 즉시 적용 가능

**단점**:
- 근본 원인 해결 안 됨
- 사용자가 제출 후에야 오류 발견

## 🔬 테스트 시나리오

### Test Case 1: 부분 입력 후 제출
```
1. 새 대기필증 추가 모달 열기
2. 최초신고일에 "2024" 입력 (연도만)
3. 다른 필드로 포커스 이동 또는 제출
4. 확인: DB에 null 저장됨 ❌

Expected: 불완전한 날짜는 제출 불가 또는 경고
```

### Test Case 2: 완전 입력 후 제출
```
1. 새 대기필증 추가 모달 열기
2. 최초신고일에 "2024-01-15" 완전 입력
3. 제출
4. 확인: DB에 "2024-01-15" 저장됨 ✅

Expected: 정상 저장
```

### Test Case 3: 빈 값으로 제출
```
1. 새 대기필증 추가 모달 열기
2. 날짜 필드 건드리지 않음
3. 제출
4. 확인: DB에 null 저장됨 ✅

Expected: null 저장 (선택 필드이므로 정상)
```

## 📋 구현 체크리스트

- [ ] DateInput 컴포넌트 수정 (Option 1 or 2 선택)
- [ ] 불완전한 날짜 입력 방지 로직 추가
- [ ] 제출 시점 검증 강화 (Option 3)
- [ ] 사용자 피드백 UI 추가 (날짜 형식 가이드)
- [ ] 빌드 테스트
- [ ] Test Case 1-3 수동 테스트
- [ ] 커밋 및 푸시

## 🎨 UX 개선 제안

### 시각적 피드백 추가

```typescript
// 불완전한 날짜일 때 테두리 색상 변경
<div className={`flex items-center gap-1 sm:gap-2 ${
  isIncompleteDate ? 'opacity-60' : ''
}`}>
  <input
    className={`... ${
      year && year.length !== 4 ? 'border-amber-400' : 'border-gray-300'
    }`}
  />
  {/* 완성도 표시 */}
  {isIncompleteDate && (
    <span className="text-xs text-amber-600">날짜를 완성해주세요</span>
  )}
</div>
```

## 🔗 관련 파일

- **컴포넌트**: `/app/admin/air-permit/page.tsx` (Line 61-176)
- **API 엔드포인트**: `/app/api/air-permit/route.ts` (Line 263-264)
- **타입 정의**: Line 22-23 (first_report_date, operation_start_date)

## 📊 영향 분석

**영향 범위**: 대기필증 추가 기능만 영향 (수정 기능은 정상)

**이유**:
- 수정 모달은 다른 날짜 입력 컴포넌트를 사용할 가능성
- 또는 초기값이 완전한 날짜 형식으로 채워져 있어 문제 발생 안 함

**우선순위**: 🔴 High
- 데이터 무결성 문제
- 사용자 경험 저하
- 필수 정보 누락 가능

## 💡 권장 조치

**즉시 적용**: Option 1 (완전한 날짜만 전달)
- 가장 안전한 방식
- 구현 복잡도 낮음
- 서버 로직과 일치

**향후 개선**: Option 2 (로컬 상태 분리)
- 최적의 UX 제공
- 시간 여유 있을 때 적용
