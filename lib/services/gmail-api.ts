// Gmail API(gmail.readonly)로 INBOX 메일 목록/본문을 조회하는 서비스
import { gmail_v1, google } from 'googleapis';
import sanitizeHtml from 'sanitize-html';
import { getAuthorizedGmailClient } from './gmail-oauth';

// isomorphic-dompurify(jsdom 기반)는 Vercel 서버리스 번들에서 모듈 로드 시점에
// 크래시가 발생해 순수 JS 기반 sanitize-html로 대체함
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'p', 'br', 'div', 'span',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'img', 'font',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    font: ['color', 'size', 'face'],
    td: ['colspan', 'rowspan', 'align', 'valign'],
    th: ['colspan', 'rowspan', 'align', 'valign'],
    table: ['border', 'cellpadding', 'cellspacing', 'width'],
    '*': ['style', 'class', 'align'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  disallowedTagsMode: 'discard',
};

export interface MailListItem {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export interface MailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface MailDetail {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  html: string;
  text: string;
  attachments: MailAttachment[];
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBody(data?: string | null): string {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function extractContent(
  part: gmail_v1.Schema$MessagePart | undefined
): { html: string; text: string; attachments: MailAttachment[] } {
  if (!part) return { html: '', text: '', attachments: [] };

  if (part.filename && part.body?.attachmentId) {
    return {
      html: '',
      text: '',
      attachments: [
        {
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        },
      ],
    };
  }

  if (part.mimeType === 'text/html' && part.body?.data) {
    return { html: decodeBody(part.body.data), text: '', attachments: [] };
  }
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return { html: '', text: decodeBody(part.body.data), attachments: [] };
  }

  let html = '';
  let text = '';
  const attachments: MailAttachment[] = [];
  for (const child of part.parts || []) {
    const extracted = extractContent(child);
    html = html || extracted.html;
    text = text || extracted.text;
    attachments.push(...extracted.attachments);
  }
  return { html, text, attachments };
}

export async function listMailMessages(params: {
  pageToken?: string;
  maxResults?: number;
  query?: string;
}): Promise<{ email: string; messages: MailListItem[]; nextPageToken: string | null } | null> {
  const auth = await getAuthorizedGmailClient();
  if (!auth) return null;

  const gmail = google.gmail({ version: 'v1', auth: auth.client });
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: params.maxResults ?? 20,
    pageToken: params.pageToken,
    labelIds: ['INBOX'],
    q: params.query || undefined,
  });

  const refs = listRes.data.messages || [];
  const details = await Promise.all(
    refs.map(ref =>
      gmail.users.messages.get({
        userId: 'me',
        id: ref.id!,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      })
    )
  );

  const messages: MailListItem[] = details.map(({ data }) => ({
    id: data.id!,
    subject: headerValue(data.payload?.headers, 'Subject') || '(제목 없음)',
    from: headerValue(data.payload?.headers, 'From'),
    date: headerValue(data.payload?.headers, 'Date'),
    snippet: data.snippet || '',
    isUnread: (data.labelIds || []).includes('UNREAD'),
  }));

  return {
    email: auth.email,
    messages,
    nextPageToken: listRes.data.nextPageToken || null,
  };
}

export async function getMailMessage(id: string): Promise<MailDetail | null> {
  const auth = await getAuthorizedGmailClient();
  if (!auth) return null;

  const gmail = google.gmail({ version: 'v1', auth: auth.client });
  const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });

  const { html, text, attachments } = extractContent(data.payload as gmail_v1.Schema$MessagePart);

  return {
    id: data.id!,
    subject: headerValue(data.payload?.headers, 'Subject') || '(제목 없음)',
    from: headerValue(data.payload?.headers, 'From'),
    to: headerValue(data.payload?.headers, 'To'),
    date: headerValue(data.payload?.headers, 'Date'),
    html: html ? sanitizeHtml(html, SANITIZE_OPTIONS) : '',
    text,
    attachments,
  };
}

export async function getMailAttachment(
  messageId: string,
  attachmentId: string
): Promise<Buffer | null> {
  const auth = await getAuthorizedGmailClient();
  if (!auth) return null;

  const gmail = google.gmail({ version: 'v1', auth: auth.client });
  const { data } = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });

  if (!data.data) return null;
  return Buffer.from(data.data, 'base64url');
}
