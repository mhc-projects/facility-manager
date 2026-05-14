'use client';

import AdminLayout from '@/components/ui/AdminLayout';
import DpfImportUploader from '@/components/dpf/DpfImportUploader';

export default function DpfImportPage() {
  return (
    <AdminLayout
      title="차량 데이터 임포트"
      description="후지노테크 전산반영 리스트 또는 엠즈 엑셀 파일을 업로드하여 차량 데이터를 일괄 등록합니다"
    >
      <div className="max-w-2xl space-y-6">
        {/* 임포트 카드 */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <DpfImportUploader />
        </div>

        {/* 컬럼 안내 — 후지노 전산반영 형식 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="font-semibold text-blue-800 mb-1 flex items-center gap-1.5">
            <span className="text-base">★</span> 후지노테크 전산반영 리스트 형식 (신규)
          </h3>
          <p className="text-xs text-blue-600 mb-3">헤더에 &apos;접수지자체명&apos; 또는 &apos;관리방향&apos; 이 있으면 자동 감지됩니다.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-blue-900">
            {([
              ['차대번호', '고유 식별자 (필수)'],
              ['차량번호', '번호판'],
              ['차명', '차량 모델명'],
              ['접수지자체명', '담당 지자체'],
              ['엔진형식', 'D4BH / D6DA 등'],
              ['소유자성명', '소유자 이름'],
              ['주소', '소유자 주소'],
              ['연락처', '소유자 연락처'],
              ['구변일자', '구조변경일자'],
              ['장치시리얼번호', 'DPF 장치 번호'],
              ['장치', '복합중형 / 복합소형 등'],
              ['신뢰등급', 'A/B/C 등급'],
              ['보정전_차량번호', '보정 전 번호판'],
              ['등급관리', 'A/B/C/D 관리 등급'],
              ['관리방향', '운영관리 / 이력보관'],
            ] as [string, string][]).map(([col, desc]) => (
              <div key={col} className="flex flex-col py-0.5">
                <span className="font-medium text-blue-800">{col}</span>
                <span className="text-xs text-blue-600">{desc}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-blue-600">
            &apos;차량번호_보정여부&apos;, &apos;전산등록구분&apos; 2개 컬럼은 원본 값으로 DB에 보관됩니다.
          </p>
        </div>

        {/* 컬럼 안내 — 후지노 구형 */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-gray-600 mb-1">후지노 구형 / 엠즈 형식</h3>
          <p className="text-xs text-gray-500 mb-3">헤더에 &apos;현재 차량번호&apos;, &apos;지자체(대)&apos;, &apos;일련번호(후)&apos; 가 있는 경우입니다.</p>
          <div className="grid grid-cols-3 gap-2 text-sm text-gray-700">
            {([
              ['차대번호', '고유 식별자'],
              ['현재 차량번호', '번호판'],
              ['차명', '차량 모델명'],
              ['현재 업체명', '소유자 이름'],
              ['주소', '소유자 주소'],
              ['최종연락처', '소유자 연락처'],
              ['지자체(대)', '담당 지자체'],
              ['일련번호(후)', 'DPF 장치 번호'],
              ['구조변경일자', '구조변경일'],
            ] as [string, string][]).map(([col, desc]) => (
              <div key={col} className="flex flex-col">
                <span className="font-medium text-gray-700">{col}</span>
                <span className="text-xs text-gray-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
