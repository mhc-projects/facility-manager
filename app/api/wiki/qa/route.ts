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
    const { question } = await request.json();
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

    // 2. wiki_chunks 전체 조회 후 JS에서 코사인 유사도 계산
    const { data: allChunks, error: fetchError } = await supabaseAdmin
      .from('wiki_chunks')
      .select('chunk_text, node_id, embedding, wiki_nodes!inner(title, slug)')
      .eq('wiki_nodes.is_published', true);

    if (fetchError) {
      console.error('[QA] chunk fetch error:', fetchError);
      return NextResponse.json(
        { answer: '검색 중 오류가 발생했습니다. Wiki 데이터가 임베딩되어 있는지 확인하세요.' },
        { status: 200 }
      );
    }

    // 코사인 유사도 계산
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

    // embedding은 "[x,y,...]" 문자열 또는 배열로 반환될 수 있음
    function parseEmbed(v: unknown): number[] {
      if (Array.isArray(v)) return v as number[];
      if (typeof v === 'string') return JSON.parse(v);
      return [];
    }

    type ChunkRow = { chunk_text: string; node_id: string; embedding: unknown; wiki_nodes: { title: string; slug: string } | { title: string; slug: string }[] };
    const scored = (allChunks as ChunkRow[] ?? [])
      .map(c => {
        const node = Array.isArray(c.wiki_nodes) ? c.wiki_nodes[0] : c.wiki_nodes;
        return {
          chunk_text: c.chunk_text,
          node_id: c.node_id,
          node_title: node?.title ?? '',
          node_slug: node?.slug ?? '',
          similarity: cosineSim(queryEmbedding, parseEmbed(c.embedding)),
        };
      })
      .filter(c => c.similarity >= 0.2)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8);

    console.log(`[QA] query="${question}" → ${scored.length}개 청크 (top similarity: ${scored[0]?.similarity?.toFixed(3) ?? 'N/A'})`);

    const chunks = scored;

    if (!chunks.length) {
      return NextResponse.json(
        { answer: '해당 지침에서 관련 내용을 찾지 못했습니다. 다른 키워드로 질문해보세요.' },
        { status: 200 }
      );
    }

    // 3. Gemini Flash 스트리밍 답변
    if (!process.env.GEMINI_API_KEY) {
      const context = chunks.map((c: { chunk_text: string }) => c.chunk_text).join('\n\n');
      return NextResponse.json({
        answer: `다음 내용에서 관련 정보를 찾았습니다:\n\n${context.slice(0, 500)}...`,
        sources: chunks.map((c: { node_title: string; node_slug: string }) => ({ title: c.node_title, slug: c.node_slug })),
      });
    }

    const context = chunks.map((c: { chunk_text: string }) => c.chunk_text).join('\n\n---\n\n');
    const sources = [...new Map(
      chunks.map((c: { node_id: string; node_title: string; node_slug: string }) => [c.node_id, { title: c.node_title, slug: c.node_slug }])
    ).values()];

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContentStream(
      `당신은 운행차 배출가스 저감사업 DPF(매연저감장치) 업무 전문가입니다.
아래 업무처리지침 내용을 근거로 질문에 답변하세요.

답변 원칙:
1. 참고자료에서 관련 내용을 찾아 구체적으로 답변하세요 (절차, 금액, 조건, 기한 등 수치 포함).
2. 참고자료의 내용이 질문과 완전히 일치하지 않더라도, 관련성이 있으면 그 내용을 바탕으로 최선의 답변을 제공하세요.
3. 참고자료에 전혀 관련 내용이 없을 때만 "해당 지침에서 확인되지 않습니다"라고 답하세요.
4. 답변은 한국어로 작성하고, 출처가 되는 챕터/섹션명을 언급하세요.

[참고자료]
${context}

[질문]
${question}`
    );

    const stream = new ReadableStream({
      async start(controller) {
        // 소스 정보를 첫 번째 청크로 전송
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
