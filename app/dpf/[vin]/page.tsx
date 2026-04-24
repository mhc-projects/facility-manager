'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/ui/AdminLayout';
import { DpfVehicle, DpfDeviceInstallation, DpfPerformanceInspection, DpfSubsidyApplication, DpfCallMonitoring } from '@/types/dpf';
import { ChevronRight } from 'lucide-react';

interface VehicleDetail {
  vehicle: DpfVehicle;
  installations: DpfDeviceInstallation[];
  inspections: DpfPerformanceInspection[];
  subsidies: DpfSubsidyApplication[];
  callMonitoring: DpfCallMonitoring[];
}

const TABS = [
  { key: 'basic', label: '기본정보' },
  { key: 'installation', label: '설치이력' },
  { key: 'inspection', label: '성능검사' },
  { key: 'subsidy', label: '보조금' },
  { key: 'documents', label: '서식출력' },
  { key: 'call', label: '콜모니터링' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function DpfVehicleDetailPage({ params }: { params: { vin: string } }) {
  const vin = decodeURIComponent(params.vin);
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('basic');

  useEffect(() => {
    fetch(`/api/dpf/vehicles/${encodeURIComponent(vin)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setDetail(data);
      })
      .catch(() => setError('데이터를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, [vin]);

  if (loading) {
    return (
      <AdminLayout title="차량 상세" description="로딩 중...">
        <div className="flex items-center justify-center h-64 text-gray-500">
          <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          로딩 중...
        </div>
      </AdminLayout>
    );
  }

  if (error || !detail) {
    return (
      <AdminLayout title="차량 상세" description="오류">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-md">
          <p className="text-red-700">{error || '차량을 찾을 수 없습니다.'}</p>
          <Link href="/dpf" className="mt-3 inline-block text-blue-600 hover:underline text-sm">
            목록으로 돌아가기
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const { vehicle, installations, inspections, subsidies, callMonitoring } = detail;

  const breadcrumb = (
    <div className="flex items-center gap-1 text-sm text-gray-500">
      <Link href="/dpf" className="hover:text-blue-600">DPF 차량 관리</Link>
      <ChevronRight className="w-3 h-3" />
      <span className="font-mono text-gray-700">{vin}</span>
    </div>
  );

  return (
    <AdminLayout
      title={vehicle.vehicle_name || vin}
      description={`${vehicle.plate_number} · ${vehicle.local_government || '-'}`}
    >
      {breadcrumb}

      {/* 차량 헤더 카드 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mt-3 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">
                {vehicle.vehicle_name || '(차명 없음)'}
              </h2>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                {vehicle.plate_number}
              </span>
            </div>
            <p className="mt-1 font-mono text-sm text-gray-500">{vehicle.vin}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium text-gray-800">{vehicle.local_government || '-'}</div>
            <div className="text-xs text-gray-400">접수 지자체</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['소유자', vehicle.owner_name],
            ['연락처', vehicle.owner_contact],
            ['장치 시리얼', vehicle.device_serial],
            ['구변일자', vehicle.installation_date?.split('T')[0]],
          ].map(([label, value]) => (
            <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="font-medium text-gray-800 mt-0.5 text-sm">{value || '-'}</div>
            </div>
          ))}
        </div>
        {vehicle.owner_address && (
          <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5">
            주소: {vehicle.owner_address}
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.key === 'installation' && installations.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                {installations.length}
              </span>
            )}
            {tab.key === 'inspection' && inspections.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                {inspections.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        {activeTab === 'basic' && <BasicInfoTab vehicle={vehicle} />}
        {activeTab === 'installation' && <InstallationTab installations={installations} />}
        {activeTab === 'inspection' && <InspectionTab inspections={inspections} />}
        {activeTab === 'subsidy' && <SubsidyTab subsidies={subsidies} />}
        {activeTab === 'documents' && <DocumentsTab vehicle={vehicle} />}
        {activeTab === 'call' && <CallMonitoringTab records={callMonitoring} />}
      </div>
    </AdminLayout>
  );
}

// ─── 탭 컴포넌트들 ──────────────────────────────────────────

function BasicInfoTab({ vehicle }: { vehicle: DpfVehicle }) {
  const rows = [
    ['차대번호 (VIN)', vehicle.vin],
    ['차량번호', vehicle.plate_number],
    ['차명', vehicle.vehicle_name],
    ['소유자성명', vehicle.owner_name],
    ['주소', vehicle.owner_address],
    ['연락처', vehicle.owner_contact],
    ['접수지자체명', vehicle.local_government],
    ['장치시리얼번호', vehicle.device_serial],
    ['구변일자', vehicle.installation_date?.split('T')[0]],
  ];
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-3">기본 정보</h3>
      <dl className="divide-y divide-gray-100">
        {rows.map(([label, value]) => (
          <div key={label} className="py-2.5 grid grid-cols-3 gap-3 text-sm">
            <dt className="text-gray-500 font-medium">{label}</dt>
            <dd className="col-span-2 text-gray-900">{value || '-'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function InstallationTab({ installations }: { installations: DpfDeviceInstallation[] }) {
  if (!installations.length) return <EmptyState message="설치 이력이 없습니다." />;
  const actionLabel: Record<string, string> = { install: '설치', remove: '탈착', replace: '교체' };
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-3">장치 설치/탈착 이력</h3>
      <div className="space-y-3">
        {installations.map(inst => (
          <div key={inst.id} className="border border-gray-200 rounded-lg p-3 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                inst.action_type === 'install' ? 'bg-green-100 text-green-700' :
                inst.action_type === 'remove' ? 'bg-red-100 text-red-700' :
                'bg-yellow-100 text-yellow-700'}`}>
                {actionLabel[inst.action_type]}
              </span>
              <span className="text-gray-500">{inst.installation_date || '-'}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {([['시리얼번호', inst.serial_number], ['설치업체', inst.installer_company],
                 ['관리번호', inst.management_number], ['판매사무소', inst.sales_office]] as [string, string | null | undefined][])
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex gap-1">
                    <dt className="text-gray-500">{k}:</dt>
                    <dd className="text-gray-800">{v}</dd>
                  </div>
                ))}
            </dl>
            {inst.notes && <p className="mt-1 text-xs text-gray-500">{inst.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function InspectionTab({ inspections }: { inspections: DpfPerformanceInspection[] }) {
  if (!inspections.length) return <EmptyState message="성능검사 이력이 없습니다." />;
  const typeLabel: Record<string, string> = { initial: '최초검사', confirmation: '확인검사', periodic: '정기검사' };
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-3">성능검사 이력</h3>
      <div className="space-y-3">
        {inspections.map(insp => (
          <div key={insp.id} className="border border-gray-200 rounded-lg p-3 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-gray-700">{insp.inspection_date || '-'}</span>
              {insp.inspection_type && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                  {typeLabel[insp.inspection_type]}
                </span>
              )}
              {insp.pass_yn != null && (
                <span className={`px-2 py-0.5 text-xs rounded font-medium ${insp.pass_yn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {insp.pass_yn ? '합격' : '불합격'}
                </span>
              )}
            </div>
            {insp.inspection_agency && <p className="text-xs text-gray-500 mb-2">{insp.inspection_agency}</p>}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {([['KD147', insp.kd147_before, insp.kd147_after],
                 ['Lugdown', insp.lugdown_before, insp.lugdown_after],
                 ['자유가속', insp.free_accel_before, insp.free_accel_after]] as [string, number | null | undefined, number | null | undefined][])
                .map(([label, before, after]) => (
                  <div key={label} className="bg-gray-50 rounded p-1.5">
                    <div className="text-gray-500 mb-1">{label}</div>
                    <div className="flex gap-1 items-center">
                      <span className="text-red-600">{before ?? '-'}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-green-600">{after ?? '-'}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubsidyTab({ subsidies }: { subsidies: DpfSubsidyApplication[] }) {
  if (!subsidies.length) return <EmptyState message="보조금 이력이 없습니다." />;
  const statusLabel: Record<string, { label: string; color: string }> = {
    pending:   { label: '대기', color: 'bg-yellow-100 text-yellow-700' },
    approved:  { label: '승인', color: 'bg-green-100 text-green-700' },
    rejected:  { label: '반려', color: 'bg-red-100 text-red-700' },
    cancelled: { label: '취소', color: 'bg-gray-100 text-gray-600' },
  };
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-3">보조금 신청 이력</h3>
      <div className="space-y-3">
        {subsidies.map(sub => {
          const st = sub.approval_status ? statusLabel[sub.approval_status] : null;
          return (
            <div key={sub.id} className="border border-gray-200 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-gray-700">{sub.reception_date || '-'} 접수</span>
                {st && <span className={`px-2 py-0.5 text-xs rounded font-medium ${st.color}`}>{st.label}</span>}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {([['지자체', sub.local_government], ['청구금액', sub.subsidy_claim_amount?.toLocaleString()],
                   ['지급일', sub.subsidy_payment_date], ['자부담(탈거)', sub.self_payment_removal?.toLocaleString()]] as [string, string | undefined][])
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-1">
                      <dt className="text-gray-500">{k}:</dt>
                      <dd className="text-gray-800">{v}</dd>
                    </div>
                  ))}
              </dl>
              {sub.notes && <p className="mt-1 text-xs text-gray-500">{sub.notes}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocumentsTab({ vehicle }: { vehicle: DpfVehicle }) {
  const forms = [
    { code: 'annex_2', name: 'DPF 부착 및 저공해엔진 개조·교체 확인서', auto: true },
    { code: 'annex_3', name: '보조금 지급 청구서 + 위임장', auto: true },
    { code: 'annex_6', name: '저공해조치 신청서', auto: true },
    { code: 'annex_7', name: '차량상태 및 저감장치 부착 품질 확인서', auto: true },
    { code: 'annex_1', name: '국고보조금 교부신청서', auto: false },
    { code: 'annex_4', name: '보조사업 수행 및 예산집행 실적보고서', auto: false },
  ];
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-3">서식 출력</h3>
      <p className="text-xs text-gray-500 mb-4">차량 정보가 자동으로 입력됩니다. 서식을 선택하여 작성·출력하세요.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {forms.map(form => (
          <Link key={form.code}
            href={`/dpf/wiki/forms/${form.code}?vin=${encodeURIComponent(vehicle.vin)}`}
            className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-blue-50
                       hover:border-blue-300 transition-colors group">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 group-hover:text-blue-700 truncate">{form.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{form.code.replace('_', ' ')}</div>
            </div>
            {form.auto && (
              <span className="shrink-0 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">자동입력</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function CallMonitoringTab({ records }: { records: DpfCallMonitoring[] }) {
  if (!records.length) return <EmptyState message="콜모니터링 이력이 없습니다." />;
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-3">콜모니터링 이력</h3>
      <div className="space-y-2">
        {records.map(r => (
          <div key={r.id} className="border border-gray-200 rounded-lg p-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-gray-600">{r.monitoring_date || '-'}</span>
              {r.satisfaction_score && (
                <div className="flex">
                  {Array.from({ length: 5 }, (_, i) => (
                    <svg key={i} className={`w-3.5 h-3.5 ${i < r.satisfaction_score! ? 'text-yellow-400' : 'text-gray-200'}`}
                      fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  ))}
                </div>
              )}
              {r.call_agent && <span className="text-xs text-gray-400">담당: {r.call_agent}</span>}
            </div>
            {r.memo && <p className="mt-1 text-xs text-gray-600">{r.memo}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <svg className="mx-auto w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  );
}
