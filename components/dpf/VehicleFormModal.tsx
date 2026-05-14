'use client';

import { useState, useEffect } from 'react';
import Modal, { ModalActions } from '@/components/ui/Modal';
import { DpfVehicle } from '@/types/dpf';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (vin: string) => void;
  vehicle?: DpfVehicle;
}

interface FormValues {
  vin: string;
  plate_number: string;
  vehicle_name: string;
  owner_name: string;
  owner_contact: string;
  owner_address: string;
  local_government: string;
  device_serial: string;
  installation_date: string;
  vendor: 'fujino' | 'mz';
  // 신규 필드
  engine_type: string;
  device_type: string;
  trust_grade: string;
  plate_number_original: string;
  grade_management: string;
  management_direction: string;
}

const EMPTY: FormValues = {
  vin: '', plate_number: '', vehicle_name: '', owner_name: '',
  owner_contact: '', owner_address: '', local_government: '',
  device_serial: '', installation_date: '', vendor: 'fujino',
  engine_type: '', device_type: '', trust_grade: '',
  plate_number_original: '', grade_management: '', management_direction: '',
};

const DEVICE_TYPE_OPTIONS = ['', '복합중형', '복합소형', '2종 파샬', '1종 대형', '정보없음'];
const TRUST_GRADE_OPTIONS = [
  '',
  'A-차량번호, 차대번호 완전일치',
  'B-차대번호 매칭',
  'C-후지노 전산 단독',
  '탈거, 폐차, 반납',
];
const GRADE_MGMT_OPTIONS = [
  '',
  'A-완전일치',
  'B-차대번호 매칭',
  'C-전산 단독',
  'D-이력보관(탈거·폐차·반납)',
];
const MGMT_DIRECTION_OPTIONS = ['', '운영관리', '이력보관'];

export default function VehicleFormModal({ isOpen, onClose, onSuccess, vehicle }: Props) {
  const isEdit = Boolean(vehicle);
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      if (vehicle) {
        setValues({
          vin: vehicle.vin,
          plate_number: vehicle.plate_number ?? '',
          vehicle_name: vehicle.vehicle_name ?? '',
          owner_name: vehicle.owner_name ?? '',
          owner_contact: vehicle.owner_contact ?? '',
          owner_address: vehicle.owner_address ?? '',
          local_government: vehicle.local_government ?? '',
          device_serial: vehicle.device_serial ?? '',
          installation_date: vehicle.installation_date?.split('T')[0] ?? '',
          vendor: vehicle.vendor ?? 'fujino',
          engine_type: vehicle.engine_type ?? '',
          device_type: vehicle.device_type ?? '',
          trust_grade: vehicle.trust_grade ?? '',
          plate_number_original: vehicle.plate_number_original ?? '',
          grade_management: vehicle.grade_management ?? '',
          management_direction: vehicle.management_direction ?? '',
        });
      } else {
        setValues(EMPTY);
      }
    }
  }, [isOpen, vehicle]);

  function set(key: keyof FormValues, val: string) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  async function handleSubmit() {
    if (!values.plate_number.trim()) { setError('차량번호는 필수입니다'); return; }
    if (!isEdit && !values.vin.trim()) { setError('차대번호는 필수입니다'); return; }

    setSaving(true);
    setError('');
    try {
      const url = isEdit
        ? `/api/dpf/vehicles/${encodeURIComponent(vehicle!.vin)}`
        : '/api/dpf/vehicles';

      const body = isEdit
        ? { ...values, vin: undefined }
        : values;

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '저장에 실패했습니다'); return; }

      const savedVin = isEdit ? vehicle!.vin : data.vehicle?.vin ?? values.vin;
      onSuccess(savedVin);
      onClose();
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  }

  const field = (
    label: string,
    key: keyof FormValues,
    opts?: { type?: string; required?: boolean; readOnly?: boolean; placeholder?: string }
  ) => (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{opts?.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={opts?.type ?? 'text'}
        value={values[key]}
        onChange={e => set(key, e.target.value)}
        readOnly={opts?.readOnly}
        placeholder={opts?.placeholder}
        className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
          ${opts?.readOnly ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}
      />
    </div>
  );

  const selectField = (label: string, key: keyof FormValues, options: string[]) => (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={values[key]}
        onChange={e => set(key, e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt || '— 선택 안 함 —'}</option>
        ))}
      </select>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? '차량 정보 수정' : '신규 차량 등록'}
      size="lg"
      actions={
        <>
          <ModalActions.Cancel onClick={onClose} />
          <ModalActions.Confirm onClick={handleSubmit} loading={saving}>
            {isEdit ? '수정 저장' : '등록'}
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

        {/* 차량 식별 */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">차량 식별</p>
          <div className="grid grid-cols-2 gap-3">
            {field('차대번호 (VIN)', 'vin', { required: true, readOnly: isEdit, placeholder: 'KMXXX...' })}
            {field('차량번호', 'plate_number', { required: true, placeholder: '12가3456' })}
            {field('차명', 'vehicle_name', { placeholder: '포터II' })}
            {field('엔진형식', 'engine_type', { placeholder: 'D4BH' })}
            {field('보정 전 차량번호', 'plate_number_original', { placeholder: '보정이 있는 경우만' })}
          </div>
        </div>

        {/* 소유자 */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">소유자 / 업체</p>
          <div className="grid grid-cols-2 gap-3">
            {field('소유자/업체명', 'owner_name', { placeholder: '홍길동' })}
            {field('연락처', 'owner_contact', { placeholder: '010-0000-0000' })}
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">주소</label>
            <input
              type="text"
              value={values.owner_address}
              onChange={e => set('owner_address', e.target.value)}
              placeholder="도로명 주소"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* DPF 장치 */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">DPF 장치</p>
          <div className="grid grid-cols-2 gap-3">
            {selectField('장치 종류', 'device_type', DEVICE_TYPE_OPTIONS)}
            {field('장치 일련번호', 'device_serial', { placeholder: '1269' })}
            {field('구변일자', 'installation_date', { type: 'date' })}
            {field('접수지자체', 'local_government', { placeholder: '서울특별시' })}
          </div>
        </div>

        {/* 등급 / 관리 */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">등급 / 관리</p>
          <div className="grid grid-cols-2 gap-3">
            {selectField('신뢰등급', 'trust_grade', TRUST_GRADE_OPTIONS)}
            {selectField('등급관리', 'grade_management', GRADE_MGMT_OPTIONS)}
            {selectField('관리방향', 'management_direction', MGMT_DIRECTION_OPTIONS)}
          </div>
        </div>

        {/* 벤더 */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">벤더</label>
          <div className="flex gap-3">
            {(['fujino', 'mz'] as const).map(v => (
              <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="vendor"
                  value={v}
                  checked={values.vendor === v}
                  onChange={() => set('vendor', v)}
                  className="text-blue-600"
                />
                <span className="text-sm">{v === 'fujino' ? '후지노' : '엠즈'}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
