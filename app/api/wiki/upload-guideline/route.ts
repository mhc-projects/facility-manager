// app/api/wiki/upload-guideline/route.ts
// 지침서 PDF 업로드 → AI 분석 → wiki_nodes 자동 생성 → 검토 대기
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY ?? '');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const versionLabel = formData.get('version_label') as string;

    if (!file || !versionLabel) {
      return NextResponse.json({ error: 'file과 version_label이 필요합니다' }, { status: 400 });
    }

    const BUCKET = 'dpf-documents';
    const safeExt = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') ?? 'pdf';
    const fileName = `guidelines/${Date.now()}.${safeExt}`;
    const buffer = await file.arrayBuffer();

    // 버킷 없으면 생성
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find(b => b.name === BUCKET)) {
      const { error: bucketErr } = await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
      if (bucketErr) {
        return NextResponse.json({ error: `Storage 버킷 생성 실패: ${bucketErr.message}` }, { status: 500 });
      }
    }

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: `파일 업로드 실패: ${uploadError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(uploadData.path);

    const { data: upload, error: dbError } = await supabaseAdmin
      .from('guideline_uploads')
      .insert({ file_url: publicUrl, version_label: versionLabel, status: 'analyzing' })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // 백그라운드 분석 (응답은 즉시 반환)
    analyzeGuidelineAsync(upload.id, buffer, versionLabel).catch(console.error);

    return NextResponse.json({
      success: true,
      uploadId: upload.id,
      message: 'PDF 업로드 완료. AI 분석 중입니다 (보통 1~2분).',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Upload Guideline] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface ChapterAnalysis {
  title: string;
  content: string;
  key_points?: string[];
}

const ANALYSIS_PROMPT = `이 PDF는 운행차 배출가스 저감사업 업무처리지침입니다.
직원들이 실무에서 질문할 때 정확한 답변을 줄 수 있도록, 각 챕터의 내용을 원문에 충실하게 상세히 추출해주세요.

