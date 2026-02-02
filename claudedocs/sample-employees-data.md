# 회의록 안건 담당자용 샘플 직원 데이터

## 📋 개요

회의록 작성 시 안건 담당자를 선택할 수 있도록 employees 테이블에 샘플 직원 데이터를 추가하는 방법입니다.

## 🎯 목적

- **문제**: 안건 섹션에 담당자 선택 기능이 있지만 선택할 수 있는 직원 데이터가 없음
- **해결**: 5개 부서, 13명의 샘플 직원 데이터를 제공하여 즉시 사용 가능

## 👥 샘플 직원 구성

### 1. 개발팀 (3명)
| 이름 | 이메일 | 직급 | 권한 |
|------|--------|------|------|
| 김개발 | kim.dev@company.com | 팀장 | 관리자 (3) |
| 이프론트 | lee.frontend@company.com | 선임개발자 | 매출조회 (2) |
| 박백엔드 | park.backend@company.com | 주임개발자 | 매출조회 (2) |

### 2. 관리팀 (3명)
| 이름 | 이메일 | 직급 | 권한 |
|------|--------|------|------|
| 최관리 | choi.admin@company.com | 팀장 | 관리자 (3) |
| 정회계 | jung.accounting@company.com | 대리 | 매출조회 (2) |
| 한인사 | han.hr@company.com | 주임 | 일반 (1) |

### 3. 영업팀 (3명)
| 이름 | 이메일 | 직급 | 권한 |
|------|--------|------|------|
| 강영업 | kang.sales@company.com | 팀장 | 관리자 (3) |
| 오마케팅 | oh.marketing@company.com | 선임 | 매출조회 (2) |
| 윤고객 | yoon.cs@company.com | 사원 | 일반 (1) |

### 4. 기술지원팀 (2명)
| 이름 | 이메일 | 직급 | 권한 |
|------|--------|------|------|
| 임기술 | lim.tech@company.com | 팀장 | 매출조회 (2) |
| 서지원 | seo.support@company.com | 주임 | 일반 (1) |

### 5. 경영지원팀 (2명)
| 이름 | 이메일 | 직급 | 권한 |
|------|--------|------|------|
| 조경영 | jo.management@company.com | 이사 | 관리자 (3) |
| 신전략 | shin.strategy@company.com | 과장 | 매출조회 (2) |

## 🚀 실행 방법

### 방법 1: npm 스크립트 사용 (권장)

```bash
# .env.local 파일이 있는지 확인
npm run migrate:sample-employees
```

### 방법 2: Supabase SQL Editor 사용

1. Supabase Dashboard 접속
2. SQL Editor 메뉴 선택
3. [sql/insert_sample_employees.sql](../sql/insert_sample_employees.sql) 파일 내용 복사
4. 붙여넣기 후 "Run" 버튼 클릭

### 방법 3: 직접 SQL 실행

```bash
# Supabase CLI 사용 (설치되어 있는 경우)
supabase db execute -f sql/insert_sample_employees.sql
```

## 📊 실행 결과

### 성공 메시지
```
🚀 샘플 직원 데이터 삽입 시작...
📋 총 X개의 SQL 문 발견
🔄 직원 데이터 삽입 중...
✅ 샘플 직원 데이터 삽입 완료!
   총 5개 부서의 직원 데이터 처리됨
```

### 삽입된 데이터 확인
```sql
SELECT
    name AS "이름",
    email AS "이메일",
    department AS "부서",
    position AS "직급",
    CASE
        WHEN permission_level = 1 THEN '일반'
        WHEN permission_level = 2 THEN '매출조회'
        WHEN permission_level = 3 THEN '관리자'
    END AS "권한"
FROM public.employees
WHERE email LIKE '%@company.com'
ORDER BY department, position;
```

### 부서별 통계
```
┌──────────────┬──────┬──────────┐
│ 부서         │ 인원 │ 관리자수 │
├──────────────┼──────┼──────────┤
│ 개발팀       │ 3    │ 1        │
│ 관리팀       │ 3    │ 1        │
│ 영업팀       │ 3    │ 1        │
│ 기술지원팀   │ 2    │ 0        │
│ 경영지원팀   │ 2    │ 1        │
└──────────────┴──────┴──────────┘
```

## 🔧 기술 세부사항

### SQL 안전성

**중복 실행 방지**:
```sql
INSERT INTO public.employees (...)
VALUES (...)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    department = EXCLUDED.department,
    ...
    updated_at = NOW();
```

- `ON CONFLICT (email)` 사용으로 이메일 중복 시 업데이트
- 여러 번 실행해도 안전
- 기존 데이터 보존 (덮어쓰기)

### 권한 레벨

