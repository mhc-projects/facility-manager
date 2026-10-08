/**
 * GET /api/subsidy-crawler/runs/:runId/announcements
 *
 * 특정 크롤링 실행(run_id)에서 발견된 공고 목록 조회
 *
 * Query Parameters:
 * - page: 페이지 번호 (기본값: 1)
 * - page_size: 페이지당 항목 수 (기본값: 20, 최대: 100)
 * - relevant_only: 관련 공고만 표시 (기본값: false)
 * - ai_verified_only: AI 검증된 공고만 표시 (기본값: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AnnouncementItem {
  id: string;
  title: string;
  region_name: string;
  source_url: string;
  published_at: string | null;
  application_period_start: string | null;
  application_period_end: string | null;
  budget: string | null;
  support_amount: string | null;
  is_relevant: boolean;
  relevance_score: number | null;
  keywords_matched: string[];
  crawled_at: string;
}

interface AnnouncementListResponse {
  success: boolean;
  data?: {
    announcements: AnnouncementItem[];
    pagination: {
      total: number;
      page: number;
      page_size: number;
      total_pages: number;
    };
    filters: {
      show_relevant_only: boolean;
      show_ai_verified_only: boolean;
    };
  };
  error?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
): Promise<NextResponse<AnnouncementListResponse>> {
  try {
    const { runId } = params;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const page_size = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') || '20', 10)));
    const relevant_only = searchParams.get('relevant_only') === 'true';
    const ai_verified_only = searchParams.get('ai_verified_only') === 'true';

    // Build query
    let query = supabase
      .from('subsidy_announcements')
      .select('*', { count: 'exact' })
      .eq('crawl_run_id', runId);

    // Apply filters
    if (relevant_only) {
      query = query.eq('is_relevant', true);
    }

    if (ai_verified_only) {
      query = query.gte('relevance_score', 0.7); // AI verified threshold
    }

    // Apply pagination
    const offset = (page - 1) * page_size;
    query = query
      .order('crawled_at', { ascending: false })
      .range(offset, offset + page_size - 1);

    // Execute query
    const { data: announcements, error, count } = await query;

    if (error) {
      console.error('[API] subsidy-crawler/runs/[runId]/announcements GET error:', error);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch announcements: ${error.message}`,
        },
        { status: 500 }
      );
    }

    // Calculate pagination info
    const total = count || 0;
    const total_pages = Math.ceil(total / page_size);

    return NextResponse.json({
      success: true,
      data: {
        announcements: (announcements || []).map((a) => ({
          id: a.id,
          title: a.title,
          region_name: a.region_name,
          source_url: a.source_url,
          published_at: a.published_at,
          application_period_start: a.application_period_start,
          application_period_end: a.application_period_end,
          budget: a.budget,
          support_amount: a.support_amount,
          is_relevant: a.is_relevant,
          relevance_score: a.relevance_score,
          keywords_matched: a.keywords_matched || [],
          crawled_at: a.crawled_at,
        })),
        pagination: {
          total,
          page,
          page_size,
          total_pages,
        },
        filters: {
          show_relevant_only: relevant_only,
          show_ai_verified_only: ai_verified_only,
        },
      },
    });
  } catch (error) {
    console.error('[API] subsidy-crawler/runs/[runId]/announcements unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
