'use client'

/**
 * 드래그로 높이 조정이 가능한 Tiptap 에디터 래퍼.
 *
 * - 내부적으로 TiptapEditor를 감싸고, 아래쪽 resize handle(grip)을 드래그하여
 *   전체 에디터 컨테이너 높이를 조정할 수 있습니다.
 * - 조정한 높이는 `storageKey`로 localStorage에 저장되어, 페이지를 다시 접속해도
 *   마지막 크기가 복원됩니다.
 * - `storageKey`가 없으면 영속화를 건너뜁니다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { GripHorizontal } from 'lucide-react'
import TiptapEditor from './TiptapEditor'

interface ResizableTiptapEditorProps {
  content: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  /** localStorage 영속화 키. 없으면 저장하지 않음. */
  storageKey?: string
  /** 초기 높이 (저장된 값이 없을 때 사용). 기본 200px */
  defaultHeight?: number
  /** 최소 높이 px. 기본 120 */
  minHeight?: number
  /** 최대 높이 px. 기본 window.innerHeight (제한 없음이면 undefined) */
  maxHeight?: number
}

export default function ResizableTiptapEditor({
  content,
  onChange,
  disabled = false,
  placeholder,
  storageKey,
  defaultHeight = 200,
  minHeight = 120,
  maxHeight,
}: ResizableTiptapEditorProps) {
  const [height, setHeight] = useState<number>(defaultHeight)
  const [mounted, setMounted] = useState(false)
  const dragStateRef = useRef<{ startY: number; startH: number } | null>(null)

  // 저장된 높이 복원
  useEffect(() => {
    setMounted(true)
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const n = parseInt(saved, 10)
        if (!Number.isNaN(n) && n > 0) {
          setHeight(n)
        }
      }
    } catch {
      // ignore
    }
  }, [storageKey])

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return
      e.preventDefault()
      dragStateRef.current = { startY: e.clientY, startH: height }

      const onMove = (ev: MouseEvent) => {
        if (!dragStateRef.current) return
        const { startY, startH } = dragStateRef.current
        let next = startH + (ev.clientY - startY)
        if (next < minHeight) next = minHeight
        const cap = maxHeight ?? window.innerHeight - 100
        if (next > cap) next = cap
        setHeight(next)
      }

      const onUp = () => {
        dragStateRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        // 저장
        if (storageKey) {
          try {
            // 최신 높이는 state가 아닌 실제 DOM 기준으로 저장
            // setHeight는 비동기이므로 ev 기반으로 다시 계산할 수도 있지만
            // 드래그 직후 state가 업데이트된 직후 effect에서 저장하는 방식을 사용
          } catch {
            // ignore
          }
        }
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [disabled, height, minHeight, maxHeight, storageKey],
  )

  // 드래그가 끝난 후 height state가 업데이트되면 localStorage에 저장
  // (드래그 중 매 프레임마다 저장하지 않도록 디바운스)
  useEffect(() => {
    if (!storageKey || !mounted) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, String(height))
      } catch {
        // ignore
      }
    }, 200)
    return () => clearTimeout(t)
  }, [height, storageKey, mounted])

  // Disabled(읽기 전용) 모드에서는 리사이즈 핸들을 숨기고 TiptapEditor에 위임
  if (disabled) {
    return (
      <TiptapEditor
        content={content}
        onChange={onChange}
        disabled
        placeholder={placeholder}
        minHeight={`${height}px`}
      />
    )
  }

  return (
    <div className="relative border border-gray-300 rounded-lg overflow-hidden bg-white">
      <div
        style={{ height: `${height}px` }}
        className="overflow-auto"
      >
        <TiptapEditor
          content={content}
          onChange={onChange}
          placeholder={placeholder}
          minHeight="100%"
        />
      </div>
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        title="드래그하여 크기 조정"
        className="flex items-center justify-center h-3 bg-gray-50 hover:bg-gray-100 border-t border-gray-200 cursor-ns-resize select-none"
      >
        <GripHorizontal className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  )
}
