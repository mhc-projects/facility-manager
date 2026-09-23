'use client';

import Link from 'next/link';
import { DpfServiceRecordWithVehicle } from '@/types/dpf';
import { CATEGORY_LABELS } from '@/components/dpf/ServiceRecordFormModal';
import { DEVICE_TYPE_COLORS } from '@/components/dpf/DpfVehicleTable';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

interface Props {
  records: DpfServiceRecordWithVehicle[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  variant?: 'reception' | 'logistics';
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  in_progress: { label: '진행중', color: 'bg-amber-100 text-amber-700' },
  completed:   { label: '완료',   color: 'bg-emerald-100 text-emerald-700' },
  cancelled:   { label: '취소',   color: 'bg-gray-100 text-gray-500' },
};

const RECEPTION_COLUMNS = [
  { key: 'manufacturer',   label: '제작사',     width: 80 },
  { key: 'category',       label: '분류',       width: 90 },
  { key: 'status',         label: '상태',       width: 90 },
  { key: 'reception_date', label: '접수일',     width: 100 },
  { key: 'plate_number',   label: '차량번호',   width: 100 },
  { key: 'vin',            label: '차대번호',   width: 160 },
  { key: 'owner_name',     label: '계약자',     width: 100 },
  { key: 'vehicle_name',   label: '차명',       width: 130 },
  { key: 'local_government', label: '지자체',   width: 100 },
  { key: 'service_branch', label: '처리점',     width: 130 },
  { key: 'assigned_as_technician', label: '담당AS기사', width: 100 },
  { key: 'process_dates',  label: '처리·완료',  width: 120 },
  { key: 'billing_status', label: '청구상태',   width: 110 },
] as const;

// 물류(부품전달/요소수)는 처리점/담당AS기사 개념이 없어 빼고, 택배사를 추가한다(설계 §8.2)
// process_dates는 기사처리/처리/완료 3줄을 한 셀에 스택 — 물류는 기사처리가 항상 null이라 자동으로 숨는다
const LOGISTICS_COLUMNS = [
  { key: 'category',       label: '분류',       width: 90 },
  { key: 'status',         label: '상태',       width: 90 },
  { key: 'reception_date', label: '접수일',     width: 100 },
  { key: 'plate_number',   label: '차량번호',   width: 100 },
  { key: 'vin',            label: '차대번호',   width: 160 },
  { key: 'owner_name',     label: '계약자',     width: 100 },
  { key: 'vehicle_name',   label: '차명',       width: 130 },
  { key: 'local_government', label: '지자체',   width: 100 },
  { key: 'courier',        label: '택배사',     width: 110 },
  { key: 'process_dates',  label: '처리·완료',  width: 120 },
  { key: 'billing_status', label: '청구상태',   width: 110 },
] as const;

const BILLING_LABELS: Record<string, string> = {
  none: '청구 전',
  billed: '청구완료',
  unbillable_reception: '지급불가(접수)',
  unbillable_completion: '지급불가(완료)',
  held: '보류',
};

const COST_TYPE_LABELS: Record<string, string> = { paid: '유상', free: '무상', mixed: '유/무상' };

function SkeletonRow({ columns }: { columns: ReadonlyArray<{ key: string; width: number }> }) {
  return (
    <tr className="border-b border-gray-100">
      {columns.map((col) => (
        <td key={col.key} className="px-3 py-3">
          <div
            className="h-4 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 rounded animate-pulse"
            style={{ width: `${Math.round(col.width * 0.7)}px` }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function DpfServiceRecordTable({
  records, total, page, pageSize, onPageChange, loading, variant = 'reception',
}: Props) {
  const COLUMNS = variant === 'logistics' ? LOGISTICS_COLUMNS : RECEPTION_COLUMNS;
  const tableMinWidth = COLUMNS.reduce((sum, col) => sum + col.width, 0) + 40;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  function cellValue(r: DpfServiceRecordWithVehicle, key: string): React.ReactNode {
    const vehicle = r.dpf_vehicles;
    switch (key) {
      case 'manufacturer': {
        // 차량관리 목록과 같은 원천(raw_data.제작사) — 엠즈 임포트 차량만 값이 있다
        const maker = vehicle.raw_data?.['제작사'];
        return maker != null && maker !== ''
          ? <span className="text-xs text-gray-600">{String(maker)}</span>
          : <span className="text-gray-300">-</span>;
      }
      case 'category':
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
              {CATEGORY_LABELS[r.category]} {r.round_no}회차
            </span>
            {r.converted_from_category && (
              <span className="text-[10px] text-amber-600">
                {CATEGORY_LABELS[r.converted_from_category]}에서 전환
              </span>
            )}
          </div>
        );
      case 'status': {
        const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.in_progress;
        const ext = r.extension_requested
          ? r.extension_approved === true
            ? { label: '연장승인', color: 'bg-emerald-50 text-emerald-600' }
            : r.extension_approved === false
            ? { label: '연장반려', color: 'bg-red-50 text-red-600' }
            : { label: '연장요청', color: 'bg-amber-50 text-amber-600' }
          : null;
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${st.color}`}>
              {st.label}
            </span>
            {ext && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${ext.color}`}>
                {ext.label}
              </span>
            )}
          </div>
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
          <div className="flex flex-col gap-0.5">
            <Link href={`/dpf/${encodeURIComponent(vehicle.vin)}?tab=service`}
              className="font-mono text-xs text-blue-600 hover:text-blue-800 transition-colors underline-offset-2 hover:underline">
              {vehicle.vin}
            </Link>
            {vehicle.installation_date && (
              <span className="text-[10px] tabular-nums text-gray-400">구변 {vehicle.installation_date.split('T')[0]}</span>
            )}
          </div>
        );
      case 'owner_name':    return <span className="text-sm font-medium text-gray-800">{vehicle.owner_name || '-'}</span>;
      case 'vehicle_name': {
        const dt = vehicle.device_type;
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm">{vehicle.vehicle_name || '-'}</span>
            {dt && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${DEVICE_TYPE_COLORS[dt] ?? 'bg-gray-100 text-gray-600'}`}>
                {dt}
              </span>
            )}
          </div>
        );
      }
      case 'local_government': return <span className="text-xs text-gray-500">{r.local_government || vehicle.local_government || '-'}</span>;
      case 'service_branch': return <span className="text-xs text-gray-600">{r.service_branch || '-'}</span>;
      case 'courier':        return <span className="text-xs text-gray-600">{r.courier || '-'}</span>;
      case 'assigned_as_technician': return <span className="text-xs text-gray-600">{r.assigned_as_technician || '-'}</span>;
      case 'process_dates': {
        const dates = (
          [
            ['기사', r.technician_processed_at],
            ['처리', r.processed_at],
            ['완료', r.completed_at],
          ] as [string, string | null | undefined][]
        ).filter(([, v]) => v);
        if (dates.length === 0) return <span className="text-gray-300">-</span>;
        return (
          <div className="flex flex-col gap-0.5">
            {dates.map(([label, v]) => (
              <div key={label} className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400 w-6 inline-block">{label}</span>
                <span className="text-xs tabular-nums text-gray-600">{v}</span>
              </div>
            ))}
          </div>
        );
      }
      case 'billing_status':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500">
              {BILLING_LABELS[r.billing_status ?? 'none'] ?? '청구 전'}
            </span>
            {r.association_billing_date && (
              <span className="text-[10px] tabular-nums text-gray-400">{r.association_billing_date}</span>
            )}
            {r.cost_type && (
              <span className="text-[10px] text-gray-400">{COST_TYPE_LABELS[r.cost_type] ?? r.cost_type}</span>
            )}
          </div>
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
        <table className="text-sm border-collapse" style={{ minWidth: `${tableMinWidth}px`, width: '100%' }}>
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
              ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} columns={COLUMNS} />)
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
