'use client';

import { useState, useEffect, useRef } from 'react';
import {
  AlertCircle, CalendarCheck, CalendarClock, Check, ClipboardCheck, Clock, Cog, Droplets, FileText,
  Hourglass, Info, Loader2, MessageSquare, Package, Paperclip, Phone, PhoneCall, Receipt, RefreshCw, Siren,
  StickyNote, Tags, Trash2, Truck, Upload, Warehouse, Wrench, type LucideIcon,
} from 'lucide-react';
import Modal, { ModalActions } from '@/components/ui/Modal';
import {
  Card, FieldLabel, FooterStatus, FormCanvas, INPUT_CLASS, SelectInput, Segmented, SubmitKbd, Switch, TextArea, TextInput,
  ToggleChip, useCmdEnter, vehicleSummary, type VehicleSummaryType,
} from '@/components/dpf/DpfFormUI';
import { DpfServiceRecord, DpfServiceCategory, DpfAttachmentSlotKey } from '@/types/dpf';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vin: string;
  // 모달 헤더에 "차량번호 · 차명 · 계약자"로 보여줄 차량 요약 — 없으면 차대번호만
  vehicle?: VehicleSummaryType;
  record?: DpfServiceRecord;
  initialCategory?: DpfServiceCategory;
  onAttachmentsChange?: (recordId: string, count: number) => void;
}

export const CATEGORY_OPTIONS: { value: DpfServiceCategory; label: string }[] = [
  { value: 'as', label: 'AS' },
  { value: 'clean_elapsed', label: '경과 크리닝' },
  { value: 'clean', label: '정기 크리닝' },
  { value: 'cs', label: '상담종료' },
  { value: 'parts_delivery', label: '부품전달' },
  { value: 'urea', label: '요소수' },
  { value: 'engine_replace', label: '엔진교체' },
];

export const CATEGORY_LABELS: Record<DpfServiceCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label])
) as Record<DpfServiceCategory, string>;

export const LOGISTICS_CATEGORIES: DpfServiceCategory[] = ['parts_delivery', 'urea'];

// "AS 1회차", "정기 크리닝 4회차"처럼 분류별 회차 라벨 — 목록/카드/삭제 확인 문구 공용
export function categoryRoundLabels(r: Pick<DpfServiceRecord, 'category' | 'categories' | 'round_no' | 'round_nos'>): string[] {
  const cats = r.categories?.length ? r.categories : [r.category];
  return cats.map(c => {
    const n = r.round_nos?.[c] ?? (c === r.category ? r.round_no : undefined);
    return n != null ? `${CATEGORY_LABELS[c]} ${n}회차` : CATEGORY_LABELS[c];
  });
}

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

// 분류별 색·아이콘 — Tailwind가 스캔할 수 있게 클래스 문자열을 통째로 둔다
export const CATEGORY_COLORS: Record<DpfServiceCategory, { dot: string; selected: string; iconOn: string; badge: string }> = {
  as:             { dot: 'bg-rose-500',   selected: 'border-rose-400 bg-rose-50/60 ring-1 ring-rose-400',       iconOn: 'bg-rose-100 text-rose-600',     badge: 'bg-rose-500' },
  clean_elapsed:  { dot: 'bg-sky-500',    selected: 'border-sky-400 bg-sky-50/60 ring-1 ring-sky-400',          iconOn: 'bg-sky-100 text-sky-600',       badge: 'bg-sky-500' },
  clean:          { dot: 'bg-blue-500',   selected: 'border-blue-400 bg-blue-50/60 ring-1 ring-blue-400',       iconOn: 'bg-blue-100 text-blue-600',     badge: 'bg-blue-500' },
  cs:             { dot: 'bg-slate-400',  selected: 'border-slate-400 bg-slate-50 ring-1 ring-slate-400',       iconOn: 'bg-slate-200 text-slate-600',   badge: 'bg-slate-500' },
  engine_replace: { dot: 'bg-violet-500', selected: 'border-violet-400 bg-violet-50/60 ring-1 ring-violet-400', iconOn: 'bg-violet-100 text-violet-600', badge: 'bg-violet-500' },
  parts_delivery: { dot: 'bg-amber-500',  selected: 'border-amber-400 bg-amber-50/60 ring-1 ring-amber-400',    iconOn: 'bg-amber-100 text-amber-600',   badge: 'bg-amber-500' },
  urea:           { dot: 'bg-teal-500',   selected: 'border-teal-400 bg-teal-50/60 ring-1 ring-teal-400',       iconOn: 'bg-teal-100 text-teal-600',     badge: 'bg-teal-500' },
};

