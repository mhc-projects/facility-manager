import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/approvals/[id]/process
 * 결재완료 문서 처리확인
 * - 경영지원부 소속 직원 또는 권한 레벨 4만 가능
 * - status = 'approved' 인 문서에만 처리 가능
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1;
    const isSuperAdmin = permissionLevel >= 4;

    // 경영지원부 소속 여부 확인
    let isManagementSupport = false;
    if (!isSuperAdmin) {
      const emp = await queryOne(
        `SELECT e.department FROM employees e WHERE e.id = $1 AND e.is_deleted = FALSE`,
        [userId]
      );
      if (emp?.department) {
        const dept = await queryOne(
          `SELECT is_management_support FROM departments WHERE name = $1 LIMIT 1`,
          [emp.department]
        );
        isManagementSupport = dept?.is_management_support === true;
      }
    }

    if (!isSuperAdmin && !isManagementSupport) {
      return NextResponse.json({ success: false, error: '처리확인 권한이 없습니다 (경영지원부 또는 관리자 권한 필요)' }, { status: 403 });
    }

    // 문서 조회
    const doc = await queryOne(
      `SELECT id, status, is_processed, document_number, document_type, title
       FROM approval_documents
       WHERE id = $1 AND is_deleted = FALSE`,
      [params.id]
    );

    if (!doc) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
    }

    if (doc.status !== 'approved') {
      return NextResponse.json({ success: false, error: '최종 승인된 문서만 처리확인할 수 있습니다' }, { status: 400 });
    }

    if (doc.is_processed) {
      return NextResponse.json({ success: false, error: '이미 처리확인된 문서입니다' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const processNote = body.process_note?.trim() || null;

    // 처리자 이름 조회
    const processor = await queryOne(
      `SELECT name FROM employees WHERE id = $1`,
      [userId]
    );
    const processorName = processor?.name || '알 수 없음';

    // 처리확인 업데이트
    const updated = await queryOne(
      `UPDATE approval_documents
       SET is_processed = TRUE,
           processed_at = NOW(),
           processed_by = $2,
           processed_by_name = $3,
           process_note = $4
       WHERE id = $1
       RETURNING id, is_processed, processed_at, processed_by_name, process_note`,
      [params.id, userId, processorName, processNote]
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[API] POST /approvals/[id]/process error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}

/**
 * PATCH /api/approvals/[id]/process
 * 처리확인 수정 (경영지원부 또는 권한 4)
 * - process_note 수정, processed_at 현재 시간으로 갱신
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1;
    const isSuperAdmin = permissionLevel >= 4;

    let isManagementSupport = false;
    if (!isSuperAdmin) {
      const emp = await queryOne(
        `SELECT department FROM employees WHERE id = $1 AND is_deleted = FALSE`,
        [userId]
      );
      if (emp?.department) {
        const dept = await queryOne(
          `SELECT is_management_support FROM departments WHERE name = $1 LIMIT 1`,
          [emp.department]
        );
        isManagementSupport = dept?.is_management_support === true;
      }
    }

    if (!isSuperAdmin && !isManagementSupport) {
      return NextResponse.json({ success: false, error: '처리확인 수정 권한이 없습니다 (경영지원부 또는 관리자 권한 필요)' }, { status: 403 });
    }

    const doc = await queryOne(
      `SELECT id, is_processed FROM approval_documents WHERE id = $1 AND is_deleted = FALSE`,
      [params.id]
    );

    if (!doc) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
    }

    if (!doc.is_processed) {
      return NextResponse.json({ success: false, error: '처리확인된 문서만 수정할 수 있습니다' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const processNote = body.process_note?.trim() || null;

    const updated = await queryOne(
      `UPDATE approval_documents
       SET process_note = $2,
           processed_at = NOW()
       WHERE id = $1
       RETURNING id, is_processed, processed_at, processed_by_name, process_note`,
      [params.id, processNote]
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[API] PATCH /approvals/[id]/process error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}

/**
 * DELETE /api/approvals/[id]/process
 * 처리확인 취소 (경영지원부 또는 권한 4)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1;
    const isSuperAdmin = permissionLevel >= 4;

    let isManagementSupport = false;
    if (!isSuperAdmin) {
      const emp = await queryOne(
        `SELECT department FROM employees WHERE id = $1 AND is_deleted = FALSE`,
        [userId]
      );
      if (emp?.department) {
        const dept = await queryOne(
          `SELECT is_management_support FROM departments WHERE name = $1 LIMIT 1`,
          [emp.department]
        );
        isManagementSupport = dept?.is_management_support === true;
      }
    }

    if (!isSuperAdmin && !isManagementSupport) {
      return NextResponse.json({ success: false, error: '처리확인 취소는 경영지원부 또는 관리자만 가능합니다' }, { status: 403 });
    }

    const updated = await queryOne(
      `UPDATE approval_documents
       SET is_processed = FALSE,
           processed_at = NULL,
           processed_by = NULL,
           processed_by_name = NULL,
           process_note = NULL
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING id, is_processed`,
      [params.id]
    );

    if (!updated) {
      return NextResponse.json({ success: false, error: '문서를 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[API] DELETE /approvals/[id]/process error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
