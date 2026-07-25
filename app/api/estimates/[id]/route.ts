// app/api/estimates/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTokenString } from '@/utils/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DELETE: 견적서 삭제 (권한 4 이상 필요)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 4) {
      return NextResponse.json({ success: false, error: '권한이 필요합니다.' }, { status: 403 });
    }

    const { id } = params;

    // 견적서 삭제
    const { error } = await supabase
      .from('estimate_history')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '견적서가 삭제되었습니다.'
    });

  } catch (error) {
    console.error('견적서 삭제 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
