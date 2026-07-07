import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth/require-admin'

// GET: 목표값 조회
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const targetType = searchParams.get('target_type'); // 'revenue', 'receivable', 'installation'
    const month = searchParams.get('month'); // '2025-01'

    const supabase = await createClient();

    let query = supabase
      .from('dashboard_targets')
      .select('*')
      .order('month', { ascending: false });

    if (targetType) {
      query = query.eq('target_type', targetType);
    }

    if (month) {
      query = query.eq('month', month);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [Dashboard Targets API] GET error:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data || []
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Targets API GET Error]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST: 목표값 생성 또는 업데이트
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { target_type, month, target_value } = body;

    // 필수 값 검증
    if (!target_type || !month || target_value === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'target_type, month, target_value는 필수입니다.'
        },
        { status: 400 }
      );
    }

    // 유효한 target_type 검증
    if (!['revenue', 'receivable', 'installation'].includes(target_type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'target_type은 revenue, receivable, installation 중 하나여야 합니다.'
        },
        { status: 400 }
      );
    }

    // 월 형식 검증 (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        {
          success: false,
          error: 'month는 YYYY-MM 형식이어야 합니다 (예: 2025-01)'
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // upsert: 존재하면 업데이트, 없으면 생성
    const { data, error } = await supabase
      .from('dashboard_targets')
      .upsert(
        {
          target_type,
          month,
          target_value: parseFloat(target_value),
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'target_type,month'
        }
      )
      .select()
      .single();

    if (error) {
      console.error('❌ [Dashboard Targets API] POST error:', error);
      throw error;
    }

    console.log('✅ [Dashboard Targets API] Target saved:', data);

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Targets API POST Error]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE: 목표값 삭제
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const targetType = searchParams.get('target_type');
    const month = searchParams.get('month');

    const supabase = await createClient();

    let query = supabase.from('dashboard_targets').delete();

    if (id) {
      query = query.eq('id', id);
    } else if (targetType && month) {
      query = query.eq('target_type', targetType).eq('month', month);
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'id 또는 target_type과 month를 제공해야 합니다.'
        },
        { status: 400 }
      );
    }

    const { error } = await query;

    if (error) {
      console.error('❌ [Dashboard Targets API] DELETE error:', error);
      throw error;
    }

    console.log('✅ [Dashboard Targets API] Target deleted');

    return NextResponse.json({
      success: true,
      message: '목표가 삭제되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Targets API DELETE Error]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
