'use client';

import AdminLayout from '@/components/ui/AdminLayout';
import DpfImportUploader from '@/components/dpf/DpfImportUploader';

export default function DpfImportPage() {
  return (
    <AdminLayout
      title="차량 데이터 임포트"
      description="후지노 차량정보 엑셀 파일을 업로드하여 차량 데이터를 일괄 등록합니다"
    >
      <div className="max-w-2xl space-y-6">
        {/* 임포트 카드 */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <DpfImportUploader />
        </div>

        {/* 컬럼 안내 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <h3 className="font-semibold text-yellow-800 mb-3 flex items-center gap-1">
            <span>★</span> UI 표시 컬럼 (노란색 헤더 9개)
          </h3>
          <div className="grid grid-cols-3 gap-2 text-sm text-yellow-900">
            {[
              ['차대번호', '고유 식별자'],
              ['차량번호', '번호판'],
              ['차명', '차량 모델명'],
              ['소유자성명', '소유자 이름'],
              ['주소', '소유자 주소'],
              ['연락처', '소유자 연락처'],
              ['접수지자체명', '담당 지자체'],
              ['장치시리얼번호', 'DPF 장치 번호'],
              ['구변일자', '설치 완료일'],
            ].map(([col, desc]) => (
              <div key={col} className="flex flex-col">
                <span className="font-medium">{col}</span>
                <span className="text-xs text-yellow-700">{desc}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-yellow-700">
            나머지 43개 컬럼은 DB에 보관되지만 화면에는 표시되지 않습니다.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
