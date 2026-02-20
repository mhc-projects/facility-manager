// components/business/MemoFilterBar.tsx
// 메모 필터링 UI 컴포넌트

'use client';

import { Filter } from 'lucide-react';

interface MemoFilterBarProps {
  activeFilter: 'all' | 'normal' | 'task' | 'auto';
  onFilterChange: (filter: 'all' | 'normal' | 'task' | 'auto') => void;
  counts: {
    all: number;
    normal: number;
    task: number;
    auto: number;
  };
}

export function MemoFilterBar({ activeFilter, onFilterChange, counts }: MemoFilterBarProps) {
  const filters = [
    { key: 'all' as const, label: '전체', count: counts.all },
    { key: 'normal' as const, label: '일반 메모', count: counts.normal },
    { key: 'task' as const, label: '업무 메모', count: counts.task },
    { key: 'auto' as const, label: '변경 이력', count: counts.auto }
  ];

  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
      <Filter className="w-4 h-4 text-gray-400" />
      <div className="flex gap-1 flex-wrap">
        {filters.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`
              px-3 py-1 text-xs rounded-full transition-colors
              ${activeFilter === key
                ? 'bg-indigo-600 text-white font-medium'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            {label} ({count})
          </button>
        ))}
      </div>
    </div>
  );
}
