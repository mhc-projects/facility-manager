# 메모 수정 기능 문제 분석

## 문제 보고
**위치**: admin/business 상세 모달 > 업무진행현황 탭 > 메모 섹션
**증상**: 메모 수정 기능이 동작하지 않음

## 코드 흐름 분석

### 정상 흐름 (예상)
1. **수정 버튼 클릭** → `startEditMemo(memo)` 호출
2. **상태 업데이트**:
   - `setEditingMemo(memo)` - 현재 수정 중인 메모 설정
   - `setMemoForm({ title: memo.title, content: memo.content })` - 폼에 기존 값 채우기
   - `setIsAddingMemo(true)` - 메모 입력 폼 표시
3. **사용자가 메모 수정** → title, content 변경
4. **저장 버튼 클릭** → `handleEditMemo()` 호출
5. **API 요청**: `/api/business-memos?id=${editingMemo.id}` (PUT)
6. **상태 업데이트**: 메모 목록에서 해당 메모 업데이트
7. **폼 초기화**: `setEditingMemo(null)`, `setIsAddingMemo(false)`

### 관련 파일 및 함수

#### [app/admin/business/page.tsx](../app/admin/business/page.tsx)

##### 상태 정의 (Line 838-846)
```typescript
const [businessMemos, setBusinessMemos] = useState<BusinessMemo[]>([])
const [isAddingMemo, setIsAddingMemo] = useState(false)
const [editingMemo, setEditingMemo] = useState<BusinessMemo | null>(null)
const [memoForm, setMemoForm] = useState({ title: '', content: '' })
```

##### startEditMemo 함수 (Line 1519-1527)
```typescript
const startEditMemo = (memo: BusinessMemo) => {
  if (!memo.id) {
    alert('메모 ID가 없어 수정할 수 없습니다.')
    return
  }
  setEditingMemo(memo)
  setMemoForm({ title: memo.title, content: memo.content })
  setIsAddingMemo(true) // 같은 폼을 재사용
}
```

**✅ 정상 동작**: 메모 수정 상태를 올바르게 설정

##### handleEditMemo 함수 (Line 1416-1460)
```typescript
const handleEditMemo = async () => {
  if (!editingMemo || !memoForm.title?.trim() || !memoForm.content?.trim()) {
    alert('제목과 내용을 모두 입력해주세요.')
    return
  }

  try {
    const updateData: UpdateBusinessMemoInput = {
      title: memoForm.title.trim(),
      content: memoForm.content.trim(),
      updated_by: user?.name || user?.email || '알 수 없음'
    }

    const response = await fetch(`/api/business-memos?id=${editingMemo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    })

    const result = await response.json()

    if (result.success && result.data) {
      const updatedMemo = result.data.data || result.data
      console.log('🔧 [FRONTEND] 메모 수정 성공:', updatedMemo)

      // 즉시 UI에서 메모 업데이트 (낙관적 업데이트)
      setBusinessMemos(prev =>
        prev.map(memo => memo.id === editingMemo.id ? updatedMemo : memo)
      )

      console.log('🔧 [FRONTEND] UI 상태 업데이트 완료 - 메모 수정됨')

      // 메모 폼 초기화 및 입력창 닫기
      setMemoForm({ title: '', content: '' })
      setEditingMemo(null)
      setIsAddingMemo(false)
    } else {
      alert(`메모 수정 실패: ${result.error}`)
    }
  } catch (error) {
    console.error('❌ 메모 수정 오류:', error)
    alert('메모 수정 중 오류가 발생했습니다.')
  }
}
```

**✅ 정상 동작**: API 호출 및 상태 업데이트 로직 올바름

##### cancelMemoEdit 함수 (Line 1529-1533)
```typescript
const cancelMemoEdit = () => {
  setIsAddingMemo(false)
  setEditingMemo(null)
  setMemoForm({ title: '', content: '' })
}
```

**✅ 정상 동작**: 모든 상태 초기화

##### Props 전달 (Line 4562-4574)
```typescript
<BusinessDetailModal
  isOpen={isDetailModalOpen}
  business={selectedBusiness}
  onClose={() => { /* ... */ }}
  onEdit={openEditModal}
  isAddingMemo={isAddingMemo}
  setIsAddingMemo={setIsAddingMemo}
  businessMemos={businessMemos}
  businessTasks={businessTasks}
  getIntegratedItems={getIntegratedItems}
  canDeleteAutoMemos={canDeleteAutoMemos}
  startEditMemo={startEditMemo}
  handleDeleteMemo={handleDeleteMemo}
  editingMemo={editingMemo}
  memoForm={memoForm}
  setMemoForm={setMemoForm}
  handleAddMemo={handleAddMemo}
  handleEditMemo={handleEditMemo}
  /* ... */
