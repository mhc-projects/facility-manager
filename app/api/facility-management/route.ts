// app/api/facility-management/route.ts - 시설 관리 통합 API
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// 사업장 시설 관리 정보 조회 (GET)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessName = searchParams.get('businessName');
    const businessId = searchParams.get('businessId');

    if (!businessName && !businessId) {
      return NextResponse.json({
        success: false,
        message: '사업장명 또는 사업장 ID가 필요합니다.'
      }, { status: 400 });
    }

    // 1. 사업장 기본 정보 조회 (모든 컬럼 선택)
    let businessQuery = supabaseAdmin.from('business_info').select('*');

    if (businessId) {
      businessQuery = businessQuery.eq('id', businessId);
    } else {
      businessQuery = businessQuery.eq('business_name', businessName);
    }

    const { data: business, error: businessError } = await businessQuery.single();

    if (businessError || !business) {
      return NextResponse.json({
        success: true,
        data: {
          business: null,
          phases: [],
          devices: [],
          files: {
            presurvey: 0,
            installation: 0,
            completion: 0
          }
        },
        message: '사업장을 찾을 수 없습니다.'
      });
    }

    const foundBusinessId = business.id;

    // 2. 프로젝트 진행 단계 조회
    const { data: phases, error: phasesError } = await supabaseAdmin
      .from('project_phases')
      .select('*')
      .eq('business_id', foundBusinessId)
      .order('created_at', { ascending: true });

    // Silently handle phase query errors

    // 3. 측정기기 정보 조회
    const { data: devices, error: devicesError } = await supabaseAdmin
      .from('measurement_devices')
      .select('*')
      .eq('business_id', foundBusinessId)
      .order('created_at', { ascending: true });

    // Silently handle device query errors

    // 4. 업로드 파일 통계 조회
    const { data: fileStats, error: fileStatsError } = await supabaseAdmin
      .from('uploaded_files')
      .select('project_phase')
      .eq('business_id', foundBusinessId);

    let fileCounts = { presurvey: 0, installation: 0, completion: 0 };
    if (fileStats && !fileStatsError) {
      fileCounts = fileStats.reduce((acc: any, file: any) => {
        if (file.project_phase === 'presurvey') acc.presurvey++;
        else if (file.project_phase === 'installation') acc.installation++;
        else if (file.project_phase === 'completion') acc.completion++;
        return acc;
      }, fileCounts);
    }

    return NextResponse.json({
      success: true,
      data: {
        business,
        phases: phases || [],
        devices: devices || [],
        files: fileCounts
      }
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'CDN-Cache-Control': 'no-store',  // Vercel CDN 캐시 비활성화
        'Vercel-CDN-Cache-Control': 'no-store'  // Vercel 전용
      }
    });

  } catch (error) {
    console.error('❌ [FACILITY-MGMT] 시설 관리 정보 조회 실패:', error);
    return NextResponse.json({
      success: false,
      message: '시설 관리 정보 조회 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

// 사업장 시설 관리 정보 업데이트 (PUT)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      businessId,
      businessName,
      installation_phase,
      surveyor_name,
      surveyor_contact,
      surveyor_company,
      survey_date,
      installation_date,
      completion_date,
      special_notes,
      // Phase별 담당자 정보 (새로운 필드)
      phase,
      presurvey_inspector_name,
      presurvey_inspector_contact,
      presurvey_inspector_date,
      presurvey_special_notes,
      postinstall_installer_name,
      postinstall_installer_contact,
      postinstall_installer_date,
      postinstall_special_notes,
      aftersales_technician_name,
      aftersales_technician_contact,
      aftersales_technician_date,
      aftersales_special_notes
    } = body;

    if (!businessId && !businessName) {
      return NextResponse.json({
        success: false,
        message: '사업장 ID 또는 사업장명이 필요합니다.'
      }, { status: 400 });
    }

    // 1. 사업장 기본 정보 업데이트 - 제공된 필드만 업데이트
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // 제공된 필드만 업데이트 객체에 추가
    if (installation_phase !== undefined) updateData.installation_phase = installation_phase;
    if (surveyor_name !== undefined) updateData.surveyor_name = surveyor_name;
    if (surveyor_contact !== undefined) updateData.surveyor_contact = surveyor_contact;
    if (surveyor_company !== undefined) updateData.surveyor_company = surveyor_company;
    // 날짜 필드: 빈 문자열("")을 null로 변환하여 PostgreSQL DATE 타입 오류 방지
    if (survey_date !== undefined) updateData.survey_date = survey_date === '' ? null : survey_date;
    if (installation_date !== undefined) updateData.installation_date = installation_date === '' ? null : installation_date;
    if (completion_date !== undefined) updateData.completion_date = completion_date === '' ? null : completion_date;
    if (special_notes !== undefined) updateData.special_notes = special_notes;

    // Phase별 담당자 정보 업데이트
    if (presurvey_inspector_name !== undefined) updateData.presurvey_inspector_name = presurvey_inspector_name;
    if (presurvey_inspector_contact !== undefined) updateData.presurvey_inspector_contact = presurvey_inspector_contact;
    // 날짜 필드: 빈 문자열("")을 null로 변환
    if (presurvey_inspector_date !== undefined) updateData.presurvey_inspector_date = presurvey_inspector_date === '' ? null : presurvey_inspector_date;
    if (presurvey_special_notes !== undefined) updateData.presurvey_special_notes = presurvey_special_notes;

    if (postinstall_installer_name !== undefined) updateData.postinstall_installer_name = postinstall_installer_name;
    if (postinstall_installer_contact !== undefined) updateData.postinstall_installer_contact = postinstall_installer_contact;
    // 날짜 필드: 빈 문자열("")을 null로 변환
    if (postinstall_installer_date !== undefined) updateData.postinstall_installer_date = postinstall_installer_date === '' ? null : postinstall_installer_date;
    if (postinstall_special_notes !== undefined) updateData.postinstall_special_notes = postinstall_special_notes;

    if (aftersales_technician_name !== undefined) updateData.aftersales_technician_name = aftersales_technician_name;
    if (aftersales_technician_contact !== undefined) updateData.aftersales_technician_contact = aftersales_technician_contact;
    // 날짜 필드: 빈 문자열("")을 null로 변환
    if (aftersales_technician_date !== undefined) updateData.aftersales_technician_date = aftersales_technician_date === '' ? null : aftersales_technician_date;
    if (aftersales_special_notes !== undefined) updateData.aftersales_special_notes = aftersales_special_notes;

    let updateQuery = supabaseAdmin.from('business_info').update(updateData);

    if (businessId) {
      updateQuery = updateQuery.eq('id', businessId);
    } else {
      updateQuery = updateQuery.eq('business_name', businessName);
    }

    const { data: updatedBusiness, error: updateError } = await updateQuery.select().single();

    if (updateError) {
      console.error(`❌ [FACILITY-MGMT] 업데이트 에러:`, updateError);
      throw updateError;
    }

    // 2. 단계 변경 시 프로젝트 단계 기록 업데이트
    if (installation_phase) {
      const phaseNames = {
        'presurvey': '설치 전 실사',
        'installation': '장비 설치',
        'completed': '설치 후 검수'
      };

      await supabaseAdmin
        .from('project_phases')
        .upsert({
          business_id: updatedBusiness.id,
          phase_type: installation_phase,
          phase_name: phaseNames[installation_phase as keyof typeof phaseNames] || installation_phase,
          status: 'in_progress',
          start_date: new Date().toISOString().split('T')[0],
          assigned_to: surveyor_name,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'business_id,phase_type'
        });
    }

    return NextResponse.json({
      success: true,
      data: updatedBusiness,
      message: '시설 관리 정보가 업데이트되었습니다.'
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    console.error('❌ [FACILITY-MGMT] 시설 관리 정보 업데이트 실패:', error);
    return NextResponse.json({
      success: false,
      error: error,
      message: '시설 관리 정보 업데이트 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}