// components/ui/UnitInput.tsx
import React from 'react'

interface UnitInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  unit: string
  className?: string
}

/**
 * 숫자 입력 시 자동으로 단위를 추가하는 Input 컴포넌트
 *
 * @example
 * // 배출시설 용량 (m³)
 * <UnitInput
 *   value={capacity}
 *   onChange={setCapacity}
 *   placeholder="용량"
 *   unit="m³"
 * />
 *
 * // 방지시설 용량 (m³/분)
 * <UnitInput
 *   value={capacity}
 *   onChange={setCapacity}
 *   placeholder="용량"
 *   unit="m³/분"
 * />
 */
export const UnitInput: React.FC<UnitInputProps> = ({
  value,
  onChange,
  placeholder,
  unit,
  className
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value

    // 단위가 붙어있는 경우 제거
    if (inputValue.endsWith(unit)) {
      inputValue = inputValue.slice(0, -unit.length).trim()
    }

    onChange(inputValue)
  }

  const handleBlur = () => {
    // 값이 있고 단위가 없으면 자동으로 단위 추가
    if (value && value.trim() && !value.trim().endsWith(unit)) {
      const numericValue = value.trim()

      // 순수 숫자만 허용 (정수, 소수점, 쉼표만 허용, 알파벳 불허)
      // 예: "100", "100.5", "1,200" → 단위 추가
      // 예: "75HP", "abc", "100kW" → 단위 추가 안함
      const isPureNumeric = /^[\d.,\s]+$/.test(numericValue)

      // 순수 숫자일 때만 단위 추가
      if (isPureNumeric) {
        onChange(`${numericValue} ${unit}`)
      }
      // 알파벳이나 다른 문자가 섞여있으면 단위 추가하지 않음
    }
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // 포커스 시 단위 제거하여 순수 숫자만 편집 가능
    if (value && value.endsWith(unit)) {
      const numericValue = value.slice(0, -unit.length).trim()
      onChange(numericValue)
      // 커서를 끝으로 이동
      setTimeout(() => {
        e.target.setSelectionRange(numericValue.length, numericValue.length)
      }, 0)
    }
  }

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={className}
    />
  )
}
