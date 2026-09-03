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
  const { inspect } = await import('node:util');

  const originalError = console.error.bind(console);
  const recentHashes = new Map<string, { count: number; windowStart: number }>();

  const truncate = (s: string) => (s.length > MAX_FIELD_LEN ? s.slice(0, MAX_FIELD_LEN) + '...(truncated)' : s);

  console.error = (...args: unknown[]) => {
    originalError(...args);

    // Node.js 자체 경고(ExperimentalWarning/DeprecationWarning 등)는 Node의 기본 경고
    // 출력기가 console.error를 우선 사용해서 여기로 들어온다 — "(node:<pid>) "로 시작하는
    // 게 그 신호. 애플리케이션 에러가 아니므로 기록하지 않는다.
    if (typeof args[0] === 'string' && /^\(node:\d+\)\s/.test(args[0])) return;

    try {
      const tag = args.length > 1 && typeof args[0] === 'string' ? args[0] : undefined;
      const errArg = args.find((a) => a instanceof Error) as Error | undefined;
      // Supabase 에러(PostgrestError 등)는 Error 인스턴스가 아닌 일반 객체라 String(a)가
      // "[object Object]"로 뭉갠다 — inspect로 실제 필드(code/message/details/hint)를 남긴다.
      const message = truncate(
        errArg?.message ??
          args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 3 }))).join(' ')
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
