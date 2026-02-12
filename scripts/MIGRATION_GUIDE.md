# 업무 메모 상태 한글 치환 마이그레이션 가이드

## 📋 개요

**목적**: `business_memos` 테이블의 `content` 필드에 포함된 영문 상태 코드를 한글로 일괄 변환

**대상**:
- 업무 자동 생성/변경 시 생성된 메모
- 영문 상태 코드가 포함된 모든 메모 (예: `subsidy_site_inspection` → `현장 실사`)

**치환 대상 개수**: 67개 업무 상태

---

## ⚠️ 실행 전 필수 사항

### 1. 백업 생성 (필수!)
```sql
-- 백업 테이블 생성
CREATE TABLE business_memos_backup_20260212 AS
SELECT * FROM business_memos;

-- 백업 확인
SELECT COUNT(*) FROM business_memos_backup_20260212;
```

### 2. 영향 범위 확인
```sql
-- 영문 상태가 포함된 메모 개수 확인
SELECT COUNT(*) as affected_memos
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+'; -- 영문과 언더스코어 패턴

-- 샘플 확인
SELECT id, content, created_at
FROM business_memos
WHERE content LIKE '%subsidy_site_inspection%'
   OR content LIKE '%as_customer_contact%'
   OR content LIKE '%dealer_order_received%'
LIMIT 10;
```

---

## 🚀 실행 방법

### Option 1: Supabase SQL Editor (권장)
```
1. Supabase 대시보드 접속
2. SQL Editor 메뉴 선택
3. scripts/migrate-memo-status-to-korean.sql 파일 내용 복사
4. SQL Editor에 붙여넣기
5. Run 버튼 클릭
```

### Option 2: psql CLI
```bash
# 로컬에서 실행
psql -h <your-supabase-host> \
     -U postgres \
     -d postgres \
     -f scripts/migrate-memo-status-to-korean.sql
```

### Option 3: DBeaver/DataGrip
```
1. 데이터베이스 연결
2. SQL 파일 열기 (scripts/migrate-memo-status-to-korean.sql)
3. 전체 선택 후 실행
```

---

## 📊 치환 대상 상세

### 1. 자비(Self) 업무 - 14개
```
self_customer_contact → 고객 상담
self_site_inspection → 현장 실사
self_quotation → 견적서 작성
self_contract → 계약 체결
self_deposit_confirm → 계약금 확인
self_product_order → 제품 발주
self_product_shipment → 제품 출고
self_installation_schedule → 설치 협의
self_installation → 제품 설치
self_balance_payment → 잔금 입금
self_document_complete → 서류 발송 완료
self_needs_check → 확인필요
deposit_confirm → 계약금 확인 (레거시)
installation_schedule → 설치예정 (레거시)
```

### 2. 보조금(Subsidy) 업무 - 27개
```
subsidy_customer_contact → 고객 상담
subsidy_site_inspection → 현장 실사
subsidy_quotation → 견적서 작성
subsidy_contract → 계약 체결
subsidy_document_preparation → 신청서 작성 필요
subsidy_application_submit → 신청서 제출
subsidy_approval_pending → 보조금 승인대기
subsidy_approved → 보조금 승인
subsidy_rejected → 보조금 탈락
subsidy_document_supplement → 신청서 보완
subsidy_pre_construction_inspection → 착공 전 실사
subsidy_pre_construction_supplement_1st → 착공 보완 1차
subsidy_pre_construction_supplement_2nd → 착공 보완 2차
subsidy_construction_report_submit → 착공신고서 제출
subsidy_product_order → 제품 발주
subsidy_product_shipment → 제품 출고
subsidy_installation_schedule → 설치예정
subsidy_installation → 설치완료
subsidy_pre_completion_document_submit → 준공도서 작성 필요
subsidy_completion_inspection → 준공 실사
subsidy_completion_supplement_1st → 준공 보완 1차
subsidy_completion_supplement_2nd → 준공 보완 2차
subsidy_completion_supplement_3rd → 준공 보완 3차
subsidy_final_document_submit → 보조금지급신청서 제출
subsidy_payment → 보조금 입금
subsidy_needs_check → 확인필요
+ 레거시 10개
```

