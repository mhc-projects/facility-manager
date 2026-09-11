# 컨텍스트 노트 — DPF 서비스 이력(AS/크리닝/물류) (2026-09-11)

## 배경
DPF 담당자들이 익숙해하는 크린어스(제조사) DEAR System의 부착현황/물류관리/접수현황 화면 구조를 로그인해서 직접 조사하고,
facility-manager `/dpf` 모듈에 이식할 설계를 작성함. 전체 설계는 `../dpf-as-logistics-design.md` 참고.

## 핵심 결정 (사용자 확정)
- 본사/협력사 접수경로 구분 없음 — 블루온은 콜센터가 전화 전부 직접 받음.
- 크린어스는 vendor enum에 지금 추가 안 함 (fujino/mz 유지).
- 첨부파일(12슬롯) 구조는 1단계에서 만들지 않음 — 담당자 요구 구체화되면 5단계로.
- 연장 워크플로우는 전자결재 미연동, 단순 boolean 필드.
- 회차(round_no)는 전환(크리닝↔AS) 시 새 category 기준 재채번, 원래 분류는 `converted_from_category`에만 흔적.
- 변경정보 오버레이는 `dpf_vehicles`에 컬럼 추가 방식(파생 계산 아님) — 부착현황 목록에서 조인 없이 보여주기 위함.

## 어드바이저 검토에서 나온 수정 (2026-09-11, 구현 전)
1차 설계안을 어드바이저에게 검토받아 6개 필수 수정 + 5개 권장 수정을 반영함 (설계 문서 각 절에 타임스탬프로 표시돼 있음).
- **round_no 채번을 API가 아니라 DB 트리거로**: Supabase JS 호출에서 "MAX 조회→+1→INSERT"를 하면 동시 접수 시 경쟁 상태 발생.
  전자결재 approve/submit 라우트가 `lib/supabase-direct`의 `transaction()` 헬퍼를 빠뜨려 부분 업데이트 버그가 났던 전례가 있어서
  ([[project_approval_pending_fixes]] 참고), API 코드가 매번 기억해야 하는 방식 대신 DB 트리거로 강제함.
- **오버레이 write-back 대상 재정리**: 1차 초안은 `current_vin_override`까지 자동 write-back한다고 적었지만, 접수 등록 폼에
  차량번호/차대번호 입력란이 아예 없어서(§2.2 관찰 내용에 없음) 자동화할 소스가 없었음. `current_plate_number`/`current_vin_override`/
  `is_special_management`/`is_special_sale`은 전부 수동 전용(VehicleFormModal), 연락처·출동지역만 자동 write-back으로 수정.
- **처리내용(processing_content) 컬럼 누락 발견** — 내역 테이블의 3번째 텍스트 필드가 스키마에 빠져 있었음. 추가.
- **삭제≠취소**: 협회청구일자를 들고 있는 원장을 하드 삭제하면 안 됨. `is_deleted` 소프트 삭제 + `status`에 `cancelled` 추가.
- **지자체/처리점은 자유 텍스트**: 크린어스의 코드 테이블(지자체 168개 등)은 우리 쪽에 없음. `local_gov_code`/`service_branch_id`를
  `local_government`/`service_branch` 자유 텍스트로 변경. 담당AS기사/처리기사도 1단계는 자유 텍스트, employees FK 연동은 후속 과제.
- **특판(is_special_sale)은 차량 속성**: 크린어스 필터에서 특판은 접수 건이 아니라 계약(차량) 단위 속성이었음 — `dpf_vehicles`로 이동.
- **1단계 API 라우트를 vin 스코프 서브레코드 패턴으로**: 처음엔 `/api/dpf/service-records` 최상위 엔드포인트를 1단계에 넣었는데,
  기존 `installations`/`inspections` 라우트와 패턴을 맞추는 게 맞음 — 최상위 통합 리스트 엔드포인트는 2단계(접수현황 페이지)로 이동.

## 미관찰 (구현 시 주의)
- 크린어스 "서류 보기" 상세 화면 — 클릭이 반응하지 않아 구조를 못 봄. 첨부파일 설계(§4.7)는 등록 폼의 파일 슬롯에서 유추한 것.
- 크린어스 "접수종류" 드롭다운 옵션 — 클릭 위치가 빗나가서 못 엶. 1단계에서는 `category` 자체를 접수종류로 취급.