const CATEGORY_ICONS: Record<DpfServiceCategory, LucideIcon> = {
  as: Wrench, clean_elapsed: Hourglass, clean: CalendarCheck, cs: MessageSquare,
  engine_replace: Cog, parts_delivery: Package, urea: Droplets,
};

const CATEGORY_GROUPS: { label: string; values: DpfServiceCategory[] }[] = [
  { label: '사후관리', values: ['as', 'clean_elapsed', 'clean', 'cs', 'engine_replace'] },
  { label: '물류', values: ['parts_delivery', 'urea'] },
];

// 접히는 섹션별 필드 — "N개 입력됨" 표시와 열 때 자동 펼침 판단에 쓴다
const SECTION_FIELDS = {
  process: ['processing_content', 'assigned_as_technician', 'processing_technician', 'technician_processed_at', 'processed_at', 'completed_at'],
  flags: ['is_urgent', 'needs_callback', 'is_dispatch', 'is_dropoff', 'filter_type', 'collected_filter', 'replaced_filter'],
  contact: ['contact_wireless', 'contact_wired', 'dispatch_area_primary', 'dispatch_area_secondary'],
  billing: ['cost_type', 'association_billing_date', 'billing_status'],
  extension: ['extension_requested', 'extension_approved', 'extension_note'],
  notes: ['notes'],
};

const PROCESS_STEPS = [
  { key: 'technician_processed_at', label: '기사처리' },
  { key: 'processed_at', label: '처리' },
  { key: 'completed_at', label: '완료' },
];

const FLAG_OPTIONS: { key: string; label: string; icon: LucideIcon; tone: 'red' | 'blue' }[] = [
  { key: 'is_urgent', label: '긴급', icon: Siren, tone: 'red' },
  { key: 'needs_callback', label: '통화요청', icon: PhoneCall, tone: 'blue' },
  { key: 'is_dispatch', label: '출동', icon: Truck, tone: 'blue' },
  { key: 'is_dropoff', label: '입고', icon: Warehouse, tone: 'blue' },
];

// 기본값(빈 문자열·false·null·청구상태 'none')은 입력으로 치지 않는다
function countFilled(values: Record<string, unknown>, fields: string[]): number {
  return fields.filter(f => {
    const v = values[f];
    return v != null && v !== '' && v !== false && !(f === 'billing_status' && v === 'none');
  }).length;
}

interface AttachmentData { url: string; created_at: string; ext: string }

const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf';
const ATTACHMENT_ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;

function isImageExt(ext: string) {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext.toLowerCase());
}

