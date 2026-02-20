'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  inline?: boolean;  // 라벨과 드롭다운을 같은 행에 표시
}

export default function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = '전체',
  className = '',
  inline = false
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    console.log('🔘 toggleOption 호출:', { option, currentSelected: selectedValues })
    if (selectedValues.includes(option)) {
      const newValues = selectedValues.filter(v => v !== option)
      console.log('  → 선택 해제:', newValues)
      onChange(newValues);
    } else {
      const newValues = [...selectedValues, option]
      console.log('  → 선택 추가:', newValues)
      onChange(newValues);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const displayText = selectedValues.length === 0
    ? placeholder
    : selectedValues.length === 1
      ? selectedValues[0]
      : `${selectedValues[0]} 외 ${selectedValues.length - 1}개`;

  return (
    <div className={`${inline ? 'flex items-center gap-2' : ''} ${className}`}>
      <label className={`text-[10px] sm:text-xs md:text-sm font-medium ${inline ? 'whitespace-nowrap shrink-0' : 'mb-1 sm:mb-1.5 block'}`}>
        {label}
      </label>
      <div ref={dropdownRef} className={`relative ${inline ? 'flex-1' : ''}`}>
        <button
          type="button"
          onClick={() => {
            console.log(`🔽 드롭다운 버튼 클릭: ${label}, isOpen: ${isOpen} → ${!isOpen}, options: ${options.length}개`)
            setIsOpen(!isOpen)
          }}
          className="w-full px-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between gap-1"
        >
          <span className={`truncate ${selectedValues.length === 0 ? 'text-gray-500' : 'text-gray-900'}`}>
            {displayText}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {selectedValues.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="p-0.5 hover:bg-gray-200 rounded"
              >
                <X className="w-3 h-3 text-gray-500" />
              </button>
            )}
            <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">옵션 없음</div>
            ) : (
              options.map(option => (
                <label
                  key={option}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-xs sm:text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option)}
                    onChange={() => toggleOption(option)}
                    className="w-3.5 h-3.5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="truncate">{option}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
