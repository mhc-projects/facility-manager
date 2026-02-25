// types/dashboard.ts
// 대시보드 그래프 데이터 타입 정의

export interface RevenueData {
  month: string;                // "2025-01", "2025-02" 형식
  revenue: number;              // 매출
  cost: number;                 // 매입
  profit: number;               // 순이익
  profitRate: number;           // 이익률 (%)
  target?: number;              // 월별 목표
  achievementRate?: number;     // 달성률 (%)
  prevMonthChange: number;      // 전월 대비 증감률 (%)
  count: number;                // 해당 월 사업장 수
}

export interface ReceivableData {
  month: string;                // "2025-01" 형식
  outstanding: number;          // 미수금
  collected: number;            // 회수 금액
  collectionRate: number;       // 회수율 (%)
  prevMonthChange: number;      // 전월 대비 증감
}

export interface InstallationData {
  month: string;                // "2025-01" 형식
  waiting: number;              // 대기 건수
  inProgress: number;           // 진행중 건수
  completed: number;            // 완료 건수
  total: number;                // 전체 건수
  completionRate: number;       // 완료율 (%)
  prevMonthChange: number;      // 전월 대비 증감
}

export interface DashboardFilters {
  office?: string;              // 지사별 필터
  manufacturer?: string;        // 제조사별 필터
  progressStatus?: string;      // 진행구분별 필터
  salesOffice?: string;         // 영업점별 필터

  // 기간 필터
  periodMode?: 'recent' | 'custom' | 'yearly';  // 조회 모드
  months?: number;              // recent 모드: 최근 N개월
  startDate?: string;           // custom 모드: 시작일 (YYYY-MM)
  endDate?: string;             // custom 모드: 종료일 (YYYY-MM)
  year?: number;                // yearly 모드: 특정 연도
}

export interface DashboardTarget {
  id: string;
  target_type: 'revenue' | 'receivable' | 'installation';
  month: string;
  target_value: number;
  created_at?: string;
  updated_at?: string;
}

export interface RevenueSummary {
  avgProfit: number;            // 평균 순이익
  avgProfitRate: number;        // 평균 이익률
  totalRevenue: number;         // 총 매출
  totalProfit: number;          // 총 순이익
  totalCost: number;            // 총 매입금액
  totalOtherCosts: number;      // 기타 비용 (실사비+AS비+커스텀비)
  avgProfitRateByBiz: number;   // 사업장 평균 이익률
  totalSalesCommission?: number;   // 총 영업비용
  totalInstallationCost?: number;  // 총 설치비용
}

export interface ReceivableSummary {
  totalOutstanding: number;     // 총 미수금
  avgCollectionRate: number;    // 평균 회수율
}

export interface InstallationSummary {
  avgMonthlyInstallations: number;  // 월평균 설치 건수
  avgCompletionRate: number;        // 평균 완료율
  totalInstallations: number;       // 총 설치 건수
}
