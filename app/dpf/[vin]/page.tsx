'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/ui/AdminLayout';
import VehicleFormModal from '@/components/dpf/VehicleFormModal';
import SubRecordFormModal, { SubRecordType } from '@/components/dpf/SubRecordFormModal';
import { ConfirmModal } from '@/components/ui/Modal';
import {
  DpfVehicle, DpfDeviceInstallation, DpfPerformanceInspection,
  DpfSubsidyApplication, DpfCallMonitoring, FormTemplate,
} from '@/types/dpf';
import {
  ChevronRight, Pencil, Trash2, Plus, ArrowLeft,
  Car, Phone, MapPin, Hash, Calendar,
} from 'lucide-react';

interface VehicleDetail {
  vehicle: DpfVehicle;
  installations: DpfDeviceInstallation[];
  inspections: DpfPerformanceInspection[];
  subsidies: DpfSubsidyApplication[];
  callMonitoring: DpfCallMonitoring[];
}

const ALL_TABS = [
  { key: 'basic',        label: '기본정보',   vendors: ['fujino', 'mz'] },
  { key: 'installation', label: '설치이력',   vendors: ['fujino'] },
  { key: 'inspection',   label: '성능검사',   vendors: ['fujino'] },
  { key: 'subsidy',      label: '보조금',     vendors: ['fujino'] },
  { key: 'documents',    label: '서식출력',   vendors: ['fujino', 'mz'] },
  { key: 'call',         label: '콜모니터링', vendors: ['fujino', 'mz'] },
] as const;

type TabKey = typeof ALL_TABS[number]['key'];

interface SubRecordModal {
  type: SubRecordType;
  record?: DpfDeviceInstallation | DpfPerformanceInspection | DpfSubsidyApplication | DpfCallMonitoring;
}

interface DeleteState {
  label: string;
  onConfirm: () => Promise<void>;
}

