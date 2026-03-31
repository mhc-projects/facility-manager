// app/api/announcements/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/supabase-direct';

/**
 * GET /api/announcements
 * 공지사항 목록 조회
 * - Level 1+ (AUTHENTICATED) 읽기 가능
 * - 페이징, 정렬 지원
 * - is_deleted = false인 항목만 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 쿼리 파라미터
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;
    const showPinnedOnly = searchParams.get('pinned') === 'true';

    // Direct PostgreSQL 쿼리 구성
    let queryStr = `
      SELECT a.*,
        (SELECT COUNT(*) FROM announcement_attachments aa WHERE aa.announcement_id = a.id) as attachment_count
      FROM announcements a
      WHERE a.is_deleted = false
    `;
    const params: any[] = [];

    // 상단 고정 필터
    if (showPinnedOnly) {
      queryStr += ` AND a.is_pinned = true`;
    }

    // 정렬 (상단 고정 우선, 그 다음 최신순)
    queryStr += ` ORDER BY a.is_pinned DESC, a.created_at DESC`;

    // 페이징 (상단 고정만 조회하는 경우 페이징 제외)
    if (!showPinnedOnly) {
      queryStr += ` LIMIT $1 OFFSET $2`;
      params.push(limit, offset);
    }

    const data = await queryAll(queryStr, params);

    // 전체 개수 조회
    let countQueryStr = `
      SELECT COUNT(*) as count FROM announcements
      WHERE is_deleted = false
    `;
    if (showPinnedOnly) {
      countQueryStr += ` AND is_pinned = true`;
    }

    const countResult = await queryOne(countQueryStr, []);
    const count = parseInt(countResult?.count || '0');

    const response = NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });

    // 캐시 비활성화 (실시간 업데이트 필요)
    response.headers.set('Cache-Control', 'no-store, must-revalidate');

    return response;
  } catch (error) {
    console.error('[공지사항 API 오류]', error);
    return NextResponse.json(
      { error: '공지사항 API 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/announcements
 * 공지사항 생성
 * - Level 3+ (SUPER_ADMIN) 쓰기 가능
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { title, content, author_id, author_name, is_pinned } = body;

    // 필수 필드 검증
    if (!title || !content || !author_id || !author_name) {
      return NextResponse.json(
        { error: '제목, 내용, 작성자 정보는 필수입니다.' },
        { status: 400 }
      );
    }

    // 공지사항 생성 (Direct PostgreSQL)
    const data = await queryOne(
      `INSERT INTO announcements (
        title, content, author_id, author_name, is_pinned
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [title, content, author_id, author_name, is_pinned || false]
    );

    if (!data) {
      console.error('[공지사항 생성 실패] - 데이터 반환 없음');
      return NextResponse.json(
        { error: '공지사항 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      data
    }, { status: 201 });

    // 캐시 비활성화 (실시간 업데이트 필요)
    response.headers.set('Cache-Control', 'no-store, must-revalidate');

    return response;
  } catch (error) {
    console.error('[공지사항 생성 API 오류]', error);
    return NextResponse.json(
      { error: '공지사항 생성 API 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
