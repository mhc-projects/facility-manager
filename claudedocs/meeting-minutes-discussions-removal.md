# 회의록 논의사항 섹션 제거

## 📋 작업 요약

회의록(Meeting Minutes) 시스템에서 논의사항(Discussions) 섹션을 제거하고 관련 DB 스키마를 정리했습니다.

## 🎯 변경 목적

- **UI 간소화**: 불필요한 논의사항 섹션 제거
- **사업장 중심**: 사업장별 이슈(Business Issues)에 집중
- **DB 정리**: 사용하지 않는 discussions 필드 정리

## 📝 주요 변경사항

### 1. UI 변경

**제거된 컴포넌트:**
- 논의사항 섹션 전체 제거 ([app/admin/meeting-minutes/create/page.tsx:505-552](../app/admin/meeting-minutes/create/page.tsx))
- Discussion 관련 state 제거
- Discussion 핸들러 함수 제거:
  - `handleAddDiscussion()`
  - `handleRemoveDiscussion()`
  - `handleUpdateDiscussion()`

**유지된 기능:**
- ✅ 회의 기본 정보 (제목, 날짜, 유형, 장소)
- ✅ 참석자 관리
- ✅ 안건 관리
- ✅ 회의 요약
- ✅ 사업장별 이슈 (Business Issues) - 최근 구현

### 2. 타입 정의 변경

**파일**: [types/meeting-minutes.ts](../types/meeting-minutes.ts)

```typescript
// Discussion 인터페이스
/**
 * 회의 논의사항
 * @deprecated 더 이상 사용하지 않음 - 하위 호환성을 위해 유지
 */
export interface Discussion {
  topic: string
  notes: string
  decisions: string[]
}

// MeetingContent 인터페이스
export interface MeetingContent {
  summary: string
  discussions?: Discussion[]         // @deprecated - 하위 호환성용
  business_issues: BusinessIssue[]  // 사업장별 이슈
  action_items?: ActionItem[]        // @deprecated - 하위 호환성용
}
```

**변경사항:**
- `Discussion` 인터페이스: `@deprecated` 표시 (하위 호환성 유지)
- `MeetingContent.discussions`: required → optional (`discussions?`)

### 3. 데이터 저장 로직

**파일**: [app/admin/meeting-minutes/create/page.tsx:193-197](../app/admin/meeting-minutes/create/page.tsx)

```typescript
content: {
  summary,
  discussions: [],  // 빈 배열로 유지 (하위 호환성)
  business_issues: businessIssues
}
```

**하위 호환성 전략:**
- 신규 회의록: `discussions: []` (빈 배열)
- 기존 회의록: 기존 데이터 유지 (마이그레이션으로 정리 가능)

### 4. DB 마이그레이션

**마이그레이션 SQL**: [sql/remove_discussions_from_meeting_minutes.sql](../sql/remove_discussions_from_meeting_minutes.sql)

```sql
-- 모든 회의록의 content에서 discussions 필드를 빈 배열로 업데이트
UPDATE meeting_minutes
SET content = jsonb_set(
  content,
  '{discussions}',
  '[]'::jsonb,
  true
)
WHERE content ? 'discussions'
  AND jsonb_typeof(content->'discussions') != 'null';
```

**실행 스크립트**: [scripts/run-remove-discussions.ts](../scripts/run-remove-discussions.ts)

**실행 명령어:**
```bash
npm run migrate:remove-discussions
```

## 🔧 마이그레이션 실행 방법

### 1. 백업 (권장)

```bash
# Supabase 대시보드에서 수동 백업 또는
# pg_dump를 사용한 백업
pg_dump -h your-host -U postgres -d postgres > backup_$(date +%Y%m%d).sql
```

### 2. 마이그레이션 실행

```bash
# .env.local 파일이 있는지 확인
npm run migrate:remove-discussions
```

### 3. 확인