export default function DpfVehicleDetailPage({ params }: { params: { vin: string } }) {
  const vin = decodeURIComponent(params.vin);
  const router = useRouter();

  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('basic');

  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [subModal, setSubModal] = useState<SubRecordModal | null>(null);

  const loadDetail = useCallback(() => {
    setLoading(true);
    fetch(`/api/dpf/vehicles/${encodeURIComponent(vin)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setDetail(data);
      })
      .catch(() => setError('데이터를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, [vin]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  function openDeleteVehicle() {
    setDeleteState({
      label: `${detail?.vehicle.plate_number ?? vin} 차량을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
      onConfirm: async () => {
        const res = await fetch(`/api/dpf/vehicles/${encodeURIComponent(vin)}`, { method: 'DELETE' });
        if (res.ok) router.replace('/dpf');
        else setError('삭제에 실패했습니다');
      },
    });
  }

  function openDeleteRecord(
    type: 'installations' | 'inspections' | 'subsidies' | 'calls',
    id: string,
    label: string
  ) {
    setDeleteState({
      label: `${label}을(를) 삭제하시겠습니까?`,
      onConfirm: async () => {
        const res = await fetch(`/api/dpf/vehicles/${encodeURIComponent(vin)}/${type}/${id}`, { method: 'DELETE' });
        if (res.ok) loadDetail();
        else setError('삭제에 실패했습니다');
      },
    });
  }

  async function handleConfirmDelete() {
    if (!deleteState) return;
    setDeleting(true);
    await deleteState.onConfirm();
    setDeleting(false);
    setDeleteState(null);
  }

  if (loading) {
    return (
      <AdminLayout title="차량 상세" description="">
        <div className="space-y-4 animate-pulse">
          <div className="h-6 w-48 bg-gray-100 rounded-lg" />
          <div className="h-40 bg-gray-100 rounded-xl" />
          <div className="h-10 bg-gray-100 rounded-xl" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !detail) {
    return (
      <AdminLayout title="차량 상세" description="">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
            <Car className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-base font-semibold text-gray-800">{error || '차량을 찾을 수 없습니다.'}</p>
          <p className="text-sm text-gray-500 mt-1">차대번호를 확인하거나 목록으로 돌아가세요.</p>
          <Link href="/dpf"
            className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 목록으로
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const { vehicle, installations, inspections, subsidies, callMonitoring } = detail;
  const tabs = ALL_TABS.filter(t => t.vendors.includes(vehicle.vendor ?? 'fujino'));

  const tabCounts: Partial<Record<TabKey, number>> = {
    installation: installations.length,
    inspection: inspections.length,
    subsidy: subsidies.length,
    call: callMonitoring.length,
  };

  const isVendorMz = vehicle.vendor === 'mz';
  const vendorColor = isVendorMz
    ? 'from-violet-600 to-purple-700'
    : 'from-blue-600 to-blue-800';

  return (
    <AdminLayout title={vehicle.vehicle_name || vin} description="">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-1.5 text-sm mb-4">
        <Link href="/dpf" className="flex items-center gap-1 text-gray-500 hover:text-blue-600 transition-colors font-medium">
          <ArrowLeft className="w-3.5 h-3.5" />
          DPF 차량 관리
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="font-mono text-gray-600 text-xs bg-gray-100 px-2 py-0.5 rounded">{vin}</span>
      </nav>

      {/* 차량 히어로 카드 */}
      <div className={`relative overflow-hidden bg-gradient-to-br ${vendorColor} rounded-2xl shadow-lg shadow-blue-200/50 mb-5`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-white/20" />
          <div className="absolute -right-4 top-16 w-32 h-32 rounded-full bg-white/10" />
        </div>

        <div className="relative z-10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/20 text-white text-xs font-bold tracking-wide backdrop-blur-sm">
                  {isVendorMz ? 'MZ · 엠즈' : 'FJ · 후지노'}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/20 text-white text-xs font-semibold backdrop-blur-sm">
                  {vehicle.plate_number || '-'}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white mt-2 leading-tight">
                {vehicle.vehicle_name || '(차명 미등록)'}
              </h1>
              <p className="mt-1 font-mono text-blue-100 text-xs tracking-wider">{vehicle.vin}</p>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all backdrop-blur-sm border border-white/20"
              >
                <Pencil className="w-3.5 h-3.5" /> 수정
              </button>
              <button
                onClick={openDeleteVehicle}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-all backdrop-blur-sm"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제
              </button>
            </div>
          </div>

          {/* 핵심 정보 칩 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {vehicle.owner_name && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/15 rounded-lg text-white text-xs backdrop-blur-sm">
                <Car className="w-3 h-3 text-blue-200" />
                <span>{vehicle.owner_name}</span>
              </div>
            )}
            {vehicle.owner_contact && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/15 rounded-lg text-white text-xs backdrop-blur-sm">
                <Phone className="w-3 h-3 text-blue-200" />
                <span className="tabular-nums">{vehicle.owner_contact}</span>
              </div>
            )}
            {vehicle.local_government && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/15 rounded-lg text-white text-xs backdrop-blur-sm">
                <MapPin className="w-3 h-3 text-blue-200" />
                <span>{vehicle.local_government}</span>
              </div>
            )}
            {vehicle.device_serial && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/15 rounded-lg text-white text-xs font-mono backdrop-blur-sm">
                <Hash className="w-3 h-3 text-blue-200" />
                <span>{vehicle.device_serial}</span>
              </div>
            )}
            {vehicle.installation_date && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/15 rounded-lg text-white text-xs backdrop-blur-sm">
                <Calendar className="w-3 h-3 text-blue-200" />
                <span>{vehicle.installation_date.split('T')[0]}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 탭 바 */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-4 overflow-x-auto">
        {tabs.map(tab => {
          const count = tabCounts[tab.key];
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {count != null && count > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {activeTab === 'basic' && <BasicInfoTab vehicle={vehicle} />}
        {activeTab === 'installation' && (
          <InstallationTab
            installations={installations}
            onAdd={() => setSubModal({ type: 'installation' })}
            onEdit={r => setSubModal({ type: 'installation', record: r })}
            onDelete={r => openDeleteRecord('installations', r.id, `${r.installation_date ?? ''} ${r.action_type}`)}
          />
        )}
        {activeTab === 'inspection' && (
          <InspectionTab
            inspections={inspections}
            onAdd={() => setSubModal({ type: 'inspection' })}
            onEdit={r => setSubModal({ type: 'inspection', record: r })}
            onDelete={r => openDeleteRecord('inspections', r.id, `${r.inspection_date ?? ''} 검사`)}
          />
        )}
        {activeTab === 'subsidy' && (
          <SubsidyTab
            subsidies={subsidies}
            onAdd={() => setSubModal({ type: 'subsidy' })}
            onEdit={r => setSubModal({ type: 'subsidy', record: r })}
            onDelete={r => openDeleteRecord('subsidies', r.id, `${r.reception_date ?? ''} 보조금`)}
          />
        )}
        {activeTab === 'documents' && <DocumentsTab vehicle={vehicle} />}
        {activeTab === 'call' && (
          <CallMonitoringTab
            records={callMonitoring}
            onAdd={() => setSubModal({ type: 'call' })}
            onEdit={r => setSubModal({ type: 'call', record: r })}
            onDelete={r => openDeleteRecord('calls', r.id, `${r.monitoring_date ?? ''} 콜`)}
          />
        )}
      </div>

      {/* 차량 수정 모달 */}
      <VehicleFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        vehicle={vehicle}
        onSuccess={() => { setShowEditModal(false); loadDetail(); }}
      />

      {/* 이력 추가/수정 모달 */}
      {subModal && (
        <SubRecordFormModal
          isOpen={true}
          onClose={() => setSubModal(null)}
          onSuccess={() => { setSubModal(null); loadDetail(); }}
          type={subModal.type}
          vin={vin}
          record={subModal.record}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      <ConfirmModal
        isOpen={Boolean(deleteState)}
        onClose={() => setDeleteState(null)}
        onConfirm={handleConfirmDelete}
        title="삭제 확인"
        message={deleteState?.label ?? ''}
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        loading={deleting}
      />
    </AdminLayout>
  );
}

// ─── 공통 컴포넌트 ────────────────────────────────────────────

function TabHeader({ title, count, onAdd }: { title: string; count?: number; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {count != null && count > 0 && (
          <span className="text-xs text-gray-500 tabular-nums">총 {count}건</span>
        )}
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
      >
        <Plus className="w-3.5 h-3.5" /> 이력 추가
      </button>
    </div>
  );
}

function RecordActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-1">
      <button
        onClick={onEdit}
        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
        title="수정"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
        title="삭제"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-500">{message}</p>
      <p className="text-xs text-gray-400 mt-0.5">위 버튼을 눌러 이력을 추가하세요.</p>
    </div>
  );
}

// ─── 탭 컴포넌트들 ────────────────────────────────────────────

function BasicInfoTab({ vehicle }: { vehicle: DpfVehicle }) {
  const rd = (vehicle.raw_data ?? {}) as Record<string, unknown>;
  const r = (key: string) => {
    const v = rd[key];
    return v != null && v !== '' ? String(v) : null;
  };

  const sections: { title: string; rows: [string, string | null | undefined][] }[] = [
    {
      title: '차량 식별',
      rows: [
        ['차대번호 (VIN)', vehicle.vin],
        ['현재 차량번호', vehicle.plate_number],
        ['이전 차량번호', r('이전 차량번호')],
        ['차명', vehicle.vehicle_name],
        ['제작사', r('제작사')],
      ],
    },
    {
      title: '소유자 / 업체',
      rows: [
        ['현재 업체명', vehicle.owner_name],
        ['이전 업체명', r('이전 업체명')],
        ['최종연락처', vehicle.owner_contact],
        ['주소', vehicle.owner_address],
      ],
    },
    {
      title: '장치 정보',
      rows: [
        ['부착장치', r('부착장치')],
        ['일련번호(전)', r('일련번호(전)')],
        ['일련번호(후)', vehicle.device_serial],
        ['구조변경일자', vehicle.installation_date?.split('T')[0]],
      ],
    },
    {
      title: '행정 정보',
      rows: [
        ['지자체(대)', vehicle.local_government],
        ['지자체(소)', r('지자체(소)')],
        ['최종실시일자', r('최종실시일자')],
        ['청구년월', r('청구년월')],
        ['조치공업사', r('조치공업사')],
        ['장소', r('장소')],
      ],
    },
  ];

  return (
    <div className="divide-y divide-gray-100">
      {sections.map(section => (
        <div key={section.title} className="px-5 py-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{section.title}</h4>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
            {section.rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between py-2 border-b border-gray-50">
                <dt className="text-sm text-gray-500 min-w-[110px]">{label}</dt>
                <dd className={`text-sm font-medium text-right ml-2 ${value ? 'text-gray-900' : 'text-gray-300'}`}>
                  {value || '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function InstallationTab({
  installations, onAdd, onEdit, onDelete,
}: {
  installations: DpfDeviceInstallation[];
  onAdd: () => void;
  onEdit: (r: DpfDeviceInstallation) => void;
  onDelete: (r: DpfDeviceInstallation) => void;
}) {
  const actionConfig: Record<string, { label: string; color: string }> = {
    install: { label: '설치', color: 'bg-emerald-100 text-emerald-700' },
    remove:  { label: '탈착', color: 'bg-red-100 text-red-700' },
    replace: { label: '교체', color: 'bg-amber-100 text-amber-700' },
  };

  return (
    <div>
      <TabHeader title="장치 설치/탈착 이력" count={installations.length} onAdd={onAdd} />
      {installations.length === 0 ? (
        <EmptyState message="설치 이력이 없습니다." />
      ) : (
        <div className="divide-y divide-gray-50">
          {installations.map(inst => {
            const cfg = actionConfig[inst.action_type] ?? { label: inst.action_type, color: 'bg-gray-100 text-gray-600' };
            return (
              <div key={inst.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-sm font-medium text-gray-700 tabular-nums">
                      {inst.installation_date || '날짜 미등록'}
                    </span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <RecordActions onEdit={() => onEdit(inst)} onDelete={() => onDelete(inst)} />
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                  {([
                    ['시리얼번호', inst.serial_number],
                    ['설치업체', inst.installer_company],
                    ['관리번호', inst.management_number],
                    ['판매사무소', inst.sales_office],
                  ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] text-gray-400 uppercase tracking-wide">{k}</dt>
                      <dd className="text-xs text-gray-700 font-medium mt-0.5">{v}</dd>
                    </div>
                  ))}
                </dl>
                {inst.notes && <p className="mt-2 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">{inst.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InspectionTab({
  inspections, onAdd, onEdit, onDelete,
}: {
  inspections: DpfPerformanceInspection[];
  onAdd: () => void;
  onEdit: (r: DpfPerformanceInspection) => void;
  onDelete: (r: DpfPerformanceInspection) => void;
}) {
  const typeLabel: Record<string, string> = { initial: '최초검사', confirmation: '확인검사', periodic: '정기검사' };

  return (
    <div>
      <TabHeader title="성능검사 이력" count={inspections.length} onAdd={onAdd} />
      {inspections.length === 0 ? (
        <EmptyState message="성능검사 이력이 없습니다." />
      ) : (
        <div className="divide-y divide-gray-50">
          {inspections.map(insp => (
            <div key={insp.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">
                    {insp.inspection_date || '날짜 미등록'}
                  </span>
                  {insp.inspection_type && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-md">
                      {typeLabel[insp.inspection_type]}
                    </span>
                  )}
                  {insp.pass_yn != null && (
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-md ${
                      insp.pass_yn ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {insp.pass_yn ? '합격' : '불합격'}
                    </span>
                  )}
                  {insp.inspection_agency && (
                    <span className="text-xs text-gray-400">{insp.inspection_agency}</span>
                  )}
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <RecordActions onEdit={() => onEdit(insp)} onDelete={() => onDelete(insp)} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {([
                  ['KD147', insp.kd147_before, insp.kd147_after],
                  ['Lugdown', insp.lugdown_before, insp.lugdown_after],
                  ['자유가속', insp.free_accel_before, insp.free_accel_after],
                ] as [string, number | null | undefined, number | null | undefined][]).map(([label, before, after]) => (
                  <div key={label} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-mono font-medium text-orange-600">{before ?? '—'}</span>
                      <span className="text-gray-300 text-xs">→</span>
                      <span className="font-mono font-medium text-emerald-600">{after ?? '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubsidyTab({
  subsidies, onAdd, onEdit, onDelete,
}: {
  subsidies: DpfSubsidyApplication[];
  onAdd: () => void;
  onEdit: (r: DpfSubsidyApplication) => void;
  onDelete: (r: DpfSubsidyApplication) => void;
}) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    pending:   { label: '검토중', color: 'bg-amber-100 text-amber-700' },
    approved:  { label: '승인',   color: 'bg-emerald-100 text-emerald-700' },
    rejected:  { label: '반려',   color: 'bg-red-100 text-red-700' },
    cancelled: { label: '취소',   color: 'bg-gray-100 text-gray-500' },
  };

  return (
    <div>
      <TabHeader title="보조금 신청 이력" count={subsidies.length} onAdd={onAdd} />
      {subsidies.length === 0 ? (
        <EmptyState message="보조금 이력이 없습니다." />
      ) : (
        <div className="divide-y divide-gray-50">
          {subsidies.map(sub => {
            const st = sub.approval_status ? statusConfig[sub.approval_status] : null;
            return (
              <div key={sub.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800 tabular-nums">
                      {sub.reception_date || '날짜 미등록'} 접수
                    </span>
                    {st && (
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-md ${st.color}`}>{st.label}</span>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <RecordActions onEdit={() => onEdit(sub)} onDelete={() => onDelete(sub)} />
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                  {([
                    ['지자체', sub.local_government],
                    ['청구금액', sub.subsidy_claim_amount != null ? `${sub.subsidy_claim_amount.toLocaleString()}원` : null],
                    ['지급일', sub.subsidy_payment_date],
                    ['자부담(탈거)', sub.self_payment_removal != null ? `${sub.self_payment_removal.toLocaleString()}원` : null],
                  ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] text-gray-400 uppercase tracking-wide">{k}</dt>
                      <dd className="text-xs text-gray-700 font-medium mt-0.5">{v}</dd>
                    </div>
                  ))}
                </dl>
                {sub.notes && <p className="mt-2 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">{sub.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ALL_FORMS = [
  { code: 'annex_1',   name: '국고보조금 교부신청서', auto: false, icon: '🏛' },
  { code: 'annex_2',   name: 'DPF 부착 및 저공해엔진 개조·교체 확인서', auto: true, icon: '📋' },
  { code: 'annex_2_2', name: '건설기계 엔진교체·개조 확인서', auto: true, icon: '🚜' },
  { code: 'annex_3',   name: '보조금 지급 청구서 + 위임장 (소유자→제작사)', auto: true, icon: '💳' },
  { code: 'annex_3_2', name: '보조금 지급 청구서 (제작사→지자체)', auto: true, icon: '💰' },
  { code: 'annex_4',   name: '보조사업 수행 및 예산집행 실적보고서', auto: false, icon: '📊' },
  { code: 'annex_5',   name: '유지관리비용 집행실적', auto: false, icon: '📈' },
  { code: 'annex_6',   name: '저공해조치 신청서', auto: true, icon: '📝' },
  { code: 'annex_7',   name: '차량상태 및 저감장치 부착 품질 확인서', auto: true, icon: '✅' },
  { code: 'annex_7_2', name: '건설기계 엔진교체 전/후 점검표(지게차)', auto: true, icon: '🔍' },
  { code: 'annex_7_3', name: '건설기계 엔진교체 전/후 점검표(굴착기·로더)', auto: true, icon: '🔍' },
  { code: 'annex_7_4', name: '건설기계 엔진교체 전/후 점검표(롤러)', auto: true, icon: '🔍' },
  { code: 'annex_7_5', name: '건설기계 전동화 개조 전/후 점검표(지게차)', auto: true, icon: '⚡' },
  { code: 'annex_7_6', name: '자동차 전동화 개조 전/후 점검표(1톤 화물차)', auto: true, icon: '⚡' },
];

function DocumentsTab({ vehicle }: { vehicle: DpfVehicle }) {
  const [templates, setTemplates] = useState<Map<string, FormTemplate>>(new Map());

  useEffect(() => {
    fetch('/api/wiki/form-templates')
      .then(r => r.json())
      .then(({ templates: list }) => {
        const map = new Map<string, FormTemplate>();
        (list ?? []).forEach((t: FormTemplate) => map.set(t.code, t));
        setTemplates(map);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="px-5 py-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">서식 출력</h3>
          <p className="text-xs text-gray-500 mt-0.5">서식을 선택하면 차량 정보가 자동으로 입력됩니다.</p>
        </div>
        <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-1 rounded-lg font-medium">
          자동입력 가능
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ALL_FORMS.map(form => {
          const hasTemplate = templates.has(form.code);
          return (
            <Link
              key={form.code}
              href={`/wiki/forms/${form.code}?vin=${encodeURIComponent(vehicle.vin)}`}
              className="group flex items-center gap-3 p-3.5 border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-150"
            >
              <span className="text-xl">{form.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 group-hover:text-blue-700 leading-snug">
                  {form.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-gray-400 font-mono">{form.code.replace(/_/g, ' ')}</span>
                  {form.auto && <span className="text-xs text-amber-500">· 자동입력</span>}
                  {hasTemplate && <span className="text-xs text-green-600">· 등록됨</span>}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CallMonitoringTab({
  records, onAdd, onEdit, onDelete,
}: {
  records: DpfCallMonitoring[];
  onAdd: () => void;
  onEdit: (r: DpfCallMonitoring) => void;
  onDelete: (r: DpfCallMonitoring) => void;
}) {
  return (
    <div>
      <TabHeader title="콜모니터링 이력" count={records.length} onAdd={onAdd} />
      {records.length === 0 ? (
        <EmptyState message="콜모니터링 이력이 없습니다." />
      ) : (
        <div className="divide-y divide-gray-50">
          {records.map(r => (
            <div key={r.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">
                    {r.monitoring_date || '날짜 미등록'}
                  </span>
                  {r.satisfaction_score != null && (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <svg key={i} className={`w-3.5 h-3.5 ${i < r.satisfaction_score! ? 'text-amber-400' : 'text-gray-200'}`}
                          fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                  )}
                  {r.call_agent && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">담당: {r.call_agent}</span>
                  )}
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <RecordActions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} />
                </div>
              </div>
              {r.memo && (
                <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">{r.memo}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
