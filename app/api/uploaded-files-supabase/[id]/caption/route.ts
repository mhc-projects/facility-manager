import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * PATCH /api/uploaded-files-supabase/[id]/caption
 *
 * 업로드된 사진의 설명(caption)을 업데이트합니다.
 *
 * @param caption - 사진 설명 (최대 500자, HTML 태그 제거됨)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 요청 데이터 파싱
    const { caption } = await request.json();

    // 입력 검증
    if (caption !== null && caption !== undefined) {
      // 빈 문자열은 허용 (삭제 목적)
      if (typeof caption !== 'string') {
        return NextResponse.json(
          { error: '설명은 문자열이어야 합니다' },
          { status: 400 }
        );
      }

      // 글자수 제한 (500자)
      if (caption.length > 500) {
        return NextResponse.json(
          { error: '설명은 500자를 초과할 수 없습니다' },
          { status: 400 }
        );
      }
    }

    // XSS 방지: HTML 태그 제거
    const sanitizedCaption = caption
      ? caption.replace(/<[^>]*>/g, '').trim() || null
      : null;

    // Supabase 클라이언트 생성 (Service Role Key 사용)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // DB 업데이트 (RLS 정책 자동 적용)
    const { data, error } = await supabase
      .from('uploaded_files')
      .update({
        caption: sanitizedCaption,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select('id, caption, updated_at')
      .single();

    if (error) {
      console.error('Caption update error:', error);

      // 파일을 찾을 수 없는 경우
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '파일을 찾을 수 없습니다' },
          { status: 404 }
        );
      }

      throw error;
    }

    // 성공 응답
    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        caption: data.caption,
        updated_at: data.updated_at
      }
    });

  } catch (error) {
    console.error('Caption API error:', error);
    return NextResponse.json(
      {
        error: '설명 저장 중 오류가 발생했습니다',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/uploaded-files-supabase/[id]/caption
 *
 * 특정 사진의 설명을 조회합니다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data, error } = await supabase
      .from('uploaded_files')
      .select('id, caption, updated_at')
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '파일을 찾을 수 없습니다' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Caption GET error:', error);
    return NextResponse.json(
      { error: '설명 조회 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
