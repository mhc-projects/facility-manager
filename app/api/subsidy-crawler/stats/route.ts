import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// Crawler Stats API
// ============================================================
// 목적: 크롤링 통계 및 모니터링 데이터 제공
// 엔드포인트: GET /api/subsidy-crawler/stats
// ============================================================

export const dynamic = 'force-dynamic';
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const CRAWLER_SECRET = process.env.CRAWLER_SECRET || 'dev-secret';

// ============================================================
// 타입 정의
// ============================================================

interface CrawlStats {
  // 전체 통계
  total_runs: number;
  total_successful: number;
  total_failed: number;
  avg_success_rate: number;
  avg_duration_seconds: number;
  total_new_announcements: number;
  total_relevant_announcements: number;

  // 타입별 통계
  auto_crawl_stats?: CrawlTypeStats;
  direct_crawl_stats?: CrawlTypeStats;

  // 최근 실행
  recent_runs?: RecentRun[];

  // 진행 중인 크롤링
  running_crawls?: RunningCrawl[];

  // URL 소스 통계
  url_source_stats?: UrlSourceStats;

  // 문제 URL
  problem_urls?: ProblemUrl[];
}

interface CrawlTypeStats {
  total_runs: number;
  total_successful: number;
  total_failed: number;
  avg_success_rate: number;
  avg_duration_seconds: number;
  total_new_announcements: number;
  total_relevant_announcements: number;
}

interface RecentRun {
  id: string;
  crawl_type: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  total_urls: number;
  successful_urls: number;
  failed_urls: number;
  new_announcements: number;
  relevant_announcements: number;
}

interface RunningCrawl {
  id: string;
  crawl_type: string;
  started_at: string;
  elapsed_seconds: number;
}

interface UrlSourceStats {
  total_urls: number;
  active_urls: number;
  inactive_urls: number;
  avg_success_rate: number;
  total_attempts: number;
  total_successes: number;
  total_failures: number;
}

interface ProblemUrl {
  id: string;
  url: string;
  region_name: string;
  category: string;
  consecutive_failures: number;
  last_error: string;
  last_crawled_at: string;
  severity: 'critical' | 'warning' | 'normal';
}

// ============================================================
// GET: 크롤링 통계 조회
// ============================================================

