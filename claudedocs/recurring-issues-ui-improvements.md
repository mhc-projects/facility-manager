# 미해결 반복 이슈 UI 개선 사항

## 개요
사용자 요청사항에 따라 미해결 반복 이슈 영역의 UI를 개선했습니다.

## 구현 내용

### 1. 텍스트 크기 최소화

**파일**: `components/admin/meeting-minutes/RecurringIssueCard.tsx`

모든 텍스트 크기를 최소화했습니다:
- 일반 텍스트: `text-sm` → `text-xs`
- 레이블 텍스트: `text-sm` → `text-[10px]` (Tailwind의 가장 작은 크기)
- 아이콘: `w-4 h-4` → `w-3 h-3`
- 패딩/간격: `p-4`, `mb-3`, `gap-2` → `p-2`, `mb-2`, `gap-1.5`
- 버튼: `px-4 py-2 text-sm` → `px-2 py-1.5 text-xs`
- 배지: `px-3 py-1 text-sm` → `px-2 py-0.5 text-xs`

**파일**: `components/admin/meeting-minutes/RecurringIssuesPanel.tsx`

패널 전체의 텍스트 크기를 최소화했습니다:
- 헤더 타이틀: `text-lg` → `text-sm`
- 아이콘: `w-5 h-5` → `w-4 h-4`
- 배지: `px-2 py-0.5 text-xs` → `px-1.5 py-0.5 text-[10px]`
- 안내 메시지: `text-sm` → `text-xs`
- 로딩/에러 메시지: `text-sm` → `text-xs`
- 버튼: `p-1.5`, `w-4 h-4` → `p-1`, `w-3 h-3`
- 패딩: `p-4` → `p-2`
- 그리드 간격: `gap-4` → `gap-2`

### 2. 추가된 이슈 자동 숨김 기능

**파일**: `components/admin/meeting-minutes/RecurringIssuesPanel.tsx`

```typescript
interface RecurringIssuesPanelProps {
  onAddIssue: (issue: BusinessIssue) => void
  addedIssueIds?: string[] // 이미 추가된 이슈 ID 목록 (새로 추가)
  className?: string
}
```

- `addedIssueIds` prop을 추가하여 이미 추가된 이슈 ID 배열을 받습니다
- 컴포넌트 내부에서 `filteredIssues` 계산:
  ```typescript
  const filteredIssues = issues.filter(issue => !addedIssueIds.includes(issue.id))
  ```
- 모든 렌더링 로직에서 `issues` 대신 `filteredIssues` 사용
- 이슈 개수 표시, 빈 상태 체크 등 모든 UI에 필터링 적용

**파일**: `app/admin/meeting-minutes/create/page.tsx`

```typescript
{meetingType === '정기회의' && (
  <RecurringIssuesPanel
    onAddIssue={(issue) => {
      setBusinessIssues([...businessIssues, issue])
    }}
    addedIssueIds={businessIssues.map(issue => issue.id)} // 이미 추가된 이슈 ID 전달
  />
)}
```

- 현재 `businessIssues` 배열에서 모든 이슈 ID를 추출하여 전달
- 실시간으로 추가된 이슈를 추적하여 패널에서 자동으로 숨김

## 동작 원리

1. 사용자가 "이슈 가져오기" 클릭
2. `onAddIssue` 콜백이 호출되어 `businessIssues` 배열에 이슈 추가
3. `businessIssues` 배열이 업데이트되면 React가 리렌더링
4. `RecurringIssuesPanel`이 새로운 `addedIssueIds` prop 받음
5. `filteredIssues`가 재계산되어 추가된 이슈 제외
6. 패널에서 해당 이슈 카드가 즉시 사라짐

## 사용자 경험

### Before
- 이슈를 추가해도 미해결 반복 이슈 섹션에 계속 표시됨
- 어떤 이슈를 추가했는지 혼란스러움
- 텍스트 크기가 커서 많은 공간 차지

### After
- 이슈를 추가하면 미해결 반복 이슈 섹션에서 즉시 사라짐
- 아직 추가하지 않은 이슈만 표시되어 명확함
- 텍스트 크기가 작아져 더 많은 이슈를 한눈에 볼 수 있음
- 전체 레이아웃이 더 컴팩트해짐

## 빌드 결과

✅ 빌드 성공 - TypeScript 컴파일 오류 없음

## 테스트 권장사항

1. 정기회의 생성 페이지에서 미해결 반복 이슈가 표시되는지 확인
2. "이슈 가져오기" 클릭 시 사업장별 이슈 섹션에 추가되는지 확인
3. 추가된 이슈가 미해결 반복 이슈 섹션에서 즉시 사라지는지 확인
4. 텍스트 크기가 적절하게 작아졌는지 확인
5. 여러 이슈를 순차적으로 추가하여 필터링이 올바르게 작동하는지 확인