/>
```

**✅ 정상**: 모든 필요한 props 전달됨

#### [components/business/modals/BusinessDetailModal.tsx](../components/business/modals/BusinessDetailModal.tsx)

##### Props 인터페이스 (Line 236-254)
```typescript
interface BusinessDetailModalProps {
  isOpen: boolean
  business: UnifiedBusinessInfo
  onClose: () => void
  onEdit: (business: UnifiedBusinessInfo) => void
  // Memo 관련 props
  isAddingMemo: boolean
  setIsAddingMemo: (adding: boolean) => void
  businessMemos: Memo[]
  businessTasks: Task[]
  getIntegratedItems: () => IntegratedItem[]
  canDeleteAutoMemos: boolean
  startEditMemo: (memo: Memo) => void
  handleDeleteMemo: (memo: Memo) => void
  editingMemo: Memo | null
  memoForm: { title: string; content: string }
  setMemoForm: React.Dispatch<React.SetStateAction<{ title: string; content: string }>>
  handleAddMemo: () => void
  handleEditMemo: () => void
  /* ... */
}
```

**✅ 정상**: Props 타입 정의 올바름

##### 수정 버튼 (Line 680-691)
```typescript
<button
  onClick={() => startEditMemo(memo)}
  disabled={!memo.id}
  className={`p-1 sm:p-1.5 rounded transition-colors ${
    memo.id
      ? 'text-gray-400 hover:text-indigo-600'
      : 'text-gray-300 cursor-not-allowed'
  }`}
  title={memo.id ? "메모 수정" : "메모 ID가 없어 수정할 수 없습니다"}
>
  <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
</button>
```

**✅ 정상**: `startEditMemo` 올바르게 호출, ID 체크 로직 존재

##### 저장 버튼 (Line 841-847)
```typescript
<button
  onClick={editingMemo ? handleEditMemo : handleAddMemo}
  disabled={!memoForm.title?.trim() || !memoForm.content?.trim()}
  className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
>
  {editingMemo ? '수정' : '추가'}
</button>
```

**✅ 정상**: 조건부로 올바른 핸들러 호출

##### 취소 버튼 (Line 832-840) - **문제 발견!**
```typescript
<button
  onClick={() => {
    setIsAddingMemo(false)
    setMemoForm({ title: '', content: '' })
  }}
  className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
>
  취소
</button>
```

**❌ 문제**: `setEditingMemo(null)`을 호출하지 않음!

## 근본 원인 분석

### 문제 시나리오

1. **사용자가 메모 A를 수정하려고 시도**
   - `startEditMemo(memo)` 호출
   - `editingMemo` = memo A
   - `memoForm` = { title: 'A 제목', content: 'A 내용' }
   - `isAddingMemo` = true

2. **사용자가 입력 도중 "취소" 버튼 클릭**
   - `setIsAddingMemo(false)` - 폼 숨김
   - `setMemoForm({ title: '', content: '' })` - 폼 초기화
   - **❌ BUT: `editingMemo`는 여전히 memo A를 가리킴!**

3. **사용자가 메모 B를 수정하려고 시도**
   - `startEditMemo(memo B)` 호출
   - `editingMemo` = memo B (정상 업데이트)
   - `memoForm` = { title: 'B 제목', content: 'B 내용' }
   - `isAddingMemo` = true

4. **사용자가 "저장" 버튼 클릭**
   - `handleEditMemo()` 호출 (editingMemo가 null이 아니므로)
   - **올바르게 작동해야 함** (메모 B 수정)

### 실제 문제는?

위 시나리오 분석에서는 취소 버튼의 `setEditingMemo(null)` 누락이 문제처럼 보이지만, 실제로는 다음 수정 시도에서 `startEditMemo`가 `editingMemo`를 덮어쓰기 때문에 **치명적인 문제는 아닙니다**.

하지만 **사용자가 "수정" → "취소" 후 즉시 "메모 추가"를 시도하는 경우**에는 문제가 발생합니다:

1. 메모 A 수정 시작 → `editingMemo` = A
2. 취소 클릭 → `editingMemo` 여전히 A (❌ 초기화 안됨)
3. "메모 추가" 버튼 클릭 → `setIsAddingMemo(true)` 하지만 `editingMemo`는 여전히 A
4. **저장 버튼 텍스트**: "수정" (왜냐하면 `editingMemo`가 null이 아님)
5. **저장 버튼 클릭**: `handleEditMemo()` 호출 → 새 메모 추가가 아닌 메모 A 수정!

## 추가 조사 필요 사항

### 1. 메모 추가 버튼 로직 확인
메모 추가 버튼을 클릭할 때 `editingMemo`를 명시적으로 `null`로 설정하는지 확인 필요:

```typescript
// 어딘가에 있어야 할 코드
<button onClick={() => {
  setEditingMemo(null)  // ← 이게 있는지 확인!
  setMemoForm({ title: '', content: '' })
  setIsAddingMemo(true)
}}>
  메모 추가
