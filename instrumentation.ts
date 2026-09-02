// 프로덕션 console.error를 가로채 Supabase error_logs에 영속화 — theion 일일 보고용
const MAX_FIELD_LEN = 4000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 10;

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    // 미들웨어(Edge 런타임)에서도 register()가 실행되는데, 거기서 서비스 롤 Supabase
    // 클라이언트를 만들 이유가 없다 — Node.js 런타임(API 라우트/서버 컴포넌트)에서만 동작.
    return;
  }

  const { waitUntil } = await import('@vercel/functions');
  const { getSupabaseAdmin } = await import('./lib/supabase');

  const originalError = console.error.bind(console);
  const recentHashes = new Map<string, { count: number; windowStart: number }>();

  const truncate = (s: string) => (s.length > MAX_FIELD_LEN ? s.slice(0, MAX_FIELD_LEN) + '...(truncated)' : s);

  console.error = (...args: unknown[]) => {
    originalError(...args);

    try {
      const tag = typeof args[0] === 'string' ? args[0] : undefined;
      const errArg = args.find((a) => a instanceof Error) as Error | undefined;
      const message = truncate(
        errArg?.message ?? args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')
      );
      const stack = errArg?.stack ? truncate(errArg.stack) : undefined;

      const hashKey = `${tag ?? ''}:${message}`;
      const now = Date.now();
      const bucket = recentHashes.get(hashKey);
      if (bucket && now - bucket.windowStart < RATE_LIMIT_WINDOW_MS) {
        bucket.count += 1;
        if (bucket.count > RATE_LIMIT_MAX_PER_WINDOW) return;
      } else {
        recentHashes.set(hashKey, { count: 1, windowStart: now });
      }

      const admin = getSupabaseAdmin();
      const writePromise = admin
        .from('error_logs')
        .insert({ tag, message, stack })
        .then(() => undefined)
        .catch((e: unknown) => originalError('[instrumentation] error_logs 기록 실패:', e));

      waitUntil(writePromise);
    } catch (e) {
      originalError('[instrumentation] console.error 패치 내부 오류:', e);
    }
  };
}
