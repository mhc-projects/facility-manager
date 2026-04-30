'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/ui/AdminLayout';
import FormRenderer from '@/components/forms/FormRenderer';
import Annex2Form from '@/components/forms/templates/Annex2Form';
import Annex3Form from '@/components/forms/templates/Annex3Form';
import Annex6Form from '@/components/forms/templates/Annex6Form';
import Annex7Form from '@/components/forms/templates/Annex7Form';
import { FormTemplate, DpfVehicle, FormFieldDefinition } from '@/types/dpf';
import { supabase } from '@/lib/supabase';
import { Printer, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// 실제 서식 레이아웃을 가진 annex 코드들
type AnnexTemplateComponent = React.ComponentType<{ vehicle: DpfVehicle }>;

const FORM_TEMPLATES: Record<string, AnnexTemplateComponent> = {
  annex_2: Annex2Form,
  annex_3: Annex3Form,
  annex_6: Annex6Form,
  annex_7: Annex7Form,
};

// 서식 이름 매핑
const FORM_NAMES: Record<string, string> = {
  annex_2: '별지 제2호 - 배출가스저감장치 부착 확인서',
  annex_3: '별지 제3호 - 보조금 지급 청구서 및 위임장',
  annex_6: '별지 제6호 - 저공해조치 신청서',
  annex_7: '별지 제7호 - 차량상태 및 저감장치 부착 품질 확인서',
};

// 기본 서식 정의 (DB에 없을 경우 폴백 / 템플릿 없는 annex용)
const DEFAULT_FORMS: Record<string, { name: string; fields: FormFieldDefinition[] }> = {
  annex_2: {
    name: '배출가스저감장치 부착 및 저공해엔진 개조·교체 확인서',
    fields: [
      { key: 'vehicle_name', label: '차명', type: 'text', vehicleField: 'vehicle_name' },
      { key: 'vin', label: '차대번호', type: 'text', vehicleField: 'vin', required: true },
      { key: 'plate_number', label: '차량번호', type: 'text', vehicleField: 'plate_number', required: true },
      { key: 'owner_name', label: '소유자성명', type: 'text', vehicleField: 'owner_name' },
      { key: 'owner_contact', label: '소유자 연락처', type: 'text', vehicleField: 'owner_contact' },
      { key: 'owner_address', label: '주소', type: 'text', vehicleField: 'owner_address' },
      { key: 'device_serial', label: '장치시리얼번호', type: 'text', vehicleField: 'device_serial' },
      { key: 'installation_date', label: '구변일자', type: 'date', vehicleField: 'installation_date' },
      { key: 'local_government', label: '접수지자체명', type: 'text', vehicleField: 'local_government' },
      { key: 'installer_company', label: '설치업체명', type: 'text', required: true },
      { key: 'installer_contact', label: '설치업체 연락처', type: 'text' },
      { key: 'device_model', label: '장치 모델명', type: 'text' },
      { key: 'notes', label: '특이사항', type: 'textarea' },
    ],
  },
  annex_6: {
    name: '저공해조치 신청서',
    fields: [
      { key: 'owner_name', label: '소유자성명', type: 'text', vehicleField: 'owner_name', required: true },
      { key: 'owner_address', label: '주소', type: 'text', vehicleField: 'owner_address' },
      { key: 'owner_contact', label: '연락처', type: 'text', vehicleField: 'owner_contact' },
      { key: 'vin', label: '차대번호', type: 'text', vehicleField: 'vin', required: true },
      { key: 'plate_number', label: '차량번호', type: 'text', vehicleField: 'plate_number', required: true },
      { key: 'vehicle_name', label: '차명', type: 'text', vehicleField: 'vehicle_name' },
      { key: 'measure_type', label: '저공해조치 종류', type: 'select', options: ['DPF 부착', '엔진교체', '전동화 개조', '조기폐차'], required: true },
      { key: 'application_date', label: '신청일', type: 'date' },
      { key: 'local_government', label: '접수지자체명', type: 'text', vehicleField: 'local_government' },
    ],
  },
  annex_7: {
    name: '차량상태 및 저감장치 부착 품질 확인서',
    fields: [
      { key: 'vehicle_name', label: '차명', type: 'text', vehicleField: 'vehicle_name' },
      { key: 'vin', label: '차대번호', type: 'text', vehicleField: 'vin', required: true },
      { key: 'plate_number', label: '차량번호', type: 'text', vehicleField: 'plate_number', required: true },
      { key: 'device_serial', label: '장치시리얼번호', type: 'text', vehicleField: 'device_serial' },
      { key: 'installation_date', label: '설치일자', type: 'date', vehicleField: 'installation_date' },
      { key: 'kd147_before', label: 'KD147 측정값 (부착 전)', type: 'number' },
      { key: 'kd147_after', label: 'KD147 측정값 (부착 후)', type: 'number' },
      { key: 'inspector_name', label: '검사자 성명', type: 'text', required: true },
      { key: 'inspection_date', label: '검사일자', type: 'date' },
      { key: 'pass_yn', label: '검사 합격', type: 'checkbox', placeholder: '합격' },
      { key: 'notes', label: '특이사항', type: 'textarea' },
    ],
  },
};

const DEFAULT_VEHICLE_FIELD_MAP: Record<string, string> = {
  vehicle_name: 'vehicle_name',
  vin: 'vin',
  plate_number: 'plate_number',
  owner_name: 'owner_name',
  owner_contact: 'owner_contact',
  owner_address: 'owner_address',
  device_serial: 'device_serial',
  installation_date: 'installation_date',
  local_government: 'local_government',
};

export default function FormDetailPage({ params }: { params: { code: string } }) {
  const code = params.code;
  const searchParams = useSearchParams();
  const vin = searchParams.get('vin') ?? '';

  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [vehicle, setVehicle] = useState<DpfVehicle | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const [tmplRes, vehRes] = await Promise.all([
        supabase.from('form_templates').select('*').eq('code', code).single(),
        vin ? supabase.from('dpf_vehicles').select('*').eq('vin', vin).single() : Promise.resolve({ data: null }),
      ]);
      setTemplate(tmplRes.data);
      setVehicle((vehRes as { data: DpfVehicle | null }).data);
      setLoading(false);
    };
    loadData();
  }, [code, vin]);

  // 차량 데이터로 초기값 설정 (FormRenderer 폴백용)
  useEffect(() => {
    if (!vehicle) return;
    const fieldMap = template?.vehicle_field_map ?? DEFAULT_VEHICLE_FIELD_MAP;
    const autoValues: Record<string, unknown> = {};
    for (const [formKey, vehicleKey] of Object.entries(fieldMap)) {
      const val = (vehicle as Record<string, unknown>)[vehicleKey];
      if (val != null) autoValues[formKey] = String(val);
    }
    setValues(prev => ({ ...autoValues, ...prev }));
  }, [vehicle, template]);

  const TemplateComponent = FORM_TEMPLATES[code];
  const hasTemplate = Boolean(TemplateComponent);

  const formDef = DEFAULT_FORMS[code];
  const fields: FormFieldDefinition[] = template?.schema ?? formDef?.fields ?? [];
  const formName = FORM_NAMES[code] ?? template?.name ?? formDef?.name ?? code;
  const vehicleFieldMap = template?.vehicle_field_map ?? DEFAULT_VEHICLE_FIELD_MAP;

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPdf() {
    if (!vehicle && !vin) return;
    setDownloading(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('form-print-area');
      if (!element) {
        alert('서식 영역을 찾을 수 없습니다.');
        return;
      }
      const plateNum = vehicle?.plate_number ?? vin ?? 'unknown';
      const safeFormName = formName.replace(/[<>:"/\\|?*]/g, '_');
      await html2pdf()
        .set({
          margin: 10,
          filename: `${safeFormName}_${plateNum}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(element)
        .save();
    } catch (err) {
      console.error('PDF 생성 오류:', err);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout title="서식 작성" description="로딩 중...">
        <div className="flex justify-center py-16 text-gray-400">로딩 중...</div>
      </AdminLayout>
    );
  }

  const actions = (
    <div className="flex gap-2 no-print">
      {hasTemplate && (
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {downloading ? 'PDF 생성 중...' : 'PDF 다운로드'}
        </button>
      )}
      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        <Printer className="w-4 h-4" /> 인쇄
      </button>
    </div>
  );

  return (
    <AdminLayout title={formName} description="서식 작성" actions={actions}>
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 no-print">
        <Link href="/wiki/forms" className="flex items-center gap-1 hover:text-blue-600">
          <ArrowLeft className="w-3.5 h-3.5" /> 서식 목록
        </Link>
        {vin && (
          <>
            <span>·</span>
            <Link href={`/dpf/${encodeURIComponent(vin)}`} className="hover:text-blue-600 font-mono">
              {vin}
            </Link>
          </>
        )}
      </div>

      {/* 실제 서식 템플릿이 있는 경우: 전체 너비로 렌더링 */}
      {hasTemplate && vehicle ? (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <TemplateComponent vehicle={vehicle} />
        </div>
      ) : hasTemplate && !vehicle ? (
        /* 템플릿은 있는데 차량 데이터가 없을 경우 */
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm font-medium">차량 데이터를 불러올 수 없습니다.</p>
          <p className="text-xs mt-1">VIN 파라미터가 올바른지 확인하세요.</p>
        </div>
      ) : (
        /* 템플릿 없음: 기존 FormRenderer 유지 (사이드바 레이아웃) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 차량 정보 사이드바 */}
          {vehicle && (
            <div className="lg:col-span-1 order-2 lg:order-1">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sticky top-4">
                <div className="text-sm font-semibold text-blue-800 mb-2">차량 정보 (자동입력)</div>
                <dl className="space-y-1 text-sm">
                  {([
                    ['차명', vehicle.vehicle_name],
                    ['차량번호', vehicle.plate_number],
                    ['차대번호', vehicle.vin],
                    ['소유자', vehicle.owner_name],
                    ['연락처', vehicle.owner_contact],
                    ['지자체', vehicle.local_government],
                    ['시리얼', vehicle.device_serial],
                    ['구변일자', vehicle.installation_date?.split('T')[0]],
                  ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex gap-1">
                      <dt className="text-blue-600 w-16 shrink-0 text-xs">{k}</dt>
                      <dd className="text-blue-900 text-xs truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {/* 서식 입력 폼 */}
          <div className={`${vehicle ? 'lg:col-span-2' : 'lg:col-span-3'} order-1 lg:order-2`}>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">{formName}</h2>
              <div className="text-xs text-gray-400 mb-5">
                버전: {template?.version ?? '2026.1'} · 코드: {code}
              </div>

              {fields.length > 0 ? (
                <FormRenderer
                  fields={fields}
                  vehicleData={vehicle ?? undefined}
                  vehicleFieldMap={vehicleFieldMap}
                  values={values}
                  onChange={(key, val) => setValues(prev => ({ ...prev, [key]: val }))}
                />
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">이 서식의 필드 정보가 없습니다.</p>
                  <p className="text-xs mt-1">관리자에서 서식 파일을 업로드하면 자동으로 추출됩니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 인쇄 전용 스타일 */}
      <style jsx global>{`
        @media print {
          body > *:not(#__next) { display: none !important; }
          .no-print { display: none !important; }
          nav, header, aside { display: none !important; }
          #form-print-area {
            width: 210mm !important;
            margin: 0 !important;
            padding: 10mm !important;
          }
          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>
    </AdminLayout>
  );
}
