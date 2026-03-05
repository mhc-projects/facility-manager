// components/ui/DateInput.tsx - 자동 포커스 이동 기능이 있는 날짜 입력 컴포넌트
'use client'

import { useState, useRef, useEffect } from 'react'

interface DateInputProps {
  value: string // YYYY-MM-DD 형식
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

export default function DateInput({ value, onChange, className = '', placeholder }: DateInputProps) {
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')

  const yearRef = useRef<HTMLInputElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)

  // 내부 편집 중 외부 value 변경으로 인한 리셋 방지
  const isInternalChange = useRef(false)

  // value prop이 변경되면 내부 상태 업데이트 (외부 변경일 때만)
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false
      return
    }
    if (value) {
      // ISO 8601 datetime 형식(YYYY-MM-DDTHH:mm:ss.sssZ)에서 날짜 부분만 추출
      const dateOnly = value.includes('T') ? value.split('T')[0] : value
      const parts = dateOnly.split('-')
      if (parts.length === 3) {
        setYear(parts[0])
        setMonth(parts[1])
        setDay(parts[2])
      }
    } else {
      setYear('')
      setMonth('')
      setDay('')
    }
  }, [value])

  // 날짜 조합하여 onChange 호출 (모든 필드가 완전할 때만)
  const updateDate = (newYear: string, newMonth: string, newDay: string) => {
    if (newYear.length === 4 && newMonth.length === 2 && newDay.length === 2) {
      isInternalChange.current = true
      onChange(`${newYear}-${newMonth}-${newDay}`)
    } else if (!newYear && !newMonth && !newDay) {
      isInternalChange.current = true
      onChange('')
    }
    // 편집 중(부분 입력)에는 onChange 호출하지 않음 → 기존 value 유지
  }

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
    setYear(val)
    if (val.length === 4) {
      setTimeout(() => monthRef.current?.focus(), 10)
    }
    updateDate(val, month, day)
  }

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
    setMonth(val)
    if (val.length === 2) {
      const monthNum = parseInt(val, 10)
      if (monthNum >= 1 && monthNum <= 12) {
        setTimeout(() => dayRef.current?.focus(), 10)
      }
    }
    updateDate(year, val, day)
  }

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
    setDay(val)
    updateDate(year, month, val)
  }

  const handleYearKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 연도 필드가 비어있을 때 Backspace → 아무 동작 없음
  }

  const handleMonthKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && month.length === 0) {
      yearRef.current?.focus()
    }
  }

  const handleDayKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && day.length === 0) {
      monthRef.current?.focus()
    }
  }

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <input
        ref={yearRef}
        type="text"
        inputMode="numeric"
        value={year}
        onChange={handleYearChange}
        onKeyDown={handleYearKeyDown}
        placeholder="YYYY"
        className="w-16 px-2 py-1.5 border border-gray-300 rounded text-center text-[10px] sm:text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
        maxLength={4}
      />
      <span className="text-gray-400">-</span>
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        value={month}
        onChange={handleMonthChange}
        onKeyDown={handleMonthKeyDown}
        placeholder="MM"
        className="w-12 px-2 py-1.5 border border-gray-300 rounded text-center text-[10px] sm:text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
        maxLength={2}
      />
      <span className="text-gray-400">-</span>
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        value={day}
        onChange={handleDayChange}
        onKeyDown={handleDayKeyDown}
        placeholder="DD"
        className="w-12 px-2 py-1.5 border border-gray-300 rounded text-center text-[10px] sm:text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
        maxLength={2}
      />
    </div>
  )
}
