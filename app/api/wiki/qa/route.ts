// app/api/wiki/qa/route.ts
// AI Q&A: HuggingFace 임베딩 + Supabase pgvector + Gemini Flash 스트리밍
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embedding';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

export async function POST(request: NextRequest) {
  try {
    const { question, domain } = await request.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: '질문을 입력하세요' }, { status: 400 });
    }

    // 1. 임베딩 생성
    let queryEmbedding: number[];
    try {
      queryEmbedding = await getEmbedding(question, 'query');
    } catch (embErr) {
      const msg = embErr instanceof Error ? embErr.message : String(embErr);
      console.error('[QA] embedding error:', msg);
      return NextResponse.json(
        { answer: `AI 임베딩 오류: ${msg}` },
        { status: 200 }
      );
    }

    // 2. wiki_chunks 조회 (도메인 필터 적용)
    let chunksQuery = supabaseAdmin
      .from('wiki_chunks')
      .select('chunk_text, node_id, embedding, wiki_nodes!inner(title, slug, tags)')
      .eq('wiki_nodes.is_published', true);

    const { data: allChunks, error: fetchError } = await chunksQuery;

    if (fetchError) {
      console.error('[QA] chunk fetch error:', fetchError);
      return NextResponse.json(
        { answer: '검색 중 오류가 발생했습니다. Wiki 데이터가 임베딩되어 있는지 확인하세요.' },
        { status: 200 }
      );
    }

    function cosineSim(a: number[], b: number[]): number {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      const denom = Math.sqrt(na) * Math.sqrt(nb);
      return denom === 0 ? 0 : dot / denom;
    }

    function parseEmbed(v: unknown): number[] {
      if (Array.isArray(v)) return v as number[];
      if (typeof v === 'string') return JSON.parse(v);
      return [];
    }

    type ChunkRow = {
      chunk_text: string;
      node_id: string;
      embedding: unknown;
      wiki_nodes: { title: string; slug: string; tags: string[] | null } | { title: string; slug: string; tags: string[] | null }[];
    };

    const scored = (allChunks as ChunkRow[] ?? [])
      .map(c => {
        const node = Array.isArray(c.wiki_nodes) ? c.wiki_nodes[0] : c.wiki_nodes;
        return {
          chunk_text: c.chunk_text,
          node_id: c.node_id,
          node_title: node?.title ?? '',
          node_slug: node?.slug ?? '',
          node_tags: node?.tags ?? [],
          similarity: cosineSim(queryEmbedding, parseEmbed(c.embedding)),
        };
      })
      // 도메인 필터: tags 배열에 domain 값이 포함된 것만
      .filter(c => {
        if (!domain) return true;
        return c.node_tags.includes(domain);
      })
      .filter(c => c.similarity >= 0.2)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8);

    console.log(`[QA] query="${question}" domain=${domain ?? 'all'} → ${scored.length}개 청크 (top: ${scored[0]?.similarity?.toFixed(3) ?? 'N/A'})`);

    // 3. 공지사항 + 전달사항 최근 항목 조회
    const [announcementsRes, messagesRes] = await Promise.all([
      supabaseAdmin
        .from('announcements')
        .select('title, content, author_name, created_at, is_pinned')
        .eq('is_deleted', false)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('messages')
        .select('title, content, author_name, created_at')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const announcements = announcementsRes.data ?? [];
    const messages = messagesRes.data ?? [];

    // 공지/전달사항 텍스트 구성
    const boardContext = [
      announcements.length > 0
        ? `[공지사항]\n${announcements.map(a =>
            `• ${a.is_pinned ? '[고정] ' : ''}${a.title} (${a.author_name}, ${new Date(a.created_at).toLocaleDateString('ko-KR')})\n  ${a.content?.slice(0, 200) ?? ''}`
          ).join('\n')}`
        : null,
      messages.length > 0
        ? `[전달사항]\n${messages.map(m =>
            `• ${m.title} (${m.author_name}, ${new Date(m.created_at).toLocaleDateString('ko-KR')})\n  ${m.content?.slice(0, 200) ?? ''}`
          ).join('\n')}`
        : null,
    ].filter(Boolean).join('\n\n');

    if (!scored.length && !boardContext) {
      return NextResponse.json(
        { answer: '해당 지침에서 관련 내용을 찾지 못했습니다. 다른 키워드로 질문해보세요.' },
        { status: 200 }
      );
    }

    // 4. Gemini Flash 스트리밍 답변
    if (!process.env.GEMINI_API_KEY) {
      const context = scored.map(c => c.chunk_text).join('\n\n');
      return NextResponse.json({
        answer: `다음 내용에서 관련 정보를 찾았습니다:\n\n${context.slice(0, 500)}...`,
        sources: scored.map(c => ({ title: c.node_title, slug: c.node_slug })),
      });
    }

    const wikiContext = scored.map(c => c.chunk_text).join('\n\n---\n\n');
    const sources = [...new Map(
      scored.map(c => [c.node_id, { title: c.node_title, slug: c.node_slug }])
    ).values()];

    const domainLabel = domain === 'dpf'
      ? 'DPF(매연저감장치) 운행차 배출가스 저감사업'
      : domain === 'iot'
      ? 'IoT 방지시설 운영·모니터링'
      : 'DPF 운행차 배출가스 저감사업 및 IoT 방지시설 운영';

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `당신은 블루온(주식회사) 환경설비 업무 전문가로, ${domainLabel} 업무를 담당합니다.
아래 참고자료(업무처리지침, 공지사항, 전달사항)를 근거로 질문에 답변하세요.

답변 원칙:
1. 참고자료에서 관련 내용을 찾아 구체적으로 답변하세요 (절차, 금액, 조건, 기한 등 수치 포함).
2. 참고자료의 내용이 질문과 완전히 일치하지 않더라도, 관련성이 있으면 그 내용을 바탕으로 최선의 답변을 제공하세요.
3. 참고자료에 전혀 관련 내용이 없을 때만 "해당 자료에서 확인되지 않습니다"라고 답하세요.
4. 답변은 한국어로 작성하고, 출처(챕터/섹션명 또는 공지사항)를 언급하세요.
5. 공지사항이나 전달사항에서 관련 내용을 찾았을 경우, 해당 공지의 작성자와 날짜를 언급하세요.

${wikiContext ? `[업무처리지침]\n${wikiContext}` : ''}

${boardContext ? `[회사 공지사항 및 전달사항]\n${boardContext}` : ''}

[질문]
${question}`;

    const result = await model.generateContentStream(prompt);

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'sources', sources })}\n\n`
          )
        );
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: 'text', text })}\n\n`
              )
            );
          }
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[QA] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
