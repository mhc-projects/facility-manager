'use client';

import { useState, useEffect, useRef } from 'react';
import Modal, { ModalActions } from '@/components/ui/Modal';
import { DpfServiceRecord, DpfServiceCategory, DpfAttachmentSlotKey } from '@/types/dpf';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vin: string;
  record?: DpfServiceRecord;
  initialCategory?: DpfServiceCategory;
  onAttachmentsChange?: (recordId: string, count: number) => void;
}

export const CATEGORY_OPTIONS: { value: DpfServiceCategory; label: string }[] = [
  { value: 'as', label: 'AS' },
  { value: 'clean', label: '크리닝' },
  { value: 'cs', label: '상담종료' },
  { value: 'parts_delivery', label: '부품전달' },
  { value: 'urea', label: '요소수' },
  { value: 'engine_replace', label: '엔진교체' },
];

export const CATEGORY_LABELS: Record<DpfServiceCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label])
) as Record<DpfServiceCategory, string>;

export const LOGISTICS_CATEGORIES: DpfServiceCategory[] = ['parts_delivery', 'urea'];

// 첨부파일 12슬롯(§2.2 크린어스 관찰 그대로) — key↔한글 라벨 단일 소스
export const ATTACHMENT_SLOTS: { key: DpfAttachmentSlotKey; label: string }[] = [
  { key: 'vehicle_photo', label: '차량사진' },
  { key: 'smoke_meter', label: '매연측정기' },
  { key: 'filter_cross_section_before', label: '필터전단면 클리닝전' },
  { key: 'filter_cross_section_after', label: '필터전단면 클리닝후' },
  { key: 'filter_serial_before', label: '필터일련번호 클리닝전' },
  { key: 'filter_serial_after', label: '필터일련번호 클리닝후' },
  { key: 'self_diagnostic_pressure_before', label: '자가진단장치배압 전' },
  { key: 'self_diagnostic_pressure_after', label: '자가진단장치배압 후' },
  { key: 'smoke_test_result_before', label: '매연검사결과표 전' },
  { key: 'smoke_test_result_after', label: '매연검사결과표 후' },
  { key: 'as_parts', label: 'AS부품' },
  { key: 'as_processing', label: 'AS처리' },
];

interface AttachmentData { url: string; created_at: string; ext: string }

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf';
const ATTACHMENT_ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;

function isImageExt(ext: string) {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext.toLowerCase());
}

