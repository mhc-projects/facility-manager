'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface Option {
  id: string
  name: string
}

interface AutocompleteSelectInputProps {
  value: string // 선택된 ID
  onChange: (id: string, name: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  disabled?: boolean
  allowCustomValue?: boolean // 수동 입력 허용 여부 (기본값: false)
}

export default function AutocompleteSelectInput({
  value,
  onChange,
  options,
  placeholder = '',
  className = '',
  disabled = false,
  allowCustomValue = false
}: AutocompleteSelectInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [filteredOptions, setFilteredOptions] = useState<Option[]>(options)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // value prop이 변경될 때마다 inputValue 동기화
  useEffect(() => {
    const selected = options.find(opt => opt.id === value)
    if (selected) {
      setInputValue(selected.name)
    } else if (!value && !isOpen) {
      // value가 명시적으로 비어있고 드롭다운이 닫혀있을 때만 초기화
      setInputValue('')
    }
  }, [value, options, isOpen])

  // 옵션 필터링
  useEffect(() => {
    if (inputValue) {
      const filtered = options.filter(option =>
        option.name.toLowerCase().includes(inputValue.toLowerCase())
      )
      setFilteredOptions(filtered)
    } else {
      setFilteredOptions(options)
    }
  }, [inputValue, options])

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)

        if (allowCustomValue && inputValue) {
          // 수동 입력 허용 모드: 입력값 유지하고 콜백 호출
          onChange('', inputValue)
        } else {
          // 기본 모드: 선택된 옵션으로 복원
          const selected = options.find(opt => opt.id === value)
          if (selected) {
            setInputValue(selected.name)
          } else {
            setInputValue('')
          }
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value, options, allowCustomValue, inputValue, onChange])

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          selectOption(filteredOptions[highlightedIndex])
        } else if (allowCustomValue && inputValue) {
          // 수동 입력 모드: Enter 키로 현재 입력값 확정
          onChange('', inputValue)
          setIsOpen(false)
          setHighlightedIndex(-1)
          inputRef.current?.blur()
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setHighlightedIndex(-1)

        if (allowCustomValue && inputValue) {
          // 수동 입력 모드: 입력값 유지
          onChange('', inputValue)
        } else {
          // 기본 모드: 선택된 옵션으로 복원
          const selected = options.find(opt => opt.id === value)
          if (selected) {
            setInputValue(selected.name)
          } else {
            setInputValue('')
          }
        }
        break
      case 'Tab':
        // 하이라이트된 항목이 있으면 선택
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          e.preventDefault()  // 기본 Tab 동작 방지
          selectOption(filteredOptions[highlightedIndex])
        } else if (allowCustomValue && inputValue && filteredOptions.length === 0) {
          // 수동 입력 모드: Tab으로 입력 확정
          e.preventDefault()
          onChange('', inputValue)
          setIsOpen(false)
          setHighlightedIndex(-1)
        } else {
          // 선택할 항목 없으면 기본 Tab 동작 (다음 필드로 이동)
          setIsOpen(false)
        }
        break
    }
  }

  const selectOption = (option: Option) => {
    onChange(option.id, option.name)
    setInputValue(option.name)
    setIsOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.blur()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    if (!isOpen) {
      setIsOpen(true)
    }
    setHighlightedIndex(-1)

    // 입력값이 변경되면 선택 해제 (새로운 검색 시작)
    const selected = options.find(opt => opt.id === value)
    if (selected && e.target.value !== selected.name) {
      onChange('', '')
    }
  }

  const handleInputFocus = () => {
    setIsOpen(true)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          lang="ko"
          inputMode="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`${className} pr-8`}
          autoComplete="off"
        />
        <ChevronDown
          className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform pointer-events-none ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.map((option, index) => (
            <div
              key={option.id}
              onClick={() => selectOption(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-3 py-2 cursor-pointer text-sm ${
                index === highlightedIndex
                  ? 'bg-blue-50 text-blue-700'
                  : option.id === value
                  ? 'bg-blue-100 text-blue-900 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {option.name}
            </div>
          ))}
        </div>
      )}

      {isOpen && filteredOptions.length === 0 && inputValue && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          {allowCustomValue ? (
            <div
              onClick={() => {
                onChange('', inputValue)
                setIsOpen(false)
                inputRef.current?.blur()
              }}
              className="px-3 py-2 text-sm text-blue-600 cursor-pointer hover:bg-blue-50"
            >
              "{inputValue}" 입력
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">
              검색 결과가 없습니다
            </div>
          )}
        </div>
      )}
    </div>
  )
}
