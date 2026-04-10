'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// 사용자별 고유 색상 (최대 8명)
const PRESENCE_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
]

export interface PresenceUser {
  userId: string
  userName: string
  color: string
  lockedSections: string[]  // 현재 이 사용자가 잠근 섹션 ID 목록
  joinedAt: number
}

interface UseMeetingPresenceOptions {
  meetingId: string
  currentUserId: string
  currentUserName: string
  enabled?: boolean
}

interface UseMeetingPresenceReturn {
  /** 나를 제외한 현재 편집 중인 다른 사용자 목록 */
  otherEditors: PresenceUser[]
  /** 특정 섹션을 내가 잠글 수 있는지 확인 */
  canLockSection: (sectionId: string) => boolean
  /** 특정 섹션을 잠그고 있는 다른 사용자 반환 (없으면 null) */
  getSectionLocker: (sectionId: string) => PresenceUser | null
  /** 섹션 잠금 획득 (포커스 시 호출) */
  lockSection: (sectionId: string) => void
  /** 섹션 잠금 해제 (블러 시 호출) */
  unlockSection: (sectionId: string) => void
  /** Presence 연결 상태 */
  isConnected: boolean
}

export function useMeetingPresence({
  meetingId,
  currentUserId,
  currentUserName,
  enabled = true,
}: UseMeetingPresenceOptions): UseMeetingPresenceReturn {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [otherEditors, setOtherEditors] = useState<PresenceUser[]>([])
  const [myLockedSections, setMyLockedSections] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  // isConnectedRef: stale closure 방지용 — lockSection/unlockSection/trackPresence 내부에서 참조
  const isConnectedRef = useRef(false)
  const myColorRef = useRef<string>(PRESENCE_COLORS[0])
  const myLockedSectionsRef = useRef<string[]>([])
  // joinedAtRef: 매 track 호출마다 joinedAt이 갱신되어 불필요한 presence sync가 발생하는 것을 방지
  const joinedAtRef = useRef<number | null>(null)

  // myLockedSections가 변경될 때 ref도 동기화
  useEffect(() => {
    myLockedSectionsRef.current = myLockedSections
  }, [myLockedSections])

  // Presence 상태 갱신 (채널에 현재 상태 broadcast)
  // isConnectedRef를 참조해 stale closure를 방지하고, joinedAt은 최초값을 재사용
  const trackPresence = useCallback((lockedSections: string[]) => {
    if (!channelRef.current || !isConnectedRef.current) return
    channelRef.current.track({
      userId: currentUserId,
      userName: currentUserName,
      color: myColorRef.current,
      lockedSections,
      joinedAt: joinedAtRef.current ?? Date.now(),
    })
  }, [currentUserId, currentUserName])

  useEffect(() => {
    if (!enabled || !meetingId || !currentUserId) return

    const channelName = `editing:meeting-${meetingId}`
    const channel = supabase.channel(channelName, {
      config: { presence: { key: currentUserId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>()

        // 다른 사용자 목록 추출 (나 제외)
        const others: PresenceUser[] = []
        let colorIndex = 0

        Object.entries(state).forEach(([userId, presences]) => {
          if (userId === currentUserId) {
            // 내 색상 저장
            const me = presences[0] as any
            if (me?.color) myColorRef.current = me.color
            return
          }
          const presence = presences[0] as any
          if (presence) {
            others.push({
              userId,
              userName: presence.userName || '알 수 없음',
              color: presence.color || PRESENCE_COLORS[colorIndex % PRESENCE_COLORS.length],
              lockedSections: presence.lockedSections || [],
              joinedAt: presence.joinedAt || Date.now(),
            })
            colorIndex++
          }
        })

        setOtherEditors(others)
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key !== currentUserId) return
        // 내가 join되면 내 색상 할당
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // isConnectedRef를 state보다 먼저 동기 갱신해 이후 콜백에서 stale closure 방지
          isConnectedRef.current = true
          setIsConnected(true)

          // joinedAt: 최초 구독 시에만 설정, 재연결 시에는 기존 값 유지
          if (joinedAtRef.current === null) {
            joinedAtRef.current = Date.now()
          }

          // 입장 시 색상 배정: 현재 사용자 수 기반
          const state = channel.presenceState()
          const existingCount = Object.keys(state).length
          myColorRef.current = PRESENCE_COLORS[existingCount % PRESENCE_COLORS.length]

          // 재연결 시 기존 잠금 상태 복구 (myLockedSectionsRef.current), 초기 입장 시에는 []
          await channel.track({
            userId: currentUserId,
            userName: currentUserName,
            color: myColorRef.current,
            lockedSections: myLockedSectionsRef.current,
            joinedAt: joinedAtRef.current,
          })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isConnectedRef.current = false
          setIsConnected(false)
        }
      })

    channelRef.current = channel

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
      channelRef.current = null
      isConnectedRef.current = false
      joinedAtRef.current = null
      setIsConnected(false)
      setOtherEditors([])
    }
  }, [enabled, meetingId, currentUserId, currentUserName])

  // isConnected가 true가 되면 현재 lockedSections 상태를 broadcast
  useEffect(() => {
    if (isConnected) {
      trackPresence(myLockedSectionsRef.current)
    }
  }, [isConnected, trackPresence])

  const lockSection = useCallback((sectionId: string) => {
    setMyLockedSections(prev => {
      if (prev.includes(sectionId)) return prev
      const next = [...prev, sectionId]
      // isConnectedRef로 stale closure 방지, joinedAt 재사용
      if (channelRef.current && isConnectedRef.current) {
        channelRef.current.track({
          userId: currentUserId,
          userName: currentUserName,
          color: myColorRef.current,
          lockedSections: next,
          joinedAt: joinedAtRef.current ?? Date.now(),
        })
      }
      return next
    })
  }, [currentUserId, currentUserName])

  const unlockSection = useCallback((sectionId: string) => {
    setMyLockedSections(prev => {
      const next = prev.filter(s => s !== sectionId)
      // isConnectedRef로 stale closure 방지, joinedAt 재사용
      if (channelRef.current && isConnectedRef.current) {
        channelRef.current.track({
          userId: currentUserId,
          userName: currentUserName,
          color: myColorRef.current,
          lockedSections: next,
          joinedAt: joinedAtRef.current ?? Date.now(),
        })
      }
      return next
    })
  }, [currentUserId, currentUserName])

  const canLockSection = useCallback((sectionId: string): boolean => {
    return !otherEditors.some(editor => editor.lockedSections.includes(sectionId))
  }, [otherEditors])

  const getSectionLocker = useCallback((sectionId: string): PresenceUser | null => {
    return otherEditors.find(editor => editor.lockedSections.includes(sectionId)) ?? null
  }, [otherEditors])

  return {
    otherEditors,
    canLockSection,
    getSectionLocker,
    lockSection,
    unlockSection,
    isConnected,
  }
}
