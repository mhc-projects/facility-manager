// ============================================
// 회의록 섹션별 부분 업데이트 API
// 동시 편집 지원을 위해 섹션 단위로 PATCH 처리
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'

async function getUserFromToken(request: NextRequest) {
  try {
    let token: string | null = null
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    } else {
      const cookieToken = request.cookies.get('session_token')?.value
      if (cookieToken) token = cookieToken
    }
    if (!token) return null

    const decoded = jwt.verify(token, JWT_SECRET) as any
    const { data: user, error } = await supabase
      .from('employees')
      .select('id, name, email, permission_level, department')
      .eq('id', decoded.userId || decoded.id)
      .eq('is_active', true)
      .single()

    if (error || !user) return null
    return user
  } catch {
    return null
  }
}

/**
 * PATCH /api/meeting-minutes/[id]/sections
 * 특정 섹션만 부분 업데이트 (동시 편집 지원)
 *
 * Body 형태:
 * { section: 'meta',         data: { title, meeting_date, meeting_type, location, location_type } }
 * { section: 'participants', data: { participants: [...] } }
 * { section: 'summary',      data: { summary: "..." } }
 * { section: 'agenda',       itemId: 'uuid', data: { ...agendaItem } }
 * { section: 'agenda-add',   data: { ...agendaItem } }
 * { section: 'agenda-delete', itemId: 'uuid' }
 * { section: 'business',     itemId: 'uuid', data: { ...businessIssue } }
 * { section: 'business-add', data: { ...businessIssue } }
 * { section: 'business-delete', itemId: 'uuid' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { id } = params
    const body = await request.json()
    const { section, itemId, data } = body

    if (!section) {
      return NextResponse.json({ success: false, error: 'section은 필수입니다.' }, { status: 400 })
    }

    // 회의록 존재 확인
    const { data: minute, error: fetchError } = await supabase
      .from('meeting_minutes')
      .select('id, content, agenda, participants')
      .eq('id', id)
      .single()

    if (fetchError || !minute) {
      return NextResponse.json({ success: false, error: '회의록을 찾을 수 없습니다.' }, { status: 404 })
    }

    let updatePayload: Record<string, any> = { updated_by: user.id }

    switch (section) {
      // ── meta: 기본 정보 (제목, 날짜, 회의유형, 장소) ──
      case 'meta': {
        const { title, meeting_date, meeting_type, location, location_type } = data || {}
        if (!title?.trim()) {
          return NextResponse.json({ success: false, error: '제목은 필수입니다.' }, { status: 400 })
        }
        updatePayload = {
          ...updatePayload,
          ...(title !== undefined && { title }),
          ...(meeting_date !== undefined && { meeting_date }),
          ...(meeting_type !== undefined && { meeting_type }),
          ...(location !== undefined && { location }),
          ...(location_type !== undefined && { location_type }),
        }
        break
      }

      // ── participants: 참석자 전체 교체 ──
      case 'participants': {
        const { participants } = data || {}
        updatePayload = { ...updatePayload, participants: participants ?? [] }
        break
      }

      // ── summary: content.summary 부분 업데이트 ──
      case 'summary': {
        const { summary } = data || {}
        const updatedContent = { ...(minute.content || {}), summary: summary ?? '' }
        updatePayload = { ...updatePayload, content: updatedContent }
        break
      }

      // ── agenda: 특정 안건 항목 업데이트 ──
      case 'agenda': {
        if (!itemId) {
          return NextResponse.json({ success: false, error: 'itemId는 필수입니다.' }, { status: 400 })
        }
        const currentAgenda: any[] = minute.agenda || []
        const idx = currentAgenda.findIndex((a: any) => a.id === itemId)
        if (idx === -1) {
          return NextResponse.json({ success: false, error: '안건 항목을 찾을 수 없습니다.' }, { status: 404 })
        }
        const updatedAgenda = [...currentAgenda]
        updatedAgenda[idx] = { ...updatedAgenda[idx], ...data }
        updatePayload = { ...updatePayload, agenda: updatedAgenda }
        break
      }

      // ── agenda-add: 새 안건 항목 추가 ──
      case 'agenda-add': {
        const currentAgenda: any[] = minute.agenda || []
        updatePayload = { ...updatePayload, agenda: [...currentAgenda, data] }
        break
      }

      // ── agenda-delete: 안건 항목 삭제 ──
      case 'agenda-delete': {
        if (!itemId) {
          return NextResponse.json({ success: false, error: 'itemId는 필수입니다.' }, { status: 400 })
        }
        const currentAgenda: any[] = minute.agenda || []
        updatePayload = {
          ...updatePayload,
          agenda: currentAgenda.filter((a: any) => a.id !== itemId)
        }
        break
      }

      // ── business: 특정 사업장 이슈 업데이트 ──
      case 'business': {
        if (!itemId) {
          return NextResponse.json({ success: false, error: 'itemId는 필수입니다.' }, { status: 400 })
        }
        const currentIssues: any[] = minute.content?.business_issues || []
        const idx = currentIssues.findIndex((b: any) => b.id === itemId)
        if (idx === -1) {
          return NextResponse.json({ success: false, error: '사업장 이슈를 찾을 수 없습니다.' }, { status: 404 })
        }
        const updatedIssues = [...currentIssues]
        updatedIssues[idx] = { ...updatedIssues[idx], ...data }
        const updatedContent = { ...(minute.content || {}), business_issues: updatedIssues }
        updatePayload = { ...updatePayload, content: updatedContent }
        break
      }

      // ── business-add: 새 사업장 이슈 추가 ──
      case 'business-add': {
        const currentIssues: any[] = minute.content?.business_issues || []
        const updatedContent = {
          ...(minute.content || {}),
          business_issues: [...currentIssues, data]
        }
        updatePayload = { ...updatePayload, content: updatedContent }
        break
      }

      // ── business-delete: 사업장 이슈 삭제 ──
      case 'business-delete': {
        if (!itemId) {
          return NextResponse.json({ success: false, error: 'itemId는 필수입니다.' }, { status: 400 })
        }
        const currentIssues: any[] = minute.content?.business_issues || []
        const updatedContent = {
          ...(minute.content || {}),
          business_issues: currentIssues.filter((b: any) => b.id !== itemId)
        }
        updatePayload = { ...updatePayload, content: updatedContent }
        break
      }

      // ── status: 상태 변경 (draft/completed/archived) ──
      case 'status': {
        const { status } = data || {}
        if (!['draft', 'completed', 'archived'].includes(status)) {
          return NextResponse.json({ success: false, error: '유효하지 않은 상태값입니다.' }, { status: 400 })
        }
        updatePayload = { ...updatePayload, status }
        break
      }

      default:
        return NextResponse.json({ success: false, error: `알 수 없는 섹션: ${section}` }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('meeting_minutes')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[MEETING-MINUTES/SECTIONS] Update error:', updateError)
      return NextResponse.json({ success: false, error: '업데이트에 실패했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: updated, section })
  } catch (error) {
    console.error('[MEETING-MINUTES/SECTIONS] Error:', error)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
