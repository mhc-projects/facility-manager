# 엑셀 일괄등록 Task Type 매핑 오류 수정

## 📋 문제 상황

**보고**: admin/tasks 페이지 상세모달에서 대리점 업무가 `subsidy_payment` status로 표시되는 문제 발견

**실제 데이터**:
- 사업장: (주)엘킹덤
- 업무 타입: dealer (대리점)
- 현재 단계: subsidy_payment (보조금 입금) ❌
- 엑셀 등록 시: "제품 발주" 단계로 등록

**조사 결과**: 34개의 대리점 업무가 잘못된 status를 가지고 있음

## 🔍 근본 원인 분석

### 문제 코드 위치
`app/api/admin/tasks/bulk-upload/route.ts:65-86`

문제 코드: task_type을 고려하지 않고 첫 번째 매칭만 반환

### 문제 시나리오

1. 엑셀에서 대리점 업무의 현재 단계를 "제품 발주"로 입력
2. `getStatusCodeFromKorean("제품 발주", "dealer")` 호출
3. TASK_STATUS_KR 객체 순회하며 "제품 발주"와 매칭되는 첫 번째 항목 검색
4. JavaScript 객체 순회 순서에 따라 불확정적 매칭
5. 운이 나쁘게도 `subsidy_payment`가 먼저 매칭되어 반환됨

## ✅ 해결 방안

### 1. getStatusCodeFromKorean 함수 수정

task_type을 고려하여 올바른 status 코드 반환하도록 수정:

1순위: {task_type}_ prefix가 있는 status 검색
2순위: 공통 단계 검색 (dealer/outsourcing/etc 제외)
3순위: 일반 매핑 (레거시 동작 유지)

### 2. 잘못된 데이터 수정

`scripts/fix-dealer-wrong-status.js` 실행으로 34개 업무 수정:
- task_type: dealer
- 기존 status: subsidy_payment ❌
- 수정 status: dealer_product_ordered ✅

## 🛠️ 실행 방법

### 1단계: 코드 수정 확인
```bash
npm run build
```

### 2단계: 잘못된 데이터 수정
```bash
node scripts/fix-dealer-wrong-status.js
```

## 🔗 관련 파일

- app/api/admin/tasks/bulk-upload/route.ts (수정)
- scripts/fix-dealer-wrong-status.js (생성)
- claudedocs/fix-bulk-upload-task-type-mapping.md (본 문서)
