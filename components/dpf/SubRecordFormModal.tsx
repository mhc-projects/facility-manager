'use client';
// DPF 차량 상세의 설치이력/성능검사/보조금/콜모니터링 추가·수정 모달

import { useState, useEffect } from 'react';
import {
  ArrowRight, Banknote, Building2, FileText, Gauge, Headphones, ShieldCheck, Star, StickyNote, Wrench,
} from 'lucide-react';
import Modal, { ModalActions } from '@/components/ui/Modal';
import {
  Card, FieldLabel, FooterStatus, FormCanvas, INPUT_CLASS, Segmented, SubmitKbd, TextArea, TextInput,
  useCmdEnter, vehicleSummary, type VehicleSummaryType,
} from '@/components/dpf/DpfFormUI';
import {
  DpfDeviceInstallation,
  DpfPerformanceInspection,
  DpfSubsidyApplication,
  DpfCallMonitoring,
} from '@/types/dpf';

export type SubRecordType = 'installation' | 'inspection' | 'subsidy' | 'call';

type AnyRecord = DpfDeviceInstallation | DpfPerformanceInspection | DpfSubsidyApplication | DpfCallMonitoring;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  type: SubRecordType;
  vin: string;
  vehicle?: VehicleSummaryType;
  record?: AnyRecord;
}

const TITLES: Record<SubRecordType, string> = {
  installation: '설치이력',
  inspection: '성능검사',
  subsidy: '보조금 신청',
  call: '콜모니터링',
};

