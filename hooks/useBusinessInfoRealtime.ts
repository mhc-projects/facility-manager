import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface UseBusinessInfoRealtimeOptions {
  enabled?: boolean;
  onInsert?: () => void;
  onUpdate?: () => void;
  onDelete?: () => void;
}

/**
 * business_info 테이블 실시간 구독 훅
 * 사업장 정보(청구/입금/비용 등)가 변경되면 매출관리 페이지에 즉시 반영
 */
export function useBusinessInfoRealtime(options: UseBusinessInfoRealtimeOptions = {}) {
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
      .channel('business_info_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'business_info' }, () => {
        callbacksRef.current.onInsert?.();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'business_info' }, () => {
        callbacksRef.current.onUpdate?.();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'business_info' }, () => {
        callbacksRef.current.onDelete?.();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [enabled]); // enabled 변경 시에만 재구독
}
