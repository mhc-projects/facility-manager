// Gmail 읽기전용(gmail.readonly) OAuth2 인증 URL 생성, 코드 교환, 리프레시 토큰 저장/조회
import { google } from 'googleapis';
import { query, queryOne } from '@/lib/supabase-direct';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

function getClientCredentials() {
  const clientId = process.env.GMAIL_READONLY_CLIENT_ID;
  const clientSecret = process.env.GMAIL_READONLY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_READONLY_CLIENT_ID / GMAIL_READONLY_CLIENT_SECRET 환경변수가 설정되지 않았습니다.');
  }

  return { clientId, clientSecret };
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const { clientId, clientSecret } = getClientCredentials();
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GMAIL_READONLY_SCOPE, USERINFO_EMAIL_SCOPE],
    state,
  });
}

export async function exchangeCodeAndSave(params: {
  code: string;
  redirectUri: string;
  connectedBy: string;
}): Promise<{ email: string }> {
  const { clientId, clientSecret } = getClientCredentials();
  const client = new google.auth.OAuth2(clientId, clientSecret, params.redirectUri);

  const { tokens } = await client.getToken(params.code);
  if (!tokens.refresh_token) {
    throw new Error(
      '이미 연결된 계정입니다. Google 계정의 "타사 앱 액세스 권한"에서 기존 연결을 해제한 뒤 다시 시도해주세요.'
    );
  }
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: userInfo } = await oauth2.userinfo.get();
  const email = userInfo.email;
  if (!email) {
    throw new Error('Google 계정 이메일 정보를 확인하지 못했습니다.');
  }

  await query(
    `INSERT INTO gmail_readonly_credentials (email, refresh_token, connected_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET refresh_token = EXCLUDED.refresh_token,
           connected_by = EXCLUDED.connected_by,
           updated_at = NOW()`,
    [email, tokens.refresh_token, params.connectedBy]
  );

  return { email };
}

export async function getStoredCredential(): Promise<{ email: string; refresh_token: string } | null> {
  const row = await queryOne(
    'SELECT email, refresh_token FROM gmail_readonly_credentials ORDER BY updated_at DESC LIMIT 1'
  );
  return row ?? null;
}

export async function getAuthorizedGmailClient() {
  const credential = await getStoredCredential();
  if (!credential) return null;

  const { clientId, clientSecret } = getClientCredentials();
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: credential.refresh_token });

  return { client, email: credential.email };
}
