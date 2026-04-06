// app/api/business-management/route.ts - 어드민용 사업장 관리 API (기존 데이터 활용)
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { DatabaseService, BusinessInfo } from '@/lib/database-service';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    console.log('🔍 [BUSINESS-MGMT] 어드민 사업장 목록 조회 (기존 데이터 활용)');
    
    // 1. 기존 business-list API에서 사업장 목록 가져오기
    const baseUrl = process.env.NODE_ENV === 'production'
      ? `https://${request.headers.get('host')}`
      : `http://localhost:${process.env.PORT || 3000}`;
      
    const businessListResponse = await fetch(`${baseUrl}/api/business-list`);
    const businessListData = await businessListResponse.json();
    
    if (!businessListData.success || !businessListData.data?.businesses) {
      throw new Error('사업장 목록을 가져올 수 없습니다');
    }
    
    const businessNames = businessListData.data.businesses;
    console.log(`🔍 [BUSINESS-MGMT] ${businessNames.length}개 사업장 발견`);
    
    // 쿼리 파라미터로 간단한 목록만 요청할 수 있도록 추가
    const { searchParams } = new URL(request.url);
    const simpleList = searchParams.get('detailed') !== 'true'; // 기본값을 simple로 변경
    
    if (simpleList) {
      // 간단한 목록만 반환 (즉시 응답)
      const simpleBusinesses = businessNames.map((name: string, index: number) => ({
        id: `business-${index}`,
        사업장명: name,
        주소: '',
        담당자명: '',
        담당자연락처: '',
        담당자직급: '',
        대표자: '',
        사업자등록번호: '',
        업종: '',
        사업장연락처: '',
        상태: '로딩중',
        배출시설수: 0,
        방지시설수: 0,
        총측정기기수: 0,
        등록일: new Date().toLocaleDateString('ko-KR'),
        수정일: new Date().toLocaleDateString('ko-KR')
      }));
      
      return createSuccessResponse({
        businesses: simpleBusinesses,
        count: simpleBusinesses.length,
        metadata: {
          source: 'business-list-simple',
          totalAvailable: businessNames.length,
          processed: simpleBusinesses.length,
          isSimple: true
        }
      });
    }

    // 2. 각 사업장의 상세 정보를 facilities-supabase API에서 가져오기 (병렬 처리)
    const businessDetailsPromises = businessNames.map(async (businessName: string) => {
      try {
        const encodedName = encodeURIComponent(businessName);
        const response = await fetch(`${baseUrl}/api/facilities-supabase/${encodedName}`);
        const data = await response.json();
        
        if (data.success && data.data?.businessInfo) {
          const info = data.data.businessInfo;
          const facilities = data.data.facilities;
          
          // 측정기기 수량 계산
          const dischargeCount = facilities?.discharge?.length || 0;
          const preventionCount = facilities?.prevention?.length || 0;
          const totalDevices = dischargeCount + preventionCount; // 간소화된 계산
          
          // 시설관리 시스템의 BusinessInfo 형식에 맞게 매핑
          return {
            id: `business-${businessName}`,
            사업장명: info.businessName || businessName, // 시설관리 시스템의 businessName 사용
            주소: info.address || info.주소 || '', // 시설관리 시스템의 address 사용
            담당자명: info.manager || info.담당자명 || '', // 시설관리 시스템의 manager 사용
            담당자연락처: info.contact || info.담당자연락처 || '', // 시설관리 시스템의 contact 사용
            담당자직급: info.position || info.담당자직급 || '', // 시설관리 시스템의 position 사용
            대표자: info.대표자 || '',
            사업자등록번호: info.사업자등록번호 || '',
            업종: info.업종 || '',
            사업장연락처: info.사업장연락처 || '',
            상태: info.found ? '활성' : '정보 부족',
            배출시설수: dischargeCount,
            방지시설수: preventionCount,
            총측정기기수: info.equipmentCounts?.totalDevices || totalDevices,
            // 시설관리 시스템의 측정기기 세부 정보 추가
            PH센서: info.equipmentCounts?.phSensor || 0,
            차압계: info.equipmentCounts?.differentialPressureMeter || 0,
            온도계: info.equipmentCounts?.temperatureMeter || 0,
            배출전류계: info.equipmentCounts?.dischargeCT || 0,
            송풍전류계: info.equipmentCounts?.fanCT || 0,
            펌프전류계: info.equipmentCounts?.pumpCT || 0,
            게이트웨이: info.equipmentCounts?.gateway || 0,
            등록일: new Date().toLocaleDateString('ko-KR'),
            수정일: new Date().toLocaleDateString('ko-KR')
          };
        }
        
        return {
          id: `business-${businessName}`,
          사업장명: businessName,
          주소: '',
          담당자명: '',
          담당자연락처: '',
          담당자직급: '',
          대표자: '',
          사업자등록번호: '',
          업종: '',
          사업장연락처: '',
          상태: '정보 부족',
          배출시설수: 0,
          방지시설수: 0,
          총측정기기수: 0,
          등록일: new Date().toLocaleDateString('ko-KR'),
          수정일: new Date().toLocaleDateString('ko-KR')
        };
      } catch (error) {
        console.error(`❌ [BUSINESS-MGMT] ${businessName} 정보 로드 실패:`, error);
        return {
          id: `business-${businessName}`,
          사업장명: businessName,
          주소: '',
          담당자명: '',
          담당자연락처: '',
          담당자직급: '',
          대표자: '',
          사업자등록번호: '',
          업종: '',
          사업장연락처: '',
          상태: '로드 실패',
          배출시설수: 0,
          방지시설수: 0,
          총측정기기수: 0,
          등록일: new Date().toLocaleDateString('ko-KR'),
          수정일: new Date().toLocaleDateString('ko-KR')
        };
      }
    });
    
    console.log('🔄 [BUSINESS-MGMT] 병렬 상세 정보 로드 시작...');
    const businessDetails = await Promise.allSettled(businessDetailsPromises);
    
    const formattedBusinesses = businessDetails
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);
    
    console.log(`✅ [BUSINESS-MGMT] ${formattedBusinesses.length}개 사업장 정보 완료`);
    
    return createSuccessResponse({
      businesses: formattedBusinesses,
      count: formattedBusinesses.length,
      metadata: {
        source: 'facilities-supabase',
        totalAvailable: businessNames.length,
        processed: formattedBusinesses.length,
        withCompleteInfo: formattedBusinesses.filter(b => b.상태 === '활성').length
      }
    });
    
  } catch (error: any) {
    console.error('🔴 [BUSINESS-MGMT] 오류:', error?.message || error);
    return createErrorResponse(error?.message || 'Supabase 연결에 실패했습니다', 500);
  }
}, { logLevel: 'debug' });