## 마이그레이션 핸드오프 상태
`supabase/migrations/20260911_dpf_service_records.sql` 작성 완료(2026-09-11). 어드바이저 2차 검토에서 `current_vin_override`/
`current_plate_number` 타입이 설계 초안 그대로면 실제 데이터(비표준 VIN, 지역+번호 합산 차량번호)를 못 받는다는 지적을 받아
`20260424_dpf_vin_length.sql`을 확인하고 `dpf_vehicles.vin`(VARCHAR(20))/`plate_number`(VARCHAR(50))와 동일하게 맞춤.
트리거에 `converted_from_category` 자동 기록, `vehicle_id` UPDATE 방어, `reception_date DEFAULT CURRENT_DATE`도 같은 리뷰에서 추가.
**사용자에게 전달 전 상태 — 아직 실행 요청 안 함.** 전달 후 사용자가 Supabase SQL 에디터에서 직접 실행하고 결과(성공/에러)를
알려주면 그 다음(`types/dpf.ts`)으로 진행. 에이전트가 DB에 직접 붙어서 실행하지 않음([[feedback_supabase_sql]],
[[project_hardcoded_db_password_incident]] 때문에 자격 증명도 직접 다루지 않음).

## 1단계 사후 검토 (2026-09-11, 어드바이저)
1단계 완료 후 어드바이저에게 "깔끔하게 됐는지" 재검토 요청 — 결과: 설계한 규칙(트리거 채번, 전환, write-back 최신 레코드 규칙, 소프트 삭제)
전부 브라우저 검증으로 실제 확인됨, 커밋 분리도 계획대로. 잔여 3건:
1. 브라우저 검증 중 실제 차량(260132205738, 이채규 소유)에 테스트 데이터(접수 이력 2건 + 연락처 010-9999-0000)가 남음 —
   하드 삭제 SQL을 사용자에게 전달, 직접 실행 대기 중. `is_deleted` 소프트 삭제(§4.10)와는 별개 — 이건 실제 업무 데이터가 아니라
   순수 테스트 흔적이라 하드 삭제가 맞다.
2. 설계문서 §7이 여전히 `PATCH`로 적혀 있었음(실제 구현은 PUT) — 문서만 안 맞았던 것, 수정함.
3. write-back은 구현했지만 그 값을 보여주는 화면이 없었음(`VehicleFormModal`/`BasicInfoTab` 둘 다 오버레이 필드 미노출) —
   1단계 체크리스트엔 없던 항목이라 결함은 아니지만, 2단계 범위로 명시적으로 추가함(`BasicInfoTab`에 읽기 전용 섹션).

## 2단계 계획 (2026-09-11, 어드바이저 검토로 구체화)
- 목록 API는 새로 설계하지 않고 `/api/dpf/search/route.ts`(기존 차량 검색 페이지네이션 라우트)의 쿼리 파라미터/응답 모양을 그대로 복제.
- 통계는 저장 카운터나 RPC 없이 6개 count 쿼리 병렬 호출로 충분(이 규모에서).
- 필터 UI도 새로 디자인하지 않고 `/dpf`(부착현황) 페이지의 검색행+필터패널+탭 패턴을 재사용.
- 접수현황 목록에 "빠른 등록" 버튼을 넣지 않기로 명시적으로 결정 — 크린어스도 등록은 차량 쪽에서만 하고, 신규 접수용 차량 선택 UI는
  3단계(부착현황 행 액션 버튼) 몫. 여기서 조급하게 만들면 3단계와 중복 설계하게 됨.
- 사이드바(`AdminLayout.tsx`)의 `DPF업무` 그룹은 현재 "차량 관리" 1개 항목뿐(중첩 없는 평면 구조) — "접수현황"을 형제 항목으로 추가.
  아이콘은 이미 import돼 있는 `ClipboardList` 재사용, 새 import 불필요.
- 마이그레이션 없음 — 2단계는 순수 조회 레이어. 필요하다고 느껴지면 멈추고 먼저 확인하기로 함.

## 미수정(후속 과제로 명시적으로 미룸)
- `assigned_as_technician`/`processing_technician`의 `employees` 테이블 FK 연동 (1단계는 자유 텍스트).
- 처리점 자동완성/드롭다운 (실제 처리점 목록이 쌓인 뒤 UI에서만).
- 첨부파일 슬롯 구조 (§4.7, 5단계 보류).
- 크린어스 vendor 추가 여부 (필요시 후속).
