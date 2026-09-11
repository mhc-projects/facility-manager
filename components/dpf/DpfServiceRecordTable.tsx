'use client';

import Link from 'next/link';
import { DpfServiceRecordWithVehicle } from '@/types/dpf';
import { CATEGORY_LABELS } from '@/components/dpf/ServiceRecordFormModal';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

interface Props {
  records: DpfServiceRecordWithVehicle[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  in_progress: { label: '진행중', color: 'bg-amber-100 text-amber-700' },
  completed:   { label: '완료',   color: 'bg-emerald-100 text-emerald-700' },
  cancelled:   { label: '취소',   color: 'bg-gray-100 text-gray-500' },
};

const COLUMNS = [
  { key: 'category',       label: '분류',       width: 90 },
  { key: 'status',         label: '상태',       width: 80 },
  { key: 'reception_date', label: '접수일',     width: 100 },
  { key: 'plate_number',   label: '차량번호',   width: 100 },
  { key: 'vin',            label: '차대번호',   width: 160 },
  { key: 'owner_name',     label: '계약자',     width: 100 },
  { key: 'vehicle_name',   label: '차명',       width: 130 },
  { key: 'local_government', label: '지자체',   width: 100 },
  { key: 'service_branch', label: '처리점',     width: 130 },
  { key: 'assigned_as_technician', label: '담당AS기사', width: 100 },
  { key: 'processed_at',   label: '처리일자',   width: 100 },
  { key: 'completed_at',   label: '완료일자',   width: 100 },
  { key: 'billing_status', label: '청구상태',   width: 110 },
] as const;

const BILLING_LABELS: Record<string, string> = {
  none: '청구 전',
  billed: '청구완료',
  unbillable_reception: '지급불가(접수)',
  unbillable_completion: '지급불가(완료)',
  held: '보류',
};

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      {COLUMNS.map((col, i) => (
        <td key={col.key} className="px-3 py-3">
          <div
            className="h-4 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 rounded animate-pulse"
            style={{ width: `${[60, 50, 70, 80, 130, 70, 90, 70, 90, 70, 70, 70, 80][i] ?? 80}px` }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function DpfServiceRecordTable({
  records, total, page, pageSize, onPageChange, loading,
}: Props) {
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  function cellValue(r: DpfServiceRecordWithVehicle, key: string): React.ReactNode {
    const vehicle = r.dpf_vehicles;
    switch (key) {
      case 'category':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
            {CATEGORY_LABELS[r.category]} {r.round_no}회차
          </span>
        );
      case 'status': {
        const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.in_progress;
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${st.color}`}>
            {st.label}
          </span>
        );
      }
      case 'reception_date':
        return r.reception_date
          ? <span className="text-xs tabular-nums text-gray-700">{r.reception_date}</span>
          : <span className="text-gray-300">-</span>;
      case 'plate_number':
        return (
          <Link href={`/dpf/${encodeURIComponent(vehicle.vin)}?tab=service`}
            className="group/link inline-flex items-center gap-1 font-semibold text-gray-900 hover:text-blue-600 transition-colors text-sm">
            {vehicle.plate_number || '-'}
            <ArrowRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
          </Link>
        );
      case 'vin':
        return (
          <Link href={`/dpf/${encodeURIComponent(vehicle.vin)}?tab=service`}
            className="font-mono text-xs text-blue-600 hover:text-blue-800 transition-colors underline-offset-2 hover:underline">
            {vehicle.vin}
          </Link>
        );
      case 'owner_name':    return <span className="text-sm font-medium text-gray-800">{vehicle.owner_name || '-'}</span>;
      case 'vehicle_name':  return <span className="text-sm">{vehicle.vehicle_name || '-'}</span>;
      case 'local_government': return <span className="text-xs text-gray-500">{r.local_government || vehicle.local_government || '-'}</span>;
      case 'service_branch': return <span className="text-xs text-gray-600">{r.service_branch || '-'}</span>;
      case 'assigned_as_technician': return <span className="text-xs text-gray-600">{r.assigned_as_technician || '-'}</span>;
      case 'processed_at':
        return r.processed_at
          ? <span className="text-xs tabular-nums text-gray-500">{r.processed_at}</span>
          : <span className="text-gray-300">-</span>;
      case 'completed_at':
        return r.completed_at
          ? <span className="text-xs tabular-nums text-gray-500">{r.completed_at}</span>
          : <span className="text-gray-300">-</span>;
      case 'billing_status':
        return (
          <span className="text-xs text-gray-500">
            {BILLING_LABELS[r.billing_status ?? 'none'] ?? '청구 전'}
          </span>
        );
      default: return '-';
    }
  }

  return (
    <div className="space-y-3">
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

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="text-sm border-collapse" style={{ minWidth: '1380px', width: '100%' }}>
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
              : records.length === 0
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
              : records.map(r => (
                <tr key={r.id} className="hover:bg-blue-50/50 transition-colors duration-100">
                  {COLUMNS.map(col => (
                    <td key={col.key} className="px-3 py-2.5 whitespace-nowrap">
                      {cellValue(r, col.key)}
                    </td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

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
