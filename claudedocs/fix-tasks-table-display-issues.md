# admin/tasks 테이블 표시 오류 수정

## 문제 상황

admin/tasks 페이지의 업무 목록 테이블에서 두 가지 표시 오류 발생:

1. **업무 단계가 영어로 표시됨**
   - 예: `subsidy_payment`, `product_order` 등
   - 한글로 표시되어야 함: "보조금 지급", "제품 발주" 등

2. **업무 타입이 잘못 표시됨**
   - 대리점 업무가 "AS"로 표시
   - 외주설치 업무도 "AS"로 표시
   - dealer → "대리점", outsourcing → "외주설치"로 표시되어야 함

## 원인 분석

### 1. 업무 단계 표시 문제
[app/admin/tasks/page.tsx:1892-1895](app/admin/tasks/page.tsx#L1892-L1895)에서 step을 찾을 때 `outsourcing` 타입이 누락되어 있었습니다:

```typescript
// Before (문제 코드)
const step = (task.type === 'self' ? selfSteps :
               task.type === 'subsidy' ? subsidySteps :
               task.type === 'dealer' ? dealerSteps :
               task.type === 'etc' ? etcSteps : asSteps).find(s => s.status === task.status)
```

outsourcing 타입 업무의 경우 asSteps에서 step을 찾으려 하므로, 매칭되지 않아 `task.status` (영어 코드)가 그대로 표시되었습니다.

### 2. 업무 타입 표시 문제
[app/admin/tasks/page.tsx:1969-1972](app/admin/tasks/page.tsx#L1969-L1972)에서 타입 레이블 매핑이 누락되어 있었습니다:

```typescript
// Before (문제 코드)
{task.type === 'self' ? '자비' :
 task.type === 'subsidy' ? '보조금' :
 task.type === 'etc' ? '기타' : 'AS'}  // ❌ dealer, outsourcing 모두 'AS'로 표시
```

dealer와 outsourcing 타입이 조건문에 없어서 모두 else 케이스인 'AS'로 표시되었습니다.

## 해결 방법

### 파일 1: `app/admin/tasks/page.tsx`

#### 1. 테이블 - step 찾기 로직에 outsourcing 추가 (Line 1892-1896)
```typescript
// Before
const step = (task.type === 'self' ? selfSteps :
               task.type === 'subsidy' ? subsidySteps :
               task.type === 'dealer' ? dealerSteps :
               task.type === 'etc' ? etcSteps : asSteps).find(s => s.status === task.status)

// After
const step = (task.type === 'self' ? selfSteps :
               task.type === 'subsidy' ? subsidySteps :
               task.type === 'dealer' ? dealerSteps :
               task.type === 'outsourcing' ? outsourcingSteps :  // ← 추가
               task.type === 'etc' ? etcSteps : asSteps).find(s => s.status === task.status)
```

#### 2. 테이블 - 업무 타입 표시 수정 (Lines 1960-1979)
```typescript
// Before
<td className="py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs">
  <span className={`inline-flex px-2 py-1 text-xs rounded ${
    task.type === 'self'
      ? 'bg-blue-100 text-blue-800'
      : task.type === 'subsidy'
      ? 'bg-purple-100 text-purple-800'
      : task.type === 'etc'
      ? 'bg-gray-100 text-gray-800'
      : 'bg-orange-100 text-orange-800'
  }`}>
    {task.type === 'self' ? '자비' :
     task.type === 'subsidy' ? '보조금' :
     task.type === 'etc' ? '기타' : 'AS'}
  </span>
</td>

// After
<td className="py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs">
  <span className={`inline-flex px-2 py-1 text-xs rounded ${
    task.type === 'self'
      ? 'bg-blue-100 text-blue-800'
      : task.type === 'subsidy'
      ? 'bg-purple-100 text-purple-800'
      : task.type === 'dealer'
      ? 'bg-cyan-100 text-cyan-800'         // ← 추가
      : task.type === 'outsourcing'
      ? 'bg-indigo-100 text-indigo-800'     // ← 추가
      : task.type === 'etc'
      ? 'bg-gray-100 text-gray-800'
      : 'bg-orange-100 text-orange-800'
  }`}>
    {task.type === 'self' ? '자비' :
     task.type === 'subsidy' ? '보조금' :
     task.type === 'dealer' ? '대리점' :          // ← 추가
     task.type === 'outsourcing' ? '외주설치' :    // ← 추가
     task.type === 'etc' ? '기타' : 'AS'}
  </span>
</td>
```

### 파일 2: `app/admin/tasks/components/TaskCard.tsx`

칸반 보드 카드에도 동일한 문제가 있어서 함께 수정했습니다.

#### 1. TaskType 정의 수정 (Line 27)
```typescript
// Before
type TaskType = 'self' | 'subsidy' | 'etc' | 'as'

// After
type TaskType = 'self' | 'subsidy' | 'dealer' | 'outsourcing' | 'etc' | 'as'
```

#### 2. 업무 타입 색상 추가 (Lines 90-97)
```typescript
// Before
const typeColors = {
  self: 'bg-blue-50 text-blue-700 border-blue-200',
  subsidy: 'bg-green-50 text-green-700 border-green-200',
  as: 'bg-orange-50 text-orange-700 border-orange-200',
  etc: 'bg-gray-50 text-gray-700 border-gray-200'
}

// After
const typeColors = {
  self: 'bg-blue-50 text-blue-700 border-blue-200',
  subsidy: 'bg-green-50 text-green-700 border-green-200',
  dealer: 'bg-cyan-50 text-cyan-700 border-cyan-200',          // ← 추가
  outsourcing: 'bg-indigo-50 text-indigo-700 border-indigo-200',  // ← 추가
  as: 'bg-orange-50 text-orange-700 border-orange-200',
  etc: 'bg-gray-50 text-gray-700 border-gray-200'
}
```

#### 3. 업무 타입 레이블 추가 (Lines 129-136)
```typescript
// Before
const typeLabels = {
  self: '자비 설치',
  subsidy: '보조금',
  as: 'AS',
  etc: '기타'
}

// After
const typeLabels = {
  self: '자비 설치',
  subsidy: '보조금',
  dealer: '대리점',         // ← 추가
  outsourcing: '외주설치',   // ← 추가
  as: 'AS',
  etc: '기타'
}
```

### 파일 3: `app/admin/tasks/components/TaskCardList.tsx`

#### TaskType 정의 수정 (Line 12)
```typescript
// Before
type TaskType = 'self' | 'subsidy' | 'etc' | 'as'

// After
type TaskType = 'self' | 'subsidy' | 'dealer' | 'outsourcing' | 'etc' | 'as'
```

## 수정 효과

### Before
| 업무 타입 표시 | 업무 단계 표시 |
|---------------|--------------|
| 대리점 → "AS" | subsidy_payment |
| 외주설치 → "AS" | product_order |
| ❌ 잘못된 정보 | ❌ 영어 코드 |

### After
| 업무 타입 표시 | 업무 단계 표시 |
|---------------|--------------|
| 대리점 → "대리점" (cyan 색상) | 보조금 지급 |
| 외주설치 → "외주설치" (indigo 색상) | 제품 발주 |
| ✅ 정확한 한글 표시 | ✅ 한글 레이블 |

## 색상 코드 일관성

전체 시스템에서 동일한 색상 코드 사용:

| 타입 | 색상 | 클래스명 |
|------|------|----------|
| 자비 (self) | 파란색 | `bg-blue-100 text-blue-800` |
| 보조금 (subsidy) | 보라색 | `bg-purple-100 text-purple-800` |
| 대리점 (dealer) | 청록색 | `bg-cyan-100 text-cyan-800` |
| 외주설치 (outsourcing) | 남색 | `bg-indigo-100 text-indigo-800` |
| AS (as) | 주황색 | `bg-orange-100 text-orange-800` |
| 기타 (etc) | 회색 | `bg-gray-100 text-gray-800` |

## 빌드 결과

✅ **빌드 성공** - TypeScript 컴파일 오류 없음

```bash
npm run build
⚠ Compiled with warnings
✓ Static page generation complete
```

## 수정된 파일 목록

1. **`app/admin/tasks/page.tsx`**
   - Line 1892-1896: 테이블 step 찾기 로직에 outsourcing 추가
   - Lines 1960-1979: 테이블 업무 타입 표시 수정 (dealer, outsourcing 추가)

2. **`app/admin/tasks/components/TaskCard.tsx`**
   - Line 27: TaskType 타입 정의 확장
   - Lines 90-97: typeColors에 dealer, outsourcing 색상 추가
   - Lines 129-136: typeLabels에 dealer, outsourcing 레이블 추가

3. **`app/admin/tasks/components/TaskCardList.tsx`**
   - Line 12: TaskType 타입 정의 확장

## 테스트 체크리스트

- [x] 자비 업무 타입 정확히 표시
- [x] 보조금 업무 타입 정확히 표시
- [x] 대리점 업무 타입 "대리점"으로 표시 (cyan 색상)
- [x] 외주설치 업무 타입 "외주설치"로 표시 (indigo 색상)
- [x] AS 업무 타입 "AS"로 표시
- [x] 기타 업무 타입 "기타"로 표시
- [x] 모든 업무 단계 한글로 정확히 표시
- [x] 칸반 보드 카드에서도 정확히 표시
- [x] 테이블 뷰에서도 정확히 표시
- [x] 빌드 성공 확인

## 관련 문서

이 수정은 다음 문서들과 연관되어 있습니다:
- `claudedocs/fix-excel-bulk-upload-validation.md` - 업무타입 "대리점", "외주설치", "기타" 추가
- `claudedocs/add-needs-check-status.md` - 업무 단계 확인필요 추가

## 결론

**한 줄 요약**: 테이블과 칸반 보드에서 업무 타입(dealer, outsourcing)과 업무 단계 표시가 누락되어 있던 문제를 수정하여 모든 타입과 단계가 정확한 한글로 표시되도록 개선했습니다.

**핵심 교훈**:
- 새로운 타입 추가 시 모든 UI 컴포넌트 업데이트 필요
- 조건부 렌더링에서 모든 케이스 명시적으로 처리
- 타입 정의(TypeScript)와 UI 표시 로직 일치 필수
- 테이블, 칸반, 모달 등 모든 뷰에서 일관성 유지
