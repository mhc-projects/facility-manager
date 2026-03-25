// app/api/dev-work-log/[id]/route.ts
// 개발 업무 일지 단건 조회(GET), 수정(PUT), 삭제(DELETE)

import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/supabase-direct'
import { verifyTokenString } from '@/utils/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function checkDevDepartment(userId: string): Promise<boolean> {
  const result = await queryOne(
    `SELECT e.department AS dept_name
     FROM employees e
     WHERE e.id = $1 AND e.is_deleted = FALSE`,
    [userId]
  )
  if (!result) return false
  return ((result as { dept_name?: string }).dept_name || '').includes('개발')
}

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.substring(7)
  return verifyTokenString(token)
}

/**
 * GET /api/dev-work-log/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const decoded = await authenticate(request)
    if (!decoded) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 })
    }

    const userId = decoded.userId || decoded.id
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1
    if (permissionLevel < 4) {
      const isDev = await checkDevDepartment(userId)
      if (!isDev) {
        return NextResponse.json({ success: false, error: '접근 권한이 없습니다' }, { status: 403 })
      }
    }

    const row = await queryOne(
      `SELECT
         w.id, w.title, w.type, w.priority, w.status,
         w.description, w.received_date, w.expected_date, w.completed_date,
         w.assignee_id, ae.name AS assignee_name,
         w.progress_notes, w.progress_percent,
         w.target_location,
         w.created_by, ce.name AS creator_name,
         w.created_at, w.updated_at
       FROM dev_work_log w
       LEFT JOIN employees ae ON ae.id = w.assignee_id
       LEFT JOIN employees ce ON ce.id = w.created_by
       WHERE w.id = $1`,
      [params.id]
    )

    if (!row) {
      return NextResponse.json({ success: false, error: '업무를 찾을 수 없습니다' }, { status: 404 })
    }

    const r = row as Record<string, unknown>
    const data = {
      ...r,
      progress_notes: typeof r.progress_notes === 'string'
        ? JSON.parse(r.progress_notes as string)
        : (r.progress_notes || []),
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[DEV-WORK-LOG GET/:id]', err)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}

/**
 * PUT /api/dev-work-log/[id]
 * 업무 정보 수정 + 진행 메모 추가
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const decoded = await authenticate(request)
    if (!decoded) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 })
    }

    const userId = decoded.userId || decoded.id
    const userName: string = decoded.name || '알 수 없음'
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1
    if (permissionLevel < 4) {
      const isDev = await checkDevDepartment(userId)
      if (!isDev) {
        return NextResponse.json({ success: false, error: '접근 권한이 없습니다' }, { status: 403 })
      }
    }

    const existing = await queryOne(
      `SELECT id, progress_notes FROM dev_work_log WHERE id = $1`,
      [params.id]
    )
    if (!existing) {
      return NextResponse.json({ success: false, error: '업무를 찾을 수 없습니다' }, { status: 404 })
    }

    const body = await request.json()
    const {
      title,
      type,
      priority,
      status,
      description,
      received_date,
      expected_date,
      completed_date,
      assignee_id,
      progress_percent,
      target_location,
      new_note,
    } = body

    // 진행 메모 처리
    interface NoteItem { note: string; created_at: string; author_name: string }
    let progressNotes: NoteItem[] = []
    const existingNotes = (existing as { progress_notes?: unknown }).progress_notes
    if (Array.isArray(existingNotes)) {
      progressNotes = existingNotes as NoteItem[]
    } else if (typeof existingNotes === 'string') {
      try { progressNotes = JSON.parse(existingNotes) } catch { progressNotes = [] }
    }

    if (new_note?.trim()) {
      progressNotes = [
        ...progressNotes,
        {
          note: new_note.trim(),
          created_at: new Date().toISOString(),
          author_name: userName,
        },
      ]
    }

    const setClauses: string[] = []
    const values: (string | number | null)[] = []
    let idx = 1

    if (title !== undefined) { setClauses.push(`title = $${idx++}`); values.push(title) }
    if (type !== undefined) { setClauses.push(`type = $${idx++}`); values.push(type) }
    if (priority !== undefined) { setClauses.push(`priority = $${idx++}`); values.push(priority) }
    if (status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(status) }
    if (description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(description || null) }
    if (received_date !== undefined) { setClauses.push(`received_date = $${idx++}`); values.push(received_date || null) }
    if (expected_date !== undefined) { setClauses.push(`expected_date = $${idx++}`); values.push(expected_date || null) }
    if (completed_date !== undefined) { setClauses.push(`completed_date = $${idx++}`); values.push(completed_date || null) }
    if (assignee_id !== undefined) { setClauses.push(`assignee_id = $${idx++}`); values.push(assignee_id ?? null) }
    if (progress_percent !== undefined) { setClauses.push(`progress_percent = $${idx++}`); values.push(progress_percent) }
    if (target_location !== undefined) { setClauses.push(`target_location = $${idx++}`); values.push(target_location ?? null) }

    setClauses.push(`progress_notes = $${idx++}`)
    values.push(JSON.stringify(progressNotes))

    if (setClauses.length === 0) {
      return NextResponse.json({ success: false, error: '수정할 내용이 없습니다' }, { status: 400 })
    }

    values.push(params.id)
    const updated = await queryOne(
      `UPDATE dev_work_log SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id`,
      values
    )

    return NextResponse.json({ success: true, data: { id: (updated as { id?: string })?.id } })
  } catch (err) {
    console.error('[DEV-WORK-LOG PUT/:id]', err)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}

/**
 * DELETE /api/dev-work-log/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const decoded = await authenticate(request)
    if (!decoded) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 })
    }

    const userId = decoded.userId || decoded.id
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1
    if (permissionLevel < 4) {
      const isDev = await checkDevDepartment(userId)
      if (!isDev) {
        return NextResponse.json({ success: false, error: '접근 권한이 없습니다' }, { status: 403 })
      }
    }

    const existing = await queryOne(
      `SELECT id, created_by FROM dev_work_log WHERE id = $1`,
      [params.id]
    )
    if (!existing) {
      return NextResponse.json({ success: false, error: '업무를 찾을 수 없습니다' }, { status: 404 })
    }

    if (permissionLevel < 4 && (existing as { created_by?: string }).created_by !== userId) {
      return NextResponse.json(
        { success: false, error: '본인이 작성한 업무만 삭제할 수 있습니다' },
        { status: 403 }
      )
    }

    await queryOne(`DELETE FROM dev_work_log WHERE id = $1`, [params.id])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DEV-WORK-LOG DELETE/:id]', err)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