```sql
-- Supabase SQL Editor에서 실행
SELECT
  id,
  title,
  content->'discussions' as discussions,
  content->'business_issues' as business_issues
FROM meeting_minutes
LIMIT 10;
```

**예상 결과:**
- `discussions`: `[]` (빈 배열)
- `business_issues`: 기존 데이터 유지

## 📊 영향 범위

### 영향 받는 파일

| 파일 | 변경 사항 |
|------|-----------|
| [app/admin/meeting-minutes/create/page.tsx](../app/admin/meeting-minutes/create/page.tsx) | 논의사항 UI 제거, state 제거, 핸들러 제거 |
| [types/meeting-minutes.ts](../types/meeting-minutes.ts) | Discussion @deprecated, discussions optional |
| [sql/remove_discussions_from_meeting_minutes.sql](../sql/remove_discussions_from_meeting_minutes.sql) | DB 마이그레이션 SQL |
| [scripts/run-remove-discussions.ts](../scripts/run-remove-discussions.ts) | 마이그레이션 실행 스크립트 |
| [package.json](../package.json) | 마이그레이션 스크립트 추가 |

### 영향 받지 않는 기능

- ✅ 회의록 목록 조회
- ✅ 회의록 상세 보기
- ✅ 회의록 수정 (edit 페이지는 별도 업데이트 필요할 수 있음)
- ✅ 사업장별 이슈 관리
- ✅ 기타 회의록 기능

## ⚠️ 주의사항

### 1. 하위 호환성

- **기존 회의록**: `discussions` 필드가 있는 기존 데이터는 유지됨
- **신규 회의록**: `discussions: []`로 저장됨
- **타입 안정성**: `discussions?` optional로 처리되어 기존 코드 호환

### 2. 마이그레이션 선택사항

마이그레이션 실행은 **선택사항**입니다:
- **실행 안 함**: 기존 데이터 유지, UI에서만 제거
- **실행함**: 기존 데이터도 정리 (권장)

### 3. Edit 페이지 업데이트

현재는 **Create 페이지만** 업데이트되었습니다.

**추가 작업 필요:**
- `app/admin/meeting-minutes/[id]/edit/page.tsx` 동일하게 업데이트
- 상세 보기 페이지에서 discussions 표시 제거 (선택)

## 🎉 완료된 작업

- ✅ UI에서 논의사항 섹션 완전 제거
- ✅ Discussion 관련 state 및 핸들러 제거
- ✅ 타입 정의 @deprecated 표시 및 optional 처리
- ✅ DB 마이그레이션 SQL 작성
- ✅ 마이그레이션 실행 스크립트 작성
- ✅ package.json에 마이그레이션 명령어 추가
- ✅ 빌드 테스트 통과

## 📚 다음 단계

### 선택사항 1: Edit 페이지 업데이트

```bash
# Edit 페이지도 동일하게 업데이트
# app/admin/meeting-minutes/[id]/edit/page.tsx
```

### 선택사항 2: 상세 보기 페이지 업데이트

```bash
# 상세 보기에서 discussions 표시 제거
# app/admin/meeting-minutes/[id]/page.tsx
```

### 선택사항 3: DB 마이그레이션 실행

```bash
# 기존 데이터 정리
npm run migrate:remove-discussions
```

## 🔍 테스트 체크리스트

- [x] 빌드 성공 확인
- [ ] 회의록 작성 페이지 UI 확인
- [ ] 신규 회의록 저장 테스트
- [ ] 기존 회의록 조회 테스트
- [ ] 마이그레이션 실행 테스트 (선택)
- [ ] Edit 페이지 업데이트 (선택)

## 📞 문의

문제 발생 시:
1. 빌드 에러 → 타입 정의 확인
2. 저장 에러 → content 구조 확인
3. 조회 에러 → discussions optional 처리 확인

---

**작성일**: 2025-02-01
**담당자**: Claude Code
**상태**: ✅ 완료 (선택적 마이그레이션 대기)
