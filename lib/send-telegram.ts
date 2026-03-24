/**
 * 텔레그램 Bot API 메시지 발송 유틸리티
 *
 * 환경변수:
 *   TELEGRAM_BOT_TOKEN  - BotFather에서 발급받은 토큰
 *
 * 사용 방법:
 *   사용자가 /admin/settings (알림 탭)에서 텔레그램 채널에 봇 명령을 실행하면
 *   chat_id가 employees.telegram_chat_id 에 저장됩니다.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface TelegramPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * 특정 chat_id로 텔레그램 메시지 발송
 * 실패해도 예외를 throw하지 않음
 */
export async function sendTelegramMessage(
  chatId: string | number,
  payload: TelegramPayload,
): Promise<void> {
  if (!BOT_TOKEN) return;

  try {
    const text = payload.url
      ? `${payload.title}\n${payload.body}\n\n🔗 <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}${payload.url}">바로가기</a>`
      : `${payload.title}\n${payload.body}`;

    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[TELEGRAM] 발송 실패:', chatId, err);
    }
  } catch (e) {
    console.warn('[TELEGRAM] sendTelegramMessage 오류:', e);
  }
}

/**
 * userId(employees.id)로 telegram_chat_id를 조회하여 메시지 발송
 * chat_id가 없으면 조용히 skip
 */
export async function sendTelegramToUser(
  userId: string,
  payload: TelegramPayload,
): Promise<void> {
  if (!BOT_TOKEN) return;

  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { data } = await supabaseAdmin
      .from('employees')
      .select('telegram_chat_id')
      .eq('id', userId)
      .single();

    if (!data?.telegram_chat_id) return;

    await sendTelegramMessage(data.telegram_chat_id, payload);
  } catch (e) {
    console.warn('[TELEGRAM] sendTelegramToUser 오류:', e);
  }
}
