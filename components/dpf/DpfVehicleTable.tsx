'use client';

import Link from 'next/link';
import { DpfVehicle } from '@/types/dpf';

interface Props {
  vehicles: DpfVehicle[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

export default function DpfVehicleTable({
  vehicles,
  total,
  page,
  pageSize,
  onPageChange,
  loading,
}: Props) {
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500">
        <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        검색 중...
      </div>
    );
  }

  if (!loading && vehicles.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500">
        검색 결과가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 결과 카운트 */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          총 <strong>{total.toLocaleString()}</strong>건
          {total > 0 && ` (${start}–${end})`}
        </span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-yellow-50">
            <tr>
              {[
                { key: 'vin', label: '차대번호', width: 'w-36' },
                { key: 'plate_number', label: '차량번호', width: 'w-24' },
                { key: 'vehicle_name', label: '차명', width: 'w-28' },
                { key: 'owner_name', label: '소유자성명', width: 'w-24' },
                { key: 'owner_address', label: '주소', width: 'w-48' },
                { key: 'owner_contact', label: '연락처', width: 'w-28' },
                { key: 'local_government', label: '접수지자체명', width: 'w-24' },
                { key: 'device_serial', label: '장치시리얼번호', width: 'w-36' },
                { key: 'installation_date', label: '구변일자', width: 'w-24' },
              ].map(col => (
                <th
                  key={col.key}
                  className={`${col.width} px-3 py-2.5 text-left text-xs font-semibold text-gray-700 whitespace-nowrap border-b border-yellow-200`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vehicles.map((v) => (
              <tr
                key={v.id}
                className="hover:bg-blue-50 transition-colors"
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/dpf/${encodeURIComponent(v.vin)}`}
                    className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {v.vin}
                  </Link>
                </td>
                <td className="px-3 py-2.5 font-medium text-gray-900">{v.plate_number || '-'}</td>
                <td className="px-3 py-2.5 text-gray-700">{v.vehicle_name || '-'}</td>
                <td className="px-3 py-2.5 text-gray-700">{v.owner_name || '-'}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs max-w-48 truncate" title={v.owner_address ?? ''}>
                  {v.owner_address || '-'}
                </td>
                <td className="px-3 py-2.5 text-gray-700">{v.owner_contact || '-'}</td>
                <td className="px-3 py-2.5 text-gray-700">{v.local_government || '-'}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{v.device_serial || '-'}</td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                  {v.installation_date ? v.installation_date.split('T')[0] : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            이전
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`w-8 h-8 text-sm rounded ${
                  pageNum === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
