'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, UserCheck, Loader2, Building2, Plus, Shield } from 'lucide-react';

export interface AdminManagerValue {
  id: string;
  name: string;
  position?: string;
  department?: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  employee_id: string;
  department?: string;
  position?: string;
  is_active: boolean;
}

interface AdminManagerPickerProps {
  /** 현재 선택된 관리책임자 목록 */
  value: AdminManagerValue[];
  onChange: (value: AdminManagerValue[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** 최대 선택 인원 (기본값: 제한 없음) */
  maxCount?: number;
}

export default function AdminManagerPicker({
  value = [],
  onChange,
  disabled = false,
  placeholder = '관리책임자 추가...',
  className = '',
  maxCount,
}: AdminManagerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout>();

  const selectedIds = new Set(value.map(v => v.id).filter(Boolean));
  const isMaxReached = maxCount !== undefined && value.length >= maxCount;

  // 직원 목록 로드
  const loadEmployees = useCallback(async (search?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20', includeInactive: 'false' });
      if (search && search.length >= 1) params.set('search', search);
      const res = await fetch(`/api/users/employees?${params}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setEmployees(data.success ? (data.data?.employees ?? []) : []);
    } catch {
      setEmployees([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadEmployees(searchTerm || undefined);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => loadEmployees(searchTerm || undefined), 250);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchTerm, isOpen, loadEmployees]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  const openDropdown = () => {
    if (disabled || isMaxReached) return;
    setIsOpen(true);
    setHighlightedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const toggle = (emp: Employee) => {
    if (selectedIds.has(emp.id)) {
      // 선택 해제
      onChange(value.filter(v => v.id !== emp.id));
    } else {
      // 추가
      const next: AdminManagerValue = {
        id: emp.id,
        name: emp.name,
        position: emp.position,
        department: emp.department,
      };
      onChange([...value, next]);
    }
    // 드롭다운 유지 (multi-select이므로)
    setSearchTerm('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const remove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(v => v.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 검색 목록 중 아직 선택 안 된 항목만 키보드 탐색
    const navigable = employees.filter(emp => !selectedIds.has(emp.id));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, navigable.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      toggle(navigable[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* 선택된 태그 + 추가 버튼 영역 */}
      <div
        className={`
          min-h-[34px] flex flex-wrap gap-1.5 items-center px-2 py-1.5
          border rounded-md transition-colors
          ${disabled ? 'bg-gray-50 border-gray-200 cursor-not-allowed' : 'bg-white border-gray-300'}
          ${isOpen ? 'border-blue-500 ring-2 ring-blue-100' : !disabled ? 'hover:border-blue-400' : ''}
        `}
      >
        {/* 선택된 사람 태그들 */}
        {value.map((person, idx) => (
          <span
            key={person.id || `${person.name}-${idx}`}
            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs font-medium text-blue-700 group"
          >
            {/* 아바타 이니셜 */}
            <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">
              {person.name.charAt(0)}
            </span>
            <span className="max-w-[80px] truncate">{person.name}</span>
            {person.position && (
              <span className="text-blue-400 hidden sm:inline truncate max-w-[50px]">
                {person.position}
              </span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={e => remove(person.id || '', e)}
                className="text-blue-300 hover:text-red-400 transition-colors flex-shrink-0 rounded-full"
                aria-label={`${person.name} 삭제`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {/* 추가 버튼 */}
        {!disabled && !isMaxReached && (
          <button
            type="button"
            onClick={openDropdown}
            className={`
              inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors
              ${value.length === 0
                ? 'text-gray-400 hover:text-blue-500'
                : 'text-blue-400 hover:text-blue-600'}
            `}
          >
            {value.length === 0 ? (
              <>
                <UserCheck className="w-3.5 h-3.5" />
                <span>{placeholder}</span>
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                <span>추가</span>
              </>
            )}
          </button>
        )}

        {/* 빈 상태 + disabled */}
        {disabled && value.length === 0 && (
          <span className="text-xs text-gray-400">없음</span>
        )}
      </div>

      {/* 드롭다운 */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* 검색 인풋 */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setHighlightedIndex(-1); }}
                onKeyDown={handleKeyDown}
                placeholder="이름으로 검색"
                className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
              />
              {isLoading
                ? <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin flex-shrink-0" />
                : <button
                    type="button"
                    onClick={() => { setIsOpen(false); setSearchTerm(''); }}
                    className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
              }
            </div>
            {/* 선택 인원 카운트 */}
            {value.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5 px-1">
                <Shield className="w-3 h-3 text-blue-400" />
                <span className="text-[11px] text-blue-500">
                  {value.length}명 지정됨
                  {maxCount && ` (최대 ${maxCount}명)`}
                </span>
              </div>
            )}
          </div>

          {/* 목록 */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {employees.length === 0 && !isLoading && (
              <li className="px-3 py-4 text-center text-xs text-gray-400">
                {searchTerm ? `"${searchTerm}" 검색 결과 없음` : '등록된 직원이 없습니다'}
              </li>
            )}
            {employees.map((emp, i) => {
              const isSelected = selectedIds.has(emp.id);
              // 키보드 탐색 인덱스는 미선택 항목 기준
              const navigableIndex = employees
                .filter(e => !selectedIds.has(e.id))
                .indexOf(emp);
              const isHighlighted = !isSelected && navigableIndex === highlightedIndex;

              return (
                <li key={emp.id}>
                  <button
                    type="button"
                    onClick={() => toggle(emp)}
                    onMouseEnter={() => !isSelected && setHighlightedIndex(navigableIndex)}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors
                      ${isHighlighted ? 'bg-blue-50' : isSelected ? 'bg-blue-50/60' : 'hover:bg-gray-50'}
                      ${isSelected ? 'text-blue-700' : 'text-gray-800'}
                    `}
                  >
                    {/* 아바타 */}
                    <div className={`
                      w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-semibold
                      ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}
                    `}>
                      {isSelected
                        ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        : emp.name.charAt(0)
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{emp.name}</div>
                      {(emp.department || emp.position) && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {emp.department && (
                            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                              <Building2 className="w-2.5 h-2.5" />
                              {emp.department}
                            </span>
                          )}
                          {emp.position && (
                            <span className="text-[10px] text-gray-400">· {emp.position}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <span className="text-[10px] text-blue-400 flex-shrink-0">선택됨</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 완료 버튼 */}
          {value.length > 0 && (
            <div className="p-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setIsOpen(false); setSearchTerm(''); }}
                className="w-full py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              >
                완료
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