export default function ServiceRecordFormModal({ isOpen, onClose, onSuccess, vin, vehicle, record, initialCategory, onAttachmentsChange }: Props) {
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

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      setError('');
      const initial = record
        ? { ...(record as unknown as Record<string, unknown>), categories: record.categories?.length ? record.categories : [record.category] }
        : defaultValues(initialCategory);
      setValues(initial);
      // 접을 수 있는 섹션은 폼을 열 때 값이 있으면 펼친다 — 이후엔 사용자 토글만 반영(입력 중에 접히지 않게)
      setOpenSections(Object.fromEntries(
        Object.entries(SECTION_FIELDS).map(([key, fields]) => [key, countFilled(initial, fields) > 0])
      ));
    }
  }, [isOpen, record, initialCategory]);

  function isSectionOpen(key: keyof typeof SECTION_FIELDS) { return Boolean(openSections[key]); }
  function toggleSection(key: keyof typeof SECTION_FIELDS) { setOpenSections(prev => ({ ...prev, [key]: !prev[key] })); }

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

  // 분류는 복수 선택 — 선택 순서 유지, 첫 번째가 대표 분류(목록 정렬·전환 기준)
  const categories = (values.categories as DpfServiceCategory[] | undefined) ?? [];
  const isLogistics = categories.some(c => LOGISTICS_CATEGORIES.includes(c));

  function toggleCategory(c: DpfServiceCategory) {
    setError('');
    setValues(prev => {
      const cur = (prev.categories as DpfServiceCategory[] | undefined) ?? [];
      return { ...prev, categories: cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c] };
    });
  }

  async function handleSubmit() {
    if (saving) return;
    if (categories.length === 0) { setError('분류를 선택해주세요'); return; }
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

  const hasExtensionDetail = Boolean(values.extension_requested) || values.extension_approved != null || Boolean(values.extension_note);
  const attachmentCount = Object.keys(attachments).length;

  useCmdEnter(isOpen, handleSubmit);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? '접수 수정' : '새 접수 등록'}
      description={vehicleSummary(vin, vehicle)}
      size="xl"
      closeOnOverlayClick={false}
      actions={
        <>
          <FooterStatus error={error}>
            {categories.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((c, i) => (
                  <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 font-medium text-gray-700">
                    <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_COLORS[c].dot}`} />
                    {CATEGORY_LABELS[c]}
                    {i === 0 && categories.length > 1 && <span className="text-[10px] text-gray-400">대표</span>}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-gray-400">분류를 하나 이상 선택하세요</span>
            )}
          </FooterStatus>
          <ModalActions.Cancel onClick={onClose} />
          <ModalActions.Confirm onClick={handleSubmit} loading={saving}>
            {isEdit ? '수정 저장' : '접수 등록'}
            <SubmitKbd />
          </ModalActions.Confirm>
        </>
      }
    >
      <FormCanvas>

          <Card icon={Tags} title="분류 · 상태" description="여러 분류를 함께 고를 수 있어요. 처음 고른 분류가 대표 분류가 됩니다.">
            {isEdit && record && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <span className="font-medium text-gray-600">저장된 회차</span>
                {categoryRoundLabels(record).map(label => (
                  <span key={label} className="rounded-md bg-white px-1.5 py-0.5 font-medium text-gray-700 ring-1 ring-gray-200">{label}</span>
                ))}
                {record.converted_from_category && (
                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200">
                    {CATEGORY_LABELS[record.converted_from_category]}에서 전환
                  </span>
                )}
              </div>
            )}

            <div className="space-y-3">
              {CATEGORY_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-gray-400">{group.label}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {group.values.map(c => (
                      <CategoryTile
                        key={c}
                        category={c}
                        order={categories.indexOf(c)}
                        isPrimary={categories[0] === c && categories.length > 1}
                        savedRound={record?.round_nos?.[c]}
                        isEdit={isEdit}
                        onToggle={() => toggleCategory(c)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <FieldLabel>상태</FieldLabel>
                <Segmented
                  value={String(values.status ?? 'in_progress')}
                  onChange={v => set('status', v)}
                  options={[
                    { value: 'in_progress', label: '진행중', dot: 'bg-amber-500' },
                    { value: 'completed', label: '완료', dot: 'bg-emerald-500' },
                    { value: 'cancelled', label: '취소', dot: 'bg-gray-400' },
                  ]}
                />
              </div>
              <TextInput label="접수일" value={values.reception_date} onChange={v => set('reception_date', v)} type="date" />
              <TextInput label="지자체" value={values.local_government} onChange={v => set('local_government', v)} placeholder="예: 울산광역시" />
              <TextInput label="처리점" value={values.service_branch} onChange={v => set('service_branch', v)} placeholder="예: 창원모터스" />
            </div>
          </Card>

          <Card icon={FileText} title="접수 내용">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextArea label="접수내용" value={values.reception_content} onChange={v => set('reception_content', v)} placeholder="고객이 요청한 내용" rows={3} />
              <TextArea label="세부내용" value={values.detail_content} onChange={v => set('detail_content', v)} placeholder="현장 상황, 특이사항" rows={3} />
            </div>
          </Card>

          {isLogistics && (
            <Card icon={Truck} title="물류" description="부품전달 · 요소수 배송 정보" accent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextInput label="택배사" value={values.courier} onChange={v => set('courier', v)} placeholder="예: CJ대한통운" />
                <div>
                  <FieldLabel>접수 유형</FieldLabel>
                  <Segmented
                    value={String(values.delivery_request_type ?? '')}
                    onChange={v => set('delivery_request_type', v)}
                    options={[
                      { value: '', label: '미지정' },
                      { value: 'request', label: '요청' },
                      { value: 'fixed', label: '고정' },
                    ]}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextArea label="배송주소" value={values.delivery_address} onChange={v => set('delivery_address', v)} rows={2} />
                </div>
              </div>
            </Card>
          )}

          <Card
            icon={CalendarClock}
            title="처리 · 담당"
            description="처리내용 · 담당/처리 기사 · 처리 단계 일자"
            collapsible
            open={isSectionOpen('process')}
            onToggle={() => toggleSection('process')}
            filledCount={countFilled(values, SECTION_FIELDS.process)}
          >
            <TextArea label="처리내용" value={values.processing_content} onChange={v => set('processing_content', v)} placeholder="조치한 내용" rows={3} />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput label="담당AS기사" value={values.assigned_as_technician} onChange={v => set('assigned_as_technician', v)} />
              <TextInput label="처리기사" value={values.processing_technician} onChange={v => set('processing_technician', v)} />
            </div>
            <div className="mt-5">
              <FieldLabel>처리 단계</FieldLabel>
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-0">
                {PROCESS_STEPS.map((step, i) => {
                  const done = Boolean(values[step.key]);
                  return (
                    <li key={step.key} className="sm:pr-4 sm:last:pr-0">
                      <div className="mb-2 flex items-center gap-2">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                          done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
                        }`}>
                          {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                        </span>
                        <span className="text-xs font-medium text-gray-700">{step.label}</span>
                        {i < PROCESS_STEPS.length - 1 && <span className={`hidden h-px flex-1 sm:block ${done ? 'bg-emerald-200' : 'bg-gray-200'}`} />}
                      </div>
                      <input
                        type="date"
                        aria-label={step.label}
                        value={values[step.key] != null ? String(values[step.key]) : ''}
                        onChange={e => set(step.key, e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </li>
                  );
                })}
              </ol>
            </div>
          </Card>

          <Card
            icon={ClipboardCheck}
            title="접수사항 · 필터"
            description="긴급 · 통화요청 · 출동 · 입고 · 필터 정보"
            collapsible
            open={isSectionOpen('flags')}
            onToggle={() => toggleSection('flags')}
            filledCount={countFilled(values, SECTION_FIELDS.flags)}
          >
            <div className="flex flex-wrap gap-2">
              {FLAG_OPTIONS.map(f => (
                <ToggleChip
                  key={f.key}
                  icon={f.icon}
                  label={f.label}
                  tone={f.tone}
                  checked={Boolean(values[f.key])}
                  onChange={v => set(f.key, v)}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextInput label="필터" value={values.filter_type} onChange={v => set('filter_type', v)} />
              <TextInput label="회수필터" value={values.collected_filter} onChange={v => set('collected_filter', v)} />
              <TextInput label="교체필터" value={values.replaced_filter} onChange={v => set('replaced_filter', v)} />
            </div>
          </Card>

          <Card
            icon={Phone}
            title="연락처 · 출동지역"
            description="무선·유선 연락처 · 출동지역"
            collapsible
            open={isSectionOpen('contact')}
            onToggle={() => toggleSection('contact')}
            filledCount={countFilled(values, SECTION_FIELDS.contact)}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput label="연락처(무선)" value={values.contact_wireless} onChange={v => set('contact_wireless', v)} placeholder="010-0000-0000" />
              <TextInput label="연락처(유선)" value={values.contact_wired} onChange={v => set('contact_wired', v)} />
              <TextInput label="출동지역 1" value={values.dispatch_area_primary} onChange={v => set('dispatch_area_primary', v)} />
              <TextInput label="출동지역 2" value={values.dispatch_area_secondary} onChange={v => set('dispatch_area_secondary', v)} />
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-gray-400" />
              이 접수가 차량의 최신 접수일 때만 차량 정보의 변경정보에 자동 반영됩니다.
            </p>
          </Card>

          <Card
            icon={Receipt}
            title="비용 · 협회청구"
            description="유상/무상 · 협회청구일자 · 청구상태"
            collapsible
            open={isSectionOpen('billing')}
            onToggle={() => toggleSection('billing')}
            filledCount={countFilled(values, SECTION_FIELDS.billing)}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <FieldLabel>비용</FieldLabel>
                <Segmented
                  value={String(values.cost_type ?? '')}
                  onChange={v => set('cost_type', v)}
                  options={[
                    { value: '', label: '미지정' },
                    { value: 'paid', label: '유상' },
                    { value: 'free', label: '무상' },
                    { value: 'mixed', label: '유/무상' },
                  ]}
                />
              </div>
              <TextInput label="협회청구일자" value={values.association_billing_date} onChange={v => set('association_billing_date', v)} type="date" />
              <SelectInput
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
          </Card>

          <Card
            icon={Clock}
            title="연장"
            description="연장 요청 · 승인 여부 · 사유"
            collapsible
            open={isSectionOpen('extension')}
            onToggle={() => toggleSection('extension')}
            filledCount={countFilled(values, SECTION_FIELDS.extension)}
          >
            <Switch
              label="연장 요청"
              description="처리 기한 연장이 필요한 접수"
              checked={Boolean(values.extension_requested)}
              onChange={v => set('extension_requested', v)}
            />
            {hasExtensionDetail && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <FieldLabel>승인 여부</FieldLabel>
                  <Segmented
                    value={values.extension_approved === true ? 'true' : values.extension_approved === false ? 'false' : 'null'}
                    onChange={v => set('extension_approved', v === 'true' ? true : v === 'false' ? false : null)}
                    options={[
                      { value: 'null', label: '미정' },
                      { value: 'true', label: '승인', dot: 'bg-emerald-500' },
                      { value: 'false', label: '반려', dot: 'bg-red-500' },
                    ]}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextArea label="연장 사유" value={values.extension_note} onChange={v => set('extension_note', v)} rows={2} />
                </div>
              </div>
            )}
          </Card>

          {isEdit && recordId && (
            <Card
              icon={Paperclip}
              title="첨부파일"
              description="jpg · png · webp · pdf, 파일당 10MB까지"
              badge={`${attachmentCount}/${ATTACHMENT_SLOTS.length}`}
            >
              {attachmentError && (
                <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />{attachmentError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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
            </Card>
          )}

          <Card
            icon={StickyNote}
            title="비고"
            description="내부 메모"
            collapsible
            open={isSectionOpen('notes')}
            onToggle={() => toggleSection('notes')}
            filledCount={countFilled(values, SECTION_FIELDS.notes)}
          >
            <TextArea label="비고" hideLabel value={values.notes} onChange={v => set('notes', v)} placeholder="내부 메모" rows={3} />
          </Card>
      </FormCanvas>
    </Modal>
  );
}

// ─── 분류 타일 / 첨부 슬롯 ─────────────────────────────────

function CategoryTile({
  category, order, isPrimary, savedRound, isEdit, onToggle,
}: {
  category: DpfServiceCategory; order: number; isPrimary: boolean; savedRound?: number; isEdit: boolean; onToggle: () => void;
}) {
  const color = CATEGORY_COLORS[category];
  const Icon = CATEGORY_ICONS[category];
  const selected = order >= 0;
  // 수정 모드에서 새로 추가한 분류는 저장 시 새 회차가 매겨진다
  const roundHint = isEdit && selected ? (savedRound != null ? `${savedRound}회차` : '새 회차') : null;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${
        selected ? `${color.selected} shadow-sm` : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${selected ? color.iconOn : 'bg-gray-100 text-gray-400'}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${selected ? 'font-semibold text-gray-900' : 'font-medium text-gray-600'}`}>
          {CATEGORY_LABELS[category]}
        </span>
        {(isPrimary || roundHint) && (
          <span className="block text-[11px] text-gray-500">
            {[isPrimary && '대표', roundHint].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
      {selected && (
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${color.badge}`}>
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </span>
      )}
    </button>
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
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      {data ? (
        isImageExt(data.ext) ? (
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-gray-50">
            <img src={data.url} alt={slot.label} className="h-full w-full object-cover" />
          </a>
        ) : (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-gray-50 text-xs font-medium text-blue-600"
          >
            <FileText className="h-6 w-6" />
            PDF 보기
          </a>
        )
      ) : (
        <label
          htmlFor={inputId}
          className={`m-1.5 flex h-16 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 text-xs text-gray-400 transition hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-600 ${uploading ? 'pointer-events-none' : ''}`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? '업로드 중' : '업로드'}
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

      <div className="flex items-center gap-1 border-t border-gray-100 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-600" title={slot.label}>{slot.label}</span>
        {data && (
          <>
            <label htmlFor={inputId} title="교체" className="cursor-pointer rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </label>
            <button
              type="button"
              title="삭제"
              onClick={onDelete}
              disabled={uploading}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 유틸 ───────────────────────────────────────────────────

// 브라우저 로컬 날짜(YYYY-MM-DD) — toISOString()은 UTC라 KST 09시 전엔 전날이 된다
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultValues(initialCategory?: DpfServiceCategory): Record<string, unknown> {
  return {
    categories: initialCategory ? [initialCategory] : [],
    status: 'in_progress',
    reception_date: todayLocal(),
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
  delete clean.id; delete clean.vehicle_id; delete clean.round_no; delete clean.round_nos; delete clean.converted_from_category;
  // 대표 분류(category)는 서버가 categories[0]으로 맞추므로 보내지 않는다
  delete clean.category;
  delete clean.is_deleted; delete clean.created_at; delete clean.updated_at; delete clean.created_by;
  return clean;
}
