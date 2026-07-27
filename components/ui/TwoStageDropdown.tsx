'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, X } from 'lucide-react'

interface TwoStageDropdownProps {
  label: string
  stage1Options: string[]     // ['견적', '착공', '준공']
  stage2Options: string[]     // ['1', '2', ..., '12']
  onChange: (combined: string[]) => void  // Real-time callback
  placeholder?: string
  inline?: boolean
}

export default function TwoStageDropdown({
  label,
  stage1Options,
  stage2Options,
  onChange,
  placeholder = '전체',
  inline = false
}: TwoStageDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Auto-generate combined array
  const combined = useMemo(() => {
    const result: string[] = []
    selectedTypes.forEach(type => {
      selectedMonths.forEach(month => {
        result.push(`${type}|${month}`)
      })
    })
    return result
  }, [selectedTypes, selectedMonths])

  // Real-time onChange
  useEffect(() => {
    onChange(combined)
  }, [combined, onChange])

  // Generate summary text
  const summaryText = useMemo(() => {
    if (combined.length === 0) return placeholder

    const grouped: Record<string, string[]> = {}
    selectedTypes.forEach(type => {
      grouped[type] = [...selectedMonths].sort((a, b) => parseInt(a) - parseInt(b))
    })

    const parts = Object.entries(grouped)
      .map(([type, months]) => `${type}(${months.join(',')}월)`)

    return parts.join(', ')
  }, [combined, selectedTypes, selectedMonths, placeholder])

  // Clear all
  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedTypes([])
    setSelectedMonths([])
  }

  // Toggle type
  const toggleType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  // Toggle month
  const toggleMonth = (month: string) => {
    setSelectedMonths(prev =>
      prev.includes(month)
        ? prev.filter(m => m !== month)
        : [...prev, month]
    )
  }

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className={`relative ${inline ? 'flex items-center gap-2' : ''}`}>
      {/* Label */}
      {!inline && label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      {inline && label && (
        <label className="text-xs sm:text-sm font-medium whitespace-nowrap shrink-0">
          {label}
        </label>
      )}

      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <span className="truncate">{summaryText}</span>
        <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1 right-0 w-80 bg-white border border-gray-300 rounded-lg shadow-lg p-3">
          {/* Header */}
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">📋 실사 타입</span>
            {combined.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="전체 초기화"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Stage 1: Types */}
          <div className="flex gap-2 mb-3">
            {stage1Options.map(type => (
              <label
                key={type}
                className="flex items-center gap-1 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type)}
                  onChange={() => toggleType(type)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{type}</span>
              </label>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-2" />

          {/* Stage 2: Months */}
          <div className="text-sm font-medium text-gray-700 mb-2">📅 월 선택</div>
          <div className="grid grid-cols-4 gap-2">
            {stage2Options.map(month => (
              <label
                key={month}
                className="flex items-center gap-1 cursor-pointer text-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedMonths.includes(month)}
                  onChange={() => toggleMonth(month)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{month}월</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
