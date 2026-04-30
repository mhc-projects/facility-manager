'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, Bot, User, ExternalLink } from 'lucide-react';

type Domain = 'all' | 'dpf' | 'iot';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ title: string; slug: string }>;
}

const DOMAIN_TABS: { value: Domain; label: string; color: string }[] = [
  { value: 'all', label: '전체', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'dpf', label: 'DPF', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'iot', label: 'IoT', color: 'bg-green-50 text-green-700 border-green-200' },
];

const QUICK_QUESTIONS: Record<Domain, string[]> = {
  all: [
    '보조금 지급 청구 마감일은 언제인가요?',
    'DPF 보증기간은 얼마나 되나요?',
    '방지시설 IoT 점검 주기는?',
    '생계형 차량 기준이 무엇인가요?',
  ],
  dpf: [
    '보조금 지급 청구 마감일은 언제인가요?',
    'DPF 보증기간은 얼마나 되나요?',
    '의무운행기간이 얼마나 되나요?',
    '생계형 차량 기준이 무엇인가요?',
    '클리닝은 얼마나 자주 해야 하나요?',
    '저공해조치 기한이 얼마나 되나요?',
  ],
  iot: [
    '방지시설 IoT 점검 주기는?',
    'Gateway 이상 시 처리 절차는?',
    '배출 기준 초과 시 조치사항은?',
    '측정 데이터 보관 기간은?',
  ],
};

export default function QAChat() {
  const [domain, setDomain] = useState<Domain>('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 도메인 변경 시 대화 초기화
  function handleDomainChange(d: Domain) {
    setDomain(d);
    setMessages([]);
    setInput('');
  }

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const assistantMessage: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const res = await fetch('/api/wiki/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, domain: domain === 'all' ? undefined : domain }),
      });

      if (!res.ok) throw new Error('API 오류');

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream')) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let sources: Array<{ title: string; slug: string }> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const lines = decoder.decode(value).split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'sources') {
                sources = parsed.sources;
              } else if (parsed.type === 'text') {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + parsed.text,
                    sources,
                  };
                  return updated;
                });
              }
            } catch {
              // 파싱 실패 무시
            }
          }
        }
      } else {
        const data = await res.json();
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: data.answer ?? '답변을 생성할 수 없습니다.',
            sources: data.sources,
          };
          return updated;
        });
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: '오류가 발생했습니다. 다시 시도해주세요.',
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  const currentDomainTab = DOMAIN_TABS.find(t => t.value === domain)!;
  const quickQuestions = QUICK_QUESTIONS[domain];

  return (
    <div className="flex flex-col h-full">
      {/* 도메인 필터 탭 */}
      <div className="flex gap-1.5 mb-4 p-1 bg-gray-50 rounded-lg border border-gray-200">
        {DOMAIN_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => handleDomainChange(tab.value)}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md border font-medium transition-colors ${
              domain === tab.value
                ? tab.color
                : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Bot className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">
              {domain === 'all' ? '업무지침 AI Q&A' : domain === 'dpf' ? 'DPF 업무지침 AI Q&A' : 'IoT 방지시설 AI Q&A'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {domain === 'all'
                ? 'DPF·IoT 방지시설 업무처리지침에 대해 질문하세요.'
                : domain === 'dpf'
                ? '운행차 배출가스 저감사업 업무처리지침에 대해 질문하세요.'
                : 'IoT 방지시설 운영·모니터링 지침에 대해 질문하세요.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
              {quickQuestions.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg
                             hover:bg-blue-50 hover:border-blue-300 transition-colors text-gray-700"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-blue-600" />
              </div>
            )}
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-first' : ''}`}>
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
              }`}>
                {msg.content || (loading && i === messages.length - 1 ? (
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : '')}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {msg.sources.map((src, j) => (
                    <Link
                      key={j}
                      href={`/wiki/${src.slug}`}
                      className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-600 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {src.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <div className="pt-3 border-t border-gray-200">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              domain === 'iot'
                ? 'IoT 방지시설 지침에 대해 질문하세요...'
                : 'DPF·IoT 업무지침에 대해 질문하세요...'
            }
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="mt-1.5 text-xs text-gray-400 text-center">
          AI가 업무처리지침과 공지사항을 기반으로 답변합니다. 중요 사항은 지침 원문을 확인하세요.
        </p>
      </div>
    </div>
  );
}