export default function SubRecordFormModal({ isOpen, onClose, onSuccess, type, vin, vehicle, record }: Props) {
  const isEdit = Boolean(record);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setValues(record ? { ...(record as Record<string, unknown>) } : defaultValues(type));
    }
  }, [isOpen, record, type]);

  function set(key: string, val: unknown) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  async function handleSubmit() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const endpoints: Record<SubRecordType, string> = {
        installation: `/api/dpf/vehicles/${encodeURIComponent(vin)}/installations`,
        inspection: `/api/dpf/vehicles/${encodeURIComponent(vin)}/inspections`,
        subsidy: `/api/dpf/vehicles/${encodeURIComponent(vin)}/subsidies`,
        call: `/api/dpf/vehicles/${encodeURIComponent(vin)}/calls`,
      };

      const url = isEdit
        ? `${endpoints[type]}/${(record as AnyRecord).id}`
        : endpoints[type];

      const body = buildBody(type, values, isEdit);
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  useCmdEnter(isOpen, handleSubmit);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${TITLES[type]} ${isEdit ? '수정' : '추가'}`}
      description={vehicleSummary(vin, vehicle)}
      size="lg"
      closeOnOverlayClick={false}
      actions={
        <>
          <FooterStatus error={error} />
          <ModalActions.Cancel onClick={onClose} />
          <ModalActions.Confirm onClick={handleSubmit} loading={saving}>
            {isEdit ? '수정 저장' : '추가'}
            <SubmitKbd />
          </ModalActions.Confirm>
        </>
      }
    >
      <FormCanvas>
        {type === 'installation' && <InstallationFields values={values} set={set} />}
        {type === 'inspection' && <InspectionFields values={values} set={set} />}
        {type === 'subsidy' && <SubsidyFields values={values} set={set} />}
        {type === 'call' && <CallFields values={values} set={set} />}
      </FormCanvas>
    </Modal>
  );
}

// ─── 필드 그룹들 ──────────────────────────────────────────────

type FieldsProps = { values: Record<string, unknown>; set: (k: string, v: unknown) => void };

const toNumberOrNull = (v: string) => (v === '' ? null : Number(v));

function NotesCard({ values, set, field = 'notes' }: FieldsProps & { field?: string }) {
  return (
    <Card icon={StickyNote} title="메모">
      <TextArea label="메모" hideLabel value={values[field]} onChange={v => set(field, v)} placeholder="내부 메모" rows={3} />
    </Card>
  );
}

const ACTION_DATE_LABELS: Record<string, string> = { install: '설치일', remove: '탈착일', replace: '교체일' };

function InstallationFields({ values, set }: FieldsProps) {
  return (
    <>
      <Card icon={Wrench} title="설치 정보">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel>동작 유형</FieldLabel>
            <Segmented
              value={String(values.action_type ?? '')}
              onChange={v => set('action_type', v)}
              options={[
                { value: 'install', label: '설치', dot: 'bg-emerald-500' },
                { value: 'remove', label: '탈착', dot: 'bg-red-500' },
                { value: 'replace', label: '교체', dot: 'bg-blue-500' },
              ]}
            />
          </div>
          <TextInput
            label={ACTION_DATE_LABELS[String(values.action_type)] ?? '설치/탈착일'}
            value={values.installation_date}
            onChange={v => set('installation_date', v)}
            type="date"
          />
          <TextInput label="시리얼번호" value={values.serial_number} onChange={v => set('serial_number', v)} placeholder="SN-001" />
        </div>
      </Card>
      <Card icon={Building2} title="업체 · 관리">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextInput label="설치업체" value={values.installer_company} onChange={v => set('installer_company', v)} />
          <TextInput label="관리번호" value={values.management_number} onChange={v => set('management_number', v)} />
          <TextInput label="판매사무소" value={values.sales_office} onChange={v => set('sales_office', v)} />
        </div>
      </Card>
      <NotesCard values={values} set={set} />
    </>
  );
}

const MEASUREMENTS = [
  { label: 'KD147', before: 'kd147_before', after: 'kd147_after' },
  { label: 'Lugdown', before: 'lugdown_before', after: 'lugdown_after' },
  { label: '자유가속', before: 'free_accel_before', after: 'free_accel_after' },
];

// 부착 전 대비 저감률(%) — 두 값이 다 있고 부착 전이 0보다 클 때만
function reductionRate(before: unknown, after: unknown): number | null {
  if (before == null || after == null || before === '' || after === '') return null;
  const b = Number(before);
  const a = Number(after);
  if (!Number.isFinite(b) || !Number.isFinite(a) || b <= 0) return null;
  return ((b - a) / b) * 100;
}

function InspectionFields({ values, set }: FieldsProps) {
  return (
    <>
      <Card icon={ShieldCheck} title="검사 정보">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput label="검사일" value={values.inspection_date} onChange={v => set('inspection_date', v)} type="date" />
          <TextInput label="검사기관" value={values.inspection_agency} onChange={v => set('inspection_agency', v)} />
          <div>
            <FieldLabel>검사유형</FieldLabel>
            <Segmented
              value={String(values.inspection_type ?? '')}
              onChange={v => set('inspection_type', v)}
              options={[
                { value: '', label: '미지정' },
                { value: 'initial', label: '최초' },
                { value: 'confirmation', label: '확인' },
                { value: 'periodic', label: '정기' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>합격 여부</FieldLabel>
            <Segmented
              value={values.pass_yn === true ? 'true' : values.pass_yn === false ? 'false' : 'null'}
              onChange={v => set('pass_yn', v === 'true' ? true : v === 'false' ? false : null)}
              options={[
                { value: 'null', label: '미정' },
                { value: 'true', label: '합격', dot: 'bg-emerald-500' },
                { value: 'false', label: '불합격', dot: 'bg-red-500' },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card icon={Gauge} title="측정값" description="부착 전 → 부착 후, 저감률은 자동 계산">
        <div className="hidden grid-cols-[88px_1fr_16px_1fr_72px] items-center gap-2 pb-1.5 text-[11px] font-semibold tracking-wide text-gray-400 sm:grid">
          <span>항목</span><span>부착 전</span><span /><span>부착 후</span><span className="text-right">저감률</span>
        </div>
        <div className="space-y-2">
          {MEASUREMENTS.map(({ label, before, after }) => {
            const rate = reductionRate(values[before], values[after]);
            return (
              <div key={label} className="grid grid-cols-[1fr_16px_1fr] items-center gap-2 sm:grid-cols-[88px_1fr_16px_1fr_72px]">
                <span className="col-span-3 text-xs font-medium text-gray-700 sm:col-span-1">{label}</span>
                <input
                  type="number"
                  step="0.01"
                  aria-label={`${label} 부착 전`}
                  value={values[before] != null ? String(values[before]) : ''}
                  onChange={e => set(before, toNumberOrNull(e.target.value))}
                  placeholder="전"
                  className={`${INPUT_CLASS} tabular-nums`}
                />
                <ArrowRight className="h-4 w-4 text-gray-300" />
                <input
                  type="number"
                  step="0.01"
                  aria-label={`${label} 부착 후`}
                  value={values[after] != null ? String(values[after]) : ''}
                  onChange={e => set(after, toNumberOrNull(e.target.value))}
                  placeholder="후"
                  className={`${INPUT_CLASS} tabular-nums`}
                />
                <span className={`col-span-3 text-xs font-semibold tabular-nums sm:col-span-1 sm:text-right ${
                  rate == null ? 'text-gray-300' : rate >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {rate == null ? '—' : `${rate >= 0 ? '↓' : '↑'} ${Math.abs(rate).toFixed(1)}%`}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
      <NotesCard values={values} set={set} />
    </>
  );
}

