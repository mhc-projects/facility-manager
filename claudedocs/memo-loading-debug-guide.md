# 메모 로딩 문제 디버깅 가이드

## 🔍 문제 상황
기존에 입력했던 메모들이 사업장 상세 모달의 "메모 및 업무" 섹션에 표시되지 않음

## 🧪 디버깅 단계

### 1단계: 브라우저 콘솔 확인
1. `/admin/business` 페이지 접속
2. 브라우저 개발자 도구 열기 (F12 또는 Cmd+Option+I)
3. Console 탭 선택
4. 사업장 선택하여 상세 모달 열기
5. 콘솔에 출력되는 로그 확인

### 기대되는 로그 출력:

```javascript
🔧 [FRONTEND] loadBusinessMemos 시작 - businessId: {uuid}
🔧 [FRONTEND] 메모 로드 요청 URL: /api/business-memos?businessId={uuid}
🔧 [FRONTEND] ===== API 응답 상세 디버깅 =====
🔧 [FRONTEND] 전체 응답: {
  "success": true,
  "data": {
    "data": [메모배열] 또는 [메모배열],
    "metadata": {...}
  }
}
🔧 [FRONTEND] result.success: true
🔧 [FRONTEND] result.data 타입: object 또는 array
🔧 [FRONTEND] result.data는 배열?: true 또는 false
🔧 [FRONTEND] result.data.data: [메모배열] (중첩 구조인 경우)
🔧 [FRONTEND] Case 1 또는 Case 2 메시지
🔧 [FRONTEND] 최종 추출된 메모: X개
🔧 [FRONTEND] 메모 상세: [{id, title, source_type}, ...]
🔧 [FRONTEND] setBusinessMemos 호출 완료
```

### 2단계: API 응답 구조 확인

#### 예상 응답 패턴 1 (중첩 구조):
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "business_id": "uuid",
        "title": "메모 제목",
        "content": "메모 내용",
        "source_type": null,
        "created_at": "2026-02-04T..."
      }
    ],
    "metadata": {
      "businessId": "uuid",
      "businessName": "사업장명",
      "count": 1
    }
  },
  "timestamp": "..."
}
```

#### 예상 응답 패턴 2 (직접 배열):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "business_id": "uuid",
      "title": "메모 제목",
      "content": "메모 내용"
    }
  ],
  "metadata": {...},
  "timestamp": "..."
}
```

### 3단계: 문제 진단 체크리스트

| 확인 사항 | 예상 값 | 실제 값 | 문제? |
|-----------|---------|---------|-------|
| `result.success` | `true` | ? | |
| `result.data` 존재 | `object` 또는 `array` | ? | |
| `result.data.data` 존재 (중첩) | `array` 또는 `undefined` | ? | |
| 메모 개수 (`memos.length`) | `> 0` | ? | |
| `setBusinessMemos` 호출됨 | ✅ | ? | |
| `businessMemos` state 업데이트 | 로그 확인 | ? | |

### 4단계: 가능한 문제 시나리오

#### 시나리오 A: API 응답이 빈 배열
**증상**:
```javascript
🔧 [FRONTEND] 최종 추출된 메모: 0개
```

**원인**:
- 데이터베이스에 메모가 없음
- `business_id`가 일치하지 않음
- `is_deleted = true`로 설정됨

**해결책**:
1. 데이터베이스 직접 확인:
```sql
SELECT * FROM business_memos
WHERE business_id = '{uuid}'
AND is_active = true
AND is_deleted = false;
```

2. 브라우저 Network 탭에서 실제 API 응답 확인

#### 시나리오 B: API 응답 파싱 오류
**증상**:
```javascript
⚠️ [FRONTEND] 예상치 못한 응답 구조: {...}
🔧 [FRONTEND] 최종 추출된 메모: 0개
```

**원인**:
- API 응답 구조가 예상과 다름
- `createSuccessResponse` 중첩 문제

**해결책**:
전체 응답 구조 로그 확인 후 파싱 로직 조정

#### 시나리오 C: State 업데이트 후 렌더링 실패
**증상**:
```javascript
🔧 [FRONTEND] setBusinessMemos 호출 완료
🔧 [FRONTEND] businessMemos state 변경됨: X개
// 하지만 UI에는 표시 안됨
```

**원인**:
- Modal 컴포넌트가 props 변경을 감지하지 못함
- `getIntegratedItems()` 함수 issue (이미 useCallback으로 해결함)

**해결책**:
1. `getIntegratedItems()` 호출 로그 확인:
```javascript
🔧 [FRONTEND] getIntegratedItems 호출됨 - businessMemos: X개
```

2. Modal 렌더링 조건 확인:
```javascript
{(businessMemos.length > 0 || businessTasks.length > 0) && (
  // 메모 및 업무 섹션
)}
```

#### 시나리오 D: task_sync 메모만 있어서 필터링됨
**증상**:
```javascript
🔧 [FRONTEND] 최종 추출된 메모: 5개
🔧 [FRONTEND] getIntegratedItems 호출됨 - businessMemos: 5개
🔧 [FRONTEND] task_sync 메모 제외: [업무] 사업장명 - ...
// 모든 메모가 task_sync로 제외됨
```

**원인**:
- 모든 메모가 `source_type = 'task_sync'`
- 사용자 수동 메모가 없음

**해결책**:
- 이는 정상 동작 (task_sync는 실제 업무로 표시됨)
- 수동 메모를 추가하면 표시됨

## 🔧 수정 사항

### 파일: [app/admin/business/page.tsx](../app/admin/business/page.tsx)

**수정 내용**:
1. 상세 디버깅 로그 추가
2. API 응답 구조 감지 로직 개선
3. Case별 처리 로직 명확화

```typescript
// Before
const memos = Array.isArray(result.data) ? result.data : (result.data?.data || [])

// After
let memos = []
if (Array.isArray(result.data)) {
  console.log('Case 1: result.data가 배열')
  memos = result.data
} else if (result.data?.data && Array.isArray(result.data.data)) {
  console.log('Case 2: result.data.data가 배열')
  memos = result.data.data
} else {
  console.warn('예상치 못한 응답 구조')
  memos = []
}
```

## 📊 실행 방법

### 개발 환경에서 테스트
```bash
npm run dev
```

1. http://localhost:3000/admin/business 접속
2. 사업장 선택
3. 브라우저 콘솔 확인
4. 디버깅 로그 분석

### 프로덕션 빌드 확인
```bash
npm run build
npm start
```

## 🎯 다음 단계

### 문제 지속 시:
1. 콘솔 로그 전체 복사
2. Network 탭에서 `/api/business-memos` 응답 확인
3. 데이터베이스 직접 쿼리로 메모 존재 확인
4. 이슈 리포트 작성

### 추가 조사 필요 항목:
- [ ] Supabase 데이터베이스에 메모가 실제로 존재하는가?
- [ ] API 응답의 정확한 구조는 무엇인가?
- [ ] businessMemos state가 업데이트되는가?
- [ ] Modal 컴포넌트가 리렌더링되는가?
- [ ] task_sync 메모만 있는 것은 아닌가?

## 📖 참고 문서
- [memo-display-fix-implementation.md](./memo-display-fix-implementation.md) - 메모 표시 문제 수정 내역
- [memo-system-complete-analysis.md](./memo-system-complete-analysis.md) - 메모 시스템 전체 분석