### 3. AS 업무 - 7개
```
as_customer_contact → AS 고객 상담
as_site_inspection → AS 현장 확인
as_quotation → AS 견적 작성
as_contract → AS 계약 체결
as_part_order → AS 부품 발주
as_completed → AS 완료
as_needs_check → 확인필요
```

### 4. 대리점(Dealer) 업무 - 5개
```
dealer_order_received → 발주 수신
dealer_invoice_issued → 계산서 발행
dealer_payment_confirmed → 입금 확인
dealer_product_ordered → 제품 발주
dealer_needs_check → 확인필요
```

### 5. 외주설치(Outsourcing) 업무 - 5개
```
outsourcing_order → 외주 발주
outsourcing_schedule → 일정 조율
outsourcing_in_progress → 설치 진행 중
outsourcing_completed → 설치 완료
outsourcing_needs_check → 확인필요
```

### 6. 기타(Etc) 업무 - 2개
```
etc_status → 기타
etc_needs_check → 확인필요
```

### 7. 범용 상태 - 5개
```
pending → 대기
in_progress → 진행중
completed → 완료
cancelled → 취소
on_hold → 보류
```

### 8. 레거시 공통 - 9개
```
customer_contact → 고객 상담
site_inspection → 현장 실사
quotation → 견적서 작성
contract → 계약 체결
product_order → 제품 발주
product_shipment → 제품 출고
installation → 설치완료
balance_payment → 잔금 입금
document_complete → 서류 발송 완료
```

---

## ✅ 실행 후 검증

### 1. 변환 완료 확인
```sql
-- 한글로 변환된 메모 샘플 확인
SELECT id, content, created_at
FROM business_memos
WHERE content LIKE '%상태:%'
  AND content LIKE '%보조금%'
ORDER BY created_at DESC
LIMIT 10;
```

### 2. 영문 잔여 확인
```sql
-- 영문 상태가 남아있는지 확인
SELECT id, content, created_at
FROM business_memos
WHERE content LIKE '%subsidy_site_inspection%'
   OR content LIKE '%as_customer_contact%'
   OR content LIKE '%dealer_order_received%'
   OR content LIKE '%outsourcing_order%'
ORDER BY created_at DESC
LIMIT 20;

-- 영문 패턴 전체 검색
SELECT COUNT(*) as remaining_english
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+';
```

### 3. Before/After 비교
```sql
-- 변환 전후 비교 (백업 테이블 사용)
SELECT
  b.id,
  b.content as before,
  m.content as after
FROM business_memos_backup_20260212 b
JOIN business_memos m ON b.id = m.id
WHERE b.content != m.content
LIMIT 10;
```

---

## 🔄 롤백 방법

### 문제 발생 시 즉시 롤백
```sql
-- 트랜잭션 실행 중이었다면
ROLLBACK;

-- 이미 커밋된 경우 백업에서 복원
BEGIN;

-- 현재 테이블 삭제 (조심!)
DROP TABLE business_memos;

-- 백업에서 복원
ALTER TABLE business_memos_backup_20260212 RENAME TO business_memos;

COMMIT;
```

### 특정 메모만 롤백
```sql
-- 특정 메모를 백업에서 복원
UPDATE business_memos m
SET content = b.content
FROM business_memos_backup_20260212 b
WHERE m.id = b.id
  AND m.id IN (SELECT id FROM business_memos WHERE ... );
```

---

## 📈 예상 결과

### Before (마이그레이션 전)
```
새로운 보조금 업무 "현장 실사"이 생성되었습니다.
(상태: subsidy_site_inspection, 담당자: 미배정)
```

### After (마이그레이션 후)
```
새로운 보조금 업무 "현장 실사"이 생성되었습니다.
(상태: 현장 실사, 담당자: 미배정)
```

