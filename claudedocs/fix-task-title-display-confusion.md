# Task Title Display 제거로 혼동 해결

## 📋 문제 상황

**보고**: 한일전동지게차 사업장의 업무 표시에서 혼동 발생
- 미니 칸반보드: "제품 발주" 2개로 표시
- 메모 및 업무 섹션: "제품발주"와 "보조금 입금"이라는 2개의 다른 항목으로 표시

**근본 원인**:
- Task 1: title="한일전동지게차 - 보조금 입금", status=`dealer_product_ordered`
- Task 2: title="한일전동지게차 - 제품 발주", status=`dealer_product_ordered`
- 칸반보드는 `status`로 그룹핑하지만, 확장된 목록에서는 `title`을 표시하여 불일치 발생

## ✅ 해결 방안

**사용자 요청**: "title은 아예 출력하지 않는게 혼동을 줄일 수 있을거같아"

**구현**: UI에서 task title 표시를 제거하고 status label만 표시

### 변경된 파일

#### 1. TaskProgressMiniBoard.tsx
**위치**: `/components/business/TaskProgressMiniBoard.tsx:419-421`

**Before**:
```typescript
<div key={task.id} className="bg-white p-2 rounded border text-xs">
  <div className="font-medium text-gray-800 mb-1 truncate">
    {task.title}  // ❌ Title 표시로 혼동 발생
  </div>
  <div className="flex items-center justify-between text-gray-600">
```

**After**:
```typescript
<div key={task.id} className="bg-white p-2 rounded border text-xs">
  <div className="flex items-center justify-between text-gray-600">
    // ✅ Title 제거, status label만 표시
```

#### 2. BusinessDetailModal.tsx
**위치**: `/components/business/modals/BusinessDetailModal.tsx:716`

**Before**:
```typescript
<h4 className="font-semibold text-gray-900 text-xs sm:text-sm md:text-base">
  {item.title || getStatusDisplayName(item.status || '')}  // ❌ Title 우선 표시
</h4>
```

**After**:
```typescript
<h4 className="font-semibold text-gray-900 text-xs sm:text-sm md:text-base">
  {getStatusDisplayName(item.status || '')}  // ✅ Status label만 표시
</h4>
```

## 🎯 효과

### Before (Title 표시)
```
미니 칸반보드:
  제품 발주 (2)
    └─ Task 1: "한일전동지게차 - 보조금 입금" ❌ 혼동 발생
    └─ Task 2: "한일전동지게차 - 제품 발주"

메모 및 업무:
  업무: "한일전동지게차 - 보조금 입금" ❌ Status와 불일치
  업무: "한일전동지게차 - 제품 발주"
```

### After (Status Label만 표시)
```
미니 칸반보드:
  제품 발주 (2)
    └─ Task 1: "제품 발주" ✅ Status와 일치
    └─ Task 2: "제품 발주" ✅ Status와 일치

메모 및 업무:
  업무: "제품 발주" ✅ 일관성 유지
  업무: "제품 발주" ✅ 일관성 유지
```

## 📝 설계 원칙

### Data Integrity vs UI Clarity
- **데이터 보존**: title 필드는 DB에 그대로 유지 (정보 손실 방지)
- **UI 명확성**: Status label만 표시하여 사용자 혼동 제거
- **Single Source of Truth**: Status 필드를 표시의 기준으로 사용

### 장점
1. **데이터 무손실**: 기존 title 데이터 보존
2. **UX 개선**: 사용자가 일관된 정보만 확인
3. **유지보수성**: Status 기반 표시로 로직 단순화
4. **확장성**: 향후 title 활용 가능성 보존

## 🔗 관련 이슈

### 검색 문제 해결
**문제**: admin/tasks에서 한일전동지게차 검색 안됨

**원인**:
- `dealer_product_ordered`는 dealerSteps의 마지막 단계 (5/5)
- Progress = 100%로 계산됨
- `showCompletedTasks=false`일 때 100% 업무 필터링됨

**해결**: 사용자가 "완료 업무 보기" 토글을 켜면 검색 가능 (별도 수정 불필요)

## ✅ 검증 체크리스트

- [x] TaskProgressMiniBoard.tsx title 표시 제거
- [x] BusinessDetailModal.tsx title 표시 제거
- [x] Status label 표시 유지 확인
- [ ] 브라우저에서 미니 칸반보드 확인
- [ ] 브라우저에서 메모 및 업무 섹션 확인
- [ ] 모든 task type (dealer/subsidy/self/as/outsourcing/etc) 표시 확인

## 📚 참고사항

### 데이터 상태
```javascript
// Task 1 (변경 없음)
{
  id: 'a44cac1c-1fb3-4a6f-89ea-b13462f00273',
  title: '한일전동지게차 - 보조금 입금',  // DB에 보존
  task_type: 'dealer',
  status: 'dealer_product_ordered'
}

// Task 2 (변경 없음)
{
  id: 'f5b19cfc-f4f3-4b0c-a381-ae8993579494',
  title: '한일전동지게차 - 제품 발주',   // DB에 보존
  task_type: 'dealer',
  status: 'dealer_product_ordered'
}
```

### 향후 고려사항
- Title 필드의 활용 방안 검토 (상세 모달, 툴팁 등)
- Title 자동 생성 로직 개선 (status와 일치하도록)
- 데이터 정합성 검증 로직 추가 고려
