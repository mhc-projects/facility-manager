/**
 * Supabase Realtime Hook for Facility Tasks (notes field)
 *
 * Real-time subscription to facility_tasks table changes.
 * Handles UPDATE events to keep task notes in sync across pages.
 *
 * Usage pattern mirrors useBusinessMemoRealtime.ts
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface TaskNotesRealtimePayload {
  id: string;
  notes?: string | null;
  title?: string;
  status?: string;
  task_type?: string;
  business_id?: string | null;
  business_name?: string | null;
  updated_at?: string;
}

export interface UseTaskNotesRealtimeOptions {
  enabled?: boolean;
  onUpdate?: (task: TaskNotesRealtimePayload) => void;
  onError?: (error: Error) => void;
}

export function useTaskNotesRealtime(options: UseTaskNotesRealtimeOptions) {
  const {
    enabled = true,
    onUpdate,
    onError
  } = options;

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const channelName = 'facility_tasks:notes_realtime';

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'facility_tasks'
        },
        (payload) => {
          if (onUpdate) {
            onUpdate(payload.new as TaskNotesRealtimePayload);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('[TaskNotesRealtime] 구독 오류:', err);
          if (onError) {
            onError(new Error(`Task notes realtime error: ${err.message}`));
          }
          return;
        }

        if (status === 'CHANNEL_ERROR') {
          console.error('[TaskNotesRealtime] 채널 오류 발생');
        } else if (status === 'TIMED_OUT') {
          console.warn('[TaskNotesRealtime] 연결 타임아웃');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [enabled]);
  // onUpdate는 의존성 배열에서 제외:
  // 부모 컴포넌트가 매 렌더에 새 함수 참조를 넘기면 불필요한 재구독이 발생함.
}