export const POST = withApiHandler(async (request: NextRequest) => {
  try {
    const body = await request.json();
    console.log('📝 [BUSINESS-MGMT] 사업장 추가/수정 요청:', body);
    
    // 배치 업로드인지 단일 사업장인지 확인
    if (body.isBatchUpload && Array.isArray(body.businesses)) {
      return await handleBatchBusinessUpload(body.businesses);
    }
    
    // 단일 사업장 처리 (기존 로직 유지)
    return createSuccessResponse({ 
      message: '단일 사업장 추가는 현재 읽기 전용입니다.' 
    });
    
  } catch (error: any) {
    console.error('🔴 [BUSINESS-MGMT] 저장 오류:', error);
    return createErrorResponse(error?.message || '사업장 저장에 실패했습니다', 500);
  }
}, { logLevel: 'debug' });

// 배치 업로드 처리 함수
async function handleBatchBusinessUpload(businesses: any[]) {
  try {
    console.log(`📊 [BATCH] ${businesses.length}개 사업장 배치 처리 시작`);
    
    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < businesses.length; i++) {
      const business = businesses[i];
      
      try {
        // 사업장명 확인 (공백 처리)
        const businessName = getExcelValue(business, '사업장명')?.toString()?.trim();
        if (!businessName) {
          errors.push(`행 ${i + 2}: 사업장명이 필요합니다.`);
          errorCount++;
          continue;
        }
        
        // 기존 사업장 검색
        const existingBusiness = await DatabaseService.getBusinessByName(businessName);
        
        // 엑셀 데이터를 DB 형식으로 변환
        const businessData = convertExcelToBusinessData(business);
        
        if (existingBusiness) {
          // 기존 사업장 업데이트
          await DatabaseService.updateBusiness(existingBusiness.id, businessData);
          updatedCount++;
          console.log(`✅ [BATCH] 업데이트: ${businessName} (${i + 1}/${businesses.length})`);
        } else {
          // 새 사업장 생성
          const cleanBusinessData = {
            business_name: businessData.business_name || '',
            local_government: businessData.local_government || null,
            address: businessData.address || null,
            manager_name: businessData.manager_name || null,
            manager_position: businessData.manager_position || null,
            manager_contact: businessData.manager_contact || null,
            business_contact: businessData.business_contact || null,
            fax_number: businessData.fax_number || null,
            email: businessData.email || null,
            representative_name: businessData.representative_name || null,
            business_registration_number: businessData.business_registration_number || null,
            row_number: businessData.row_number || null,
            department: businessData.department || null,
            progress_status: businessData.progress_status || null,
            contract_document: businessData.contract_document || null,
            order_request_date: businessData.order_request_date || null,
            wireless_document: businessData.wireless_document || null,
            installation_support: businessData.installation_support || null,
            order_manager: businessData.order_manager || null,
            order_date: businessData.order_date || null,
            shipment_date: businessData.shipment_date || null,
            inventory_check: businessData.inventory_check || null,
            installation_date: businessData.installation_date || null,
            installation_team: businessData.installation_team || null,
            business_type: businessData.business_type || null,
            business_category: businessData.business_category || null,
            pollutants: businessData.pollutants || null,
            annual_emission_amount: businessData.annual_emission_amount || null,
            subsidy_approval_date: businessData.subsidy_approval_date || null,
            expansion_pack: businessData.expansion_pack || null,
            other_equipment: businessData.other_equipment || null,
            additional_cost: businessData.additional_cost || null,
            negotiation: businessData.negotiation || null,
            multiple_stack_cost: businessData.multiple_stack_cost || null,
            representative_birth_date: businessData.representative_birth_date || null,
            manufacturer: businessData.manufacturer || null,
            vpn: businessData.vpn || null,
            greenlink_id: businessData.greenlink_id || null,
            greenlink_pw: businessData.greenlink_pw || null,
            business_management_code: businessData.business_management_code || null,
            sales_office: businessData.sales_office || null,
            ph_meter: businessData.ph_meter || null,
            differential_pressure_meter: businessData.differential_pressure_meter || null,
            temperature_meter: businessData.temperature_meter || null,
            discharge_current_meter: businessData.discharge_current_meter || null,
            fan_current_meter: businessData.fan_current_meter || null,
            pump_current_meter: businessData.pump_current_meter || null,
            gateway: businessData.gateway || null,
            vpn_wired: businessData.vpn_wired || null,
            vpn_wireless: businessData.vpn_wireless || null,
            explosion_proof_differential_pressure_meter_domestic: businessData.explosion_proof_differential_pressure_meter_domestic || null,
            explosion_proof_temperature_meter_domestic: businessData.explosion_proof_temperature_meter_domestic || null,
            expansion_device: businessData.expansion_device || null,
            relay_8ch: businessData.relay_8ch || null,
            relay_16ch: businessData.relay_16ch || null,
            main_board_replacement: businessData.main_board_replacement || null,
            multiple_stack: businessData.multiple_stack || null,
            facility_summary: null,
            additional_info: {},
            is_active: true,
            is_deleted: false
          };
          
          await DatabaseService.createBusiness(cleanBusinessData);
          createdCount++;
          console.log(`🆕 [BATCH] 생성: ${businessName} (${i + 1}/${businesses.length})`);
        }
        
        // 진행률 계산 및 출력 (매 10개마다 또는 완료시)
        if ((i + 1) % 10 === 0 || i === businesses.length - 1) {
          const progressPercent = Math.round(((i + 1) / businesses.length) * 100);
          console.log(`📊 [BATCH] 진행률: ${progressPercent}% (${i + 1}/${businesses.length})`);
        }
        
      } catch (error: any) {
        const businessName = getExcelValue(business, '사업장명')?.toString()?.trim() || '알 수 없음';
        console.error(`❌ [BATCH] ${businessName} 처리 실패:`, error);
        errors.push(`행 ${i + 2} (${businessName}): ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`📊 [BATCH] 완료 - 생성: ${createdCount}, 업데이트: ${updatedCount}, 오류: ${errorCount}`);
    
    return createSuccessResponse({
      message: '배치 업로드가 완료되었습니다.',
      results: {
        total: businesses.length,
        created: createdCount,
        updated: updatedCount,
        errors: errorCount,
        errorDetails: errors.slice(0, 10) // 최대 10개 오류만 반환
      }
    });
    
  } catch (error: any) {
    console.error('🔴 [BATCH] 배치 처리 오류:', error);
    return createErrorResponse(`배치 처리 중 오류: ${error.message}`, 500);
  }
}

// 엑셀 필드명 정규화 함수 (공백 제거)
function normalizeFieldName(fieldName: string): string {
  return fieldName?.trim().replace(/\s+/g, '') || '';
}

// 엑셀 데이터에서 값 가져오기 (공백 처리 개선)
function getExcelValue(excelRow: any, fieldName: string): any {
  // 디버깅: 사업장명 필드 확인
  if (fieldName === '사업장명') {
    console.log('🔍 [CONVERT] 사업장명 필드 찾기:', {
      '사업장명_직접': excelRow['사업장명'],
      '사업장명_공백포함': excelRow[' 사업장명 '],
      '사업장명_앞공백': excelRow[' 사업장명'],
      '사업장명_뒤공백': excelRow['사업장명 ']
    });
  }
  
  // 1. 원본 필드명으로 시도
  if (excelRow[fieldName] !== undefined && excelRow[fieldName] !== null && excelRow[fieldName] !== '') {
    return excelRow[fieldName];
  }
  
  // 2. 다양한 공백 변형으로 시도
  const variations = [
    ` ${fieldName} `,    // 앞뒤 공백
    ` ${fieldName}`,     // 앞 공백만
    `${fieldName} `,     // 뒤 공백만
    fieldName.trim()     // 공백 제거된 원본
  ];
  
  for (const variation of variations) {
    if (excelRow[variation] !== undefined && excelRow[variation] !== null && excelRow[variation] !== '') {
      return excelRow[variation];
    }
  }
  
  // 3. 모든 키에서 정규화해서 찾기 (최후 수단)
  const normalizedTarget = normalizeFieldName(fieldName);
  for (const key in excelRow) {
    if (normalizeFieldName(key) === normalizedTarget && excelRow[key] !== undefined && excelRow[key] !== null && excelRow[key] !== '') {
      return excelRow[key];
    }
  }
  
  return undefined;
}

// Excel 날짜 변환 함수
function convertExcelDate(excelDate: any): string | null {
  if (!excelDate) return null;
  
  // 이미 문자열이고 날짜 형식이면 그대로 반환
  if (typeof excelDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(excelDate)) {
    return excelDate;
  }
  
  // 숫자면 Excel 날짜로 변환
  if (typeof excelDate === 'number') {
    try {
      // Excel epoch: 1900-01-01, JavaScript epoch: 1970-01-01
      // Excel의 1은 1900-01-01이지만 실제로는 1900-01-00 버그가 있어서 -1 해야함
      const excelEpoch = new Date(1900, 0, 1);
      const jsDate = new Date(excelEpoch.getTime() + (excelDate - 2) * 24 * 60 * 60 * 1000);
      return jsDate.toISOString().split('T')[0]; // YYYY-MM-DD 형식
    } catch (error) {
      console.warn('Excel 날짜 변환 실패:', excelDate);
      return null;
    }
  }
  
  // 기타 문자열 처리
  if (typeof excelDate === 'string') {
    try {
      const date = new Date(excelDate);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (error) {
      console.warn('날짜 파싱 실패:', excelDate);
    }
  }
  
  return null;
}

// 엑셀 데이터를 BusinessInfo 형식으로 변환
function convertExcelToBusinessData(excelRow: any): Partial<BusinessInfo> {
  console.log('🔍 [CONVERT] 엑셀 행 처리 중, 사업장명 확인:', {
    keys: Object.keys(excelRow),
    사업장명_직접: excelRow['사업장명'],
    사업장명_공백포함: excelRow[' 사업장명 '],
    사업장명_앞공백: excelRow[' 사업장명'],
    사업장명_뒤공백: excelRow['사업장명 ']
  });
  
  // 제조사 매핑
  const manufacturerValue = getExcelValue(excelRow, '제조사')?.toString()?.trim() || '';
  const manufacturerMap: Record<string, 'ecosense' | 'cleanearth' | 'gaia_cns' | 'evs'> = {
    '1': 'ecosense',
    '2': 'cleanearth',
    '3': 'gaia_cns',
    '4': 'evs',
    '1. 에코센스': 'ecosense',
    '에코센스': 'ecosense',
    '2. 클린어스': 'cleanearth', 
    '클린어스': 'cleanearth',
    '3. 가이아씨앤에스': 'gaia_cns',
    '가이아씨앤에스': 'gaia_cns',
    '4. 이브이에스': 'evs',
    '이브이에스': 'evs'
  };
  
  // VPN 매핑
  const vpnValue = getExcelValue(excelRow, 'VPN')?.toString()?.trim() || '';
  const vpnMap: Record<string, 'wired' | 'wireless'> = {
    '1': 'wireless',
    '2': 'wired',
    '1. 무선': 'wireless',
    '무선': 'wireless',
    '2. 유선': 'wired',
    '유선': 'wired'
  };
  
  return {
    // 기본 정보
    business_name: getExcelValue(excelRow, '사업장명')?.toString()?.trim() || '',
    local_government: getExcelValue(excelRow, '지자체')?.toString()?.trim() || null,
    address: getExcelValue(excelRow, '주소')?.toString()?.trim() || null,
    representative_name: getExcelValue(excelRow, '대표자명')?.toString()?.trim() || null,
    business_registration_number: getExcelValue(excelRow, '사업자등록번호')?.toString()?.trim() || null,
    manager_name: getExcelValue(excelRow, '사업장담당자')?.toString()?.trim() || null,
    manager_position: getExcelValue(excelRow, '직급')?.toString()?.trim() || null,
    manager_contact: getExcelValue(excelRow, '연락처')?.toString()?.trim() || null,
    business_contact: getExcelValue(excelRow, '사업장연락처')?.toString()?.trim() || null,
    fax_number: getExcelValue(excelRow, '팩스번호')?.toString()?.trim() || null,
    email: getExcelValue(excelRow, '이메일')?.toString()?.trim() || null,
    
    // 추가 정보 필드들
    row_number: getExcelValue(excelRow, '연번') ? Number(getExcelValue(excelRow, '연번')) : null,
    department: getExcelValue(excelRow, '담당부서')?.toString()?.trim() || null,
    progress_status: getExcelValue(excelRow, '진행구분')?.toString()?.trim() || null,
    contract_document: getExcelValue(excelRow, '계약서')?.toString()?.trim() || null,
    order_request_date: convertExcelDate(getExcelValue(excelRow, '발주요청일')),
    wireless_document: getExcelValue(excelRow, '무선서류')?.toString()?.trim() || null,
    installation_support: getExcelValue(excelRow, '설치업무지원')?.toString()?.trim() || null,
    order_manager: getExcelValue(excelRow, '발주담당')?.toString()?.trim() || null,
    order_date: convertExcelDate(getExcelValue(excelRow, '발주일')),
    shipment_date: convertExcelDate(getExcelValue(excelRow, '출고일')),
    inventory_check: getExcelValue(excelRow, '재고파악')?.toString()?.trim() || null,
    installation_date: convertExcelDate(getExcelValue(excelRow, '설치일')),
    installation_team: getExcelValue(excelRow, '설치팀')?.toString()?.trim() || null,
    business_type: getExcelValue(excelRow, '업종')?.toString()?.trim() || null,
    business_category: getExcelValue(excelRow, '종별')?.toString()?.trim() || null,
    pollutants: getExcelValue(excelRow, '오염물질')?.toString()?.trim() || null,
    annual_emission_amount: getExcelValue(excelRow, '발생량(톤/년)') ? Number(getExcelValue(excelRow, '발생량(톤/년)')) : null,
    subsidy_approval_date: convertExcelDate(getExcelValue(excelRow, '보조금 승인일')),
    expansion_pack: getExcelValue(excelRow, '확장팩') ? Number(getExcelValue(excelRow, '확장팩')) : null,
    other_equipment: getExcelValue(excelRow, '기타')?.toString()?.trim() || null,
    additional_cost: getExcelValue(excelRow, '추가공사비') ? Number(getExcelValue(excelRow, '추가공사비')) : null,
    negotiation: getExcelValue(excelRow, '네고')?.toString()?.trim() || null,
    multiple_stack_cost: getExcelValue(excelRow, '복수굴뚝(설치비)') ? Number(getExcelValue(excelRow, '복수굴뚝(설치비)')) : null,
    
    // 시스템 정보
    manufacturer: manufacturerMap[manufacturerValue] || null,
    vpn: vpnMap[vpnValue] || null,
    greenlink_id: getExcelValue(excelRow, '그린링크ID')?.toString()?.trim() || null,
    greenlink_pw: getExcelValue(excelRow, '그린링크PW')?.toString()?.trim() || null,
    business_management_code: getExcelValue(excelRow, '사업장관리코드') ? Number(getExcelValue(excelRow, '사업장관리코드')) : null,
    sales_office: getExcelValue(excelRow, '영업점')?.toString()?.trim() || null,
    
    // 측정기기 수량 (CT 포함)
    ph_meter: getExcelValue(excelRow, 'PH센서') ? Number(getExcelValue(excelRow, 'PH센서')) : null,
    differential_pressure_meter: getExcelValue(excelRow, '차압계') ? Number(getExcelValue(excelRow, '차압계')) : null,
    temperature_meter: getExcelValue(excelRow, '온도계') ? Number(getExcelValue(excelRow, '온도계')) : null,
    discharge_current_meter: getExcelValue(excelRow, '배출전류계') ? Number(getExcelValue(excelRow, '배출전류계')) : null,
    fan_current_meter: getExcelValue(excelRow, '송풍전류계') ? Number(getExcelValue(excelRow, '송풍전류계')) : null,
    pump_current_meter: getExcelValue(excelRow, '펌프전류계') ? Number(getExcelValue(excelRow, '펌프전류계')) : null,
    gateway: getExcelValue(excelRow, '게이트웨이') ? Number(getExcelValue(excelRow, '게이트웨이')) : null,
    vpn_wired: getExcelValue(excelRow, 'VPN(유선)') ? Number(getExcelValue(excelRow, 'VPN(유선)')) : null,
    vpn_wireless: getExcelValue(excelRow, 'VPN(무선)') ? Number(getExcelValue(excelRow, 'VPN(무선)')) : null,
    explosion_proof_differential_pressure_meter_domestic: getExcelValue(excelRow, '방폭차압계(국산)') ? Number(getExcelValue(excelRow, '방폭차압계(국산)')) : null,
    explosion_proof_temperature_meter_domestic: getExcelValue(excelRow, '방폭온도계(국산)') ? Number(getExcelValue(excelRow, '방폭온도계(국산)')) : null,
    expansion_device: getExcelValue(excelRow, '확장디바이스') ? Number(getExcelValue(excelRow, '확장디바이스')) : null,
    representative_birth_date: convertExcelDate(getExcelValue(excelRow, '대표자생년월일')),

    // 제출일 관리 (착공신고서, 그린링크 전송확인서, 부착완료통보서)
    construction_report_submitted_at: convertExcelDate(getExcelValue(excelRow, '착공신고서제출일')),
    greenlink_confirmation_submitted_at: convertExcelDate(getExcelValue(excelRow, '그린링크전송확인서제출일')),
    attachment_completion_submitted_at: convertExcelDate(getExcelValue(excelRow, '부착완료통보서제출일')),
    attachment_support_application_date: convertExcelDate(getExcelValue(excelRow, '부착지원신청서신청일')),
    attachment_support_writing_date: convertExcelDate(getExcelValue(excelRow, '부착지원신청서작성일')),

    // 기존 필드들 (엑셀에 없어서 null로 설정)
    relay_8ch: null,
    relay_16ch: null,
    main_board_replacement: null,
    multiple_stack: null
  };
}

export const DELETE = withApiHandler(async (request: NextRequest) => {
  try {
    const body = await request.json();
    console.log('🗑️ [BUSINESS-MGMT] 사업장 삭제 요청:', body);
    
    // 실제 구현은 필요시 추가
    return createSuccessResponse({ 
      message: '사업장 정보는 읽기 전용입니다. 원본 시스템에서 수정해주세요.' 
    });
    
  } catch (error: any) {
    console.error('🔴 [BUSINESS-MGMT] 삭제 오류:', error);
    return createErrorResponse(error?.message || '사업장 삭제에 실패했습니다', 500);
  }
}, { logLevel: 'debug' });