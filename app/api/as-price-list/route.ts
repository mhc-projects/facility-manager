import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { verifyApiKey } from '@/utils/api-key-auth';

export const dynamic = 'force-dynamic';

const VALID_PRICE_TYPES = ['cost', 'revenue', 'dispatch_cost', 'dispatch_revenue'] as const;
type PriceType = typeof VALID_PRICE_TYPES[number];

/**
 * GET /api/as-price-list
 * 단가표 목록 조회
 * ?price_type=cost|revenue|dispatch_cost|dispatch_revenue
 * ?include_inactive=true
 * JWT 토큰 또는 API 키 인증 모두 허용 (에코센스 등 외부 시스템 지원)
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);

    // JWT 또는 API 키 중 하나 인증
    const isJwt = verifyTokenString(token);
    const apiKeyInfo = isJwt ? null : await verifyApiKey(token, '/api/as-price-list');
    if (!isJwt && !apiKeyInfo) {
      return NextResponse.json({ success: false, error: '유효하지 않은 인증 정보입니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';
    const priceType = searchParams.get('price_type') as PriceType | null;

    const conditions: string[] = [];
    const queryParams: unknown[] = [];

    if (!includeInactive) conditions.push('is_active = true');
    if (priceType && VALID_PRICE_TYPES.includes(priceType)) {
      queryParams.push(priceType);
      conditions.push(`price_type = $${queryParams.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pgQuery(
      `SELECT * FROM as_price_list
       ${whereClause}
       ORDER BY price_type ASC, category ASC NULLS LAST, sort_order ASC, item_name ASC`,
      queryParams
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[as-price-list] GET error:', error);
    return NextResponse.json({ success: false, error: '단가표 조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/as-price-list
 * 단가표 항목 등록
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    if (!verifyTokenString(token)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const body = await request.json();
    const { category, item_name, unit_price, unit = '개', description, sort_order = 0, price_type = 'cost' } = body;

    if (!item_name) {
      return NextResponse.json({ success: false, error: '항목명이 필요합니다' }, { status: 400 });
    }
    if (unit_price === undefined || unit_price === null || isNaN(Number(unit_price))) {
      return NextResponse.json({ success: false, error: '단가가 필요합니다' }, { status: 400 });
    }
    if (!VALID_PRICE_TYPES.includes(price_type)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 단가 유형입니다' }, { status: 400 });
    }

    const result = await pgQuery(
      `INSERT INTO as_price_list (category, item_name, unit_price, unit, description, sort_order, price_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [category || null, item_name, Number(unit_price), unit, description || null, sort_order, price_type]
    );

    return NextResponse.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('[as-price-list] POST error:', error);
    return NextResponse.json({ success: false, error: '단가표 항목 등록 실패' }, { status: 500 });
  }
}
