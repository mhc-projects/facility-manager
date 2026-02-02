# 회의록 상세 페이지에 사업장별 이슈 섹션 추가

## 📝 문제 상황

### 증상
- 회의록 작성 페이지에서 사업장별 이슈를 입력하고 저장
- 회의록 상세 페이지로 이동하면 **사업장별 이슈 섹션이 표시되지 않음**
- 데이터는 DB에 정상 저장되었으나 UI에서 렌더링되지 않음

### 영향 범위
- **파일**: [app/admin/meeting-minutes/[id]/page.tsx](../app/admin/meeting-minutes/[id]/page.tsx)
- **증상**: 사업장별 이슈 데이터가 DB에 존재하지만 상세 페이지에서 표시 안 됨

## 🔍 원인 분석

### 근본 원인
상세 페이지에 **사업장별 이슈 섹션 렌더링 코드가 완전히 누락**되어 있었습니다.

### 데이터 구조
**파일**: [types/meeting-minutes.ts](../types/meeting-minutes.ts)

```typescript
export interface MeetingContent {
  summary: string
  discussions?: Discussion[]         // 선택적 (deprecated)
  business_issues: BusinessIssue[]  // ✅ 필수 필드
  action_items?: ActionItem[]        // 선택적 (deprecated)
}

export interface BusinessIssue {
  id: string
  business_id: string         // 사업장 ID
  business_name: string        // 사업장명
  issue_description: string    // 이슈 설명
  assignee_id: string         // 담당자 ID
  assignee_name: string       // 담당자명
  is_completed: boolean       // 완료 여부
  completed_at?: string       // 완료 날짜 (선택적)
}
```

### 기존 상세 페이지 구조
```typescript
1. 기본 정보 (회의 제목, 일시, 장소)
2. 참석자
3. 안건
4. 회의 요약
5. 논의사항 (discussions) - deprecated
6. 액션 아이템 (action_items) - deprecated
7. ❌ **사업장별 이슈 섹션 누락** ← 문제!
8. 첨부파일
9. 메타 정보
```

## ✅ 수정 내용

### 1. 사업장별 이슈 섹션 추가