| 레벨 | 이름 | 설명 |
|------|------|------|
| 1 | 일반 | 기본 사용자 권한 |
| 2 | 매출조회 | 매출 데이터 조회 가능 |
| 3 | 관리자 | 매출 및 단가 조회/수정 가능 |

### 전화번호 패턴

- 형식: `010-1234-5XXX`
- 부서별 구분:
  - 개발팀: 5001-5003
  - 관리팀: 5010-5012
  - 영업팀: 5020-5022
  - 기술지원팀: 5030-5031
  - 경영지원팀: 5040-5041

## 📝 사용 예시

### 회의록 작성 시 안건 담당자 선택

1. **회의록 작성 페이지** 접속: `/admin/meeting-minutes/create`
2. **안건 섹션**에서 "추가" 버튼 클릭
3. **담당자 필드**에서 검색:
   - "김개발" 입력 → 김개발 선택
   - "개발" 입력 → 개발팀 전체 표시
   - "팀장" 입력 → 모든 팀장 표시
4. **자동완성**으로 빠른 선택 가능

### AutocompleteSelectInput 동작

```tsx
<AutocompleteSelectInput
  value={item.assignee_id || ''}
  onChange={(id, name) => {
    // id: UUID (예: "123e4567-e89b-12d3-a456-426614174000")
    // name: 직원명 (예: "김개발")
  }}
  options={employees.map(e => ({ id: e.id, name: e.name }))}
  placeholder="담당자 선택"
/>
```

**검색 기능**:
- 키보드 입력으로 실시간 필터링
- 이름, 부서, 직급 검색 가능
- ↑↓ 키로 네비게이션
- Enter로 선택

## 🎯 실제 사용 시나리오

### 시나리오 1: 프로젝트 회의
```
안건 1: "신규 기능 개발 계획"
- 데드라인: 2025-02-15
- 담당자: 김개발 (개발팀 팀장)

안건 2: "고객 피드백 분석"
- 데드라인: 2025-02-10
- 담당자: 윤고객 (영업팀 사원)
```

### 시나리오 2: 정기 회의
```
안건 1: "월간 매출 보고"
- 데드라인: 2025-02-05
- 담당자: 정회계 (관리팀 대리)

안건 2: "마케팅 전략 수립"
- 데드라인: 2025-02-20
- 담당자: 오마케팅 (영업팀 선임)
```

## ⚠️ 주의사항

### 1. 테스트 데이터
- 이 데이터는 **샘플/테스트용**입니다
- 실제 운영 환경에서는 실제 직원 정보로 교체 필요
- 이메일 주소는 `@company.com` 도메인 사용

### 2. 데이터 정리
실제 직원 데이터로 교체 시 샘플 데이터 삭제:
```sql
DELETE FROM public.employees
WHERE email LIKE '%@company.com';
```

### 3. 권한 관리
- permission_level은 실제 직원의 역할에 맞게 설정
- 관리자 권한(3)은 신중하게 부여
- 비활성화 시 `is_active = FALSE` 설정 (삭제 대신)

## 🔍 확인 방법

### 1. Supabase Dashboard
```
Dashboard > Table Editor > employees > Filter by email contains "@company.com"
```

### 2. Admin 페이지
```
/admin/users 페이지에서 직원 목록 확인
```

### 3. 회의록 작성 페이지
```
/admin/meeting-minutes/create > 안건 추가 > 담당자 검색
```

### 4. SQL 쿼리
```sql
SELECT COUNT(*) as "샘플 직원 수"
FROM public.employees
WHERE email LIKE '%@company.com'
AND is_active = TRUE;
```

## 📚 관련 파일

| 파일 | 설명 |
|------|------|
| [sql/insert_sample_employees.sql](../sql/insert_sample_employees.sql) | 샘플 직원 데이터 삽입 SQL |
| [scripts/insert-sample-employees.ts](../scripts/insert-sample-employees.ts) | 마이그레이션 실행 스크립트 |
| [sql/00_create_employees_table.sql](../sql/00_create_employees_table.sql) | employees 테이블 스키마 |
| [package.json](../package.json) | npm 스크립트 정의 |

## 🎉 다음 단계

샘플 직원 데이터 삽입 후:

1. **회의록 작성 테스트**
   ```
   /admin/meeting-minutes/create
   ```

2. **안건 담당자 선택 테스트**
   - 안건 추가
   - 담당자 검색 (예: "김개발", "개발팀")
   - 자동완성 동작 확인

3. **저장 및 조회 확인**
   - 회의록 저장
   - 상세 페이지에서 담당자 표시 확인

4. **실제 직원 데이터 교체** (운영 환경)
   - 샘플 데이터 삭제
   - 실제 직원 정보 입력

---

**작성일**: 2025-02-01
**담당자**: Claude Code
**상태**: ✅ 준비 완료
