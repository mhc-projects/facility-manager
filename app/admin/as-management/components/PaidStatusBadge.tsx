import React from 'react';

interface PaidStatusBadgeProps {
  isPaid: boolean | null;
  override: boolean | null;
}

export default function PaidStatusBadge({ isPaid, override }: PaidStatusBadgeProps) {
  if (isPaid === null) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-400 border border-gray-200">
        미확인
      </span>
    );
  }
  if (isPaid) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-600 border border-red-200">
        유상
        {override !== null && <span className="text-red-300 text-[10px] font-normal">수동</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      무상
      {override !== null && <span className="text-emerald-300 text-[10px] font-normal">수동</span>}
    </span>
  );
}
