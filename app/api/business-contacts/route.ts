// app/api/business-contacts/route.ts - 사업장 연락처 정보 API
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// 사업장 연락처 정보 조회 (GET)
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const businessName = searchParams.get('businessName');

  if (!businessName) {
    return NextResponse.json({
      success: false,
      message: '사업장명이 필요합니다.'
    }, { status: 400 });
  }

  console.log(`📋 [BUSINESS-CONTACTS] 연락처 정보 조회: ${businessName}`);

  try {
    // 먼저 business_info 테이블 확인 (기존 테이블일 수 있음)
    const { data: businessInfo, error: businessInfoError } = await supabaseAdmin
      .from('business_info')
      .select('*')
      .eq('business_name', businessName)
      .single();

    if (!businessInfoError && businessInfo) {
      console.log(`✅ [BUSINESS-CONTACTS] business_info 테이블에서 데이터 발견: ${businessName}`);
      return NextResponse.json({
        success: true,
        data: {
          found: true,
          businessName: businessInfo.business_name || businessName,
          사업장명: businessInfo.business_name || businessName,
          주소: businessInfo.address || businessInfo.주소 || null,
          담당자명: businessInfo.manager_name || businessInfo.담당자명 || null,
          담당자연락처: businessInfo.manager_contact || businessInfo.담당자연락처 || null,
          사업장연락처: businessInfo.business_contact || businessInfo.사업장연락처 || null,
          사업자등록번호: businessInfo.business_registration_number || businessInfo.사업자등록번호 || null,
          대표자: businessInfo.representative_name || businessInfo.대표자 || null,
          업종: businessInfo.business_type || businessInfo.업종 || null,
          id: businessInfo.id,
          updatedAt: businessInfo.updated_at,
          tableUsed: 'business_info'
        }
      });
    }

    // business_contacts 테이블 시도
    const { data: contactInfo, error: contactError } = await supabaseAdmin
      .from('business_contacts')
      .select('*')
      .eq('business_name', businessName)
      .single();

    if (contactError) {
      if (contactError.code === 'PGRST116') {
        // 데이터가 없는 경우 기본 구조 반환
        console.log(`📋 [BUSINESS-CONTACTS] 연락처 정보 없음: ${businessName}`);
        return NextResponse.json({
          success: true,
          data: {
            found: false,
            businessName,
            사업장명: businessName,
            주소: null,
            담당자명: null,
            담당자연락처: null,
            사업장연락처: null,
            사업자등록번호: null,
            대표자: null,
            업종: null
          }
        });
      }
      throw contactError;
    }

    console.log(`✅ [BUSINESS-CONTACTS] 연락처 정보 조회 완료: ${businessName}`);

    return NextResponse.json({
      success: true,
      data: {
        found: true,
        businessName: contactInfo.business_name,
        사업장명: contactInfo.business_name,
        주소: contactInfo.address,
        담당자명: contactInfo.manager_name,
        담당자연락처: contactInfo.manager_contact,
        사업장연락처: contactInfo.business_contact,
        사업자등록번호: contactInfo.business_registration_number,
        대표자: contactInfo.representative_name,
        업종: contactInfo.business_type,
        id: contactInfo.id,
        updatedAt: contactInfo.updated_at
      }
    });

  } catch (error) {
    console.error(`❌ [BUSINESS-CONTACTS] 조회 실패:`, error);
    
    // 테이블이 존재하지 않는 경우 기본 데이터 구조 반환
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST205') {
      console.log(`📋 [BUSINESS-CONTACTS] business_contacts 테이블이 없습니다. 기본 구조를 반환합니다.`);
      return NextResponse.json({
        success: true,
        data: {
          found: false,
          businessName: businessName,
          사업장명: businessName,
          주소: null,
          담당자명: null,
          담당자연락처: null,
          사업장연락처: null,
          사업자등록번호: null,
          대표자: null,
          업종: null,
          tableExists: false
        }
      });
    }
    
    return NextResponse.json({
      success: false,
      message: '연락처 정보 조회 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

// 사업장 연락처 정보 생성/수정 (POST/PUT)
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      businessName,
      주소, 
      담당자명, 
      담당자연락처, 
      사업장연락처, 
      사업자등록번호, 
      대표자, 
      업종 
    } = body;

    if (!businessName) {
      return NextResponse.json({
        success: false,
        message: '사업장명이 필요합니다.'
      }, { status: 400 });
    }

    console.log(`📝 [BUSINESS-CONTACTS] 연락처 정보 저장: ${businessName}`);

    // business_info 테이블에 upsert (기존 데이터가 있으면 업데이트, 없으면 생성)
    const { data: contactData, error: contactError } = await supabaseAdmin
      .from('business_info')
      .upsert({
        business_name: businessName,
        주소: 주소,
        담당자명: 담당자명,
        담당자연락처: 담당자연락처,
        사업장연락처: 사업장연락처,
        사업자등록번호: 사업자등록번호,
        대표자: 대표자,
        업종: 업종,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'business_name'
      })
      .select()
      .single();

    if (contactError) {
      throw contactError;
    }

    console.log(`✅ [BUSINESS-CONTACTS] 연락처 정보 저장 완료: ${businessName}`);

    return NextResponse.json({
      success: true,
      message: '연락처 정보가 저장되었습니다.',
      data: {
        id: contactData.id,
        businessName: contactData.business_name,
        사업장명: contactData.business_name,
        주소: contactData.address,
        담당자명: contactData.manager_name,
        담당자연락처: contactData.manager_contact,
        사업장연락처: contactData.business_contact,
        사업자등록번호: contactData.business_registration_number,
        대표자: contactData.representative_name,
        업종: contactData.business_type
      }
    });

  } catch (error) {
    console.error(`❌ [BUSINESS-CONTACTS] 저장 실패:`, error);
    
    // 테이블이 존재하지 않는 경우 알림
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST205') {
      return NextResponse.json({
        success: false,
        message: '데이터베이스 테이블이 존재하지 않습니다. Supabase 대시보드에서 business_contacts 테이블을 먼저 생성해주세요.',
        requiresTableCreation: true
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: '연락처 정보 저장 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}