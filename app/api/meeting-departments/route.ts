// ============================================
// 회의록 부서 목록 API
// GET  /api/meeting-departments       - 전체 부서 목록 조회
// POST /api/meeting-departments       - 부서 추가
// DELETE /api/meeting-departments     - 부서 삭제 (?name=xxx)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// JWT 토큰에서 사용자 정보 추출하는 헬퍼 함수 (다른 meeting-* 라우트와 동일 패턴)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'

async function getUserFromToken(request: NextRequest) {
  try {
    let token: string | null = null

    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    } else {
      const cookieToken = request.cookies.get('session_token')?.value
      if (cookieToken) {
        token = cookieToken
      }
    }

    if (!token) {
      return null
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any

    const { data: user, error } = await supabase
      .from('employees')
      .select('id, name, email, permission_level, department')
      .eq('id', decoded.userId || decoded.id)
      .eq('is_active', true)
      .single()

    if (error || !user) {
      console.warn('⚠️ [MEETING-DEPT] 사용자 조회 실패:', error?.message)
      return null
    }

    return user
  } catch (error) {
    console.warn('⚠️ [MEETING-DEPT] JWT 토큰 검증 실패:', error)
    return null
  }
}

// Next.js 프로덕션 캐싱 비활성화
export const dynamic = 'force-dynamic'

// GET: 부서 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('meeting_departments')
      .select('name')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json(
      { success: true, data: (data || []).map((row: { name: string }) => row.name) },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[MEETING-DEPT] GET error:', error)
    return NextResponse.json({ success: false, error: '부서 목록 조회 실패' }, { status: 500 })
  }
}

// POST: 부서 추가
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 })
    }

    const body = await request.json()
    const name = (body.name || '').trim()

    if (!name) {
      return NextResponse.json({ success: false, error: '부서명을 입력해주세요' }, { status: 400 })
    }

    // 현재 최대 sort_order 조회
    const { data: existing } = await supabase
      .from('meeting_departments')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = existing && existing.length > 0 ? (existing[0].sort_order + 1) : 0

    const { error } = await supabase
      .from('meeting_departments')
      .insert({ name, sort_order: nextOrder })

    if (error) {
      // unique 제약 위반 = 이미 존재
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: '이미 존재하는 부서명입니다' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[MEETING-DEPT] POST error:', error)
    return NextResponse.json({ success: false, error: '부서 추가 실패' }, { status: 500 })
  }
}

// DELETE: 부서 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')

    if (!name) {
      return NextResponse.json({ success: false, error: '부서명이 필요합니다' }, { status: 400 })
    }

    const { error } = await supabase
      .from('meeting_departments')
      .delete()
      .eq('name', name)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[MEETING-DEPT] DELETE error:', error)
    return NextResponse.json({ success: false, error: '부서 삭제 실패' }, { status: 500 })
  }
}
