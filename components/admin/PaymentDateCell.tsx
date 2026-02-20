'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';

interface PaymentDateCellProps {
  businessId: string;
  currentDate: string | null;
  onUpdate: (businessId: string, date: string | null) => Promise<void>;
  readonly?: boolean;
}

export function PaymentDateCell({
  businessId,
  currentDate,
  onUpdate,
  readonly = false
}: PaymentDateCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localDate, setLocalDate] = useState(currentDate);
  const [isLoading, setIsLoading] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Update local state when prop changes (from external updates)
  useEffect(() => {
    setLocalDate(currentDate);
  }, [currentDate]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mouseup', handleClickOutside);
    return () => document.removeEventListener('mouseup', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Update calendar position on scroll
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setTriggerPosition({
          top: rect.bottom + 4,
          left: rect.left
        });
      }
    };

    // Update position on scroll
    window.addEventListener('scroll', updatePosition, true); // true = capture phase for all scrollable elements
    return () => window.removeEventListener('scroll', updatePosition, true);
  }, [isOpen]);

  const handleDateSelect = async (date: string | null) => {
    setLocalDate(date);
    setIsOpen(false);
    setIsLoading(true);

    try {
      await onUpdate(businessId, date);
    } catch (error) {
      // Revert on error
      setLocalDate(currentDate);
    } finally {
      setIsLoading(false);
    }
  };

  if (readonly) {
    return (
      <div className="text-xs text-gray-600">
        {currentDate || '-'}
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {/* Display/Trigger Button */}
        <button
          ref={triggerRef}
          onClick={(e) => {
            e.stopPropagation(); // Prevent table row click handlers
            if (triggerRef.current) {
              const rect = triggerRef.current.getBoundingClientRect();
              setTriggerPosition({
                top: rect.bottom + 4,
                left: rect.left
              });
            }
            setIsOpen(!isOpen);
          }}
          disabled={isLoading}
          className="w-full px-2 py-1 text-xs text-left hover:bg-teal-50 rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          title="클릭하여 입금예정일 수정"
        >
          <Calendar className="w-3 h-3 text-teal-600 flex-shrink-0" />
          <span className={localDate ? 'text-teal-700 font-medium' : 'text-gray-400'}>
            {isLoading ? '저장 중...' : (localDate || '-')}
          </span>
        </button>
      </div>

      {/* Render calendar via Portal - OUTSIDE table DOM */}
      {isOpen && typeof window !== 'undefined' && createPortal(
        <>
          {/* Background overlay - visual only, doesn't block clicks */}
          <div
            className="fixed inset-0 bg-black/10 z-40 pointer-events-none"
            aria-hidden="true"
          />

          {/* Calendar container - rendered at document.body, outside table DOM */}
          <div
            ref={popoverRef}
            className="fixed z-50 bg-white pointer-events-auto rounded-lg shadow-2xl border-2 border-gray-300 p-3 w-64"
            style={{
              top: triggerPosition ? `${triggerPosition.top}px` : undefined,
              left: triggerPosition ? `${triggerPosition.left}px` : undefined
            }}
          >
            <SimpleDatePicker
              value={localDate}
              onChange={handleDateSelect}
            />
          </div>
        </>,
        document.body
      )}
    </>
  );
}

/**
 * Simple inline date picker component
 */
interface SimpleDatePickerProps {
  value: string | null; // YYYY-MM-DD format
  onChange: (date: string | null) => void;
}

function SimpleDatePicker({ value, onChange }: SimpleDatePickerProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(
    value ? parseInt(value.split('-')[0]) : today.getFullYear()
  );
  const [currentMonth, setCurrentMonth] = useState(
    value ? parseInt(value.split('-')[1]) - 1 : today.getMonth()
  );

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const selectedDate = value ? new Date(value) : null;

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleDayClick = (day: number) => {
    const month = (currentMonth + 1).toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const dateString = `${currentYear}-${month}-${dayStr}`;
    onChange(dateString);
  };

  const handleToday = () => {
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    onChange(`${year}-${month}-${day}`);
  };

  const handleClear = () => {
    onChange(null);
  };

  // Generate calendar days
  const calendarDays = [];
  // Empty cells for days before month start
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(<div key={`empty-${i}`} className="w-8 h-8" />);
  }
  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const isSelected = selectedDate &&
      selectedDate.getFullYear() === currentYear &&
      selectedDate.getMonth() === currentMonth &&
      selectedDate.getDate() === day;

    const isToday =
      today.getFullYear() === currentYear &&
      today.getMonth() === currentMonth &&
      today.getDate() === day;

    calendarDays.push(
      <button
        key={day}
        onClick={(e) => {
          e.stopPropagation(); // Prevent table row click handlers
          handleDayClick(day);
        }}
        className={`w-8 h-8 text-xs rounded flex items-center justify-center transition-colors ${
          isSelected
            ? 'bg-teal-600 text-white font-bold'
            : isToday
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'hover:bg-gray-100 text-gray-700'
        }`}
      >
        {day}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* Month/Year Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePrevMonth();
          }}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="이전 달"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-sm font-semibold text-gray-900">
          {currentYear}년 {currentMonth + 1}월
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleNextMonth();
          }}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="다음 달"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1">
        {['일', '월', '화', '수', '목', '금', '토'].map(day => (
          <div key={day} className="w-8 h-6 text-xs font-medium text-gray-500 flex items-center justify-center">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2 border-t border-gray-200">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
          className="flex-1 px-3 py-1.5 text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          삭제
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToday();
          }}
          className="flex-1 px-3 py-1.5 text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 rounded transition-colors font-medium"
        >
          오늘
        </button>
      </div>
    </div>
  );
}
