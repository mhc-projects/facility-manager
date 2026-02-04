# 메모 API 에러 진단

## 🔴 발견된 문제

### API 응답 실패
```json
{
  "success": false,
  "message": "서버 오류가 발생했습니다.",
  "timestamp": "2026. 02. 04. 11:43:09"
}
```

### 로그 분석
- ✅ 프론트엔드: 정상 작동 (`loadBusinessMemos` 호출됨)
- ❌ 백엔드 API: 실패 (`success: false`)
- ❓ 에러 원인: 알 수 없음 (일반적인 에러 메시지만 반환)

## 🔧 적용한 수정

### 파일: [app/api/business-memos/route.ts](../app/api/business-memos/route.ts)

**수정 내용**: 상세한 에러 로깅 및 메시지 추가

```typescript
// Before
} catch (error: any) {
  console.error('❌ [BUSINESS-MEMOS] GET 요청 처리 오류:', error)
  return createErrorResponse('서버 오류가 발생했습니다.', 500);
}

// After
} catch (error: any) {
  console.error('❌ [BUSINESS-MEMOS] GET 요청 처리 오류:', error)
  console.error('❌ [BUSINESS-MEMOS] 에러 상세:', {
    message: error.message,
    stack: error.stack,
    name: error.name
  })
  return createErrorResponse(
    `메모 조회 실패: ${error.message || '알 수 없는 오류'}`,
    500
  );
}
```

## 🧪 다음 단계: 재테스트

### 1. 서버 재시작
```bash
# 터미널에서 Ctrl+C로 서버 중지 후
npm run dev
```

### 2. 테스트 수행
1. http://localhost:3000/admin/business 접속
2. 사업장 선택하여 모달 열기
3. **두 곳 모두** 로그 확인:
   - **브라우저 콘솔**: 더 상세한 에러 메시지 확인
   - **서버 터미널**: API 에러 로그 확인

### 3. 예상 로그

#### 브라우저 콘솔:
```javascript
🔧 [FRONTEND] 전체 응답: {
  "success": false,
  "message": "메모 조회 실패: [실제 에러 메시지]",  // ← 실제 에러 내용
  "timestamp": "..."
}
```

#### 서버 터미널:
```
❌ [BUSINESS-MEMOS] GET 요청 처리 오류: Error: [실제 에러]
❌ [BUSINESS-MEMOS] 에러 상세: {
  message: "[실제 에러 메시지]",
  stack: "[스택 트레이스]",
  name: "Error"
}
```

## 🔍 가능한 에러 원인

### A. 데이터베이스 연결 문제
**에러 메시지 예시**:
- "connection timeout"
- "could not connect to database"
- "SSL connection error"

**해결책**:
- `.env.local`의 Supabase 설정 확인
- Supabase 대시보드에서 프로젝트 상태 확인

### B. 쿼리 문법 오류
**에러 메시지 예시**:
- "syntax error at or near"
- "column does not exist"
- "relation does not exist"

**해결책**:
- 데이터베이스 스키마 확인
- `business_memos` 테이블 존재 확인
- 컬럼명 확인

### C. 환경 변수 누락
**에러 메시지 예시**:
- "undefined is not a function"
- "Cannot read property of undefined"

**해결책**:
- `.env.local` 파일 존재 확인
- 필수 환경 변수 설정 확인

### D. Direct PostgreSQL 연결 문제
**에러 메시지 예시**:
- "Pool is not defined"
- "pg module not found"

**해결책**:
```bash
npm install pg
```

## 📋 체크리스트

서버 재시작 후 확인할 사항:

- [ ] 서버 터미널에 에러 로그 출력되는가?
- [ ] 브라우저 콘솔에 상세한 에러 메시지 나오는가?
- [ ] 에러 메시지에서 실제 원인을 파악할 수 있는가?
- [ ] 데이터베이스 연결은 정상인가?
- [ ] `business_memos` 테이블이 존재하는가?

## 🎯 다음 작업

에러 로그를 확인한 후:
1. 실제 에러 메시지 공유
2. 원인 파악 및 해결 방안 수립
3. 수정 적용 및 재테스트
