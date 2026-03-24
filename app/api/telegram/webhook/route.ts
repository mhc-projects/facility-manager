/**
 * POST /api/telegram/webhook
 *
 * 텔레그램 봇 Webhook 엔드포인트.
 * 사용자가 봇에게 /start <token> 을 보내면
 * token으로 직원을 찾아 telegram_chat_id 를 저장합니다.
 *
 * Webhook 등록 방법 (Vercel 배포 후 1회 실행):
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<domain>/api/telegram/webhook"
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/send-telegram';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = body?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId: number = message.chat?.id;
    const text: string = message.text || '';

    // /start <connect_token> 형식 처리
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const connectToken = parts[1]?.trim();

      if (!connectToken) {
        await sendTelegramMessage(chatId, {
          title: '안녕하세요!',
          body: '시설 관리 시스템 알림 봇입니다.\n\n설정 페이지에서 연결 코드를 받아 /start <코드> 형식으로 입력해 주세요.',
        });
        return NextResponse.json({ ok: true });
      }

      // connect_token으로 직원 조회
      const { data: employee, error } = await supabaseAdmin
        .from('employees')
        .select('id, name')
        .eq('telegram_connect_token', connectToken)
        .eq('is_deleted', false)
        .single();

      if (error || !employee) {
        await sendTelegramMessage(chatId, {
          title: '❌ 연결 실패',
          body: '유효하지 않은 코드입니다. 설정 페이지에서 새 코드를 발급받아 다시 시도해 주세요.',
        });
        return NextResponse.json({ ok: true });
      }

      // chat_id 저장 + token 초기화
      await supabaseAdmin
        .from('employees')
        .update({
          telegram_chat_id: String(chatId),
          telegram_connect_token: null,
        })
        .eq('id', employee.id);

      await sendTelegramMessage(chatId, {
        title: `✅ 연결 완료!`,
        body: `${employee.name}님, 이제 결재 알림을 텔레그램으로 받으실 수 있습니다.`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[TELEGRAM WEBHOOK] 오류:', e);
    return NextResponse.json({ ok: true }); // 텔레그램에는 항상 200 반환
  }
}