</button>
```

### 2. 실제 버그 재현 단계
1. 메모 수정 버튼 클릭
2. 내용 변경하지 않고 "취소" 클릭
3. "메모 추가" 버튼 클릭
4. 새 메모 작성 후 "저장" 클릭
5. **예상 결과**: 새 메모 추가
6. **실제 결과**: 기존 메모 수정? (확인 필요)

### 3. API 응답 확인
`handleEditMemo`가 실제로 호출되고 있는지, 그리고 API가 성공 응답을 주는지 브라우저 DevTools Console에서 확인:

```
// 예상 로그:
🔧 [FRONTEND] 메모 수정 성공: {...}
🔧 [FRONTEND] UI 상태 업데이트 완료 - 메모 수정됨
```

## 해결 방안

### 옵션 A: 취소 버튼에서 editingMemo 초기화 (권장)

**파일**: [components/business/modals/BusinessDetailModal.tsx:832-840](../components/business/modals/BusinessDetailModal.tsx#L832-L840)

**현재 코드**:
```typescript
<button
  onClick={() => {
    setIsAddingMemo(false)
    setMemoForm({ title: '', content: '' })
  }}
  className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
>
  취소
</button>
```

**수정 후**:
```typescript
<button
  onClick={() => {
    setIsAddingMemo(false)
    setEditingMemo(null)  // ✅ 추가!
    setMemoForm({ title: '', content: '' })
  }}
  className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
>
  취소
</button>
```

**장점**:
- 간단하고 직관적
- 취소 시 모든 상태 완전히 초기화
- 일관성 있는 동작 보장

**단점**:
- 없음

### 옵션 B: 전용 cancelMemoEdit 함수 사용

**파일**: [app/admin/business/page.tsx](../app/admin/business/page.tsx)에 이미 `cancelMemoEdit` 함수가 존재함 (Line 1529-1533)

**현재 코드** (BusinessDetailModal.tsx):
```typescript
<button onClick={() => {
  setIsAddingMemo(false)
  setMemoForm({ title: '', content: '' })
}}>
  취소
</button>
```

**수정 방안**:
1. `cancelMemoEdit` 함수를 props로 전달
2. 취소 버튼에서 해당 함수 호출

**page.tsx에서 props 추가**:
```typescript
<BusinessDetailModal
  /* ... 기존 props ... */
  cancelMemoEdit={cancelMemoEdit}  // ✅ 추가
/>
```

**BusinessDetailModal.tsx Props 인터페이스**:
```typescript
interface BusinessDetailModalProps {
  /* ... 기존 props ... */
  cancelMemoEdit: () => void  // ✅ 추가
}
```

**BusinessDetailModal.tsx 취소 버튼**:
```typescript
<button
  onClick={cancelMemoEdit}  // ✅ 변경
  className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
>
  취소
</button>
```

**장점**:
- 상태 관리 로직을 한 곳에 집중
- 재사용 가능한 함수
- 더 깔끔한 코드 구조

**단점**:
- props 추가 필요
- 약간 더 복잡한 구현

### 옵션 C: 메모 추가 버튼에서 editingMemo 초기화

메모 추가 버튼을 클릭할 때 명시적으로 `setEditingMemo(null)` 호출:

**위치**: BusinessDetailModal.tsx에서 "메모 추가" 버튼 찾기 (코드에서 확인 필요)

```typescript
<button onClick={() => {
  setEditingMemo(null)  // ✅ 추가
  setMemoForm({ title: '', content: '' })
  setIsAddingMemo(true)
}}>
  + 메모 추가
