---
name: dpf
description: Facility Manager 프로젝트의 DPF(매연저감장치) 차량관리/사후관리(AS·크리닝·물류) 시스템 참조. dpf_service_records 등록/전환/집계, 부착현황 파생 컬럼 로직 수정 시 사용한다.
---

# DPF 매연저감장치 관리

## 핵심 테이블
- `dpf_vehicles` — 차량 마스터(vendor: fujino/mz). 변경정보 오버레이 8컬럼(2026-09-11): write-back 대상(current_contact_wireless/wired, dispatch_area_primary/secondary — 접수 시 자동 갱신) vs 수동 전용(current_plate_number, current_vin_override, is_special_management, is_special_sale — VehicleFormModal에서만 수정).
- `dpf_service_records` — AS/크리닝/물류(부품전달/요소수)/엔진교체 통합 원장. `as_records`(사업장 AS, [[as-management]] 스킬 참고)와는 완전히 별개 시스템 — 대상 엔티티가 다르다(차량 vs 사업장), 연결 컬럼 없음. 접수현황/물류관리/부착현황 3화면은 이 표를 서로 다른 category 집합으로 필터링한 뷰일 뿐, 별도 테이블이 아니다.
- `dpf_device_installations` — 설치/탈착/교체 이력. **엠즈(mz) 벤더 차량은 이 테이블이 애초에 비어 있다** — 엠즈는 자체 DB 파일을 그대로 가져와 차량 마스터 필드만 채우고, 설치이력/성능검사/보조금 서브테이블은 임포트 경로 자체가 없다(103ec33 커밋). `/dpf/[vin]`의 설치이력/성능검사/보조금 탭이 `vendors: ['fujino']`로만 노출되는 이유이자, 부착현황 목록의 철부횟수가 엠즈 차량에서 항상 0으로 돌아오는 이유(화면에는 `-`로 표시해 "추적 안 함"과 "실제 0회"를 구분).

## round_no(회차) — DB 트리거로만 채번, API에서 계산 금지
- `(vehicle_id, category)` 단위로 증가. `dpf_service_records_set_round_no()` 트리거가 INSERT 시 또는 UPDATE로 category가 바뀔 때만 재계산(`MAX(round_no)+1`).
- ⚠️ API/클라이언트가 round_no를 직접 계산해서 넣으면 안 된다 — "MAX 조회 → +1 → INSERT"를 일반 호출로 하면 동시 접수 시 경쟁 상태(race)가 생긴다(전자결재 approve/submit이 트랜잭션 헬퍼를 빠뜨려 부분 업데이트 버그가 났던 전례를 반면교사 삼아 DB 트리거로 강제, [[project_approval_pending_fixes]] 참고).
- 유니크 인덱스(`vehicle_id, category, round_no`) 위반(`23505`) 시 API가 1회만 재시도한다 — 트리거가 재계산하므로 재시도하면 해소됨. 회차 번호에 이빨(gap)이 생기는 것은 허용한다(취소 건도 번호를 먹는다).

## 전환(conversion) — 크리닝↔AS
접수 도중 분류가 바뀌면 `converted_from_category`에 원래 분류를 남기고, `round_no`는 **새 category 기준으로 재채번**한다(원래 채번을 유지하지 않음). 트리거가 `category is distinct from old.category`일 때 자동 처리한다.

## 변경정보 오버레이 write-back — "최신 레코드일 때만"
연락처(`contact_wireless`/`contact_wired`)·출동지역(`dispatch_area_primary`/`secondary`)은 접수 등록/수정 시 `dpf_vehicles` 오버레이 컬럼에 자동 반영되지만, **PUT(수정)은 그 레코드가 해당 차량의 최신 레코드(reception_date desc, created_at desc)일 때만 write-back한다.** 오래된 티켓을 수정한다고 이후 더 최신 접수에서 확인된 정보를 덮어쓰면 안 되기 때문이다. POST(신규 접수)는 항상 최신이므로 조건 없이 write-back한다.

## 삭제 ≠ 취소 (두 개의 독립된 축)
- `is_deleted`(소프트 삭제) — 협회청구 이력(`association_billing_date`)이 걸린 원장을 보존하기 위해 하드 삭제하지 않는다. DELETE API는 `is_deleted=true`로만 갱신한다.
- `status='cancelled'`(취소) — 고객이 접수를 철회한 경우. **집계 시 두 축을 헷갈리지 말 것**: 접수현황 요약 바(대기/완료)와 부착현황 파생 컬럼(크리닝횟수/AS횟수)은 `cancelled`를 카운트에서 제외하지만, 최근접수일/마지막처리일 같은 "날짜" 집계는 취소 건도 포함한다(접수·처리 자체는 실제 발생했으므로). 새 집계를 추가할 때마다 이 둘 중 어느 쪽 성격인지 먼저 정해야 한다.

## 부착현황(`/dpf`) 파생 컬럼 — 배치 조회, 메인 목록에 조인 금지
`GET /api/dpf/service-records/derived-stats?vehicle_ids=...`가 화면에 보이는 vehicle_id만 모아 `dpf_service_records`+`dpf_device_installations`를 별도로 조회하고 애플리케이션 코드에서 집계한다(PostgREST에 GROUP BY가 없다). `/api/dpf/search`(메인 목록)에는 손대지 않는다 — 새 파생 지표를 추가할 때도 이 배치 API에 필드를 얹지, 메인 쿼리에 조인하지 않는다.

## 접수현황/물류관리 — 같은 원장의 필터 뷰, 별도 화면 아님
`/dpf/service`(접수현황)와 `/dpf/service/logistics`(물류관리)는 둘 다 `components/dpf/DpfServiceListView.tsx`
(`mode: 'reception' | 'logistics'`) 하나를 공유한다. 새 필터/집계를 추가할 땐 엔드포인트를 분리하지 않고 기존
`GET /api/dpf/service-records`·`/stats`에 파라미터/필드를 additive로 얹는 것이 이 프로젝트의 확립된 패턴이다
(예: `/stats`는 clean/as/cs 5필드에 urea/parts 4필드를 더해 9필드짜리 응답 하나를 쓴다 — reception 화면은 뒤 4개를,
logistics 화면은 앞 5개를 무시할 뿐이다). `category` 콤마 리스트 필터가 이미 있어서 "물류만 보기"는 클라이언트가
`category=parts_delivery,urea`를 보내는 것으로 충분 — 서버 쪽에 물류 전용 분기를 새로 만들지 않는다.

## 지자체/처리점/기사 — 자유 텍스트, 코드 테이블 없음
`local_government`/`service_branch`/`assigned_as_technician`/`processing_technician` 전부 자유 텍스트다. 참조할 코드 테이블(크린어스의 지자체 168개 등)이 이 프로젝트에 없어서다 — 드롭다운/자동완성을 넣으려면 먼저 실제 값이 쌓인 뒤 UI에서만 구현해야지, 코드 테이블을 새로 설계하면 안 된다.

## 설계/구현 이력
전체 설계 배경과 단계별 결정 근거는 `claudedocs/dpf-as-logistics-design.md`(크린어스 DEAR System 화면 분석 포함), 단계별 체크리스트/발견사항은 `claudedocs/dpf-service-records/checklist.md`·`context-notes.md` 참고.
