'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Users } from 'lucide-react';

interface CandidateEmployee {
  id: string;
  name: string;
  department: string;
  permission_level: number;
}

interface CollectionManagerCellProps {
  businessId: string;
  assignedIds: string[];
  candidates: CandidateEmployee[];
  onUpdate: (businessId: string, employeeId: string, checked: boolean) => void;
}

export function CollectionManagerCell({
  businessId,
  assignedIds,
  candidates,
  onUpdate,
}: CollectionManagerCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mouseup', handleClickOutside);
    return () => document.removeEventListener('mouseup', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Update position on scroll (capture phase to catch all scrollable ancestors)
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setTriggerPosition({ top: rect.bottom + 4, left: rect.left });
      }
    };

    window.addEventListener('scroll', updatePosition, true);
    return () => window.removeEventListener('scroll', updatePosition, true);
  }, [isOpen]);

  const assignedEmployees = candidates.filter(c => assignedIds.includes(c.id));
  // 셀 너비에 따라 최대 1개 배지만 표시 (나머지는 +N으로)
  const MAX_VISIBLE = 1;
  const visibleBadges = assignedEmployees.slice(0, MAX_VISIBLE);
  const overflowCount = assignedEmployees.length - MAX_VISIBLE;

  return (
    <>
      <div className="flex items-center gap-1 w-full overflow-hidden">
        {/* Badge display — takes remaining space, truncates */}
        <div className="flex items-center gap-1 overflow-hidden flex-1 min-w-0">
          {visibleBadges.map(emp => (
            <span
              key={emp.id}
              className="inline-flex items-center px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full whitespace-nowrap truncate max-w-[5rem]"
            >
              {emp.name}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full whitespace-nowrap flex-shrink-0">
              +{overflowCount}
            </span>
          )}
        </div>

        {/* Trigger button — always visible, never pushed out */}
        <button
          ref={triggerRef}
          onClick={(e) => {
            e.stopPropagation();
            if (triggerRef.current) {
              const rect = triggerRef.current.getBoundingClientRect();
              setTriggerPosition({ top: rect.bottom + 4, left: rect.left });
            }
            setIsOpen(prev => !prev);
          }}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-purple-50 hover:bg-purple-100 text-purple-600 transition-colors"
          title="수금 담당자 지정"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Portal dropdown - rendered at document.body, outside table DOM */}
      {isOpen && typeof window !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-50 bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[180px] max-h-64 overflow-y-auto"
          style={{
            top: triggerPosition ? `${triggerPosition.top}px` : undefined,
            left: triggerPosition ? `${triggerPosition.left}px` : undefined,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100">
            <Users className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-xs font-semibold text-gray-700">수금 담당자 지정</span>
          </div>

          {candidates.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400">지정 가능한 담당자 없음</div>
          ) : (
            <ul>
              {candidates.map(emp => (
                <li key={emp.id}>
                  <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignedIds.includes(emp.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        onUpdate(businessId, emp.id, e.target.checked);
                      }}
                      className="w-3.5 h-3.5 accent-purple-600 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{emp.name}</div>
                      {emp.department && (
                        <div className="text-xs text-gray-400 truncate">{emp.department}</div>
                      )}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
