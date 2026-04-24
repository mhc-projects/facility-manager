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
    } catch {
      return NextResponse.json(
        { answer: 'AI 서비스 연결에 실패했습니다. HF_API_KEY를 확인하세요.' },
        { status: 200 }
      );
    }

    // 2. pgvector 유사도 검색 (top-8 청크)
    const { data: chunks, error: searchError } = await supabaseAdmin.rpc('search_wiki_chunks', {
      query_embedding: queryEmbedding,
      match_count: 8,
      similarity_threshold: 0.4,
    });

    if (searchError) {
      console.error('[QA] pgvector search error:', searchError);
      return NextResponse.json(
        { answer: '검색 중 오류가 발생했습니다. Wiki 데이터가 임베딩되어 있는지 확인하세요.' },
        { status: 200 }
      );
    }

    if (!chunks?.length) {
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

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContentStream(
      `당신은 운행차 배출가스 저감사업 DPF(매연저감장치) 업무 전문가입니다.
다음 업무처리지침 내용만을 근거로 답변하세요.
참고자료에 없는 내용은 "해당 지침에서 확인되지 않습니다"라고 답하세요.
답변은 한국어로 간결하게 작성하세요.

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
