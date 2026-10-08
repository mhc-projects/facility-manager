import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 요청마다 DB를 다시 조회하도록 정적 렌더링 대상에서 제외한다 (없으면 빌드 시점 응답이 다음 배포까지 그대로 나간다)
export const dynamic = 'force-dynamic';
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store';

/**
 * GET /api/subsidy-crawler/registered-regions
 * URL 데이터관리에 등록된 활성화된 지역 목록 조회
 */
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // URL 데이터관리에서 활성화된 지역 목록 조회
    const { data, error } = await supabase
      .from('direct_url_sources')
      .select('region_name')
      .eq('is_active', true);

    if (error) {
      console.error('[REGISTERED-REGIONS] Supabase 오류:', error);
      throw error;
    }

    // 중복 제거 및 정렬
    const uniqueRegions = [...new Set(data.map(d => d.region_name))]
      .filter(region => region && region.trim()) // null, undefined, 빈 문자열 제거
      .sort((a, b) => a.localeCompare(b, 'ko'));

    console.log(`[REGISTERED-REGIONS] 등록된 지역 ${uniqueRegions.length}곳 조회 성공`);

    return NextResponse.json({
      success: true,
      data: uniqueRegions,
    });
  } catch (error: any) {
    console.error('[REGISTERED-REGIONS] 오류:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
