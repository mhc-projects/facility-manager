// app/api/dev-work-log/route.ts
// 개발 업무 일지 목록 조회(GET) 및 생성(POST)

import { NextRequest, NextResponse } from 'next/server'
import { query as pgQuery, queryOne, queryAll } from '@/lib/supabase-direct'
import { verifyTokenString } from '@/utils/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 개발부서 접근 여부 확인
async function checkDevDepartment(userId: string): Promise<boolean> {
  const result = await queryOne(
    `SELECT e.department AS dept_name
     FROM employees e
     WHERE e.id = $1 AND e.is_deleted = FALSE`,
    [userId]
  )
  if (!result) return false
  const name = (result as { dept_name?: string }).dept_name || ''
  return name.includes('개발')
}

/**
 * GET /api/dev-work-log
 * 업무 일지 목록 조회
 * Query: search, status, period(week|month|all), sort(received|completed|priority), limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 })
    }
    const token = authHeader.substring(7)
    const decoded = verifyTokenString(token)
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 })
    }

    const userId = decoded.userId || decoded.id
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1

    if (permissionLevel < 4) {
      const isDev = await checkDevDepartment(userId)
      if (!isDev) {
        return NextResponse.json(
          { success: false, error: '개발부서 소속 직원만 접근할 수 있습니다' },
          { status: 403 }
        )
      }
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || ''
    const status = searchParams.get('status') || 'all'
    const period = searchParams.get('period') || 'all'
    const sort = searchParams.get('sort') || 'received'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    const conditions: string[] = ['1=1']
    const values: (string | number | string[])[] = []
    let idx = 1

    if (search) {
      conditions.push(`(w.title ILIKE $${idx} OR ae.name ILIKE $${idx})`)
      values.push(`%${search}%`)
      idx++
    }

    if (status !== 'all') {
      conditions.push(`w.status = $${idx++}`)
      values.push(status)
    }

    if (period === 'week') {
      conditions.push(`w.received_date >= DATE_TRUNC('week', CURRENT_DATE) AND w.received_date < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'`)
    } else if (period === 'month') {
      conditions.push(`w.received_date >= (CURRENT_DATE - INTERVAL '30 days')`)
    }

    const orderMap: Record<string, string> = {
      received: 'w.received_date DESC, w.created_at DESC',
      completed: 'w.completed_date DESC NULLS LAST, w.created_at DESC',
      priority: `CASE w.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END ASC, w.received_date DESC, w.created_at DESC`,
    }
    const orderBy = orderMap[sort] || 'w.received_date DESC, w.created_at DESC'

    const whereClause = conditions.join(' AND ')

    const rows = await queryAll(
      `SELECT
         w.id,
         w.title,
         w.type,
         w.priority,
         w.status,
         w.description,
         w.received_date,
         w.expected_date,
         w.completed_date,
         w.assignee_id,
         ae.name AS assignee_name,
         w.progress_notes,
         w.progress_percent,
         w.target_location,
         w.created_by,
         ce.name AS creator_name,
         w.created_at,
         w.updated_at
       FROM dev_work_log w
       LEFT JOIN employees ae ON ae.id = w.assignee_id
       LEFT JOIN employees ce ON ce.id = w.created_by
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    )

    const countResult = await queryOne(
      `SELECT COUNT(*) AS total FROM dev_work_log w
       LEFT JOIN employees ae ON ae.id = w.assignee_id
       WHERE ${whereClause}`,
      values
    )

    const total = parseInt((countResult as { total?: string })?.total || '0')

    const items = (rows || []).map((r: Record<string, unknown>) => ({
      ...r,
      progress_notes: typeof r.progress_notes === 'string'
        ? JSON.parse(r.progress_notes as string)
        : (r.progress_notes || []),
    }))

    return NextResponse.json({ success: true, data: items, total, limit, offset })
  } catch (err) {
    console.error('[DEV-WORK-LOG GET]', err)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}

/**
 * POST /api/dev-work-log
 * 업무 일지 생성
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 })
    }
    const token = authHeader.substring(7)
    const decoded = verifyTokenString(token)
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 })
    }

    const userId = decoded.userId || decoded.id
    const permissionLevel = decoded.permissionLevel || decoded.permission_level || 1

    if (permissionLevel < 4) {
      const isDev = await checkDevDepartment(userId)
      if (!isDev) {
        return NextResponse.json(
          { success: false, error: '개발부서 소속 직원만 접근할 수 있습니다' },
          { status: 403 }
        )
      }
    }

    const body = await request.json()
    const {
      title,
      type = 'feature',
      priority = 'medium',
      status = 'in_progress',
      description,
      received_date,
      expected_date,
      completed_date,
      assignee_id,
      progress_percent = 0,
      target_location,
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: '업무명은 필수입니다' }, { status: 400 })
    }
    if (!received_date) {
      return NextResponse.json({ success: false, error: '접수일은 필수입니다' }, { status: 400 })
    }

    const row = await queryOne(
      `INSERT INTO dev_work_log
         (title, type, priority, status, description,
          received_date, expected_date, completed_date,
          assignee_id, progress_percent, target_location, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        title.trim(),
        type,
        priority,
        status,
        description || null,
        received_date,
        expected_date || null,
        completed_date || null,
        assignee_id || null,
        progress_percent,
        target_location || null,
        userId,
      ]
    )

    return NextResponse.json(
      { success: true, data: { id: (row as { id?: string })?.id } },
      { status: 201 }
    )
  } catch (err) {
    console.error('[DEV-WORK-LOG POST]', err)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
