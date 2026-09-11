// AS관리 화면과 하위 컴포넌트가 공유하는 타입/상수 — page.tsx가 아닌 별도 파일로 분리한 이유는
// Next.js App Router가 page.tsx의 named export(default 외)를 허용하지 않기 때문(.next/types 검증 실패).
export interface AsRecord {
  id: string;
  business_id: string | null;
  business_name: string;
  business_name_raw: string | null;
  business_management_code: number | null;
  delivery_date: string | null;
  address: string | null;
  manager_name: string | null;
  manager_contact: string | null;
  site_address: string | null;
  site_manager: string | null;
  site_contact: string | null;
  receipt_date: string | null;
  work_date: string | null;
  receipt_content: string | null;
  work_content: string | null;
  outlet_description: string | null;
  as_manager_name: string | null;
  as_manager_contact: string | null;
  as_manager_affiliation: string | null;
  is_paid_override: boolean | null;
  is_paid: boolean | null;
  manufacturer: string | null;
  delivery_date_override: string | null;
  installation_date: string | null;
  status: string;
  progress_notes: ProgressNote[];
  material_count: number;
  total_material_cost: number;
  dispatch_count: number;
  dispatch_cost_price_id: string | null;
  dispatch_revenue_price_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgressNote {
  id: string;
  timestamp: string;
  author: string;
  content: string;
  status_at_time: string;
}

export const MANUFACTURER_OPTIONS = [
  { value: 'ecosense',   label: '에코센스' },
  { value: 'cleanearth', label: '크린어스' },
  { value: 'gaia_cns',   label: '가이아씨앤에스' },
  { value: 'evs',        label: '이브이에스' },
];

export interface PriceItem {
  id: string;
  category: string | null;
  item_name: string;
  unit_price: number;
  unit: string;
}

export interface PriceLists {
  cost: PriceItem[];
  revenue: PriceItem[];
  dispatchCost: PriceItem[];
  dispatchRevenue: PriceItem[];
}
