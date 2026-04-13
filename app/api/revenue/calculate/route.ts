import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { calculateRevenue } from '@/lib/services/revenue-calculator';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 매출 계산 실행 (얇은 래퍼 — 인증·파싱·응답만 처리)
// 계산 로직 전체는 lib/services/revenue-calculator.ts 참조
export async function POST(request: NextRequest) {
  try {
    // JWT 토큰 검증
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        message: '인증이 필요합니다.'
      }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);

    if (!decoded) {
      return NextResponse.json({
        success: false,
        message: '유효하지 않은 토큰입니다.'
      }, { status: 401 });
    }

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level;

    if (!permissionLevel || permissionLevel < 1) {
      return NextResponse.json({
        success: false,
        message: '매출 계산 권한이 필요합니다.'
      }, { status: 403 });
    }

    const body = await request.json();
    const { business_id, calculation_date, save_result = true } = body;

    if (!business_id) {
      return NextResponse.json({
        success: false,
        message: 'business_id가 필요합니다.'
      }, { status: 400 });
    }

    // 서비스 함수 직접 호출 (HTTP 루프 제거)
    let data: Awaited<ReturnType<typeof calculateRevenue>>;
    try {
      data = await calculateRevenue({
        business_id,
        calculation_date,
        save_result,
        userId,
        permissionLevel,
      });
    } catch (svcError: any) {
      const msg: string = svcError?.message || '계산 중 오류가 발생했습니다.';
      if (msg === '사업장 정보를 찾을 수 없습니다.') {
        return NextResponse.json({ success: false, message: msg }, { status: 404 });
      }
      return NextResponse.json({ success: false, message: msg }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data,
      message: '매출 계산이 완료되었습니다.'
    });

  } catch (error) {
    console.error('매출 계산 API 오류:', error);
    return NextResponse.json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // JWT 토큰 검증 (헤더 또는 쿠키)
    const authHeader = request.headers.get('authorization');
    let token: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // 쿠키에서 토큰 확인
      const cookieToken = request.cookies.get('auth_token')?.value;
      if (cookieToken) {
        token = cookieToken;
      }
    }

    if (!token) {
      return NextResponse.json({
        success: false,
        message: '인증이 필요합니다.'
      }, { status: 401 });
    }

    const decoded = verifyTokenString(token);

    if (!decoded) {
      return NextResponse.json({
        success: false,
        message: '유효하지 않은 토큰입니다.'
      }, { status: 401 });
    }

    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return NextResponse.json({
        success: false,
        message: '토큰에 사용자 정보가 없습니다.'
      }, { status: 401 });
    }

    let permissionLevel = decoded.permissionLevel || decoded.permission_level;

    if (!permissionLevel) {
      // Direct PostgreSQL query
      const user = await queryOne(
        'SELECT id, permission_level FROM employees WHERE id = $1 AND is_active = $2 LIMIT 1',
        [userId, true]
      );

      if (!user) {
        console.error('사용자 조회 실패');
        return NextResponse.json({
          success: false,
          message: '사용자를 찾을 수 없습니다.'
        }, { status: 401 });
      }

      permissionLevel = user.permission_level;
    }

    // 권한 1 이상 확인
    if (!permissionLevel || permissionLevel < 1) {
      return NextResponse.json({
        success: false,
        message: '매출 조회 권한이 필요합니다.'
      }, { status: 403 });
    }

    // URL 파라미터 처리
    const url = new URL(request.url);
    const businessId = url.searchParams.get('business_id');
    const salesOffice = url.searchParams.get('sales_office');
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const limit = parseInt(url.searchParams.get('limit') || '10000'); // 기본값 10000으로 증가
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Direct PostgreSQL query with dynamic WHERE clause
    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (businessId) {
      whereClauses.push(`business_id = $${paramIndex}`);
      params.push(businessId);
      paramIndex++;
    }

    if (salesOffice) {
      whereClauses.push(`sales_office = $${paramIndex}`);
      params.push(salesOffice);
      paramIndex++;
    }

    if (startDate) {
      whereClauses.push(`calculation_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`calculation_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const allCalculations = await queryAll(
      `SELECT * FROM revenue_calculations
       ${whereClause}
       ORDER BY calculation_date DESC`,
      params
    );

    if (!allCalculations) {
      console.error('매출 계산 조회 오류');
      return NextResponse.json({
        success: false,
        message: '계산 결과 조회에 실패했습니다.'
      }, { status: 500 });
    }

    console.log('📊 [REVENUE-API] 조회 완료:', {
      총_레코드: allCalculations.length
    });

    // 사업장별 최신 레코드만 필터링 (중복 제거)
    const latestCalculationsMap = new Map();

    allCalculations?.forEach(calc => {
      const existing = latestCalculationsMap.get(calc.business_id);

      // 최신 레코드 판단: calculation_date DESC, created_at DESC
      if (!existing ||
          calc.calculation_date > existing.calculation_date ||
          (calc.calculation_date === existing.calculation_date && calc.created_at > existing.created_at)) {
        latestCalculationsMap.set(calc.business_id, calc);
      }
    });

    const calculations = Array.from(latestCalculationsMap.values());

    // 디버깅 로그
    console.log('📊 [REVENUE-API] 중복 제거 결과:', {
      전체_레코드: allCalculations?.length || 0,
      중복_제거_후: calculations.length,
      제거된_레코드: (allCalculations?.length || 0) - calculations.length
    });

    const totalRevenue = calculations?.reduce((sum, calc) => sum + (calc.total_revenue || 0), 0) || 0;
    const totalProfit = calculations?.reduce((sum, calc) => sum + (calc.net_profit || 0), 0) || 0;

    console.log('💰 [REVENUE-API] 매출 합계:', {
      총_매출: totalRevenue.toLocaleString(),
      총_이익: totalProfit.toLocaleString()
    });

    return NextResponse.json({
      success: true,
      data: {
        calculations: calculations || [],
        pagination: {
          total_count: calculations?.length || 0,
          offset,
          limit,
          has_more: (calculations?.length || 0) === limit
        },
        summary: {
          total_revenue: totalRevenue,
          total_profit: totalProfit,
          average_profit_margin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) + '%' : '0%'
        }
      }
    });

  } catch (error) {
    console.error('매출 계산 GET 오류:', error);
    return NextResponse.json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    }, { status: 500 });
  }
}
