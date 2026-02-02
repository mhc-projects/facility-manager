# 빠른 시작: 안건 담당자 선택 활성화

## 🎯 목표

회의록 작성 시 안건 담당자를 선택할 수 있도록 샘플 직원 데이터를 추가합니다.

## ⚡ 빠른 실행 (30초)

```bash
# 1. 환경 변수 확인
# .env.local 파일이 있는지 확인

# 2. 샘플 직원 데이터 삽입
npm run migrate:sample-employees

# 3. 개발 서버 실행 (이미 실행 중이면 생략)
npm run dev

# 4. 브라우저에서 확인
# http://localhost:3000/admin/meeting-minutes/create
```

## ✅ 결과 확인

### 1. 터미널 출력
```
🚀 샘플 직원 데이터 삽입 시작...
📋 총 X개의 SQL 문 발견
🔄 직원 데이터 삽입 중...
✅ 샘플 직원 데이터 삽입 완료!
   총 5개 부서의 직원 데이터 처리됨
```

### 2. 회의록 작성 페이지
1. `/admin/meeting-minutes/create` 접속
2. **안건 섹션**에서 "추가" 버튼 클릭
3. **담당자 필드** 클릭
4. 다음 직원들이 표시됨:
   - 김개발 (개발팀 팀장)
   - 이프론트 (개발팀 선임개발자)
   - 박백엔드 (개발팀 주임개발자)
   - 최관리 (관리팀 팀장)
   - ... 총 13명

### 3. 검색 테스트
- **"김"** 입력 → 김개발 표시
- **"개발"** 입력 → 개발팀 3명 표시
- **"팀장"** 입력 → 모든 팀장 표시

## 👥 추가된 직원 목록

| 부서 | 인원 | 담당자 예시 |
|------|------|------------|
| 개발팀 | 3명 | 김개발, 이프론트, 박백엔드 |
| 관리팀 | 3명 | 최관리, 정회계, 한인사 |
| 영업팀 | 3명 | 강영업, 오마케팅, 윤고객 |
| 기술지원팀 | 2명 | 임기술, 서지원 |
| 경영지원팀 | 2명 | 조경영, 신전략 |

**총 13명**의 샘플 직원 데이터가 추가됩니다.

## 🔧 문제 해결

### 오류 1: "SUPABASE_SERVICE_ROLE_KEY is not defined"
```bash
# .env.local 파일에 다음 환경 변수 추가
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 오류 2: "Cannot find module 'tsx'"
```bash
# tsx 패키지가 없는 경우 설치
npm install --save-dev tsx
```

### 오류 3: 담당자가 여전히 표시되지 않음
```bash
# 1. Supabase Dashboard에서 확인
#    Table Editor > employees > 데이터 확인

# 2. 캐시 클리어 후 재시작
rm -rf .next
npm run dev
```

## 📝 수동 실행 (Supabase Dashboard)

npm 스크립트가 작동하지 않는 경우:

1. **Supabase Dashboard** 접속
2. **SQL Editor** 메뉴 선택
3. **sql/insert_sample_employees.sql** 파일 열기
4. 전체 내용 복사
5. SQL Editor에 붙여넣기
6. **Run** 버튼 클릭
7. 결과 확인 (13 rows affected)

## 🎉 다음 단계

샘플 데이터 추가 완료 후:

1. **회의록 작성 테스트**
   - 안건 추가
   - 담당자 선택
   - 데드라인 설정
   - 회의록 저장

2. **사업장별 이슈 테스트**
   - 사업장별 이슈 추가
   - 담당자 선택 (동일한 직원 목록 사용)
   - 완료 여부 토글

3. **실제 데이터 교체 준비**
   - 샘플 데이터 검토
   - 실제 직원 정보 준비
   - 교체 계획 수립

## 📚 상세 문서

더 자세한 정보는 다음 문서를 참고하세요:
- [sample-employees-data.md](sample-employees-data.md) - 전체 가이드
- [sql/insert_sample_employees.sql](../sql/insert_sample_employees.sql) - SQL 파일

---

**소요 시간**: 약 30초
**난이도**: ⭐ (매우 쉬움)
**상태**: ✅ 즉시 사용 가능
