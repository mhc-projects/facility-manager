# Facility Manager - Claude Code 프로젝트 가이드

## 프로젝트 개요
블루온(주식회사 블루온) 환경설비 설치 종합 관리 플랫폼.
사업장 관리, 매출/비용 관리, 예측마감, 업무게시판, IoT 모니터링을 하나의 시스템으로 통합.

## 기술 스택
- **Frontend**: React + TypeScript (Vite)
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Deploy**: Vercel
- **Auth**: 소셜 로그인 (Kakao, Naver, Google) + JWT 기반 세션 유지
- **Package Manager**: npm
- **Node Version**: 18+

## 프로젝트 구조
```
facility-manager/
├── src/
│   ├── app/                  # Next.js App Router (페이지 라우팅)
│   │   ├── dashboard/        # 대시보드 메인
│   │   │   ├── landing-pages/  # 랜딩페이지 관리
│   │   │   └── ...
│   │   └── ...
│   ├── components/           # 공통 컴포넌트
│   ├── lib/                  # 유틸, Supabase 클라이언트 등
│   ├── hooks/                # 커스텀 훅
│   └── types/                # TypeScript 타입 정의
├── public/                   # 정적 파일
├── supabase/                 # Supabase 마이그레이션
└── .env.local                # 환경변수 (절대 커밋 금지)
```

## 핵심 DB 테이블

### 사업장
- `business_info` — 사업장 메인 테이블 (business_name, address, manager_name, manufacturer, ph_meter, gateway 등 장비 수량 컬럼 포함, progress_status, order_date, installation_date, is_active/is_deleted)
- `business_memos` — 사업장별 진행 메모 (business_id, title, content, created_by, is_active/is_deleted)

### 사용자/인증
- `employees` — 직원/계정 (name, email, department, position, permission_level: 1=일반·2=매출조회·3=관리자, is_active/is_deleted)
- `social_accounts` — 소셜 로그인 연동 (user_id→employees, provider: kakao/naver/google, provider_id)

### 업무 관리
- `facility_tasks` — 업무 메인 테이블 (title, business_name, business_id, task_type: self/subsidy/as/dealer/outsourcing/etc, status: 67개 CHECK값, priority, assignees JSONB, start_date, due_date, notes, is_active/is_deleted)
- `task_status_history` — 업무 상태 변경 이력 (task_id, task_type, old_status, new_status, changed_by)

### 매출/계산서
- `invoice_records` — 세금계산서 발행·수정이력 (business_id, invoice_stage: subsidy_1st/subsidy_2nd/self_advance/self_balance/extra, record_type: original/revised/cancelled, issue_date, supply_amount, tax_amount, payment_date, payment_amount)

### AS 관리
- `as_records` — AS 건 관리 (business_id, receipt_date, work_date, receipt_content, work_content, as_manager_name, status: received/scheduled/in_progress/completed 등, is_paid_override, progress_notes JSONB)

### 예측마감 (설치비 지급)
- `installation_payments` — 설치비 지급 이력 (business_id, payment_type: forecast/final/adjustment, payment_category: base_installation/additional_construction/extra_installation, calculated_amount, actual_amount, payment_month YYYY-MM, status: pending/paid/adjusted/cancelled)
- `eungyeol_transfers` — 은결 월별 송금 기록 (transfer_date, transfer_amount, payment_month, status: pending/transferred/reconciled)
- `closing_records` — 월별 마감 상태 (closing_month, closing_type: forecast/final, status: open/closed/reopened)

### 알림
- `notifications` — 시스템 전역 알림 (title, message, category, priority, related_resource_type, expires_at)
- `task_notifications` — 개인 업무 알림 (user_id, task_id, business_name, message, notification_type, is_read)

### 대기환경 (현재 미활성)
- `air_permit_info` / `discharge_outlets` / `discharge_facilities` / `prevention_facilities` — 대기필증·배출구·방지시설 (현재 사용 안 함)
- `measurement_devices` / `measurement_history` — IoT 측정기기·데이터 (미구현)

## 개발 규칙

### 작업 방식
- 한 번에 하나의 기능만 구현한다
- 구현 후 반드시 브라우저에서 동작 확인한다
- 기존 동작하는 기능을 깨뜨리지 않는다
- 세션 종료 시 git commit + claude-progress.txt 업데이트

### 수정 시 오류 검증 (필수)
코드를 수정할 때 반드시 아래 절차를 따른다:

