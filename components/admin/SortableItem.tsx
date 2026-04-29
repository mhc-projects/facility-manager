'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableItemProps {
  id: string | number;
  children: React.ReactNode;
  className?: string;
}

export function SortableItem({ id, children, className = '' }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex-shrink-0 p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
        aria-label="드래그하여 순서 변경"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
}