**위치**: [app/admin/meeting-minutes/[id]/page.tsx:303-315](../app/admin/meeting-minutes/[id]/page.tsx#L303-L315)

액션 아이템 섹션(line 302)과 첨부파일 섹션(line 317) 사이에 추가:

```typescript
{/* 사업장별 이슈 */}
{minute.content.business_issues && minute.content.business_issues.length > 0 && (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <h2 className="text-lg font-semibold text-gray-900 mb-4">사업장별 이슈</h2>
    <div className="space-y-3">
      {minute.content.business_issues.map((issue) => (
        <BusinessIssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  </div>
)}
```

**적용 패턴**:
- ✅ 안전한 배열 체크: `business_issues && business_issues.length > 0 &&`
- ✅ 다른 섹션과 동일한 스타일: `p-6`, `rounded-lg`, `shadow-sm`
- ✅ 일관된 제목 스타일: `text-lg font-semibold mb-4`

### 2. BusinessIssueCard 컴포넌트 추가

**위치**: [app/admin/meeting-minutes/[id]/page.tsx:410-456](../app/admin/meeting-minutes/[id]/page.tsx#L410-L456)

ActionItemCard 컴포넌트 다음에 추가:

```typescript
// ============================================
// 사업장별 이슈 카드 컴포넌트
// ============================================
interface BusinessIssueCardProps {
  issue: {
    id: string
    business_id: string
    business_name: string
    issue_description: string
    assignee_id: string
    assignee_name: string
    is_completed: boolean
    completed_at?: string
  }
}

function BusinessIssueCard({ issue }: BusinessIssueCardProps) {
  return (
    <div className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      <input
        type="checkbox"
        checked={issue.is_completed}
        readOnly
        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            {issue.business_name}
          </span>
        </div>
        <div className="font-medium text-gray-900 mb-2">{issue.issue_description}</div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>담당자: {issue.assignee_name}</span>
          {issue.is_completed && issue.completed_at && (
            <span className="text-green-600">
              완료: {new Date(issue.completed_at).toLocaleDateString('ko-KR')}
            </span>
          )}
        </div>
      </div>
      {issue.is_completed && (
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
      )}
    </div>
  )
}
```

**컴포넌트 특징**:
- ✅ 완료 체크박스 표시 (읽기 전용)
- ✅ 사업장명 뱃지로 강조 표시 (파란색 배경)
- ✅ 이슈 설명을 명확하게 표시
- ✅ 담당자 정보 표시
- ✅ 완료된 경우 완료 날짜와 체크 아이콘 표시
- ✅ 호버 효과로 UX 개선

## 🎯 수정 후 UI 구조

### 회의록 상세 페이지 최종 구조
```typescript
1. 상태 배지 및 메타정보 (회의 유형, 일시, 장소)
2. 참석자 섹션 (참석 여부 표시)
3. 안건 섹션 (제목, 설명, 소요 시간)
4. 회의 요약 섹션
5. 논의사항 섹션 (선택적)
6. 액션 아이템 섹션 (선택적, deprecated)
7. ✅ **사업장별 이슈 섹션** (추가됨!)
8. 첨부파일 섹션 (선택적)
9. 메타 정보 (작성일, 수정일)
```

### BusinessIssueCard UI 레이아웃
```
┌────────────────────────────────────────────────┐
│ ☑️  [사업장명]                              ✓ │
│     이슈 설명 텍스트                            │
│     담당자: 홍길동    완료: 2025-02-01         │
└────────────────────────────────────────────────┘
```

**시각적 요소**:
- 체크박스: 완료 여부 표시
- 파란색 뱃지: 사업장명 강조
- 녹색 체크 아이콘: 완료된 이슈 표시
- 녹색 텍스트: 완료 날짜

## 📊 검증 방법

### 1. 빌드 검증
```bash
npm run build
```
**결과**: ✅ 빌드 성공
```
Route (app)
├ ƒ /admin/meeting-minutes/[id]   3.51 kB   161 kB
```

### 2. 테스트 시나리오

#### 시나리오 1: 사업장별 이슈가 있는 회의록
```
1. 회의록 작성 페이지에서 사업장별 이슈 추가
   - 사업장: "서울 본사"
   - 이슈: "냉각탑 청소 필요"
   - 담당자: "홍길동"
2. 저장 후 상세 페이지로 이동
3. ✅ 사업장별 이슈 섹션이 표시됨
4. ✅ 입력한 데이터가 정확히 표시됨
```

#### 시나리오 2: 여러 사업장 이슈가 있는 경우
```
1. 3개의 사업장 이슈 추가:
   - 서울 본사: "냉각탑 청소"
   - 부산 지사: "배출구 점검"
   - 대구 지사: "필터 교체" (완료됨)
2. ✅ 3개 모두 표시됨
3. ✅ 완료된 이슈는 체크 아이콘과 완료 날짜 표시
```

#### 시나리오 3: 사업장별 이슈가 없는 회의록
```
1. 사업장별 이슈 없이 회의록 저장
2. ✅ 사업장별 이슈 섹션이 표시되지 않음 (정상)
3. ✅ 다른 섹션들은 정상 표시
```

## 🔧 기술 세부사항

### 안전한 배열 체크 패턴
```typescript
// ✅ 안전한 패턴
{minute.content.business_issues && minute.content.business_issues.length > 0 && (
  // 렌더링 로직
)}

// ❌ 위험한 패턴 (이전 오류 패턴)
{minute.content.business_issues.length > 0 && (
  // undefined.length → TypeError
)}
```

**동작 원리**:
- `&&` 연산자의 단락 평가(short-circuit evaluation)
- `business_issues`가 `undefined`면 첫 번째 조건에서 `false` 반환
- `.length` 접근 시도 전에 평가 중단 → 오류 방지

### 조건부 렌더링 로직
```typescript
// 완료 날짜는 완료된 경우에만 표시
{issue.is_completed && issue.completed_at && (
  <span className="text-green-600">
    완료: {new Date(issue.completed_at).toLocaleDateString('ko-KR')}
  </span>
)}

// 완료 아이콘도 완료된 경우에만 표시
{issue.is_completed && (
  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
)}
```

## 📝 베스트 프랙티스

### 1. 일관된 섹션 구조
```typescript
{/* 섹션 제목 주석 */}
{data && data.length > 0 && (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <h2 className="text-lg font-semibold text-gray-900 mb-4">섹션 제목</h2>
    <div className="space-y-3">
      {data.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  </div>
)}
```

### 2. 카드 컴포넌트 패턴
```typescript
function ItemCard({ item }: ItemCardProps) {
  return (
    <div className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      {/* 좌측: 체크박스 또는 아이콘 */}
      <input type="checkbox" ... />

      {/* 중앙: 주요 정보 */}
      <div className="flex-1">
        <div>제목/설명</div>
        <div>메타데이터</div>
      </div>

      {/* 우측: 상태 아이콘 */}
      {condition && <Icon />}
    </div>
  )
}
```

### 3. 안전한 옵셔널 필드 처리
```typescript
// 필수 필드
business_issues: BusinessIssue[]  // 항상 존재, 빈 배열일 수 있음

// 선택적 필드
discussions?: Discussion[]         // undefined일 수 있음
completed_at?: string             // undefined일 수 있음

// 렌더링 시
{requiredField.length > 0 && ...}           // ✅ 필수 필드
{optionalField && optionalField.length > 0 && ...}  // ✅ 선택적 필드
```

## 🎉 결과

### 수정 전 문제점
1. ❌ 사업장별 이슈 섹션이 상세 페이지에 완전히 누락
2. ❌ 작성 페이지에서 입력한 데이터가 표시되지 않음
3. ❌ 사용자가 입력한 이슈 정보를 확인할 수 없음
4. ❌ 회의록 기능의 핵심 부분이 누락됨

### 수정 후 개선점
1. ✅ 사업장별 이슈 섹션 추가 완료
2. ✅ BusinessIssueCard 컴포넌트로 깔끔한 UI
3. ✅ 완료 여부, 담당자, 완료 날짜 모두 표시
4. ✅ 사업장명을 파란색 뱃지로 강조
5. ✅ 완료된 이슈는 녹색 체크 아이콘 표시
6. ✅ 다른 섹션과 일관된 디자인 유지
7. ✅ 안전한 배열 체크로 오류 방지

### 빌드 결과
```bash
✓ Compiled successfully
✓ Build completed
Route: /admin/meeting-minutes/[id] (3.51 kB, 161 kB First Load JS)
```

---

**수정일**: 2025-02-02
**담당자**: Claude Code
**상태**: ✅ 수정 완료
**빌드**: ✅ 성공
**심각도**: 🟡 Medium (기능 누락)
**영향도**: 높음 (회의록 핵심 기능)
**수정 파일**: [app/admin/meeting-minutes/[id]/page.tsx](../app/admin/meeting-minutes/[id]/page.tsx) (2곳 추가)
**핵심 변경**:
- 사업장별 이슈 섹션 추가 (line 303-315)
- BusinessIssueCard 컴포넌트 구현 (line 410-456)
