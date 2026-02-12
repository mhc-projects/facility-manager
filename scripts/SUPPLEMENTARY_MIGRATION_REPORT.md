# 보완 마이그레이션 리포트

## 📋 문제 상황

### 초기 마이그레이션 결과
- **실행 스크립트**: `migrate-memo-status-to-korean.sql`
- **처리 대상**: 67개 업무 상태 코드
- **예상 결과**: 모든 영문 상태 → 한글 변환

### 검증 결과
```sql
SELECT COUNT(*) as remaining_english
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+';

결과: { 'remaining_english': 23 }
```

**23개의 레코드에서 여전히 영문 패턴이 발견됨**

---

## 🔍 원인 분석

### 샘플 데이터 분석
```json
[
  {
    "id": "e1c28d3a-ea49-4ba7-a49f-4dded98fe4c0",
    "content": "업무 상태가 \"신청서 작성 필요\"에서 \"신청서 제출\"로 변경되었습니다. 새로운 업무 단계: final_document_submit",
    "created_at": "2025-09-25T07:46:51.776326+00:00"
  },
  {
    "id": "e1d9ad8a-a61f-42e8-901e-c0e4acf41f61",
    "content": "업무 상태가 \"준공 실사\"에서 \"준공 보완\"로 변경되었습니다. 새로운 업무 단계: completion_supplement",
    "created_at": "2025-10-01T05:14:49.093508+00:00"
  }
]
```

### 발견된 패턴

#### 1. `final_document_submit` (7개)
- **원래 상태**: `subsidy_final_document_submit`
- **실제 저장**: `final_document_submit` (prefix 없음)
- **의도**: "보조금지급신청서 제출"
- **문제**: 초기 스크립트의 NOT LIKE 조건이 너무 엄격하여 처리되지 않음

#### 2. `completion_supplement` (11개)
- **원래 상태**: `subsidy_completion_supplement_1st/2nd/3rd`
- **실제 저장**: `completion_supplement` (prefix 없고 차수 구분 없음)
- **의도**: "준공 보완" (또는 "준공 보완 1차/2차/3차")
- **문제**: 일반화된 패턴으로 저장되어 구체적인 패턴만 매칭하는 스크립트에서 누락

#### 3. `pre_construction_supplement` (5개)
- **원래 상태**: `subsidy_pre_construction_supplement_1st/2nd`
- **실제 저장**: `pre_construction_supplement` (prefix 없고 차수 구분 없음)
- **의도**: "착공 보완" (또는 "착공 보완 1차/2차")
- **문제**: 일반화된 패턴으로 저장되어 구체적인 패턴만 매칭하는 스크립트에서 누락

---

## 💡 해결 방안

### 보완 스크립트 생성
**파일**: `scripts/migrate-memo-status-supplementary.sql`

### 처리 전략

#### 1. 순차적 처리 (구체적 → 일반적)
```sql
-- 먼저 가장 구체적인 패턴 처리
UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement_3rd', '준공 보완 3차')
WHERE content LIKE '%completion_supplement_3rd%'
  AND content NOT LIKE '%준공 보완 3차%';

-- 그 다음 중간 구체성
UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement_2nd', '준공 보완 2차')
WHERE content LIKE '%completion_supplement_2nd%'
  AND content NOT LIKE '%준공 보완 2차%';

-- 마지막으로 일반적인 패턴 (위에서 처리 안 된 것들)
UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement', '준공 보완')
WHERE content LIKE '%completion_supplement%'
  AND content NOT LIKE '%준공 보완%';
```

#### 2. 더 관대한 조건
- **기존 스크립트**: `NOT LIKE '%subsidy_final_document_submit%'` (너무 엄격)
- **보완 스크립트**: `NOT LIKE '%보조금지급신청서 제출%'` (이미 변환된 것만 제외)

---

## 🚀 실행 절차

### 1. 현재 상태 확인
```sql
-- 남은 영문 개수
SELECT COUNT(*) as remaining_english
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+';

-- 구체적인 패턴 확인
SELECT id, content, created_at
FROM business_memos
WHERE content LIKE '%final_document_submit%'
   OR content LIKE '%completion_supplement%'
   OR content LIKE '%pre_construction_supplement%'
ORDER BY created_at DESC;
```

