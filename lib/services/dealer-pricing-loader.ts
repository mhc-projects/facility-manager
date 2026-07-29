// dealer_pricing 테이블 조회 (서버 전용 — pg 직접 연결 사용, 클라이언트 번들에 포함 금지)
import { queryAll } from '@/lib/supabase-direct';
import { groupDealerPricingByName, type DealerPricingRow } from '@/lib/dealer-pricing';

export async function loadDealerPricingByName(): Promise<Record<string, DealerPricingRow[]>> {
  const rows = await queryAll(
    'SELECT equipment_name, manufacturer, dealer_selling_price FROM dealer_pricing WHERE is_active = $1',
    [true]
  );
  return groupDealerPricingByName((rows || []) as DealerPricingRow[]);
}
