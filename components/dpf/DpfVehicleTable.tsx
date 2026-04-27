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

function raw(vehicle: DpfVehicle, key: string): string {
  const rd = vehicle.raw_data as Record<string, unknown> | undefined;
  const v = rd?.[key];
  return v != null && v !== '' ? String(v) : '-';
}

const COLUMNS = [
  { key: 'vendor',          label: '구분',      width: 'w-14' },
  { key: 'vin',             label: '차대번호',   width: 'w-36' },
  { key: 'plate_number',    label: '현재 차량번호', width: 'w-24' },
  { key: 'prev_plate',      label: '이전 차량번호', width: 'w-24' },
  { key: 'vehicle_name',    label: '차명',       width: 'w-28' },
  { key: 'owner_name',      label: '현재 업체명', width: 'w-28' },
  { key: 'prev_owner',      label: '이전 업체명', width: 'w-24' },
  { key: 'owner_contact',   label: '최종연락처', width: 'w-28' },
  { key: 'owner_address',   label: '주소',       width: 'w-48' },
  { key: 'manufacturer',    label: '제작사',     width: 'w-16' },
  { key: 'device_type',     label: '부착장치',   width: 'w-16' },
  { key: 'local_gov_large', label: '지자체(대)', width: 'w-24' },
  { key: 'local_gov_small', label: '지자체(소)', width: 'w-20' },
  { key: 'installation_date', label: '구조변경일자', width: 'w-24' },
  { key: 'last_service',    label: '최종실시일자', width: 'w-24' },
  { key: 'billing_month',   label: '청구년월',   width: 'w-24' },
  { key: 'service_shop',    label: '조치공업사', width: 'w-28' },
  { key: 'location',        label: '장소',       width: 'w-24' },
  { key: 'serial_before',   label: '일련번호(전)', width: 'w-28' },
  { key: 'device_serial',   label: '일련번호(후)', width: 'w-28' },
] as const;

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

  function cellValue(v: DpfVehicle, key: string): React.ReactNode {
    switch (key) {
      case 'vendor':
        return (
          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
            v.vendor === 'mz' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {v.vendor === 'mz' ? '엠즈' : '후지노'}
          </span>
        );
      case 'vin':
        return (
          <Link
            href={`/dpf/${encodeURIComponent(v.vin)}`}
            className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            {v.vin}
          </Link>
        );
      case 'plate_number':    return <span className="font-medium text-gray-900">{v.plate_number || '-'}</span>;
      case 'prev_plate':      return raw(v, '이전 차량번호');
      case 'vehicle_name':    return v.vehicle_name || '-';
      case 'owner_name':      return v.owner_name || '-';
      case 'prev_owner':      return raw(v, '이전 업체명');
      case 'owner_contact':   return v.owner_contact || '-';
      case 'owner_address':   return (
        <span className="block max-w-48 truncate text-xs" title={v.owner_address ?? ''}>
          {v.owner_address || '-'}
        </span>
      );
      case 'manufacturer':    return raw(v, '제작사');
      case 'device_type':     return raw(v, '부착장치');
      case 'local_gov_large': return v.local_government || '-';
      case 'local_gov_small': return raw(v, '지자체(소)');
      case 'installation_date':
        return v.installation_date ? v.installation_date.split('T')[0] : '-';
      case 'last_service':    return raw(v, '최종실시일자');
      case 'billing_month':   return raw(v, '청구년월');
      case 'service_shop':    return raw(v, '조치공업사');
      case 'location':        return raw(v, '장소');
      case 'serial_before':   return <span className="font-mono text-xs">{raw(v, '일련번호(전)')}</span>;
      case 'device_serial':   return <span className="font-mono text-xs">{v.device_serial || '-'}</span>;
      default: return '-';
    }
  }

  return (
    <div className="space-y-3">
      {/* 결과 카운트 */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          총 <strong>{total.toLocaleString()}</strong>건
          {total > 0 && ` (${start}–${end})`}
        </span>
        <span className="text-xs text-gray-400">← 가로 스크롤</span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-sm" style={{ minWidth: '1800px' }}>
          <thead className="bg-yellow-50">
            <tr>
              {COLUMNS.map(col => (
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
              <tr key={v.id} className="hover:bg-blue-50 transition-colors">
                {COLUMNS.map(col => (
                  <td key={col.key} className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                    {cellValue(v, col.key)}
                  </td>
                ))}
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