### 2. 보완 스크립트 실행
```bash
# Supabase SQL Editor에서:
1. scripts/migrate-memo-status-supplementary.sql 열기
2. 전체 내용 복사
3. SQL Editor에 붙여넣기
4. Run 버튼 클릭
5. 결과 확인 후 COMMIT 주석 해제하고 재실행
```

### 3. 최종 검증
```sql
-- 영문이 완전히 사라졌는지 확인 (0개 목표)
SELECT COUNT(*) as remaining_english
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+';
-- 예상 결과: { 'remaining_english': 0 }

-- 변환된 샘플 확인
SELECT id, content, created_at
FROM business_memos
WHERE content LIKE '%보조금지급신청서 제출%'
   OR content LIKE '%준공 보완%'
   OR content LIKE '%착공 보완%'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 📊 예상 결과

### Before (보완 마이그레이션 전)
```
업무 상태가 "신청서 작성 필요"에서 "신청서 제출"로 변경되었습니다.
새로운 업무 단계: final_document_submit
                  ^^^^^^^^^^^^^^^^^^^^^ (영문)

업무 상태가 "준공 실사"에서 "준공 보완"로 변경되었습니다.
새로운 업무 단계: completion_supplement
                  ^^^^^^^^^^^^^^^^^^^^^^ (영문)
```

### After (보완 마이그레이션 후)
```
업무 상태가 "신청서 작성 필요"에서 "신청서 제출"로 변경되었습니다.
새로운 업무 단계: 보조금지급신청서 제출
                  ^^^^^^^^^^^^^^^^^ (한글)

업무 상태가 "준공 실사"에서 "준공 보완"로 변경되었습니다.
새로운 업무 단계: 준공 보완
                  ^^^^^^^^ (한글)
```

---

## ✅ 완료 체크리스트

### 실행 전
- [ ] 백업 테이블 존재 확인 (`business_memos_backup_20260212`)
- [ ] 현재 남은 영문 개수 확인 (23개 예상)
- [ ] 구체적인 패턴 샘플 확인

### 실행 중
- [ ] 보완 스크립트 복사
- [ ] SQL Editor에 붙여넣기
- [ ] Run 버튼 클릭
- [ ] 트랜잭션 내 검증 쿼리 실행
- [ ] 결과 확인 후 COMMIT

### 실행 후
- [ ] 영문 패턴 0개 확인
- [ ] 한글 변환 샘플 확인
- [ ] 프론트엔드에서 실제 확인
- [ ] 백업 테이블 1주일 보관

---

## 🔄 롤백 방법

### 문제 발생 시
```sql
-- 트랜잭션 롤백
ROLLBACK;

-- 또는 백업에서 복원
UPDATE business_memos m
SET content = b.content
FROM business_memos_backup_20260212 b
WHERE m.id = b.id
  AND (
    m.content LIKE '%보조금지급신청서 제출%' OR
    m.content LIKE '%준공 보완%' OR
    m.content LIKE '%착공 보완%'
  );
```

---

## 💡 교훈

### 1. 레거시 데이터 패턴의 다양성
- 코드에는 prefix가 있지만 실제 DB에는 없는 경우 존재
- 차수 구분(1차/2차/3차)이 코드에는 있지만 DB에는 일반화된 형태로 저장

### 2. 마이그레이션 스크립트 작성 시 주의사항
- **조건문이 너무 엄격하면** 정작 처리해야 할 데이터를 놓침
- **NOT LIKE 조건은 신중하게**: 실제 변환해야 할 것까지 제외할 수 있음
- **순차적 처리 필요**: 구체적인 패턴 먼저 → 일반적인 패턴 나중에

### 3. 검증의 중요성
- 마이그레이션 후 반드시 남은 영문 패턴 확인
- 샘플 데이터로 실제 변환 결과 육안 검증
- 프론트엔드에서 최종 확인

---

**작성일**: 2026-02-12
**관련 파일**:
- `scripts/migrate-memo-status-to-korean.sql` (초기 마이그레이션)
- `scripts/migrate-memo-status-supplementary.sql` (보완 마이그레이션)
- `scripts/MIGRATION_GUIDE.md` (실행 가이드)
