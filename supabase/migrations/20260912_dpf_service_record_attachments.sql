-- DPF 접수이력(dpf_service_records) 1건당 크린어스 관찰(§2.2) 12개 고정 슬롯 첨부파일
-- 저장은 비공개 Supabase Storage 버킷(dpf-attachments) + 서명 URL 방식(코드가 런타임에 버킷 자동 생성 — 이 마이그레이션엔 테이블만 포함)
create table dpf_service_record_attachments (
  id uuid primary key default gen_random_uuid(),
  -- on delete cascade는 dpf_service_records가 실제로 하드 삭제될 때만 발동한다(평소엔 is_deleted 소프트 삭제라 발동 안 함)
  record_id uuid not null references dpf_service_records(id) on delete cascade,
  slot_key text not null check (slot_key in (
    'vehicle_photo', 'smoke_meter',
    'filter_cross_section_before', 'filter_cross_section_after',
    'filter_serial_before', 'filter_serial_after',
    'self_diagnostic_pressure_before', 'self_diagnostic_pressure_after',
    'smoke_test_result_before', 'smoke_test_result_after',
    'as_parts', 'as_processing'
  )),
  storage_path text not null,       -- dpf-attachments 버킷 내 경로(공개 URL 아님, createSignedUrl로만 접근)
  uploaded_by uuid references employees(id),
  created_at timestamptz not null default now()
);
create unique index on dpf_service_record_attachments(record_id, slot_key);

alter table dpf_service_record_attachments enable row level security;
drop policy if exists "dpf_service_record_attachments_read" on dpf_service_record_attachments;
drop policy if exists "dpf_service_record_attachments_write" on dpf_service_record_attachments;
create policy "dpf_service_record_attachments_read" on dpf_service_record_attachments
  for select using (auth.role() = 'authenticated');
create policy "dpf_service_record_attachments_write" on dpf_service_record_attachments
  for all using (
    exists (select 1 from employees where id = auth.uid() and permission_level >= 2)
  );