1. **수정 전**: 변경 대상 파일과 연관된 파일을 파악한다 (import 관계, 공유 타입, 공통 컴포넌트)
2. **수정 중**: 사용자가 요청한 의도를 정확히 반영한다. 추측으로 범위를 넓히지 않는다.
3. **수정 후 즉시 검증**:
   - `npm run build`를 실행하여 TypeScript 컴파일 오류가 없는지 확인한다
   - `npm run dev`로 개발 서버를 실행하여 브라우저에서 수정된 페이지를 직접 확인한다
   - 수정한 부분뿐 아니라 관련 기능(같은 페이지, 같은 데이터를 쓰는 다른 페이지)도 확인한다
4. **오류 발생 시**: 즉시 원인을 파악하고 수정한다. 해결이 안 되면 `git stash` 또는 `git checkout`으로 되돌린 뒤, 원인을 분석하고 다시 시도한다. 오류가 남아있는 상태로 세션을 종료하지 않는다.
5. **사용자 의도 확인**: 수정 결과가 사용자의 요청과 다르면, 임의로 판단하지 말고 사용자에게 확인한다.

### 코드 컨벤션
- 컴포넌트: PascalCase (예: BusinessSiteModal.tsx)
- 함수/변수: camelCase
- 타입: PascalCase + 접미사 Type 또는 Props (예: BusinessSiteType)
- Supabase 쿼리는 lib/ 폴더에 분리
- 한국어 UI 텍스트 직접 사용 (i18n 미적용 상태)

### Supabase 규칙
- 마이그레이션은 supabase/ 폴더에 SQL 파일로 관리
- RLS(Row Level Security) 정책 반드시 설정
- 테이블 변경 시 types/ 폴더의 타입도 함께 업데이트
- .env.local의 SUPABASE_URL, SUPABASE_ANON_KEY 사용

### 금지 사항
- .env.local 파일을 git에 커밋하지 않는다
- node_modules를 직접 수정하지 않는다
- business_sites 테이블의 기존 컬럼을 삭제하거나 이름을 변경하지 않는다
- 프로덕션 DB에 직접 DROP/TRUNCATE 하지 않는다
- feature_list.json의 테스트 항목을 삭제하거나 편집하지 않는다 (passes 필드만 변경 가능)
- 빌드 오류 또는 런타임 오류가 있는 상태로 커밋하지 않는다
- 사용자가 요청하지 않은 파일을 임의로 삭제하거나 대폭 변경하지 않는다
- 한 기능 수정 시 관련 없는 다른 기능을 동시에 변경하지 않는다

## 개발 서버 실행
```bash
npm install
npm run dev
# → http://localhost:3000
```

## 환경변수 (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
KAKAO_CLIENT_ID=<kakao-client-id>
NAVER_CLIENT_ID=<naver-client-id>
GOOGLE_CLIENT_ID=<google-client-id>
```

## 현재 진행 상태
> 최신 상태는 claude-progress.txt와 git log를 참고할 것

### 완료된 모듈
- 사업장 관리 (CRUD + 수정 모달)
- 매출 관리 (세금계산서, 입금 관리)
- 장비 재고 관리
- 소셜 로그인 (Kakao/Naver/Google)
- 권한 기반 페이지 접근 제어

### 진행 중
- 예측마감 시스템 (기본설치비 + 추가공사비 선지급 관리)
- 업무 게시판 (지시/수행/이관/협조)

### 예정
- IoT 센서 모니터링 대시보드 (MQTT + TimescaleDB)
- 전력 분석 및 화재 위험 알림
- 주간 업무 보고서 자동 생성

## 세션 시작 체크리스트
1. `pwd`로 작업 디렉토리 확인
2. `git log --oneline -10`으로 최근 커밋 확인
3. `cat claude-progress.txt`로 이전 세션 작업 확인
4. `npm run dev`로 개발 서버 실행
5. 기본 기능 동작 확인 (로그인 → 대시보드 → 사업장 목록)
6. feature_list.json에서 다음 작업할 기능 선택
7. 하나의 기능만 집중 구현

## 세션 종료 체크리스트
1. `npm run build`로 빌드 오류 없는지 확인
2. 구현한 기능 브라우저에서 테스트 완료
3. 기존 기능 깨지지 않았는지 관련 페이지 확인
4. 오류가 남아있다면 반드시 해결 후 진행
5. `git add . && git commit -m "설명적 커밋 메시지"`
6. claude-progress.txt에 작업 내용 요약 추가
7. feature_list.json의 완료된 항목 passes: true로 변경
