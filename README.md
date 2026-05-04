# Facility Manager

**블루온(주식회사 블루온) 환경설비 설치 종합 관리 플랫폼**

사업장 관리, 매출/비용 관리, 예측마감, 업무 게시판, 대기환경 관리를 하나의 시스템으로 통합한 내부 운영 플랫폼입니다.

---

## 주요 기능

### 사업장 관리
- 사업장 CRUD (등록 / 조회 / 수정 / 삭제)
- 장비 수량 관리 (pH 미터, 게이트웨이, 제조사 등)
- 진행 상태 추적 (수주 → 설치 → 완료)
- 사업장별 메모 관리

### 매출 관리
- 세금계산서 발행 및 수정·취소 이력 관리
- 청구 단계별 관리 (보조금 1·2차 / 자납 선수금·잔금 / 기타)
- 입금 관리 및 미수금 추적

### 예측마감 (설치비 지급)
- 기본설치비 / 추가공사비 / 기타 설치비 선지급 관리
- 월별 은결 송금 기록
- 예측마감 / 확정마감 상태 관리

### 업무 게시판
- 업무 유형별 관리 (자납 / 보조금 / AS / 대리점 / 외주 등)
- 담당자 지정 및 기한 관리
- 상태 변경 이력 추적
- 업무 알림 시스템

### AS 관리
- AS 접수 / 일정 / 진행 / 완료 단계 관리
- 유상/무상 구분
- 진행 메모 이력

### 회의록 관리
- 회의록 작성 및 편집
- 프레젠테이션 모드 (발표용 전체화면)
- 코멘트 기능

### 대기환경 관리
- 대기필증 정보 관리
- 배출구 / 배출시설 / 방지시설 등록
- IoT 측정기기 연동 (예정)

### 위키
- 내부 지식 관리 및 문서화

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| 인증 | 소셜 로그인 (Kakao / Naver / Google) + JWT |
| 배포 | Vercel |
| 패키지 매니저 | npm |

---

## 권한 체계

| 레벨 | 역할 | 접근 범위 |
|---|---|---|
| 1 | 일반 | 기본 업무 조회 및 처리 |
| 2 | 매출 조회 | 매출 / 세금계산서 열람 |
| 3 | 관리자 | 전체 기능 + 직원 관리 |

---

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
# → http://localhost:3000

# 모바일 테스트용 (네트워크 접근 허용)
npm run dev-mobile
```

---

## 환경변수 설정

`.env.local` 파일을 생성하고 아래 값을 설정합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>

KAKAO_CLIENT_ID=<kakao-oauth-client-id>
NAVER_CLIENT_ID=<naver-oauth-client-id>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
```

> `.env.local`은 절대 git에 커밋하지 않습니다.

---

## 프로젝트 구조

```
facility-manager/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── dashboard/        # 대시보드 및 주요 페이지
│   │   │   ├── business/     # 사업장 관리
│   │   │   ├── tasks/        # 업무 게시판
│   │   │   ├── revenue/      # 매출 관리
│   │   │   ├── closing/      # 예측마감
│   │   │   ├── as/           # AS 관리
│   │   │   ├── air/          # 대기환경 관리
│   │   │   ├── meeting/      # 회의록
│   │   │   └── wiki/         # 위키
│   │   └── api/              # API Routes
│   ├── components/           # 공통 컴포넌트
│   ├── lib/                  # Supabase 클라이언트, 유틸
│   ├── hooks/                # 커스텀 훅
│   └── types/                # TypeScript 타입 정의
├── supabase/                 # DB 마이그레이션 SQL
└── public/                   # 정적 파일
```

---

## 개발 현황

### 완료
- 사업장 관리 (CRUD + 수정 모달)
- 매출 관리 (세금계산서 / 입금 관리)
- 장비 재고 관리
- 소셜 로그인 (Kakao / Naver / Google)
- 권한 기반 페이지 접근 제어
- 업무 게시판 (상태 관리 + 알림)
- 회의록 (편집 + 프레젠테이션 모드)
- AS 관리
- 대기환경 기본 관리

### 진행 중
- 예측마감 시스템 (기본설치비 + 추가공사비 선지급)

### 예정
- IoT 센서 모니터링 대시보드 (MQTT + TimescaleDB)
- 전력 분석 및 화재 위험 알림
- 주간 업무 보고서 자동 생성
