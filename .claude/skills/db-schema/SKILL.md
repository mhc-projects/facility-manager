---
name: db-schema
description: Facility Manager 프로젝트의 핵심 Supabase DB 테이블 스키마 참조. DB 쿼리 작성, 컬럼 확인, 마이그레이션 등 DB 관련 작업을 할 때 사용한다.
---

# 핵심 DB 테이블

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

### DPF (매연저감장치)
- `dpf_vehicles` — DPF 차량 마스터 (vin, plate_number, owner_name/contact/address, local_government, device_serial, installation_date, vendor: fujino/mz, is_active/is_deleted). 2026-09-11 변경정보 오버레이 컬럼 추가: `current_contact_wireless`/`current_contact_wired`/`dispatch_area_primary`/`dispatch_area_secondary`(접수 시 자동 write-back), `current_plate_number`/`current_vin_override`/`is_special_management`/`is_special_sale`(수동 전용, VehicleFormModal에서만 수정)
- `dpf_service_records` — AS/크리닝/물류(부품전달·요소수)·엔진교체 접수·처리 원장 (vehicle_id, category: as/clean/cs/parts_delivery/urea/engine_replace, round_no: (vehicle_id, category) 내 순번·DB 트리거가 채번, status: in_progress/completed/cancelled, is_deleted 소프트삭제, converted_from_category: 전환 시 트리거가 자동 기록). 사업장 귀속 `as_records`와는 대상 엔티티가 다른 별개 시스템 — 상세는 `claudedocs/dpf-as-logistics-design.md` 참고.
- `dpf_device_installations` / `dpf_performance_inspections` / `dpf_subsidy_applications` / `dpf_call_monitoring` — 차량별 설치·검사·보조금·콜모니터링 이력 (각각 vehicle_id FK)

### 대기환경
- `air_permit_info` — 대기필증 메인 테이블 (업종, 최초신고일, 가동개시일, 사업장 연결)
- `discharge_outlets` — 배출구 (배출구 번호/이름, Gateway 정보, air_permit_id)
- `discharge_facilities` — 배출시설 (시설명, 용량, 수량, outlet_id)
- `prevention_facilities` — 방지시설 (시설명, 용량, 수량, outlet_id)
- `measurement_devices` / `measurement_history` — IoT 측정기기·데이터 (미구현)
