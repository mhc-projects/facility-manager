import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// AI Verification Statistics API
// ============================================================
// Purpose: Get aggregate statistics and disagreements from AI verification
// Endpoints:
//   GET /api/subsidy-crawler/ai-verification/stats - Get overall AI stats
//   GET /api/subsidy-crawler/ai-verification/stats?run_id=xxx - Stats for specific run
// ============================================================

export const dynamic = 'force-dynamic';
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/subsidy-crawler/ai-verification/stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('run_id');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Build query for verification logs
    let query = supabase
      .from('ai_verification_log')
      .select('*');

    // Filter by run_id if provided
    if (runId) {
      query = query.eq('run_id', runId);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('Error fetching AI verification logs:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Calculate statistics
    const stats = logs ? {
      total_verifications: logs.length,
      ai_verified_count: logs.filter(l => l.ai_verified).length,
      ai_rejected_count: logs.filter(l => !l.ai_verified).length,
      keyword_matched_count: logs.filter(l => l.keyword_matched).length,

      // Disagreements
      total_disagreements: logs.filter(l => l.disagreement).length,
      keyword_only_count: logs.filter(l => l.keyword_matched && !l.ai_verified).length,
      ai_only_count: logs.filter(l => !l.keyword_matched && l.ai_verified).length,

      // Agreement metrics
      agreement_count: logs.filter(l => !l.disagreement).length,
      agreement_rate: logs.length > 0
        ? ((logs.length - logs.filter(l => l.disagreement).length) / logs.length * 100).toFixed(2)
        : 0,

      // Confidence metrics
      avg_ai_confidence: logs.length > 0
        ? logs.reduce((sum, l) => sum + (l.ai_confidence || 0), 0) / logs.length
        : 0,
      avg_keyword_score: logs.length > 0
        ? logs.reduce((sum, l) => sum + (l.keyword_score || 0), 0) / logs.length
        : 0,

      // Token usage and cost
      total_tokens: logs.reduce((sum, l) => sum + (l.total_tokens || 0), 0),
      total_cost_usd: logs.reduce((sum, l) => sum + (l.api_cost_usd || 0), 0),
      avg_response_time_ms: logs.length > 0
        ? logs.reduce((sum, l) => sum + (l.response_time_ms || 0), 0) / logs.length
        : 0,
    } : null;

    // Get recent disagreements
    const { data: disagreements, error: disagError } = await supabase
      .from('vw_ai_disagreements')
      .select('*')
      .limit(limit)
      .order('verified_at', { ascending: false });

    if (disagError) {
      console.error('Error fetching disagreements:', disagError);
    }

    // Get disagreement breakdown by type
    const disagreementBreakdown = disagreements ? {
      keyword_only: disagreements.filter(d => d.disagreement_type === 'keyword_only').length,
      ai_only: disagreements.filter(d => d.disagreement_type === 'ai_only').length,
      total: disagreements.length,
    } : null;

    return NextResponse.json({
      success: true,
      data: {
        statistics: stats,
        recent_disagreements: disagreements || [],
        disagreement_breakdown: disagreementBreakdown,
      },
    });
  } catch (error: any) {
    console.error('Unexpected error in AI verification stats API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
