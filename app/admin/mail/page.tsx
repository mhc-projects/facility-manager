'use client';

// 영업팀 전용 Gmail 수신함 열람 페이지 (읽기 전용)
import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/ui/AdminLayout';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { TokenManager } from '@/lib/api-client';
import { Mail, RefreshCw, ExternalLink, ShieldAlert, Loader2, Paperclip, Download, Search, X } from 'lucide-react';

interface MailListItem {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

interface MailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface MailDetail {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  html: string;
  text: string;
  attachments: MailAttachment[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractErrorMessage(body: any, fallback: string): string {
  if (typeof body?.error === 'string') return body.error;
  if (body?.error?.message) return body.error.message;
  return fallback;
}

function authedFetch(url: string) {
  const token = TokenManager.getToken();
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function formatDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

export default function MailPage() {
  const { user } = useAuth();
  const isSystemAdmin = (user?.permission_level ?? 0) >= 4;

  const [checking, setChecking] = useState(true);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [messages, setMessages] = useState<MailListItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadList = useCallback(async (pageToken?: string, query?: string) => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (pageToken) params.set('pageToken', pageToken);
      if (query) params.set('q', query);
      const res = await authedFetch(`/api/mail/list${params.toString() ? `?${params}` : ''}`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        setBanner({ type: 'error', text: extractErrorMessage(body, '메일함 조회에 실패했습니다.') });
        return;
      }
      setConnectedEmail(body.data.email);
      setMessages(prev => (pageToken ? [...prev, ...body.data.messages] : body.data.messages));
      setNextPageToken(body.data.nextPageToken);
    } catch {
      setBanner({ type: 'error', text: '메일함 조회 중 오류가 발생했습니다.' });
    } finally {
      setLoadingList(false);
    }
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    setActiveQuery(query);
    loadList(undefined, query || undefined);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setActiveQuery('');
    loadList();
  };

  useEffect(() => {
    async function init() {
      // OAuth 콜백 리다이렉트 쿼리스트링 처리
      const params = new URLSearchParams(window.location.search);
      const mailConnected = params.get('mail_connected');
      const mailError = params.get('mail_error');
      if (mailConnected) {
        setBanner({ type: 'success', text: `${mailConnected} 계정이 연결되었습니다.` });
      } else if (mailError) {
        setBanner({ type: 'error', text: `Gmail 연결에 실패했습니다 (${mailError}).` });
      }
      if (mailConnected || mailError) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      try {
        const res = await authedFetch('/api/mail/oauth/status');
        const body = await res.json();
        if (res.status === 401 || res.status === 403) {
          setAccessDenied(extractErrorMessage(body, '영업팀 또는 시스템 관리자만 접근할 수 있습니다.'));
          return;
        }
        if (!body.success) {
          setBanner({ type: 'error', text: extractErrorMessage(body, '연결 상태 조회에 실패했습니다.') });
          return;
        }
        if (body.data.connected) {
          setConnectedEmail(body.data.email);
          await loadList();
        }
      } finally {
        setChecking(false);
      }
    }
    init();
  }, [loadList]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await authedFetch('/api/mail/oauth/authorize-url');
      const body = await res.json();
      if (!res.ok || !body.success) {
        setBanner({ type: 'error', text: extractErrorMessage(body, '연결을 시작하지 못했습니다.') });
        setConnecting(false);
        return;
      }
      window.location.href = body.data.url;
    } catch {
      setBanner({ type: 'error', text: '연결을 시작하지 못했습니다.' });
      setConnecting(false);
    }
  };

  const handleDownloadAttachment = async (messageId: string, attachment: MailAttachment) => {
    setDownloadingId(attachment.attachmentId);
    try {
      const query = new URLSearchParams({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
      });
      const res = await authedFetch(`/api/mail/${messageId}/attachments/${attachment.attachmentId}?${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setBanner({ type: 'error', text: extractErrorMessage(body, '첨부파일 다운로드에 실패했습니다.') });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setBanner({ type: 'error', text: '첨부파일 다운로드 중 오류가 발생했습니다.' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenMessage = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await authedFetch(`/api/mail/${id}`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        setBanner({ type: 'error', text: extractErrorMessage(body, '메일을 불러오지 못했습니다.') });
        return;
      }
      setSelected(body.data);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (checking) {
    return (
      <AdminLayout title="메일함">
        <div className="flex items-center justify-center py-24 text-gray-500">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> 확인 중...
        </div>
      </AdminLayout>
    );
  }

  if (accessDenied) {
    return (
      <AdminLayout title="메일함">
        <div className="flex flex-col items-center justify-center py-24 text-center text-gray-600">
          <ShieldAlert className="w-12 h-12 text-red-400 mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-1">접근 권한이 없습니다</p>
          <p className="text-sm">{accessDenied}</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="메일함"
      description={connectedEmail ? `${connectedEmail} 수신함 (읽기 전용)` : 'Gmail 수신함 열람'}
      actions={
        connectedEmail && isSystemAdmin ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" /> 다른 계정으로 재연결
          </button>
        ) : undefined
      }
    >
      {banner && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            banner.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {banner.text}
        </div>
      )}

      {!connectedEmail ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white border border-gray-200 rounded-xl">
          <Mail className="w-12 h-12 text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-1">연결된 Gmail 계정이 없습니다</p>
          {isSystemAdmin ? (
            <>
              <p className="text-sm text-gray-500 mb-6">회사 Gmail 계정을 연결하면 수신함을 열람할 수 있습니다.</p>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Gmail 연결하기
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-500">Gmail 계정 연결은 시스템 관리자만 할 수 있습니다. 관리자에게 요청해주세요.</p>
          )}
        </div>
      ) : (
        <>
          <form onSubmit={handleSearchSubmit} className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="검색 (예: from:홍길동, subject:견적, has:attachment)"
                className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {activeQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loadingList}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              검색
            </button>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {messages.map(msg => (
                <li key={msg.id}>
                  <button
                    onClick={() => handleOpenMessage(msg.id)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${msg.isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {msg.subject}
                      </p>
                      <p className="truncate text-xs text-gray-500">{msg.from}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(msg.date)}</span>
                  </button>
                </li>
              ))}
              {messages.length === 0 && !loadingList && (
                <li className="px-4 py-12 text-center text-sm text-gray-500">
                  {activeQuery ? '검색 결과가 없습니다.' : '수신함이 비어 있습니다.'}
                </li>
              )}
            </ul>

            {nextPageToken && (
              <div className="p-3 border-t border-gray-100 text-center">
                <button
                  onClick={() => loadList(nextPageToken, activeQuery || undefined)}
                  disabled={loadingList}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  {loadingList ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  더 보기
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        isOpen={!!selected || loadingDetail}
        onClose={() => setSelected(null)}
        title={selected?.subject}
        size="xl"
      >
        {loadingDetail || !selected ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> 불러오는 중...
          </div>
        ) : (
          <div>
            <div className="mb-4 text-sm text-gray-500 space-y-0.5">
              <p><span className="font-medium text-gray-700">보낸사람:</span> {selected.from}</p>
              <p><span className="font-medium text-gray-700">받는사람:</span> {selected.to}</p>
              <p><span className="font-medium text-gray-700">날짜:</span> {formatDate(selected.date)}</p>
            </div>
            {selected.attachments.length > 0 && (
              <div className="mb-4 border border-gray-200 rounded-lg divide-y divide-gray-100">
                {selected.attachments.map(att => (
                  <div key={att.attachmentId} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0 flex items-center gap-2 text-gray-700">
                      <Paperclip className="w-4 h-4 shrink-0 text-gray-400" />
                      <span className="truncate">{att.filename}</span>
                      <span className="text-xs text-gray-400 shrink-0">{formatFileSize(att.size)}</span>
                    </div>
                    <button
                      onClick={() => handleDownloadAttachment(selected.id, att)}
                      disabled={downloadingId === att.attachmentId}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      {downloadingId === att.attachmentId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      다운로드
                    </button>
                  </div>
                ))}
              </div>
            )}
            {selected.html ? (
              <div className="prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: selected.html }} />
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{selected.text}</pre>
            )}
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