const formatWon = (v: unknown) =>
  v != null && v !== '' && Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('ko-KR')}원` : undefined;

function SubsidyFields({ values, set }: FieldsProps) {
  return (
    <>
      <Card icon={FileText} title="신청">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput label="지자체" value={values.local_government} onChange={v => set('local_government', v)} placeholder="예: 울산광역시" />
          <TextInput label="접수일" value={values.reception_date} onChange={v => set('reception_date', v)} type="date" />
          <div className="sm:col-span-2">
            <FieldLabel>승인상태</FieldLabel>
            <Segmented
              value={String(values.approval_status ?? '')}
              onChange={v => set('approval_status', v)}
              options={[
                { value: '', label: '미지정' },
                { value: 'pending', label: '대기', dot: 'bg-amber-500' },
                { value: 'approved', label: '승인', dot: 'bg-emerald-500' },
                { value: 'rejected', label: '반려', dot: 'bg-red-500' },
                { value: 'cancelled', label: '취소', dot: 'bg-gray-400' },
              ]}
            />
          </div>
        </div>
      </Card>
      <Card icon={Banknote} title="금액 · 지급">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput
            label="청구금액" type="number" suffix="원"
            value={values.subsidy_claim_amount}
            onChange={v => set('subsidy_claim_amount', toNumberOrNull(v))}
            hint={formatWon(values.subsidy_claim_amount)}
          />
          <TextInput
            label="자부담 탈거금액" type="number" suffix="원"
            value={values.self_payment_removal}
            onChange={v => set('self_payment_removal', toNumberOrNull(v))}
            hint={formatWon(values.self_payment_removal)}
          />
          <TextInput label="예상지급일" value={values.subsidy_expected_date} onChange={v => set('subsidy_expected_date', v)} type="date" />
          <TextInput label="지급일" value={values.subsidy_payment_date} onChange={v => set('subsidy_payment_date', v)} type="date" />
        </div>
      </Card>
      <NotesCard values={values} set={set} />
    </>
  );
}

const SATISFACTION_LABELS = ['', '매우 불만', '불만', '보통', '만족', '매우 만족'];

function CallFields({ values, set }: FieldsProps) {
  const score = typeof values.satisfaction_score === 'number' ? values.satisfaction_score : 0;
  return (
    <>
      <Card icon={Headphones} title="모니터링">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput label="모니터링일" value={values.monitoring_date} onChange={v => set('monitoring_date', v)} type="date" />
          <TextInput label="담당자" value={values.call_agent} onChange={v => set('call_agent', v)} />
          <div>
            <FieldLabel>모니터링 여부</FieldLabel>
            <Segmented
              value={values.monitoring_yn === true ? 'true' : values.monitoring_yn === false ? 'false' : 'null'}
              onChange={v => set('monitoring_yn', v === 'true' ? true : v === 'false' ? false : null)}
              options={[
                { value: 'null', label: '미정' },
                { value: 'true', label: '완료', dot: 'bg-emerald-500' },
                { value: 'false', label: '미실시', dot: 'bg-gray-400' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>만족도</FieldLabel>
            <div className="flex h-10 items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n}점`}
                  aria-pressed={score === n}
                  // 같은 별을 다시 누르면 선택 해제
                  onClick={() => set('satisfaction_score', score === n ? null : n)}
                  className="rounded p-0.5 transition hover:scale-110"
                >
                  <Star className={`h-6 w-6 ${n <= score ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
                </button>
              ))}
              <span className="ml-2 text-xs text-gray-500">{score ? `${score}점 · ${SATISFACTION_LABELS[score]}` : '미평가'}</span>
            </div>
          </div>
        </div>
      </Card>
      <NotesCard values={values} set={set} field="memo" />
    </>
  );
}

// ─── 유틸 ───────────────────────────────────────────────────

function defaultValues(type: SubRecordType): Record<string, unknown> {
  switch (type) {
    case 'installation': return { action_type: 'install', serial_number: '', installer_company: '', installation_date: '', management_number: '', sales_office: '', notes: '' };
    case 'inspection': return { inspection_date: '', inspection_agency: '', inspection_type: '', pass_yn: null, kd147_before: null, kd147_after: null, lugdown_before: null, lugdown_after: null, free_accel_before: null, free_accel_after: null, notes: '' };
    case 'subsidy': return { local_government: '', reception_date: '', approval_status: '', subsidy_claim_amount: null, subsidy_payment_date: '', subsidy_expected_date: '', self_payment_removal: null, notes: '' };
    case 'call': return { monitoring_date: '', monitoring_yn: null, satisfaction_score: null, memo: '', call_agent: '' };
  }
}

function buildBody(type: SubRecordType, values: Record<string, unknown>, isEdit: boolean): Record<string, unknown> {
  const clean = { ...values };
  if (isEdit) { delete clean.id; delete clean.vehicle_id; delete clean.created_at; delete clean.updated_at; }
  return clean;
}
