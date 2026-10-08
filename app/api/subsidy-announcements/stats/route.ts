import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SubsidyDashboardStats } from '@/types/subsidy';

// 요청마다 DB를 다시 조회하도록 정적 렌더링 대상에서 제외한다 (없으면 빌드 시점 응답이 다음 배포까지 그대로 나간다)
export const dynamic = 'force-dynamic';
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET: 대시보드 통계
export async function GET(request: NextRequest) {
  try {
    // 전체 관련 공고 수 (relevance_score >= 0.75)
    // 주의: 실제로는 "관련 공고 전체"를 의미하며, 무관 공고는 제외됨
    const { count: totalCount } = await supabase
      .from('subsidy_announcements')
      .select('*', { count: 'exact', head: true })
      .eq('is_relevant', true)
      .gte('relevance_score', 0.75);

    // 관련 공고 수 (relevance_score >= 0.75)
    const { count: relevantCount } = await supabase
      .from('subsidy_announcements')
      .select('*', { count: 'exact', head: true })
      .eq('is_relevant', true)
      .gte('relevance_score', 0.75);

    // 읽지 않은 공고 수 (relevance_score >= 0.75)
    const { count: unreadCount } = await supabase
      .from('subsidy_announcements')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('is_relevant', true)
      .gte('relevance_score', 0.75);

    // 이번 주 신규 공고
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: newThisWeek } = await supabase
      .from('subsidy_announcements')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString())
      .eq('is_relevant', true)
      .gte('relevance_score', 0.75);

    // 마감 임박 (7일 이내)
    const now = new Date();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);
    const { count: expiringSoon } = await supabase
      .from('subsidy_announcements')
      .select('*', { count: 'exact', head: true })
      .gte('application_period_end', now.toISOString())
      .lte('application_period_end', weekLater.toISOString())
      .eq('is_relevant', true)
      .gte('relevance_score', 0.75);

    // 상태별 통계 (relevance_score >= 0.75)
    const { data: statusData } = await supabase
      .from('subsidy_announcements')
      .select('status')
      .eq('is_relevant', true)
      .gte('relevance_score', 0.75);

    const byStatus: Record<string, number> = {
      new: 0,
      reviewing: 0,
      applied: 0,
      expired: 0,
      not_relevant: 0
    };

    statusData?.forEach(item => {
      if (byStatus[item.status] !== undefined) {
        byStatus[item.status]++;
      }
    });

    // 지역 유형별 통계 (relevance_score >= 0.75)
    const { data: regionData } = await supabase
      .from('subsidy_announcements')
      .select('region_type')
      .eq('is_relevant', true)
      .gte('relevance_score', 0.75);

    const byRegionType: Record<string, number> = {
      metropolitan: 0,
      basic: 0
    };

    regionData?.forEach(item => {
      if (byRegionType[item.region_type] !== undefined) {
        byRegionType[item.region_type]++;
      }
    });

    // 최근 크롤링 로그
    const { data: recentCrawl } = await supabase
      .from('crawl_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const stats: SubsidyDashboardStats = {
      total_announcements: totalCount || 0,
      relevant_announcements: relevantCount || 0,
      unread_count: unreadCount || 0,
      new_this_week: newThisWeek || 0,
      expiring_soon: expiringSoon || 0,
      by_status: byStatus as any,
      by_region_type: byRegionType as any,
      recent_crawl: recentCrawl || undefined
    };

    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('통계 API 오류:', error);
    return NextResponse.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, { status: 500 });
  }
}
