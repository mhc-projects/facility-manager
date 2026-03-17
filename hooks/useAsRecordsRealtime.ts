import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface UseAsRecordsRealtimeOptions {
  enabled?: boolean;
  onInsert?: (record: Record<string, unknown>) => void;
  onUpdate?: (record: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
}

/**
 * AS 건 실시간 구독 훅
 * as_records 테이블의 INSERT/UPDATE/DELETE 이벤트를 구독하여
 * 외부 시스템에서 데이터를 입력하면 AS관리 페이지에 즉시 반영
 */
export function useAsRecordsRealtime(options: UseAsRecordsRealtimeOptions = {}) {
  const { enabled = true, onInsert, onUpdate, onDelete } = options;
  const channelRef = useRef<RealtimeChannel | null>(null);
  // 콜백을 ref로 보관 → 함수 레퍼런스 변경 시 채널 재구독 방지
  const callbacksRef = useRef({ onInsert, onUpdate, onDelete });
  callbacksRef.current = { onInsert, onUpdate, onDelete };

  useEffect(() => {
    if (!enabled) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase
      .channel('as_records_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'as_records' }, (payload) => {
        callbacksRef.current.onInsert?.(payload.new as Record<string, unknown>);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'as_records' }, (payload) => {
        callbacksRef.current.onUpdate?.(payload.new as Record<string, unknown>);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'as_records' }, (payload) => {
        callbacksRef.current.onDelete?.((payload.old as { id: string }).id);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [enabled]); // enabled 변경 시에만 재구독
}
