/**
 * Supabase Realtime Hook for Business Memos
 *
 * Real-time subscription to business_memos table changes filtered by businessId.
 * Handles INSERT/UPDATE/DELETE events with automatic cleanup on unmount.
 *
 * Usage pattern mirrors useSubsidyRealtime.ts
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface BusinessMemoRealtimePayload {
  id: string;
  business_id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  source_type?: 'manual' | 'task_sync';
  source_id?: string;
  task_status?: string | null;
  task_type?: string | null;
  is_active?: boolean;
  is_deleted?: boolean;
}

export interface UseBusinessMemoRealtimeOptions {
  businessId: string;
  enabled?: boolean;
  onInsert?: (memo: BusinessMemoRealtimePayload) => void;
  onUpdate?: (memo: BusinessMemoRealtimePayload) => void;
  onDelete?: (memoId: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Supabase Realtime subscription hook for business memos.
 *
 * Subscribes to INSERT/UPDATE/DELETE events on the business_memos table
 * filtered by businessId. Cleans up the channel on unmount.
 *
 * @example
 * ```typescript
 * useBusinessMemoRealtime({
 *   businessId,
 *   enabled: !!businessId,
 *   onInsert: (memo) => {
 *     setMemos(prev => {
 *       // 중복 방지: optimistic update로 이미 추가된 경우 스킵
 *       if (prev.some(m => m.id === memo.id)) return prev;
 *       return [memo, ...prev];
 *     });
 *   },
 *   onUpdate: (memo) => {
 *     setMemos(prev => prev.map(m => m.id === memo.id ? memo : m));
 *   },
 *   onDelete: (id) => {
 *     setMemos(prev => prev.filter(m => m.id !== id));
 *   }
 * });
 * ```
 */
export function useBusinessMemoRealtime(options: UseBusinessMemoRealtimeOptions) {
  const {
    businessId,
    enabled = true,
    onInsert,
    onUpdate,
    onDelete,
    onError
  } = options;

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled || !businessId) {
      return;
    }

    // 채널명에 businessId 포함 → 각 사업장별 독립 구독
    const channelName = `business_memos:${businessId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'business_memos',
          filter: `business_id=eq.${businessId}`
        },
        (payload) => {
          if (onInsert) {
            onInsert(payload.new as BusinessMemoRealtimePayload);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'business_memos',
          filter: `business_id=eq.${businessId}`
        },
        (payload) => {
          if (onUpdate) {
            onUpdate(payload.new as BusinessMemoRealtimePayload);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'business_memos',
          filter: `business_id=eq.${businessId}`
        },
        (payload) => {
          if (onDelete) {
            onDelete(payload.old.id as string);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('[MemoRealtime] 구독 오류:', err);
          if (onError) {
            onError(new Error(`Memo realtime error: ${err.message}`));
          }
          return;
        }

        if (status === 'CHANNEL_ERROR') {
          console.error('[MemoRealtime] 채널 오류 발생');
        } else if (status === 'TIMED_OUT') {
          console.warn('[MemoRealtime] 연결 타임아웃');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [businessId, enabled]);
  // onInsert/onUpdate/onDelete는 의존성 배열에서 제외:
  // 부모 컴포넌트가 매 렌더에 새 함수 참조를 넘기면 불필요한 재구독이 발생함.
  // 대신 핸들러는 최신 state를 클로저로 캡처하지 않도록 useRef 패턴을 권장하지만,
  // 단순성을 위해 현재 구조에서는 콜백이 안정적으로 정의되어야 함.
}
