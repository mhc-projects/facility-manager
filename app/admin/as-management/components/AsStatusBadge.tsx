import React from 'react';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  completed:      { label: '진행완료', className: 'bg-green-100 text-green-700 border border-green-200' },
  scheduled:      { label: '진행예정', className: 'bg-red-100 text-red-600 border border-red-200' },
  finished:       { label: '완료',     className: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  on_hold:        { label: '보류',     className: 'bg-red-700 text-white border border-red-800' },
  site_check:     { label: '현장확인', className: 'bg-purple-700 text-white border border-purple-800' },
  installation:   { label: '포설',     className: 'bg-green-700 text-white border border-green-800' },
  completion_fix: { label: '준공보완', className: 'bg-purple-100 text-purple-700 border border-purple-200' },
  modem_check:    { label: '모뎀확인', className: 'bg-yellow-800 text-white border border-yellow-900' },
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
