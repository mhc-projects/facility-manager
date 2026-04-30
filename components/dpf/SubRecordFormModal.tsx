'use client';

import { useState, useEffect } from 'react';
import Modal, { ModalActions } from '@/components/ui/Modal';
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
  record?: AnyRecord;
}

const TITLES: Record<SubRecordType, string> = {
  installation: '설치이력',
  inspection: '성능검사',
  subsidy: '보조금 신청',
  call: '콜모니터링',
};

export default function SubRecordFormModal({ isOpen, onClose, onSuccess, type, vin, record }: Props) {
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isEdit ? '수정' : '추가'} — ${TITLES[type]}`}
      size="lg"
      actions={
        <>
          <ModalActions.Cancel onClick={onClose} />
          <ModalActions.Confirm onClick={handleSubmit} loading={saving}>
            {isEdit ? '수정 저장' : '추가'}
          </ModalActions.Confirm>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        {type === 'installation' && <InstallationFields values={values} set={set} />}
        {type === 'inspection' && <InspectionFields values={values} set={set} />}
        {type === 'subsidy' && <SubsidyFields values={values} set={set} />}
        {type === 'call' && <CallFields values={values} set={set} />}
      </div>
    </Modal>
  );
}

// ─── 필드 그룹들 ──────────────────────────────────────────────

function Field({
  label, name, value, onChange, type = 'text', required, placeholder, className = ''
}: {
  label: string; name: string; value: unknown; onChange: (v: unknown) => void;
  type?: string; required?: boolean; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value != null ? String(value) : ''}
        onChange={e => onChange(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options
}: {
  label: string; value: unknown; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
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

function InstallationFields({ values, set }: { values: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <SelectField
        label="동작 유형"
        value={values.action_type}
        onChange={v => set('action_type', v)}
        options={[
          { value: 'install', label: '설치' },
          { value: 'remove', label: '탈착' },
          { value: 'replace', label: '교체' },
        ]}
      />
      <Field label="설치/탈착일" name="installation_date" value={values.installation_date} onChange={v => set('installation_date', v)} type="date" />
      <Field label="시리얼번호" name="serial_number" value={values.serial_number} onChange={v => set('serial_number', v)} placeholder="SN-001" />
      <Field label="설치업체" name="installer_company" value={values.installer_company} onChange={v => set('installer_company', v)} />
      <Field label="관리번호" name="management_number" value={values.management_number} onChange={v => set('management_number', v)} />
      <Field label="판매사무소" name="sales_office" value={values.sales_office} onChange={v => set('sales_office', v)} />
      <div className="col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">메모</label>
        <textarea
          value={values.notes != null ? String(values.notes) : ''}
          onChange={e => set('notes', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
  );
}

function InspectionFields({ values, set }: { values: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="검사일" name="inspection_date" value={values.inspection_date} onChange={v => set('inspection_date', v)} type="date" />
        <Field label="검사기관" name="inspection_agency" value={values.inspection_agency} onChange={v => set('inspection_agency', v)} />
        <SelectField
          label="검사유형"
          value={values.inspection_type}
          onChange={v => set('inspection_type', v)}
          options={[
            { value: 'initial', label: '최초검사' },
            { value: 'confirmation', label: '확인검사' },
            { value: 'periodic', label: '정기검사' },
          ]}
        />
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">합격 여부</label>
          <div className="flex gap-4 mt-2">
            {[{ v: true, label: '합격' }, { v: false, label: '불합격' }].map(({ v, label }) => (
              <label key={label} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={values.pass_yn === v}
                  onChange={() => set('pass_yn', v)}
                  className="text-blue-600"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-3 bg-gray-50">
        <div className="text-xs font-semibold text-gray-600 mb-3">측정값 (부착 전 → 부착 후)</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'KD147', before: 'kd147_before', after: 'kd147_after' },
            { label: 'Lugdown', before: 'lugdown_before', after: 'lugdown_after' },
            { label: '자유가속', before: 'free_accel_before', after: 'free_accel_after' },
          ].map(({ label, before, after }) => (
            <div key={label}>
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="flex gap-1 items-center">
                <input
                  type="number"
                  step="0.01"
                  value={values[before] != null ? String(values[before]) : ''}
                  onChange={e => set(before, e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="전"
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-xs">→</span>
                <input
                  type="number"
                  step="0.01"
                  value={values[after] != null ? String(values[after]) : ''}
                  onChange={e => set(after, e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="후"
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">메모</label>
        <textarea
          value={values.notes != null ? String(values.notes) : ''}
          onChange={e => set('notes', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
  );
}

function SubsidyFields({ values, set }: { values: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="지자체" name="local_government" value={values.local_government} onChange={v => set('local_government', v)} />
      <Field label="접수일" name="reception_date" value={values.reception_date} onChange={v => set('reception_date', v)} type="date" />
      <SelectField
        label="승인상태"
        value={values.approval_status}
        onChange={v => set('approval_status', v)}
        options={[
          { value: 'pending', label: '대기' },
          { value: 'approved', label: '승인' },
          { value: 'rejected', label: '반려' },
          { value: 'cancelled', label: '취소' },
        ]}
      />
      <Field label="청구금액 (원)" name="subsidy_claim_amount" value={values.subsidy_claim_amount} onChange={v => set('subsidy_claim_amount', v)} type="number" />
      <Field label="지급일" name="subsidy_payment_date" value={values.subsidy_payment_date} onChange={v => set('subsidy_payment_date', v)} type="date" />
      <Field label="예상지급일" name="subsidy_expected_date" value={values.subsidy_expected_date} onChange={v => set('subsidy_expected_date', v)} type="date" />
      <Field label="자부담 탈거금액 (원)" name="self_payment_removal" value={values.self_payment_removal} onChange={v => set('self_payment_removal', v)} type="number" />
      <div className="col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">메모</label>
        <textarea
          value={values.notes != null ? String(values.notes) : ''}
          onChange={e => set('notes', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
  );
}

function CallFields({ values, set }: { values: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="모니터링일" name="monitoring_date" value={values.monitoring_date} onChange={v => set('monitoring_date', v)} type="date" />
      <Field label="담당자" name="call_agent" value={values.call_agent} onChange={v => set('call_agent', v)} />
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">만족도</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => set('satisfaction_score', n)}
              className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                values.satisfaction_score === n
                  ? 'bg-yellow-400 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">모니터링 여부</label>
        <div className="flex gap-3 mt-1">
          {[{ v: true, label: '완료' }, { v: false, label: '미실시' }].map(({ v, label }) => (
            <label key={label} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={values.monitoring_yn === v}
                onChange={() => set('monitoring_yn', v)}
                className="text-blue-600"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">메모</label>
        <textarea
          value={values.memo != null ? String(values.memo) : ''}
          onChange={e => set('memo', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
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
