'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/ui/AdminLayout';
import { FormTemplate } from '@/types/dpf';
import { supabase } from '@/lib/supabase';
import { File, Upload, CheckCircle } from 'lucide-react';

const FORM_LIST = [
  { code: 'annex_1',   name: '국고보조금 교부신청서', auto: false },
  { code: 'annex_2',   name: 'DPF 부착 및 저공해엔진 개조·교체 확인서', auto: true },
  { code: 'annex_2_2', name: '건설기계 엔진교체·개조 확인서', auto: true },
  { code: 'annex_3',   name: '보조금 지급 청구서 + 위임장 (소유자→제작사)', auto: true },
  { code: 'annex_3_2', name: '보조금 지급 청구서 (제작사→지자체)', auto: true },
  { code: 'annex_4',   name: '보조사업 수행 및 예산집행 실적보고서', auto: false },
  { code: 'annex_5',   name: '유지관리비용 집행실적', auto: false },
  { code: 'annex_6',   name: '저공해조치 신청서', auto: true },
  { code: 'annex_7',   name: '차량상태 및 저감장치 부착 품질 확인서', auto: true },
  { code: 'annex_7_2', name: '건설기계 엔진교체 전/후 점검표(지게차)', auto: true },
  { code: 'annex_7_3', name: '건설기계 엔진교체 전/후 점검표(굴착기·로더)', auto: true },
  { code: 'annex_7_4', name: '건설기계 엔진교체 전/후 점검표(롤러)', auto: true },
  { code: 'annex_7_5', name: '건설기계 전동화 개조 전/후 점검표(지게차)', auto: true },
  { code: 'annex_7_6', name: '자동차 전동화 개조 전/후 점검표(1톤 화물차)', auto: true },
];

export default function WikiFormsPage() {
  const [templates, setTemplates] = useState<Map<string, FormTemplate>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('form_templates')
      .select('*')
      .eq('is_active', true)
      .then(({ data }) => {
        const map = new Map<string, FormTemplate>();
        (data ?? []).forEach((t: FormTemplate) => map.set(t.code, t));
        setTemplates(map);
        setLoading(false);
      });
  }, []);

  const actions = (
    <Link href="/dpf/wiki/admin"
      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
      <Upload className="w-4 h-4" /> 서식 관리
    </Link>
  );

  return (
    <AdminLayout title="공식 서식 14종" description="운행차 배출가스 저감사업 공식 서식 목록" actions={actions}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {FORM_LIST.map(form => {
          const template = templates.get(form.code);
          const hasTemplate = !!template;

          return (
            <div key={form.code}
              className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col">
              <div className="flex items-start gap-3 flex-1">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  hasTemplate ? 'bg-green-50' : 'bg-gray-50'
                }`}>
                  {hasTemplate
                    ? <CheckCircle className="w-5 h-5 text-green-600" />
                    : <File className="w-5 h-5 text-gray-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 leading-snug">{form.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{form.code.replace(/_/g, ' ')}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {form.auto && (
                      <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">자동입력</span>
                    )}
                    {hasTemplate && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">등록됨</span>
                    )}
                    {template?.ai_extracted && (
                      <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">AI추출</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Link href={`/dpf/wiki/forms/${form.code}`}
                  className="flex-1 text-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  서식 작성
                </Link>
                {!hasTemplate && (
                  <Link href="/dpf/wiki/admin"
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
                    업로드
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!loading && templates.size === 0 && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          <strong>서식이 등록되지 않았습니다.</strong> 관리자 페이지에서 서식 파일을 업로드하거나 직접 작성하세요.
        </div>
      )}
    </AdminLayout>
  );
}