</button>
```

**장점**:
- 취소 버튼은 그대로 두고 추가 버튼만 수정
- 방어적 프로그래밍

**단점**:
- 근본 원인 해결이 아님
- 취소 → 추가 시에만 동작, 취소 → 수정 → 취소 같은 시나리오는 여전히 문제

## 권장 해결책

**옵션 A**와 **옵션 C**를 **둘 다 적용**하는 것을 권장:

1. **취소 버튼**: `setEditingMemo(null)` 추가 → 취소 시 완전한 상태 초기화
2. **메모 추가 버튼**: `setEditingMemo(null)` 추가 → 방어적 프로그래밍

이렇게 하면:
- ✅ 취소 후 상태가 깨끗하게 초기화
- ✅ 메모 추가 시 이전 수정 상태 영향 없음
- ✅ 모든 시나리오에서 안전한 동작

## 검증 방법

### 수정 전 테스트
1. 브라우저 DevTools Console 열기
2. 메모 수정 버튼 클릭
3. "취소" 클릭
4. Console에서 `editingMemo` 상태 확인 (null이어야 하는데 객체일 것)

### 수정 후 테스트
1. 위 수정 사항 적용
2. 개발 서버 재시작
3. 메모 수정 버튼 클릭 → 취소 → Console 확인 (`editingMemo` null 확인)
4. 다시 메모 추가 시도 → 새 메모로 정상 추가되는지 확인
5. 메모 수정 → 저장 → 정상 수정되는지 확인

### 체크리스트
- [ ] 메모 수정 후 저장 → 정상 동작
- [ ] 메모 수정 후 취소 → 폼 닫힘, 상태 초기화
- [ ] 취소 후 메모 추가 → 새 메모 추가 (기존 메모 수정 아님!)
- [ ] 메모 A 수정 → 취소 → 메모 B 수정 → 저장 → 메모 B만 수정됨
- [ ] 콘솔 에러 없음

## 관련 파일

- [app/admin/business/page.tsx](../app/admin/business/page.tsx)
  - Line 845: `editingMemo` 상태 정의
  - Line 1416-1460: `handleEditMemo` 함수
  - Line 1519-1527: `startEditMemo` 함수
  - Line 1529-1533: `cancelMemoEdit` 함수
  - Line 4562-4574: BusinessDetailModal props 전달

- [components/business/modals/BusinessDetailModal.tsx](../components/business/modals/BusinessDetailModal.tsx)
  - Line 236-254: Props 인터페이스
  - Line 680-691: 수정 버튼 (Edit3 아이콘)
  - Line 832-840: 취소 버튼 (**수정 대상**)
  - Line 841-847: 저장 버튼

- [app/api/business-memos/route.ts](../app/api/business-memos/route.ts) - API 엔드포인트

## 추가 개선 제안

### 1. 로딩 상태 추가
메모 수정 중 버튼 비활성화 및 로딩 표시:

```typescript
const [isSavingMemo, setIsSavingMemo] = useState(false)

const handleEditMemo = async () => {
  setIsSavingMemo(true)
  try {
    // ... 기존 로직 ...
  } finally {
    setIsSavingMemo(false)
  }
}

// 버튼에서:
<button
  onClick={editingMemo ? handleEditMemo : handleAddMemo}
  disabled={!memoForm.title?.trim() || !memoForm.content?.trim() || isSavingMemo}
>
  {isSavingMemo ? '저장 중...' : (editingMemo ? '수정' : '추가')}
</button>
```

### 2. Toast 알림 추가
성공/실패 시 사용자 친화적인 알림:

```typescript
import { toast } from 'react-hot-toast'

// 성공 시:
toast.success('메모가 수정되었습니다.')

// 실패 시:
toast.error('메모 수정에 실패했습니다.')
```

### 3. 낙관적 업데이트 개선
API 실패 시 롤백 로직 추가:

```typescript
const handleEditMemo = async () => {
  const originalMemo = businessMemos.find(m => m.id === editingMemo.id)

  // 낙관적 업데이트
  setBusinessMemos(prev =>
    prev.map(memo => memo.id === editingMemo.id ? updatedMemo : memo)
  )

  try {
    const response = await fetch(...)
    // ... 성공 처리 ...
  } catch (error) {
    // 실패 시 원래 메모로 롤백
    setBusinessMemos(prev =>
      prev.map(memo => memo.id === editingMemo.id ? originalMemo : memo)
    )
    toast.error('메모 수정에 실패했습니다.')
  }
}
```

---

**작성일**: 2026-02-05
**작성자**: Claude Code
**우선순위**: High
**상태**: 🔍 분석 완료, 해결 방안 제시
**문제 유형**: 상태 관리 - editingMemo 초기화 누락
**영향 범위**: admin/business 상세 모달 > 업무진행현황 탭 > 메모 섹션
