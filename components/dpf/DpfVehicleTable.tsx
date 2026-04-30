'use client';

import Link from 'next/link';
import { DpfVehicle } from '@/types/dpf';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

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
  { key: 'vendor',           label: '구분',        width: 60 },
  { key: 'plate_number',     label: '차량번호',    width: 100 },
  { key: 'vin',              label: '차대번호',    width: 160 },
  { key: 'vehicle_name',     label: '차명',        width: 110 },
  { key: 'owner_name',       label: '현재 업체명', width: 120 },
  { key: 'prev_owner',       label: '이전 업체명', width: 110 },
  { key: 'owner_contact',    label: '연락처',      width: 120 },
  { key: 'owner_address',    label: '주소',        width: 200 },
  { key: 'manufacturer',     label: '제작사',      width: 80 },
  { key: 'device_type',      label: '부착장치',    width: 80 },
  { key: 'local_gov_large',  label: '지자체(대)',  width: 110 },
  { key: 'local_gov_small',  label: '지자체(소)',  width: 90 },
  { key: 'installation_date',label: '구조변경일',  width: 100 },
  { key: 'last_service',     label: '최종실시일',  width: 100 },
  { key: 'billing_month',    label: '청구년월',    width: 90 },
  { key: 'service_shop',     label: '조치공업사',  width: 120 },
  { key: 'location',         label: '장소',        width: 90 },
  { key: 'serial_before',    label: '일련번호(전)', width: 130 },
  { key: 'device_serial',    label: '일련번호(후)', width: 130 },
] as const;

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      {COLUMNS.map((col, i) => (
        <td key={col.key} className="px-3 py-3">
          <div
            className="h-4 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 rounded animate-pulse"
            style={{ width: `${[40, 80, 130, 70, 90, 80, 90, 160, 50, 60, 80, 65, 75, 75, 65, 90, 60, 100, 100][i] ?? 80}px` }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function DpfVehicleTable({
  vehicles, total, page, pageSize, onPageChange, loading,
}: Props) {
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  function cellValue(v: DpfVehicle, key: string): React.ReactNode {
    switch (key) {
      case 'vendor':
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tracking-wide ${
            v.vendor === 'mz'
              ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
              : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
          }`}>
            {v.vendor === 'mz' ? 'MZ' : 'FJ'}
          </span>
        );
      case 'vin':
        return (
          <Link
            href={`/dpf/${encodeURIComponent(v.vin)}`}
            className="group/link inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            <span className="underline-offset-2 group-hover/link:underline">{v.vin}</span>
            <ArrowRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
          </Link>
        );
      case 'plate_number':
        return (
          <Link href={`/dpf/${encodeURIComponent(v.vin)}`}
            className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-sm">
            {v.plate_number || '-'}
          </Link>
        );
      case 'prev_plate':      return <span className="text-gray-400 text-xs">{raw(v, '이전 차량번호')}</span>;
      case 'vehicle_name':    return <span className="text-sm">{v.vehicle_name || '-'}</span>;
      case 'owner_name':      return <span className="text-sm font-medium text-gray-800">{v.owner_name || '-'}</span>;
      case 'prev_owner':      return <span className="text-gray-400 text-xs">{raw(v, '이전 업체명')}</span>;
      case 'owner_contact':
        return v.owner_contact
          ? <span className="text-sm tabular-nums">{v.owner_contact}</span>
          : <span className="text-gray-300">-</span>;
      case 'owner_address':
        return (
          <span className="block text-xs text-gray-600 truncate max-w-[200px]" title={v.owner_address ?? ''}>
            {v.owner_address || '-'}
          </span>
        );
      case 'manufacturer':    return <span className="text-xs text-gray-600">{raw(v, '제작사')}</span>;
      case 'device_type':     return <span className="text-xs text-gray-600">{raw(v, '부착장치')}</span>;
      case 'local_gov_large': return <span className="text-sm">{v.local_government || '-'}</span>;
      case 'local_gov_small': return <span className="text-xs text-gray-500">{raw(v, '지자체(소)')}</span>;
      case 'installation_date':
        return v.installation_date
          ? <span className="text-xs tabular-nums text-gray-700">{v.installation_date.split('T')[0]}</span>
          : <span className="text-gray-300">-</span>;
      case 'last_service':    return <span className="text-xs tabular-nums text-gray-500">{raw(v, '최종실시일자')}</span>;
      case 'billing_month':   return <span className="text-xs tabular-nums text-gray-500">{raw(v, '청구년월')}</span>;
      case 'service_shop':    return <span className="text-xs text-gray-600">{raw(v, '조치공업사')}</span>;
      case 'location':        return <span className="text-xs text-gray-500">{raw(v, '장소')}</span>;
      case 'serial_before':   return <span className="font-mono text-xs text-gray-500">{raw(v, '일련번호(전)')}</span>;
      case 'device_serial':   return <span className="font-mono text-xs text-gray-700">{v.device_serial || '-'}</span>;
      default: return '-';
    }
  }

  return (
    <div className="space-y-3">
      {/* 결과 카운트 + 스크롤 힌트 */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              검색 중...
            </span>
          ) : (
            <span>
              <strong className="text-gray-900 font-semibold">{total.toLocaleString()}</strong>
              <span className="text-gray-400">건</span>
              {total > 0 && (
                <span className="ml-1.5 text-gray-400 text-xs">({start}–{end})</span>
              )}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 12h8M8 17h4"/>
          </svg>
          가로 스크롤
        </span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="text-sm border-collapse" style={{ minWidth: '1780px', width: '100%' }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  style={{ minWidth: col.width }}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {loading
              ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
              : vehicles.length === 0
              ? (
                <tr>
                  <td colSpan={COLUMNS.length}>
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                      <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-medium text-gray-500 mb-1">검색 결과가 없습니다</p>
                      <p className="text-xs text-gray-400">검색어나 필터 조건을 변경해 보세요</p>
                    </div>
                  </td>
                </tr>
              )
              : vehicles.map(v => (
                <tr
                  key={v.id}
                  className="hover:bg-blue-50/50 transition-colors duration-100 group"
                >
                  {COLUMNS.map(col => (
                    <td key={col.key} className="px-3 py-2.5 whitespace-nowrap">
                      {cellValue(v, col.key)}
                    </td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-500">
            {page} / {totalPages} 페이지
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500
                         hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {(() => {
              const pages: (number | '…')[] = [];
              const delta = 2;
              for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
                  pages.push(i);
                } else if (pages[pages.length - 1] !== '…') {
                  pages.push('…');
                }
              }
              return pages.map((p, i) =>
                p === '…' ? (
                  <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-xs">···</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => onPageChange(p as number)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      p === page
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    {p}
                  </button>
                )
              );
            })()}

            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500
                         hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
