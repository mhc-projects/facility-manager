// 블루온AI Q&A 대화 히스토리 타입
export type QADomain = 'dpf' | 'iot' | null;

export type QAConversation = {
  id: string;
  domain: QADomain;
  title: string;
  created_at: string;
  updated_at: string;
};

export type QAMessageSource = { title: string; slug: string };

export type QAMessageRole = 'user' | 'assistant';

export type QAMessage = {
  id: string;
  role: QAMessageRole;
  content: string;
  sources: QAMessageSource[] | null;
  created_at: string;
};
