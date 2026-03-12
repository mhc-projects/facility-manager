// app/api/calendar/upload/route.ts - 캘린더 이벤트 파일 업로드 API
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 최대 파일 크기: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 허용된 파일 타입
const ALLOWED_MIME_TYPES = [
  // 이미지
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  // 문서
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  // 압축 파일
  'application/zip',
  'application/x-zip-compressed'
];

/**
 * 캘린더 이벤트 파일 업로드
 * POST /api/calendar/upload
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const eventId = formData.get('eventId') as string;

    // 필수 파라미터 검증
    if (!file) {
      return NextResponse.json({
        success: false,
        message: '파일이 제공되지 않았습니다.'
      }, { status: 400 });
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        success: false,
        message: `파일 크기는 ${MAX_FILE_SIZE / 1024 / 1024}MB를 초과할 수 없습니다.`
      }, { status: 400 });
    }

    // 파일 타입 검증
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({
        success: false,
        message: '지원하지 않는 파일 형식입니다.'
      }, { status: 400 });
    }

    console.log(`📤 [CALENDAR-UPLOAD] 파일 업로드 시작: ${file.name} (${file.size} bytes)`);

    // 파일명 생성 (타임스탬프 + 원본 파일명으로 충돌 방지)
    // Supabase Storage key는 ASCII 문자만 허용 (한글 등 non-ASCII → 제거)
    // macOS는 NFD, Windows/Linux는 NFC로 파일명을 전송하므로 NFC로 정규화 후 ASCII만 추출
    const timestamp = Date.now();
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()?.toLowerCase() : '';
    const baseName = file.name.replace(/\.[^.]+$/, '').normalize('NFC');
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '') || 'file';
    const sanitizedFileName = sanitizedBase + ext;
    const fileName = `${timestamp}_${sanitizedFileName}`;

    // 저장 경로 생성
    // eventId가 있으면 해당 이벤트 폴더에, 없으면 임시 폴더에 저장
    const storagePath = eventId
      ? `calendar/${eventId}/${fileName}`
      : `calendar/temp/${fileName}`;

    // 파일을 ArrayBuffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Supabase Storage에 업로드
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('facility-files')
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('❌ [CALENDAR-UPLOAD] Storage 업로드 실패:', uploadError);
      throw new Error(`파일 업로드 실패: ${uploadError.message}`);
    }

    console.log(`✅ [CALENDAR-UPLOAD] Storage 업로드 완료: ${storagePath}`);

    // Public URL 생성
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('facility-files')
      .getPublicUrl(storagePath);

    if (!publicUrlData?.publicUrl) {
      throw new Error('파일 URL 생성 실패');
    }

    // AttachedFile 형식으로 메타데이터 반환
    const attachedFile = {
      name: file.name, // 원본 파일명 사용
      size: file.size,
      type: file.type,
      url: publicUrlData.publicUrl,
      uploaded_at: new Date().toISOString()
    };

    console.log(`✅ [CALENDAR-UPLOAD] 업로드 완료:`, attachedFile);

    return NextResponse.json({
      success: true,
      data: attachedFile,
      message: '파일이 업로드되었습니다.'
    });

  } catch (error) {
    console.error('❌ [CALENDAR-UPLOAD] 업로드 실패:', error);
    return NextResponse.json({
      success: false,
      message: '파일 업로드 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

/**
 * 임시 업로드 파일 정리 (삭제)
 * DELETE /api/calendar/upload?path=calendar/temp/xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({
        success: false,
        message: '파일 경로가 필요합니다.'
      }, { status: 400 });
    }

    // 임시 파일만 삭제 가능 (보안)
    if (!filePath.startsWith('calendar/temp/')) {
      return NextResponse.json({
        success: false,
        message: '임시 파일만 삭제할 수 있습니다.'
      }, { status: 403 });
    }

    console.log(`🗑️ [CALENDAR-UPLOAD] 임시 파일 삭제: ${filePath}`);

    const { error: deleteError } = await supabaseAdmin.storage
      .from('facility-files')
      .remove([filePath]);

    if (deleteError) {
      console.warn(`⚠️ [CALENDAR-UPLOAD] 삭제 실패: ${deleteError.message}`);
      throw deleteError;
    }

    console.log(`✅ [CALENDAR-UPLOAD] 삭제 완료: ${filePath}`);

    return NextResponse.json({
      success: true,
      message: '파일이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('❌ [CALENDAR-UPLOAD] 삭제 실패:', error);
    return NextResponse.json({
      success: false,
      message: '파일 삭제 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}
