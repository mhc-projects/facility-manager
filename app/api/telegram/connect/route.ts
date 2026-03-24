/**
 * POST /api/telegram/connect
 * 텔레그램 연결 토큰 발급 (설정 페이지에서 호출)
 *
 * DELETE /api/telegram/connect
 * 텔레그램 연결 해제
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyTokenString } from '@/utils/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getUserId(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const decoded = verifyTokenString(authHeader.substring(7));
  if (!decoded) return null;
  return decoded.userId || decoded.id;
}

/**
 * 연결 토큰 발급 + 봇 정보 반환
 */
export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '인증 필요' }, { status: 401 });
  }

  try {
    // 6자리 대문자 토큰 생성
    const token = crypto.randomBytes(3).toString('hex').toUpperCase();

    await supabaseAdmin
      .from('employees')
      .update({ telegram_connect_token: token })
      .eq('id', userId);

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';

    return NextResponse.json({
      success: true,
      token,
      botUsername,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${token}` : null,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * 텔레그램 연결 해제
 */
export async function DELETE(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '인증 필요' }, { status: 401 });
  }

  try {
    await supabaseAdmin
      .from('employees')
      .update({ telegram_chat_id: null, telegram_connect_token: null })
      .eq('id', userId);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * 현재 연결 상태 조회
 */
export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '인증 필요' }, { status: 401 });
  }

  try {
    const { data } = await supabaseAdmin
      .from('employees')
      .select('telegram_chat_id')
      .eq('id', userId)
      .single();

    return NextResponse.json({
      success: true,
      connected: !!data?.telegram_chat_id,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
