import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

async function getUserFromToken(authHeader: string | null) {
  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // 사용자 정보 조회
    const { data: user, error } = await supabaseAdmin
      .from('employees')
      .select('id, name, email, permission_level, department')
      .eq('id', decoded.userId || decoded.id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .single();

    if (error || !user) {
      console.warn('⚠️ [AUTH] 사용자 조회 실패:', error?.message);
      return null;
    }

    return user;
  } catch (error) {
    console.warn('⚠️ [AUTH] JWT 토큰 검증 실패:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const currentUser = await getUserFromToken(authHeader);

    if (!currentUser) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다' }, { status: 401 });
    }

    const body = await request.json();
    const { newPassword, currentPassword } = body;

    // 필수 필드 검증 - newPassword만 필수
    if (!newPassword) {
      return NextResponse.json(
        { success: false, error: '새 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 새 비밀번호 길이 검증
    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: '새 비밀번호는 최소 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // 기존 사용자 정보 조회 (이미 getUserFromToken에서 검증됨)
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from('employees')
      .select('id, email, password_hash, name')
      .eq('id', currentUser.id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !existingUser) {
      console.error('❌ [CHANGE_PASSWORD] 사용자 조회 실패:', fetchError);
      return NextResponse.json(
        { success: false, error: '사용자 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 기존 비밀번호가 설정된 계정은 현재 비밀번호 확인이 필수
    if (existingUser.password_hash) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: '현재 비밀번호를 입력해주세요.' },
          { status: 400 }
        );
      }
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, existingUser.password_hash);
      if (!isCurrentPasswordValid) {
        return NextResponse.json(
          { success: false, error: '현재 비밀번호가 올바르지 않습니다.' },
          { status: 400 }
        );
      }
    }

    // 새 비밀번호 해시
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // 비밀번호 업데이트
    const updateData: any = {
      password_hash: newPasswordHash
    };

    // updated_at 컬럼이 존재하는지 확인 후 업데이트
    try {
      updateData.updated_at = new Date().toISOString();
    } catch (error) {
      // updated_at 컬럼이 없어도 계속 진행
    }

    const { error: updateError } = await supabaseAdmin
      .from('employees')
      .update(updateData)
      .eq('id', currentUser.id);

    if (updateError) {
      console.error('❌ [CHANGE_PASSWORD] 비밀번호 변경 실패:', updateError);
      return NextResponse.json(
        { success: false, error: '비밀번호 변경 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    console.log('✅ [CHANGE_PASSWORD] 비밀번호 변경 성공:', {
      userId: currentUser.id,
      email: existingUser.email,
      name: existingUser.name
    });

    return NextResponse.json({
      success: true,
      message: '비밀번호가 성공적으로 변경되었습니다.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [CHANGE_PASSWORD] API 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}