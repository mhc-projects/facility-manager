import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// URL Health Monitoring API
// ============================================================
// Purpose: Track individual URL performance and health status
// Endpoints:
//   GET /api/subsidy-crawler/url-health - List URL health metrics
//   GET /api/subsidy-crawler/url-health?unhealthy_only=true - Filter unhealthy URLs
//   POST /api/subsidy-crawler/url-health - Update URL health metrics
// ============================================================

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/subsidy-crawler/url-health - Get URL health metrics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unhealthyOnly = searchParams.get('unhealthy_only') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build query
    let query = supabase
      .from('vw_url_health_summary')
      .select('*')
      .order('is_healthy', { ascending: true }) // Unhealthy first
      .order('success_rate', { ascending: true }) // Lowest success rate first
      .range(offset, offset + limit - 1);

    // Filter unhealthy only if requested
    if (unhealthyOnly) {
      query = query.eq('is_healthy', false);
    }

    const { data: healthMetrics, error } = await query;

    if (error) {
      console.error('Error fetching URL health metrics:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    // 응답시간은 측정된 URL만 평균한다(한 번도 성공하지 못한 URL은 null)
    const responseTimes = (healthMetrics || [])
      .map(m => m.avg_response_time_ms)
      .filter((v): v is number => typeof v === 'number');
    const stats = healthMetrics ? {
      total_urls: healthMetrics.length,
      healthy_urls: healthMetrics.filter(m => m.is_healthy).length,
      unhealthy_urls: healthMetrics.filter(m => !m.is_healthy).length,
      avg_success_rate: healthMetrics.length > 0
        ? healthMetrics.reduce((sum, m) => sum + m.success_rate, 0) / healthMetrics.length
        : 0,
      avg_relevance_rate: healthMetrics.length > 0
        ? healthMetrics.reduce((sum, m) => sum + m.relevance_rate, 0) / healthMetrics.length
        : 0,
      avg_response_time_ms: responseTimes.length > 0
        ? responseTimes.reduce((sum, v) => sum + v, 0) / responseTimes.length
        : null,
      urls_with_failures: healthMetrics.filter(m => m.consecutive_failures > 0).length,
      critical_urls: healthMetrics.filter(m => m.consecutive_failures >= 3).length,
    } : null;

    return NextResponse.json({
      success: true,
      data: {
        metrics: healthMetrics || [],
        pagination: {
          limit,
          offset,
          total: healthMetrics?.length || 0,
        },
        statistics: stats,
      },
    });
  } catch (error: any) {
    console.error('Unexpected error in URL health API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/subsidy-crawler/url-health - Update URL health metrics
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      url_id,
      source_url,
      period_start,
      period_end,
      total_attempts,
      successful_crawls,
      failed_crawls,
      avg_response_time_ms,
      max_response_time_ms,
      min_response_time_ms,
      total_announcements_found,
      relevant_announcements_found,
      ai_verified_announcements_found,
      last_error_message,
      last_error_at,
      consecutive_failures,
    } = body;

    // Validation
    if (!url_id || !source_url || !period_start || !period_end) {
      return NextResponse.json(
        { success: false, error: 'url_id, source_url, period_start, and period_end are required' },
        { status: 400 }
      );
    }

    // Upsert URL health metric
    const { data: metric, error } = await supabase
      .from('url_health_metrics')
      .upsert(
        {
          url_id,
          source_url,
          period_start,
          period_end,
          total_attempts: total_attempts || 0,
          successful_crawls: successful_crawls || 0,
          failed_crawls: failed_crawls || 0,
          avg_response_time_ms,
          max_response_time_ms,
          min_response_time_ms,
          total_announcements_found: total_announcements_found || 0,
          relevant_announcements_found: relevant_announcements_found || 0,
          ai_verified_announcements_found: ai_verified_announcements_found || 0,
          last_error_message,
          last_error_at,
          consecutive_failures: consecutive_failures || 0,
        },
        {
          onConflict: 'url_id,period_start,period_end',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Error upserting URL health metric:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: metric,
    });
  } catch (error: any) {
    console.error('Unexpected error updating URL health:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
