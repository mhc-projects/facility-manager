// app/api/business-info-edit/route.ts - business_info 테이블 직접 수정 API
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;
    
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: '사업장 ID가 필요합니다.'
      }, { status: 400 });
    }
    
    console.log(`🔄 [BUSINESS-INFO-EDIT] 사업장 정보 수정 시작 - ID: ${id}`);
    
    const { supabaseAdmin } = await import('@/lib/supabase');
    
    // 여러 담당자 정보 처리
    let additionalInfo = {};
    
    // 기존 additional_info 유지
    try {
      const currentRecord = await supabaseAdmin
        .from('business_info')
        .select('additional_info')
        .eq('id', id)
        .single();
      
      if (currentRecord.data?.additional_info) {
        additionalInfo = currentRecord.data.additional_info;
      }
    } catch (e) {
      console.warn('기존 additional_info 조회 실패:', e);
    }

    // contacts 정보를 additional_info에 저장
    if (updateData.contacts && Array.isArray(updateData.contacts)) {
      (additionalInfo as any).contacts = updateData.contacts;
      // 첫 번째 담당자를 기본 필드에도 설정
      if (updateData.contacts.length > 0) {
        updateData.manager_name = updateData.contacts[0].name;
        updateData.manager_position = updateData.contacts[0].position;
        updateData.manager_contact = updateData.contacts[0].phone.substring(0, 20); // 20자 제한
      }
    } else if (updateData.manager_contact && updateData.manager_contact.includes('/')) {
      // 텍스트 파싱: "이름/직급/연락처/역할" 형식
      const lines = updateData.manager_contact.split('\n').filter((line: string) => line.trim());
      const parsedContacts = lines.map((line: string) => {
        const parts = line.split('/');
        return {
          name: parts[0] || '',
          position: parts[1] || '',
          phone: parts[2] || '',
          role: parts[3] || ''
        };
      }).filter((contact: any) => contact.name && contact.phone);

      if (parsedContacts.length > 0) {
        (additionalInfo as any).contacts = parsedContacts;
        // 첫 번째 담당자를 기본 필드에 설정
        updateData.manager_name = parsedContacts[0].name;
        updateData.manager_position = parsedContacts[0].position;
        updateData.manager_contact = parsedContacts[0].phone.substring(0, 20);
      }
    }

    // UTF-8 인코딩 정규화 함수
    const normalizeUTF8 = (text: string | null | undefined): string | null => {
      if (!text) return null;
      try {
        // 문자열이 이미 올바른 UTF-8인지 확인
        const encoder = new TextEncoder();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const encoded = encoder.encode(text);
        return decoder.decode(encoded);
      } catch {
        // 인코딩 오류가 있으면 기본값 반환
        console.warn('UTF-8 인코딩 오류 감지, 원본 반환:', text);
        return text;
      }
    };

    // 동적 업데이트 객체 생성 (제공된 필드만 업데이트)
    const updateObject: any = {
      additional_info: additionalInfo,
      updated_at: new Date().toISOString()
    };

    // 각 필드를 개별적으로 검사하여 제공된 경우만 업데이트 객체에 추가
    if (updateData.사업장명 || updateData.business_name) {
      updateObject.business_name = normalizeUTF8(updateData.사업장명 || updateData.business_name);
    }
    if (updateData.지자체 || updateData.local_government) {
      updateObject.local_government = normalizeUTF8(updateData.지자체 || updateData.local_government);
    }
    if (updateData.주소 || updateData.address) {
      updateObject.address = normalizeUTF8(updateData.주소 || updateData.address);
    }
    if (updateData.담당자명 || updateData.manager_name) {
      updateObject.manager_name = normalizeUTF8(updateData.담당자명 || updateData.manager_name);
    }
    if (updateData.담당자연락처 || updateData.manager_contact) {
      updateObject.manager_contact = normalizeUTF8(updateData.담당자연락처 || updateData.manager_contact);
    }
    if (updateData.담당자직급 || updateData.manager_position) {
      updateObject.manager_position = normalizeUTF8(updateData.담당자직급 || updateData.manager_position);
    }
    if (updateData.대표자 || updateData.representative_name) {
      updateObject.representative_name = normalizeUTF8(updateData.대표자 || updateData.representative_name);
    }
    if (updateData.사업자등록번호 || updateData.business_registration_number) {
      updateObject.business_registration_number = normalizeUTF8(updateData.사업자등록번호 || updateData.business_registration_number);
    }
    if (updateData.업종 || updateData.business_type) {
      updateObject.business_type = normalizeUTF8(updateData.업종 || updateData.business_type);
    }
    if (updateData.사업장연락처 || updateData.business_contact) {
      updateObject.business_contact = normalizeUTF8(updateData.사업장연락처 || updateData.business_contact);
    }
    if (updateData.팩스번호 || updateData.fax_number) {
      updateObject.fax_number = normalizeUTF8(updateData.팩스번호 || updateData.fax_number);
    }
    if (updateData.이메일 || updateData.email) {
      updateObject.email = normalizeUTF8(updateData.이메일 || updateData.email);
    }
    if (updateData.manufacturer !== undefined) {
      updateObject.manufacturer = updateData.manufacturer;
    }
    if (updateData.사업장관리코드 || updateData.business_management_code) {
      updateObject.business_management_code = updateData.사업장관리코드 || updateData.business_management_code;
    }
    if (updateData.그린링크ID || updateData.greenlink_id) {
      updateObject.greenlink_id = normalizeUTF8(updateData.그린링크ID || updateData.greenlink_id);
    }
    if (updateData.그린링크PW || updateData.greenlink_pw) {
      updateObject.greenlink_pw = normalizeUTF8(updateData.그린링크PW || updateData.greenlink_pw);
    }
    if (updateData.영업점 || updateData.sales_office) {
      updateObject.sales_office = normalizeUTF8(updateData.영업점 || updateData.sales_office);
    }
    if (updateData.PH센서 !== undefined || updateData.ph_meter !== undefined) {
      updateObject.ph_meter = updateData.PH센서 || updateData.ph_meter || 0;
    }
    if (updateData.차압계 !== undefined || updateData.differential_pressure_meter !== undefined) {
      updateObject.differential_pressure_meter = updateData.차압계 || updateData.differential_pressure_meter || 0;
    }
    if (updateData.온도계 !== undefined || updateData.temperature_meter !== undefined) {
      updateObject.temperature_meter = updateData.온도계 || updateData.temperature_meter || 0;
    }
    if (updateData.배출전류계 !== undefined || updateData.discharge_current_meter !== undefined) {
      updateObject.discharge_current_meter = updateData.배출전류계 || updateData.discharge_current_meter || 0;
    }
    if (updateData.송풍전류계 !== undefined || updateData.fan_current_meter !== undefined) {
      updateObject.fan_current_meter = updateData.송풍전류계 || updateData.fan_current_meter || 0;
    }
    if (updateData.펌프전류계 !== undefined || updateData.pump_current_meter !== undefined) {
      updateObject.pump_current_meter = updateData.펌프전류계 || updateData.pump_current_meter || 0;
    }
    if (updateData.게이트웨이 !== undefined || updateData.gateway !== undefined) {
      updateObject.gateway = updateData.게이트웨이 || updateData.gateway || 0;
    }
    if (updateData.is_active !== undefined) {
      updateObject.is_active = updateData.is_active;
    }
    
    // 추가 필드들 (database-service.ts 스키마와 매칭)
    if (updateData.additional_cost !== undefined) {
      updateObject.additional_cost = updateData.additional_cost;
    }
    if (updateData.installation_extra_cost !== undefined) {
      updateObject.installation_extra_cost = updateData.installation_extra_cost;
    }
    if (updateData.negotiation || updateData.네고) {
      updateObject.negotiation = updateData.negotiation || updateData.네고;
    }
    if (updateData.multiple_stack_cost || updateData.복수굴뚝설치비) {
      updateObject.multiple_stack_cost = updateData.multiple_stack_cost || updateData.복수굴뚝설치비;
    }
    if (updateData.expansion_pack || updateData.확장팩) {
      updateObject.expansion_pack = updateData.expansion_pack || updateData.확장팩;
    }
    if (updateData.other_equipment || updateData.기타) {
      updateObject.other_equipment = updateData.other_equipment || updateData.기타;
    }
    if (updateData.representatives !== undefined) {
      updateObject.representatives = updateData.representatives;
    }
    if (updateData.contacts_list !== undefined) {
      updateObject.contacts_list = updateData.contacts_list;
    }

    console.log('🔄 [BUSINESS-INFO-EDIT] 업데이트할 필드들:', Object.keys(updateObject));

    // business_info 테이블 직접 업데이트 (제공된 필드만)
    const { data, error } = await supabaseAdmin
      .from('business_info')
      .update(updateObject)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('❌ [BUSINESS-INFO-EDIT] 수정 실패:', error);
      return NextResponse.json({
        success: false,
        error: `사업장 정보 수정 실패: ${error.message}`
      }, { status: 500 });
    }
    
    if (!data) {
      console.error('❌ [BUSINESS-INFO-EDIT] 수정할 사업장을 찾을 수 없음 - ID:', id);
      return NextResponse.json({
        success: false,
        error: '업데이트할 사업장을 찾을 수 없습니다. ID를 확인해주세요.'
      }, { status: 404 });
    }
    
    // 응답 데이터도 UTF-8 정규화
    const normalizedData = {
      ...data,
      business_name: normalizeUTF8(data.business_name),
      manager_name: normalizeUTF8(data.manager_name),
      manager_position: normalizeUTF8(data.manager_position),
      local_government: normalizeUTF8(data.local_government),
      address: normalizeUTF8(data.address),
      representative_name: normalizeUTF8(data.representative_name),
      business_registration_number: normalizeUTF8(data.business_registration_number),
      business_type: normalizeUTF8(data.business_type),
      business_contact: normalizeUTF8(data.business_contact),
      fax_number: normalizeUTF8(data.fax_number),
      email: normalizeUTF8(data.email),
      business_management_code: normalizeUTF8(data.business_management_code),
      greenlink_id: normalizeUTF8(data.greenlink_id),
      greenlink_pw: normalizeUTF8(data.greenlink_pw),
      sales_office: normalizeUTF8(data.sales_office)
    };
    
    console.log(`✅ [BUSINESS-INFO-EDIT] 사업장 정보 수정 완료 - ${normalizedData.business_name}`);
    
    return new NextResponse(JSON.stringify({
      success: true,
      data: normalizedData,
      message: '사업장 정보가 성공적으로 수정되었습니다.'
    }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
    
  } catch (error) {
    console.error('❌ [BUSINESS-INFO-EDIT] API 오류:', error);
    return NextResponse.json({
      success: false,
      error: '사업장 정보 수정 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log(`🆕 [BUSINESS-INFO-EDIT] 새 사업장 추가 시작`);
    
    const { supabaseAdmin } = await import('@/lib/supabase');

    // UTF-8 인코딩 정규화 함수
    const normalizeUTF8 = (text: string | null | undefined): string | null => {
      if (!text) return null;
      try {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const encoded = encoder.encode(text);
        return decoder.decode(encoded);
      } catch {
        console.warn('UTF-8 인코딩 오류 감지, 원본 반환:', text);
        return text;
      }
    };
    
    // business_info 테이블에 새 레코드 추가 (UTF-8 정규화 적용)
    const { data, error } = await supabaseAdmin
      .from('business_info')
      .insert({
        business_name: normalizeUTF8(body.사업장명 || body.business_name),
        local_government: normalizeUTF8(body.지자체 || body.local_government),
        address: normalizeUTF8(body.주소 || body.address),
        manager_name: normalizeUTF8(body.담당자명 || body.manager_name),
        manager_contact: normalizeUTF8(body.담당자연락처 || body.manager_contact),
        manager_position: normalizeUTF8(body.담당자직급 || body.manager_position),
        representative_name: normalizeUTF8(body.대표자 || body.representative_name),
        business_registration_number: normalizeUTF8(body.사업자등록번호 || body.business_registration_number),
        business_type: normalizeUTF8(body.업종 || body.business_type),
        business_contact: normalizeUTF8(body.사업장연락처 || body.business_contact),
        fax_number: normalizeUTF8(body.팩스번호 || body.fax_number),
        email: normalizeUTF8(body.이메일 || body.email),
        manufacturer: body.manufacturer,
        business_management_code: body.사업장관리코드 || body.business_management_code,
        greenlink_id: normalizeUTF8(body.그린링크ID || body.greenlink_id),
        greenlink_pw: normalizeUTF8(body.그린링크PW || body.greenlink_pw),
        sales_office: normalizeUTF8(body.영업점 || body.sales_office),
        ph_meter: body.PH센서 || body.ph_meter || 0,
        differential_pressure_meter: body.차압계 || body.differential_pressure_meter || 0,
        temperature_meter: body.온도계 || body.temperature_meter || 0,
        discharge_current_meter: body.배출전류계 || body.discharge_current_meter || 0,
        fan_current_meter: body.송풍전류계 || body.fan_current_meter || 0,
        pump_current_meter: body.펌프전류계 || body.pump_current_meter || 0,
        gateway: body.게이트웨이 || body.gateway || 0,
        is_active: body.is_active !== undefined ? body.is_active : true,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ [BUSINESS-INFO-EDIT] 추가 실패:', error);
      return NextResponse.json({
        success: false,
        error: `사업장 추가 실패: ${error.message}`
      }, { status: 500 });
    }
    
    // 응답 데이터도 UTF-8 정규화
    const normalizedData = {
      ...data,
      business_name: normalizeUTF8(data.business_name),
      manager_name: normalizeUTF8(data.manager_name),
      manager_position: normalizeUTF8(data.manager_position),
      local_government: normalizeUTF8(data.local_government),
      address: normalizeUTF8(data.address),
      representative_name: normalizeUTF8(data.representative_name),
      business_registration_number: normalizeUTF8(data.business_registration_number),
      business_type: normalizeUTF8(data.business_type),
      business_contact: normalizeUTF8(data.business_contact),
      fax_number: normalizeUTF8(data.fax_number),
      email: normalizeUTF8(data.email),
      business_management_code: normalizeUTF8(data.business_management_code),
      greenlink_id: normalizeUTF8(data.greenlink_id),
      greenlink_pw: normalizeUTF8(data.greenlink_pw),
      sales_office: normalizeUTF8(data.sales_office)
    };
    
    console.log(`✅ [BUSINESS-INFO-EDIT] 새 사업장 추가 완료 - ${normalizedData.business_name}`);
    
    return NextResponse.json({
      success: true,
      data: normalizedData,
      message: '새 사업장이 성공적으로 추가되었습니다.'
    });
    
  } catch (error) {
    console.error('❌ [BUSINESS-INFO-EDIT] API 오류:', error);
    return NextResponse.json({
      success: false,
      error: '사업장 추가 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: '사업장 ID가 필요합니다.'
      }, { status: 400 });
    }
    
    console.log(`🗑️ [BUSINESS-INFO-EDIT] 사업장 삭제 시작 - ID: ${id}`);
    
    const { supabaseAdmin } = await import('@/lib/supabase');
    
    // business_info 테이블에서 soft delete (is_deleted = true)
    const { data, error } = await supabaseAdmin
      .from('business_info')
      .update({
        is_deleted: true,
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('❌ [BUSINESS-INFO-EDIT] 삭제 실패:', error);
      return NextResponse.json({
        success: false,
        error: `사업장 삭제 실패: ${error.message}`
      }, { status: 500 });
    }
    
    console.log(`✅ [BUSINESS-INFO-EDIT] 사업장 삭제 완료 - ${data.business_name}`);
    
    return NextResponse.json({
      success: true,
      data: data,
      message: '사업장이 성공적으로 삭제되었습니다.'
    });
    
  } catch (error) {
    console.error('❌ [BUSINESS-INFO-EDIT] 삭제 API 오류:', error);
    return NextResponse.json({
      success: false,
      error: '사업장 삭제 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}