---

## 🎯 체크리스트

### 실행 전
- [ ] 백업 테이블 생성 완료
- [ ] 영향 범위 확인 완료 (개수 파악)
- [ ] 테스트 환경에서 먼저 실행 (선택)
- [ ] 프로덕션 실행 권한 확인
- [ ] 팀원들에게 작업 공지

### 실행 중
- [ ] SQL 파일 복사
- [ ] SQL Editor 열기
- [ ] 전체 스크립트 붙여넣기
- [ ] Run 버튼 클릭
- [ ] 실행 완료 대기 (예상 시간: 1-5분)

### 실행 후
- [ ] 한글 변환 확인 (샘플 10개)
- [ ] 영문 잔여 확인 (0개 목표)
- [ ] Before/After 비교
- [ ] 프론트엔드에서 실제 확인
- [ ] **추가 작업**: 영문이 남아있다면 보완 스크립트 실행 (아래 참조)
- [ ] 백업 테이블 보관 (1주일)

---

## 🔧 보완 마이그레이션 (영문이 남아있는 경우)

### 문제 상황
초기 마이그레이션 후 검증 쿼리를 실행했을 때 영문 패턴이 남아있는 경우:
```sql
SELECT COUNT(*) as remaining_english
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+';
-- 결과: { 'remaining_english': 23 } 또는 0보다 큰 숫자
```

### 원인
레거시 상태 코드가 prefix 없이 사용된 경우:
- `final_document_submit` (subsidy_ prefix 없음)
- `completion_supplement` (subsidy_ prefix 없고 1차/2차/3차 구분 없음)
- `pre_construction_supplement` (subsidy_ prefix 없고 1차/2차 구분 없음)

### 해결 방법

**1단계: 영문이 남아있는지 확인**
```sql
SELECT COUNT(*) as remaining_english
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+';
```

**2단계: 보완 스크립트 실행**
```bash
# Supabase SQL Editor에서
# scripts/migrate-memo-status-supplementary.sql 파일 내용 복사 후 실행
```

**3단계: 재검증**
```sql
-- 영문이 완전히 사라졌는지 확인 (0개 목표)
SELECT COUNT(*) as remaining_english
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+';

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

## 🐛 트러블슈팅

### 문제 1: 실행 시간이 너무 오래 걸림
```sql
-- 인덱스 확인
SELECT * FROM pg_indexes WHERE tablename = 'business_memos';

-- content 컬럼에 인덱스 추가 (선택)
CREATE INDEX idx_business_memos_content_trgm
ON business_memos USING gin(content gin_trgm_ops);
```

### 문제 2: 일부 영문이 남아있음
```sql
-- 수동으로 특정 패턴 재실행
UPDATE business_memos
SET content = REPLACE(content, '영문패턴', '한글')
WHERE content LIKE '%영문패턴%';
```

### 문제 3: 잘못된 치환 발견
```sql
-- 특정 메모만 백업에서 복원
UPDATE business_memos m
SET content = b.content
FROM business_memos_backup_20260212 b
WHERE m.id = b.id AND m.id = '문제있는_메모_id';
```

---

## 📞 지원

**문제 발생 시**:
1. 즉시 롤백 (위 롤백 방법 참조)
2. 로그 확인 (Supabase Dashboard → Logs)
3. 백업 테이블 확인 (`business_memos_backup_20260212`)
4. 필요 시 수동 복원

**완료 후**:
- 백업 테이블은 1주일 후 삭제 가능
- 새로 생성되는 메모는 코드 수정으로 자동 한글화
- 기존 메모는 이번 마이그레이션으로 완전 한글화

---

**마이그레이션 생성일**: 2026-02-12
**스크립트 파일**: `scripts/migrate-memo-status-to-korean.sql`
**예상 소요 시간**: 1-5분
**영향 범위**: business_memos 테이블만 (읽기 전용 테이블 제외)
