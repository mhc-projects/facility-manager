'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { TokenManager } from '@/lib/api-client'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Bell, X } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

const STORAGE_KEY = 'approval_banner_dismissed_count'

export default function ApprovalPendingBanner() {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const dismissedRef = useRef(dismissed)

  useEffect(() => { dismissedRef.current = dismissed }, [dismissed])

  const fetchCount = useCallback(async () => {
    const token = TokenManager.getToken()
    if (!token) return

    try {
      const res = await fetch('/api/approvals/pending-count', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        const newCount = data.count || 0
        setCount(prev => {
          // count가 줄었으면 dismissed 초기화 (결재 완료 반영)
          if (newCount < prev && dismissedRef.current) {
            setDismissed(false)
            sessionStorage.removeItem(STORAGE_KEY)
          }
          // count가 늘었으면 dismissed 해제 (새 결재 도착)
          if (newCount > prev && dismissedRef.current) {
            const dismissedAt = sessionStorage.getItem(STORAGE_KEY)
            if (dismissedAt && newCount > Number(dismissedAt)) {
              setDismissed(false)
            }
          }
          return newCount
        })
      }
    } catch {
      // Silently fail
    }
  }, [])

  // 초기 로드 + 15초 폴링 (Realtime 미수신 보완)
  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 15_000)
    return () => clearInterval(interval)
  }, [fetchCount])

  // Realtime: approval_documents 변경 감지 → 즉시 count 갱신
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`approval-banner:${user.id}`)
      // approval_documents INSERT/UPDATE 감지 (상신, 재상신, 승인 등)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'approval_documents' },
        () => { fetchCount() }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'approval_documents' },
        () => { fetchCount() }
      )
      // approval_steps UPDATE 감지 (승인/반려 처리)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'approval_steps' },
        () => { fetchCount() }
      )
      // notifications INSERT 감지 (filter 없이, 클라이언트에서 필터링)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const n = payload.new as any
          if (n?.target_user_id && n.target_user_id !== user.id) return
          const approvalCategories = ['report_submitted', 'report_approved', 'report_rejected']
          if (approvalCategories.includes(n?.category)) {
            fetchCount()
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [user?.id, fetchCount])

  useEffect(() => {
    if (count === 0) {
      // 결재 건수가 0이면 dismissed 상태와 무관하게 즉시 숨김
      setVisible(false)
      setDismissed(false)
      sessionStorage.removeItem(STORAGE_KEY)
    } else if (!dismissed) {
      setVisible(true)
    }
  }, [count, dismissed])

  const handleDismiss = () => {
    setDismissed(true)
    sessionStorage.setItem(STORAGE_KEY, String(count))
  }

  const handleGoTo = () => {
    handleDismiss()
    router.push('/admin/approvals?tab=pending')
    // 이미 결재 페이지에 있을 때도 최신 데이터 반영
    router.refresh()
  }

  // 결재 관련 페이지(상세, 작성)에서는 숨김
  const isApprovalPage = /^\/admin\/approvals(\/|$)/.test(pathname ?? '')
  if (!visible || isApprovalPage) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-2xl shadow-lg shadow-blue-900/20 animate-in slide-in-from-bottom-4 duration-300 whitespace-nowrap">
      <Bell className="w-4 h-4 flex-shrink-0 animate-pulse" />
      <span className="text-sm font-medium">
        결재 대기 <span className="font-bold text-yellow-300">{count}건</span>
      </span>
      <button
        onClick={handleGoTo}
        className="text-sm font-semibold bg-white text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
      >
        확인하기
      </button>
      <button
        onClick={handleDismiss}
        className="text-blue-200 hover:text-white transition-colors"
        aria-label="닫기"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
