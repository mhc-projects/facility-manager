import React from 'react';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  received:      { label: '접수',      className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  scheduled:     { label: '일정조율중', className: 'bg-sky-50 text-sky-700 border border-sky-200' },
  in_progress:   { label: '진행중',    className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  parts_waiting: { label: '부품대기',  className: 'bg-orange-50 text-orange-700 border border-orange-200' },
  on_hold:       { label: '보류',      className: 'bg-gray-100 text-gray-500 border border-gray-200' },
  completed:     { label: '완료',      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  cancelled:     { label: '취소',      className: 'bg-red-50 text-red-500 border border-red-200' },
};

export default function AsStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-600 border border-gray-200' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

export { STATUS_CONFIG };