다음 형식으로 분석해주세요 (JSON만 반환, 마크다운 코드블록 없이):
{
  "summary": "전체 지침 주요 내용 요약 (3~5줄)",
  "chapters": [
    {
      "title": "챕터/섹션 제목 (원문 그대로)",
      "content": "해당 섹션의 내용을 아래 기준에 따라 상세히 서술 (최소 500자 이상):\n- 신청/지원 대상 (차종, 연식, 조건 등)\n- 지원 금액 및 보조율 (구체적인 숫자 포함)\n- 신청 절차 및 단계 (순서대로)\n- 제출 서류 및 요건\n- 처리 기간 및 기한\n- 사후관리 의무 및 위반 시 조치\n- 기타 중요 조건 및 예외사항\n위 항목 중 해당 챕터에 포함된 내용만 서술하되, 원문의 구체적인 수치·조건·절차를 빠짐없이 포함하세요.",
      "key_points": ["구체적 핵심 내용 1 (수치/조건 포함)", "핵심 내용 2", "핵심 내용 3"]
    }
  ],
  "form_changes": [{"form_name": "서식명", "change_type": "추가/수정/삭제", "description": "변경 내용"}]
}`;

// 10MB 이상은 Gemini File API 사용 (inline data 한도 초과 방지)
const INLINE_SIZE_LIMIT = 10 * 1024 * 1024;

async function analyzeGuidelineAsync(uploadId: string, buffer: ArrayBuffer, versionLabel: string) {
  let geminiFileUri: string | null = null;
  try {
    if (!process.env.GEMINI_API_KEY) {
      await supabaseAdmin.from('guideline_uploads').update({
        status: 'review_needed',
        diff_summary: 'GEMINI_API_KEY 미설정. 수동 검토 필요.',
      }).eq('id', uploadId);
      return;
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const byteSize = buffer.byteLength;
    console.log(`[Guideline Analysis] PDF size: ${(byteSize / 1024 / 1024).toFixed(1)}MB`);

    let pdfPart: Record<string, unknown>;

    if (byteSize > INLINE_SIZE_LIMIT) {
      // 대용량 PDF: Gemini File API로 업로드
      console.log('[Guideline Analysis] Using File API for large PDF...');
      const uploadResponse = await fileManager.uploadFile(
        Buffer.from(buffer),
        { mimeType: 'application/pdf', displayName: `guideline-${uploadId}.pdf` }
      );
      geminiFileUri = uploadResponse.file.uri;

      // 처리 완료 대기 (최대 2분)
      let fileState = uploadResponse.file.state;
      let waited = 0;
      while (fileState === FileState.PROCESSING && waited < 120) {
        await new Promise(r => setTimeout(r, 3000));
        waited += 3;
        const fileInfo = await fileManager.getFile(uploadResponse.file.name);
        fileState = fileInfo.state;
      }
      if (fileState !== FileState.ACTIVE) {
        throw new Error(`Gemini File API 처리 실패: state=${fileState}`);
      }
      pdfPart = { fileData: { mimeType: 'application/pdf', fileUri: geminiFileUri } };
    } else {
      pdfPart = {
        inlineData: {
          data: Buffer.from(buffer).toString('base64'),
          mimeType: 'application/pdf',
        },
      };
    }

    const result = await model.generateContent([pdfPart, ANALYSIS_PROMPT]);
    const text = result.response.text();

    let analysis: { summary?: string; chapters?: ChapterAnalysis[]; form_changes?: unknown[] } = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
    } catch {
      analysis = { summary: text.substring(0, 500), chapters: [] };
    }

    await supabaseAdmin.from('guideline_uploads').update({
      status: 'review_needed',
      diff_summary: analysis.summary ?? '분석 완료',
      wiki_changes: analysis.chapters ?? [],
      form_changes: analysis.form_changes ?? [],
    }).eq('id', uploadId);

    const chapters = analysis.chapters ?? [];
    if (chapters.length > 0) {
      await createWikiNodes(chapters, versionLabel);
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Guideline Analysis] error:', msg);
    await supabaseAdmin.from('guideline_uploads').update({
      status: 'review_needed',
      diff_summary: `분석 오류: ${msg}`,
    }).eq('id', uploadId);
  } finally {
    // Gemini 임시 파일 삭제 (URI 형식: https://.../files/xxx → name: files/xxx)
    if (geminiFileUri) {
      const match = geminiFileUri.match(/\/files\/([^/?]+)/);
      if (match) fileManager.deleteFile(`files/${match[1]}`).catch(() => {});
    }
  }
}

async function createWikiNodes(chapters: ChapterAnalysis[], versionLabel: string) {
  // 루트 노드 (지침서 버전) upsert
  const rootSlug = `guideline-${versionLabel.replace(/[^a-zA-Z0-9가-힣]/g, '-').replace(/-+/g, '-')}`;

  const { data: rootNode, error: rootErr } = await supabaseAdmin
    .from('wiki_nodes')
    .upsert({
      node_type: 'root',
      sort_order: 0,
      title: versionLabel,
      slug: rootSlug,
      content_md: `# ${versionLabel}\n\nDPF 업무처리지침 AI 분석 결과입니다.`,
      is_published: true,
    }, { onConflict: 'slug' })
    .select('id')
    .single();

  if (rootErr) {
    console.error('[WikiNode] root upsert error:', rootErr);
    return;
  }

  // 챕터별 wiki_node 생성
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (!ch.title) continue;

    const chSlug = `${rootSlug}-ch${i + 1}-${ch.title.replace(/[^a-zA-Z0-9가-힣]/g, '-').replace(/-+/g, '-').substring(0, 30)}`;
    const contentMd = [
      `## ${ch.title}`,
      '',
      ch.content ?? '',
      '',
      ch.key_points?.length
        ? '### 핵심 포인트\n' + ch.key_points.map(p => `- ${p}`).join('\n')
        : '',
    ].filter(Boolean).join('\n');

    const { error: chErr } = await supabaseAdmin
      .from('wiki_nodes')
      .upsert({
        parent_id: rootNode.id,
        node_type: 'chapter',
        sort_order: i,
        title: ch.title,
        slug: chSlug,
        content_md: contentMd,
        is_published: true,
      }, { onConflict: 'slug' });

    if (chErr) {
      console.error(`[WikiNode] chapter ${i} upsert error:`, chErr);
    }
  }

  console.log(`[WikiNode] ${chapters.length}개 챕터 wiki_nodes 생성 완료`);
}
