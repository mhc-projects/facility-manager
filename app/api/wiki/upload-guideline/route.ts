// app/api/wiki/upload-guideline/route.ts
// 지침서 PDF 업로드 → AI 분석 → 검토 대기
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const versionLabel = formData.get('version_label') as string;

    if (!file || !versionLabel) {
      return NextResponse.json({ error: 'file과 version_label이 필요합니다' }, { status: 400 });
    }

    // Supabase Storage에 업로드
    const fileName = `guidelines/${Date.now()}_${file.name}`;
    const buffer = await file.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('dpf-documents')
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('dpf-documents')
      .getPublicUrl(uploadData.path);

    // guideline_uploads 레코드 생성
    const { data: upload, error: dbError } = await supabaseAdmin
      .from('guideline_uploads')
      .insert({
        file_url: publicUrl,
        version_label: versionLabel,
        status: 'analyzing',
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // 백그라운드: Gemini로 PDF 분석 (응답은 즉시 반환)
    analyzeGuidelineAsync(upload.id, buffer, file.name).catch(console.error);

    return NextResponse.json({
      success: true,
      uploadId: upload.id,
      message: 'PDF 업로드 완료. AI 분석 중입니다 (보통 1~2분).',
    });
  } catch (err) {
    console.error('[Upload Guideline] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

async function analyzeGuidelineAsync(uploadId: string, buffer: ArrayBuffer, fileName: string) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      await supabaseAdmin.from('guideline_uploads').update({
        status: 'review_needed',
        diff_summary: 'GEMINI_API_KEY 미설정. 수동 검토 필요.',
      }).eq('id', uploadId);
      return;
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const pdfPart = {
      inlineData: {
        data: Buffer.from(buffer).toString('base64'),
        mimeType: 'application/pdf',
      },
    };

    const result = await model.generateContent([
      pdfPart,
      `이 PDF는 운행차 배출가스 저감사업 업무처리지침입니다.
다음 형식으로 분석해주세요 (JSON):
{
  "summary": "주요 변경사항 요약 (3~5줄)",
  "chapters": [{"title": "챕터명", "key_points": ["핵심 내용 1", "핵심 내용 2"]}],
  "form_changes": [{"form_name": "서식명", "change_type": "추가/수정/삭제", "description": "변경 내용"}]
}`,
    ]);

    const text = result.response.text();
    let analysis: Record<string, unknown> = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
    } catch {
      analysis = { summary: text };
    }

    await supabaseAdmin.from('guideline_uploads').update({
      status: 'review_needed',
      diff_summary: (analysis.summary as string) ?? '분석 완료',
      wiki_changes: (analysis.chapters as unknown[]) ?? [],
      form_changes: (analysis.form_changes as unknown[]) ?? [],
    }).eq('id', uploadId);
  } catch (err) {
    console.error('[Guideline Analysis] error:', err);
    await supabaseAdmin.from('guideline_uploads').update({
      status: 'review_needed',
      diff_summary: `분석 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
    }).eq('id', uploadId);
  }
}
