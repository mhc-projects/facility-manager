// app/api/business-photo-categories/route.ts - 사업장 포토 카테고리 CRUD API
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyToken } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SYSTEM_CATEGORIES = [
  { category_key: 'presurvey', category_name: '설치 전 실사', icon: '🔍', color: 'blue', sort_order: 0 },
  { category_key: 'postinstall', category_name: '설치 후 사진', icon: '📸', color: 'green', sort_order: 1 },
  { category_key: 'aftersales', category_name: 'AS 사진', icon: '🔧', color: 'orange', sort_order: 2 },
];

// GET: 카테고리 목록 조회 (데이터 유무 포함)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json({ success: false, message: 'businessId가 필요합니다.' }, { status: 400 });
    }

    // 카테고리 조회
    const { data: categories, error } = await supabaseAdmin
      .from('business_photo_categories')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // 카테고리가 없으면 시스템 기본 3개 자동 생성
    if (!categories || categories.length === 0) {
      const newCategories = SYSTEM_CATEGORIES.map(cat => ({
        business_id: businessId,
        ...cat,
        is_system: true,
      }));

      const { data: created, error: createError } = await supabaseAdmin
        .from('business_photo_categories')
        .insert(newCategories)
        .select();

      if (createError) throw createError;

      // 사진 수 조회
      const categoriesWithCounts = await addPhotoCountsAndDataFlags(created || [], businessId);

      return NextResponse.json({ success: true, data: categoriesWithCounts });
    }

    // 사진 수 및 데이터 유무 추가
    const categoriesWithCounts = await addPhotoCountsAndDataFlags(categories, businessId);

    return NextResponse.json({ success: true, data: categoriesWithCounts });
  } catch (error) {
    console.error('❌ [PHOTO-CATEGORIES] 조회 실패:', error);
    return NextResponse.json({
      success: false,
      message: '카테고리 조회 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

// POST: 새 카테고리 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, categoryName, icon, color } = body;

    if (!businessId || !categoryName) {
      return NextResponse.json({ success: false, message: 'businessId와 categoryName이 필요합니다.' }, { status: 400 });
    }

    // 현재 최대 sort_order 조회
    const { data: maxSort } = await supabaseAdmin
      .from('business_photo_categories')
      .select('sort_order')
      .eq('business_id', businessId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextSortOrder = (maxSort?.sort_order ?? -1) + 1;

    // 고유 키 생성: custom_ + 타임스탬프
    const categoryKey = `custom_${Date.now().toString(36)}`;

    const { data: created, error } = await supabaseAdmin
      .from('business_photo_categories')
      .insert({
        business_id: businessId,
        category_key: categoryKey,
        category_name: categoryName,
        icon: icon || '📋',
        color: color || 'gray',
        sort_order: nextSortOrder,
        is_system: false,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: { ...created, has_data: false, photo_count: 0 } });
  } catch (error) {
    console.error('❌ [PHOTO-CATEGORIES] 추가 실패:', error);
    return NextResponse.json({
      success: false,
      message: '카테고리 추가 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

// PUT: 카테고리 수정 (이름, 아이콘, 담당자 정보 등)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, category_name, icon, color, inspector_name, inspector_contact, inspector_date, special_notes } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (category_name !== undefined) updateData.category_name = category_name;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (inspector_name !== undefined) updateData.inspector_name = inspector_name;
    if (inspector_contact !== undefined) updateData.inspector_contact = inspector_contact;
    if (inspector_date !== undefined) updateData.inspector_date = inspector_date === '' ? null : inspector_date;
    if (special_notes !== undefined) updateData.special_notes = special_notes;

    const { data: updated, error } = await supabaseAdmin
      .from('business_photo_categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('❌ [PHOTO-CATEGORIES] 수정 실패:', error);
    return NextResponse.json({
      success: false,
      message: '카테고리 수정 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

// DELETE: 사용자 카테고리 삭제 (시스템 카테고리는 삭제 불가)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400 });
    }

    // 시스템 카테고리 여부 확인
    const { data: category, error: findError } = await supabaseAdmin
      .from('business_photo_categories')
      .select('is_system, category_key, business_id')
      .eq('id', id)
      .single();

    if (findError || !category) {
      return NextResponse.json({ success: false, message: '카테고리를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (category.is_system) {
      return NextResponse.json({ success: false, message: '시스템 기본 카테고리는 삭제할 수 없습니다.' }, { status: 403 });
    }

    // 파일이 있는 카테고리는 권한 3 이상만 삭제 가능
    const { data: files } = await supabaseAdmin
      .from('uploaded_files')
      .select('id')
      .eq('business_id', category.business_id)
      .like('file_path', `%/${category.category_key}/%`)
      .limit(1);

    if (files && files.length > 0) {
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      const decoded = token ? verifyToken(token) : null;
      const userRole = decoded?.role ?? 0;

      if (userRole < 3) {
        return NextResponse.json({
          success: false,
          message: '파일이 있는 카테고리는 관리자(권한 3 이상)만 삭제할 수 있습니다.'
        }, { status: 403 });
      }
    }

    // 카테고리 삭제
    const { error: deleteError } = await supabaseAdmin
      .from('business_photo_categories')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, message: '카테고리가 삭제되었습니다.' });
  } catch (error) {
    console.error('❌ [PHOTO-CATEGORIES] 삭제 실패:', error);
    return NextResponse.json({
      success: false,
      message: '카테고리 삭제 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

// 헬퍼: 각 카테고리에 사진 수와 데이터 유무 플래그 추가
async function addPhotoCountsAndDataFlags(categories: any[], businessId: string) {
  // 사진 수 조회
  const { data: files } = await supabaseAdmin
    .from('uploaded_files')
    .select('file_path')
    .eq('business_id', businessId);

  return categories.map(cat => {
    // 사진 수 계산: file_path에 카테고리 키가 포함된 것
    const photoCount = (files || []).filter((f: { file_path?: string }) => {
      const path = f.file_path || '';
      // 시스템 카테고리: 기존 경로 매칭
      if (cat.category_key === 'presurvey') return path.includes('/presurvey/');
      if (cat.category_key === 'postinstall') return path.includes('/postinstall/') || path.includes('/completion/');
      if (cat.category_key === 'aftersales') return path.includes('/aftersales/');
      // 사용자 정의 카테고리
      return path.includes(`/${cat.category_key}/`);
    }).length;

    // 데이터 유무: 사진이 있거나 담당자 정보가 입력된 경우
    const hasInspectorData = !!(cat.inspector_name || cat.inspector_contact || cat.special_notes);
    const hasData = photoCount > 0 || hasInspectorData;

    return {
      ...cat,
      photo_count: photoCount,
      has_data: hasData,
    };
  });
}
