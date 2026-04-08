import { useState, useEffect } from 'react';
import { TokenManager } from '@/lib/api-client';

export interface PaymentStatusInfo {
  business_id: string;
  payment_status: string;
  has_refund_history: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  diff_pending: { label: '차액발생', color: 'bg-red-100 text-red-800' },
  final_completed: { label: '정산완료', color: 'bg-green-100 text-green-800' },
  final_pending: { label: '본마감대기', color: 'bg-orange-100 text-orange-800' },
  forecast_completed: { label: '예측완료', color: 'bg-blue-100 text-blue-800' },
  forecast_pending: { label: '예측대기', color: 'bg-yellow-100 text-yellow-800' },
  not_applicable: { label: '미대상', color: 'bg-gray-100 text-gray-500' },
};

export function getPaymentStatusDisplay(status: string) {
  return STATUS_LABELS[status] || STATUS_LABELS.not_applicable;
}

/**
 * 사업장별 설치비 지급 상태를 조회하는 hook
 * 매출관리 페이지에서 상태 뱃지 표시용
 */
export function usePaymentStatus(businessIds: string[]) {
  const [statusMap, setStatusMap] = useState<Record<string, PaymentStatusInfo>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (businessIds.length === 0) return;

    const fetchStatuses = async () => {
      setLoading(true);
      try {
        const token = TokenManager.getToken();
        const res = await fetch('/api/installation-closing/payment-status', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ business_ids: businessIds }),
        });
        const data = await res.json();
        if (data.success) {
          const map: Record<string, PaymentStatusInfo> = {};
          data.data.forEach((item: PaymentStatusInfo) => {
            map[item.business_id] = item;
          });
          setStatusMap(map);
        }
      } catch {
        // 실패해도 매출관리 페이지 기능에 영향 없음
      } finally {
        setLoading(false);
      }
    };

    fetchStatuses();
  }, [businessIds.join(',')]);

  return { statusMap, loading };
}
