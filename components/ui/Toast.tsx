'use client'

import { useEffect } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
  duration?: number
}

/**
 * Toast 알림 컴포넌트
 *
 * 비차단 방식의 알림으로 alert를 대체
 * - 렌더링 차단 없음
 * - 자동 사라짐
 * - 더 나은 UX
 *
 * @example
 * const [toast, setToast] = useState(null)
 *
 * // 성공 알림
 * setToast({ message: '저장되었습니다', type: 'success' })
 *
 * // 에러 알림
 * setToast({ message: '오류가 발생했습니다', type: 'error' })
 *
 * // 렌더링
 * {toast && <Toast {...toast} onClose={() => setToast(null)} />}
 */
export function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  const styles = {
    success: {
      bg: 'bg-green-500',
      icon: <CheckCircle className="w-5 h-5" />
    },
    error: {
      bg: 'bg-red-500',
      icon: <XCircle className="w-5 h-5" />
    }
  }

  const style = styles[type]

  return (
    <div
      className={`fixed top-20 right-4 ${style.bg} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 transition-all duration-300 animate-slideInRight`}
      role="alert"
    >
      {style.icon}
      <span className="font-medium">{message}</span>
      <button
        onClick={onClose}
        className="hover:opacity-80 transition-opacity"
        aria-label="닫기"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