export async function GET(request: NextRequest) {
  // 인증 확인 (선택사항: stats는 public일 수 있음)
  const authHeader = request.headers.get('authorization');
  const isAuthenticated = authHeader === `Bearer ${CRAWLER_SECRET}`;

  const { searchParams } = new URL(request.url);
  const includeDetails = searchParams.get('details') === 'true';
  const includeProblems = searchParams.get('problems') === 'true';

  try {
    const stats: CrawlStats = {
      total_runs: 0,
      total_successful: 0,
      total_failed: 0,
      avg_success_rate: 0,
      avg_duration_seconds: 0,
      total_new_announcements: 0,
      total_relevant_announcements: 0,
    };

    // ========================================
    // 1. 최근 7일 통계 (crawl_stats_recent 뷰)
    // ========================================

    const { data: recentStats, error: statsError } = await supabase
      .from('crawl_stats_recent')
      .select('*');

    if (!statsError && recentStats) {
      for (const row of recentStats) {
        stats.total_runs += row.total_runs || 0;
        stats.total_successful += row.total_successful || 0;
        stats.total_failed += row.total_failed || 0;
        stats.total_new_announcements += row.total_new_announcements || 0;
        stats.total_relevant_announcements += row.total_relevant_announcements || 0;

        // 타입별 통계
        if (row.crawl_type === 'auto') {
          stats.auto_crawl_stats = {
            total_runs: row.total_runs,
            total_successful: row.total_successful,
            total_failed: row.total_failed,
            avg_success_rate: row.avg_success_rate || 0,
            avg_duration_seconds: row.avg_duration_seconds || 0,
            total_new_announcements: row.total_new_announcements || 0,
            total_relevant_announcements: row.total_relevant_announcements || 0,
          };
        } else if (row.crawl_type === 'direct') {
          stats.direct_crawl_stats = {
            total_runs: row.total_runs,
            total_successful: row.total_successful,
            total_failed: row.total_failed,
            avg_success_rate: row.avg_success_rate || 0,
            avg_duration_seconds: row.avg_duration_seconds || 0,
            total_new_announcements: row.total_new_announcements || 0,
            total_relevant_announcements: row.total_relevant_announcements || 0,
          };
        }
      }

      // 전체 평균 성공률
      const totalUrls = stats.total_successful + stats.total_failed;
      stats.avg_success_rate = totalUrls > 0
        ? Math.round((stats.total_successful / totalUrls) * 100 * 100) / 100
        : 0;

      // 평균 실행 시간 (가중 평균)
      let totalDuration = 0;
      let totalRuns = 0;
      for (const row of recentStats) {
        totalDuration += (row.avg_duration_seconds || 0) * (row.total_runs || 0);
        totalRuns += row.total_runs || 0;
      }
      stats.avg_duration_seconds = totalRuns > 0
        ? Math.round(totalDuration / totalRuns)
        : 0;
    }

    // ========================================
    // 2. 상세 정보 (옵션)
    // ========================================

    if (includeDetails && isAuthenticated) {
      // 최근 10개 실행
      const { data: recentRuns } = await supabase
        .from('crawl_logs_detailed')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      if (recentRuns) {
        stats.recent_runs = recentRuns.map((run: any) => ({
          id: run.id,
          crawl_type: run.crawl_type,
          started_at: run.started_at,
          completed_at: run.completed_at,
          duration_seconds: run.duration_seconds,
          total_urls: run.total_urls,
          successful_urls: run.successful_urls,
          failed_urls: run.failed_urls,
          new_announcements: run.new_announcements,
          relevant_announcements: run.relevant_announcements,
        }));
      }

      // 진행 중인 크롤링
      const { data: runningCrawls } = await supabase.rpc('get_running_crawls');

      if (runningCrawls) {
        stats.running_crawls = runningCrawls.map((crawl: any) => ({
          id: crawl.id,
          crawl_type: crawl.crawl_type,
          started_at: crawl.started_at,
          elapsed_seconds: crawl.elapsed_seconds,
        }));
      }
    }

    // ========================================
    // 3. URL 소스 통계
    // ========================================

    const { data: urlStats } = await supabase
      .from('direct_url_sources')
      .select('is_active, total_attempts, total_successes');

    if (urlStats) {
      const totalUrls = urlStats.length;
      const activeUrls = urlStats.filter((u: any) => u.is_active).length;
      const totalAttempts = urlStats.reduce((sum: number, u: any) => sum + (u.total_attempts || 0), 0);
      const totalSuccesses = urlStats.reduce((sum: number, u: any) => sum + (u.total_successes || 0), 0);

      stats.url_source_stats = {
        total_urls: totalUrls,
        active_urls: activeUrls,
        inactive_urls: totalUrls - activeUrls,
        avg_success_rate: totalAttempts > 0
          ? Math.round((totalSuccesses / totalAttempts) * 100 * 100) / 100
          : 0,
        total_attempts: totalAttempts,
        total_successes: totalSuccesses,
        total_failures: totalAttempts - totalSuccesses,
      };
    }

    // ========================================
    // 4. 문제 URL (옵션)
    // ========================================

    if (includeProblems && isAuthenticated) {
      const { data: problemUrls } = await supabase
        .from('problem_urls')
        .select('*')
        .order('consecutive_failures', { ascending: false })
        .limit(20);

      if (problemUrls) {
        stats.problem_urls = problemUrls.map((url: any) => ({
          id: url.id,
          url: url.url,
          region_name: url.region_name,
          category: url.category,
          consecutive_failures: url.consecutive_failures,
          last_error: url.last_error,
          last_crawled_at: url.last_crawled_at,
          severity: url.severity,
        }));
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch stats',
      },
      { status: 500 }
    );
  }
}