export default function ServiceRecordFormModal({ isOpen, onClose, onSuccess, vin, record, initialCategory, onAttachmentsChange }: Props) {
  const isEdit = Boolean(record);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const recordId = record?.id;
  const recordIdRef = useRef(recordId);
  recordIdRef.current = recordId;
  const [attachments, setAttachments] = useState<Record<string, AttachmentData>>({});
  const [attachmentsLoaded, setAttachmentsLoaded] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState<Record<string, boolean>>({});
  const [attachmentError, setAttachmentError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setValues(record ? { ...(record as unknown as Record<string, unknown>) } : defaultValues(initialCategory));
    }
  }, [isOpen, record, initialCategory]);

  useEffect(() => {
    setAttachments({});
    setAttachmentsLoaded(false);
    setAttachmentUploading({});
    setAttachmentError('');
    if (isOpen && recordId) {
      fetchAttachments(recordId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recordId]);

  // 목록/카드는 이 모달 상태를 직접 구독하지 않으므로(취소/X로 닫으면 onSuccess가 안 불려 상위 refetch가 없다),
  // 업로드·삭제로 attachments가 바뀔 때마다 부모에 개수를 그때그때 반영한다. 단, 서버 확인 전(attachmentsLoaded
  // false, 모달을 막 열어 초기화만 된 상태)에는 호출하지 않는다 — 안 그러면 조회 실패 시 0으로 잘못 패치해서
  // 기존에 있던 첨부파일의 배지를 지워버린다.
  useEffect(() => {
    if (recordId && attachmentsLoaded) onAttachmentsChange?.(recordId, Object.keys(attachments).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments, recordId, attachmentsLoaded]);

  async function fetchAttachments(id: string) {
    try {
      const res = await fetch(`/api/dpf/service-records/${id}/attachments`);
      const data = await res.json();
      // 조회 중 모달이 다른 레코드로 전환됐다면(업로드가 오래 걸려 응답이 늦게 온 경우) 반영하지 않는다
      if (res.ok && id === recordIdRef.current) {
        setAttachments(data);
        setAttachmentsLoaded(true);
      }
    } catch {
      // 조회 실패는 조용히 무시 — 업로드/삭제는 그대로 시도 가능(단, attachmentsLoaded는 false로 남겨
      // 부모 배지를 잘못된 0으로 패치하지 않는다)
    }
  }

  async function handleAttachmentUpload(slotKey: DpfAttachmentSlotKey, file: File) {
    if (!recordId) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ATTACHMENT_ALLOWED_EXT.includes(ext)) {
      setAttachmentError('허용되지 않는 파일 형식입니다(jpg/png/webp/pdf만 가능)');
      return;
    }
    if (file.size > ATTACHMENT_MAX_SIZE) {
      setAttachmentError('파일 크기는 10MB를 초과할 수 없습니다');
      return;
    }
    setAttachmentError('');
    setAttachmentUploading(prev => ({ ...prev, [slotKey]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('slot_key', slotKey);
      const res = await fetch(`/api/dpf/service-records/${recordId}/attachments`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setAttachmentError(data.error ?? '업로드에 실패했습니다'); return; }
      await fetchAttachments(recordId);
    } catch {
      setAttachmentError('네트워크 오류가 발생했습니다');
    } finally {
      setAttachmentUploading(prev => ({ ...prev, [slotKey]: false }));
    }
  }

  async function handleAttachmentDelete(slotKey: DpfAttachmentSlotKey) {
    const targetId = recordId;
    if (!targetId) return;
    setAttachmentError('');
    setAttachmentUploading(prev => ({ ...prev, [slotKey]: true }));
    try {
      const res = await fetch(`/api/dpf/service-records/${targetId}/attachments/${slotKey}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setAttachmentError(data.error ?? '삭제에 실패했습니다'); return; }
      // 삭제 중 모달이 다른 레코드로 전환됐다면 그 레코드의 로컬 상태를 건드리지 않는다
      if (targetId !== recordIdRef.current) return;
      setAttachments(prev => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
    } catch {
      setAttachmentError('네트워크 오류가 발생했습니다');
    } finally {
      setAttachmentUploading(prev => ({ ...prev, [slotKey]: false }));
    }
  }

  function set(key: string, val: unknown) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  const category = values.category as DpfServiceCategory | undefined;
  const isLogistics = category ? LOGISTICS_CATEGORIES.includes(category) : false;

  async function handleSubmit() {
    if (!values.category) { setError('분류를 선택해주세요'); return; }
    setSaving(true);
    setError('');
    try {
      const base = `/api/dpf/vehicles/${encodeURIComponent(vin)}/service-records`;
      const url = isEdit ? `${base}/${(record as DpfServiceRecord).id}` : base;

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(values)),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '저장에 실패했습니다'); return; }

      onSuccess();
      onClose();
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isEdit ? '수정' : '접수 등록'} — ${category ? CATEGORY_LABELS[category] : 'AS/크리닝'}`}
      size="xl"
      actions={
        <>
          <ModalActions.Cancel onClick={onClose} />
          <ModalActions.Confirm onClick={handleSubmit} loading={saving}>
            {isEdit ? '수정 저장' : '접수 등록'}
          </ModalActions.Confirm>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {isEdit && record?.round_no != null && (
          <div className="text-xs text-gray-500">
            {CATEGORY_LABELS[record.category]} {record.round_no}회차
            {record.converted_from_category && (
              <span className="ml-1.5 text-amber-600">
                ({CATEGORY_LABELS[record.converted_from_category]}에서 전환됨)
              </span>
            )}
          </div>
        )}

        <Section title="분류 / 상태">
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="분류" value={values.category} onChange={v => set('category', v)} options={CATEGORY_OPTIONS} required />
            <SelectField
              label="상태"
              value={values.status}
              onChange={v => set('status', v)}
              options={[
                { value: 'in_progress', label: '진행중' },
                { value: 'completed', label: '완료' },
                { value: 'cancelled', label: '취소' },
              ]}
            />
            <Field label="접수일" name="reception_date" value={values.reception_date} onChange={v => set('reception_date', v)} type="date" />
            <Field label="지자체" name="local_government" value={values.local_government} onChange={v => set('local_government', v)} />
            <Field label="처리점" name="service_branch" value={values.service_branch} onChange={v => set('service_branch', v)} />
          </div>
        </Section>

        <Section title="접수 / 처리 내용">
          <div className="grid grid-cols-2 gap-4">
            <TextArea label="접수내용" name="reception_content" value={values.reception_content} onChange={v => set('reception_content', v)} />
            <TextArea label="세부내용" name="detail_content" value={values.detail_content} onChange={v => set('detail_content', v)} />
            <div className="col-span-2">
              <TextArea label="처리내용" name="processing_content" value={values.processing_content} onChange={v => set('processing_content', v)} />
            </div>
          </div>
        </Section>

        <Section title="담당자 / 처리일">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="담당AS기사" name="assigned_as_technician" value={values.assigned_as_technician} onChange={v => set('assigned_as_technician', v)} />
            <Field label="처리기사" name="processing_technician" value={values.processing_technician} onChange={v => set('processing_technician', v)} />
            <Field label="기사처리일자" name="technician_processed_at" value={values.technician_processed_at} onChange={v => set('technician_processed_at', v)} type="date" />
            <Field label="처리일자" name="processed_at" value={values.processed_at} onChange={v => set('processed_at', v)} type="date" />
            <Field label="완료일자" name="completed_at" value={values.completed_at} onChange={v => set('completed_at', v)} type="date" />
          </div>
        </Section>

        <Section title="접수사항">
          <div className="flex flex-wrap gap-4">
            <CheckboxField label="긴급" checked={Boolean(values.is_urgent)} onChange={v => set('is_urgent', v)} />
            <CheckboxField label="통화요청" checked={Boolean(values.needs_callback)} onChange={v => set('needs_callback', v)} />
            <CheckboxField label="출동" checked={Boolean(values.is_dispatch)} onChange={v => set('is_dispatch', v)} />
            <CheckboxField label="입고" checked={Boolean(values.is_dropoff)} onChange={v => set('is_dropoff', v)} />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field label="필터" name="filter_type" value={values.filter_type} onChange={v => set('filter_type', v)} />
            <Field label="회수필터" name="collected_filter" value={values.collected_filter} onChange={v => set('collected_filter', v)} />
            <Field label="교체필터" name="replaced_filter" value={values.replaced_filter} onChange={v => set('replaced_filter', v)} />
          </div>
        </Section>

        <Section title="연락처 / 출동지역">
          <div className="grid grid-cols-2 gap-4">
            <Field label="연락처(무선)" name="contact_wireless" value={values.contact_wireless} onChange={v => set('contact_wireless', v)} />
            <Field label="연락처(유선)" name="contact_wired" value={values.contact_wired} onChange={v => set('contact_wired', v)} />
            <Field label="출동지역 1" name="dispatch_area_primary" value={values.dispatch_area_primary} onChange={v => set('dispatch_area_primary', v)} />
            <Field label="출동지역 2" name="dispatch_area_secondary" value={values.dispatch_area_secondary} onChange={v => set('dispatch_area_secondary', v)} />
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            이 접수 건이 해당 차량의 최신 접수일 때만 차량 정보의 변경정보에 자동 반영됩니다.
          </p>
        </Section>

        <Section title="비용 / 협회청구">
          <div className="grid grid-cols-3 gap-4">
            <SelectField
              label="비용"
              value={values.cost_type}
              onChange={v => set('cost_type', v)}
              options={[
                { value: 'paid', label: '유상' },
                { value: 'free', label: '무상' },
                { value: 'mixed', label: '유/무상' },
              ]}
            />
            <Field label="협회청구일자" name="association_billing_date" value={values.association_billing_date} onChange={v => set('association_billing_date', v)} type="date" />
            <SelectField
              label="청구상태"
              value={values.billing_status}
              onChange={v => set('billing_status', v)}
              options={[
                { value: 'none', label: '청구 전' },
                { value: 'billed', label: '청구완료' },
                { value: 'unbillable_reception', label: '지급불가(접수)' },
                { value: 'unbillable_completion', label: '지급불가(완료)' },
                { value: 'held', label: '보류' },
              ]}
            />
          </div>
        </Section>

        {isLogistics && (
          <Section title="물류 (부품전달 / 요소수)">
            <div className="grid grid-cols-2 gap-4">
              <Field label="택배사" name="courier" value={values.courier} onChange={v => set('courier', v)} />
              <SelectField
                label="접수 유형"
                value={values.delivery_request_type}
                onChange={v => set('delivery_request_type', v)}
                options={[
                  { value: 'request', label: '요청' },
                  { value: 'fixed', label: '고정' },
                ]}
              />
              <div className="col-span-2">
                <TextArea label="배송주소" name="delivery_address" value={values.delivery_address} onChange={v => set('delivery_address', v)} />
              </div>
            </div>
          </Section>
        )}

        <Section title="연장">
          <div className="flex items-center gap-6">
            <CheckboxField label="연장 요청" checked={Boolean(values.extension_requested)} onChange={v => set('extension_requested', v)} />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-700">승인</span>
              {[{ v: true, label: '승인' }, { v: false, label: '반려' }, { v: null, label: '미정' }].map(({ v, label }) => (
                <label key={label} className="flex items-center gap-1 ml-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={(values.extension_approved ?? null) === v}
                    onChange={() => set('extension_approved', v)}
                    className="text-blue-600"
                  />
                  <span className="text-xs">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <TextArea label="연장 사유" name="extension_note" value={values.extension_note} onChange={v => set('extension_note', v)} />
          </div>
        </Section>

        {isEdit && recordId && (
          <Section title="첨부파일">
            {attachmentError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {attachmentError}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {ATTACHMENT_SLOTS.map(slot => (
                <AttachmentSlotView
                  key={slot.key}
                  slot={slot}
                  data={attachments[slot.key]}
                  uploading={Boolean(attachmentUploading[slot.key])}
                  onUpload={file => handleAttachmentUpload(slot.key, file)}
                  onDelete={() => handleAttachmentDelete(slot.key)}
                />
              ))}
            </div>
          </Section>
        )}

        <Section title="비고">
          <TextArea label="비고" name="notes" value={values.notes} onChange={v => set('notes', v)} hideLabel />
        </Section>
      </div>
    </Modal>
  );
}

// ─── 섹션/필드 컴포넌트 ────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{title}</h4>
      {children}
    </div>
  );
}

function Field({
  label, name, value, onChange, type = 'text', required, placeholder,
}: {
  label: string; name: string; value: unknown; onChange: (v: unknown) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value != null ? String(value) : ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function TextArea({
  label, name, value, onChange, hideLabel,
}: {
  label: string; name: string; value: unknown; onChange: (v: string) => void; hideLabel?: boolean;
}) {
  return (
    <div>
      {!hideLabel && <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>}
      <textarea
        value={value != null ? String(value) : ''}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options, required,
}: {
  label: string; value: unknown; onChange: (v: string) => void;
  options: { value: string; label: string }[]; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        value={value != null ? String(value) : ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option value="">선택...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded text-blue-600" />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function AttachmentSlotView({
  slot, data, uploading, onUpload, onDelete,
}: {
  slot: { key: DpfAttachmentSlotKey; label: string };
  data?: AttachmentData;
  uploading: boolean;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  const inputId = `attachment-input-${slot.key}`;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onUpload(file);
  }

  return (
    <div className="border border-gray-200 rounded-lg p-2 flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gray-600 truncate" title={slot.label}>{slot.label}</span>

      {data ? (
        isImageExt(data.ext) ? (
          <a href={data.url} target="_blank" rel="noopener noreferrer">
            <img src={data.url} alt={slot.label} className="w-full h-20 object-cover rounded border border-gray-100" />
          </a>
        ) : (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center h-20 text-xs text-blue-600 underline bg-gray-50 rounded"
          >
            PDF 보기
          </a>
        )
      ) : (
        <label
          htmlFor={inputId}
          className="flex items-center justify-center h-20 border border-dashed border-gray-300 rounded text-xs text-gray-400 cursor-pointer hover:bg-gray-50"
        >
          {uploading ? '업로드 중...' : '파일 선택'}
        </label>
      )}

      <input
        id={inputId}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        aria-label={`${slot.label} 파일 선택`}
        onChange={handleChange}
        disabled={uploading}
        className="hidden"
      />

      {data && (
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
            {uploading ? '업로드 중...' : '교체'}
          </label>
          <button
            type="button"
            onClick={onDelete}
            disabled={uploading}
            className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 유틸 ───────────────────────────────────────────────────

function defaultValues(initialCategory?: DpfServiceCategory): Record<string, unknown> {
  return {
    category: initialCategory ?? '',
    status: 'in_progress',
    reception_date: new Date().toISOString().split('T')[0],
    local_government: '', service_branch: '',
    reception_content: '', detail_content: '', processing_content: '',
    assigned_as_technician: '', processing_technician: '',
    technician_processed_at: '', processed_at: '', completed_at: '',
    is_urgent: false, needs_callback: false, is_dispatch: false, is_dropoff: false,
    filter_type: '', collected_filter: '', replaced_filter: '',
    contact_wireless: '', contact_wired: '', dispatch_area_primary: '', dispatch_area_secondary: '',
    cost_type: '', association_billing_date: '', billing_status: 'none',
    courier: '', delivery_request_type: '', delivery_address: '',
    extension_requested: false, extension_approved: null, extension_note: '',
    notes: '',
  };
}

function buildBody(values: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...values };
  // 서버가 받지 않는(트리거/시스템 관리 대상) 필드 — 있어도 API가 무시하지만 명시적으로 제거
  delete clean.id; delete clean.vehicle_id; delete clean.round_no; delete clean.converted_from_category;
  delete clean.is_deleted; delete clean.created_at; delete clean.updated_at; delete clean.created_by;
  return clean;
}
