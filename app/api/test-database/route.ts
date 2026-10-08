// app/api/test-database/route.ts - 데이터베이스 테스트 API
import { NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/lib/database-service'
import { supabase } from '@/lib/supabase'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';


// GET: 데이터베이스 연결 및 기능 테스트
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'connection'

  try {
    switch (action) {
      case 'connection':
        // 데이터베이스 연결 테스트
        const connectionTest = await DatabaseService.testConnection()
        
        if (connectionTest) {
          // 테이블 존재 확인
          const { data: tables, error } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .in('table_name', [
              'business_info', 
              'air_permit_info', 
              'discharge_outlets', 
              'discharge_facilities', 
              'prevention_facilities', 
              'data_history'
            ])

          if (error) {
            return NextResponse.json({
              success: false,
              message: '테이블 확인 중 오류 발생',
              error: error.message
            })
          }

          return NextResponse.json({
            success: true,
            message: 'Supabase 연결 성공',
            data: {
              tablesFound: tables?.length || 0,
              expectedTables: 6,
              tables: tables?.map(t => t.table_name) || []
            }
          })
        } else {
          return NextResponse.json({
            success: false,
            message: 'Supabase 연결 실패',
            error: '환경변수를 확인하세요'
          })
        }

      case 'sample-data':
        // 샘플 데이터 확인
        const businesses = await DatabaseService.getBusinessList()
        const summary = await DatabaseService.getBusinessSummary()
        
        return NextResponse.json({
          success: true,
          message: '샘플 데이터 조회 성공',
          data: {
            businessCount: businesses.length,
            businesses: businesses.slice(0, 3), // 처음 3개만 반환
            summary: summary.slice(0, 3)
          }
        })

      case 'create-test-business':
        // 테스트 사업장 생성
        const testBusiness = await DatabaseService.createBusiness({
          business_name: `테스트사업장_${Date.now()}`,
          local_government: '테스트시',
          address: '테스트 주소 123',
          manager_name: '테스트담당자',
          manager_position: '팀장',
          manager_contact: '010-0000-0000',
          business_contact: '02-0000-0000',
          fax_number: null,
          email: 'test@example.com',
          representative_name: '테스트대표',
          facility_summary: null,
          business_registration_number: '000-00-00000',
          manufacturer: 'ecosense',
          vpn: 'wired',
          greenlink_id: null,
          greenlink_pw: null,
          business_management_code: null,
          ph_meter: 1,
          differential_pressure_meter: 0,
          temperature_meter: 1,
          discharge_current_meter: null,
          fan_current_meter: null,
          pump_current_meter: null,
          gateway: null,
          vpn_wired: 1,
          vpn_wireless: 0,
          explosion_proof_differential_pressure_meter_domestic: null,
          explosion_proof_temperature_meter_domestic: null,
          expansion_device: null,
          relay_8ch: null,
          relay_16ch: null,
          main_board_replacement: null,
          multiple_stack: 0,
          sales_office: null,
          additional_info: { test: true },
          is_active: true,
          is_deleted: false,
          
          // 추가된 필드들 (null 값으로 설정)
          row_number: null,
          department: null,
          progress_status: null,
          contract_document: null,
          order_request_date: null,
          wireless_document: null,
          installation_support: null,
          order_manager: null,
          order_date: null,
          shipment_date: null,
          inventory_check: null,
          installation_date: null,
          installation_team: null,
          business_type: null,
          business_category: null,
          pollutants: null,
          annual_emission_amount: null,
          subsidy_approval_date: null,
          expansion_pack: null,
          other_equipment: null,
          additional_cost: null,
          negotiation: null,
          multiple_stack_cost: null,
          representative_birth_date: null
        })

        return NextResponse.json({
          success: true,
          message: '테스트 사업장 생성 성공',
          data: testBusiness
        })

      case 'history-test':
        // 데이터 이력 기능 테스트
        const history = await DatabaseService.getDataHistory({ limit: 10 })
        
        return NextResponse.json({
          success: true,
          message: '데이터 이력 조회 성공',
          data: {
            historyCount: history.length,
            recentHistory: history.slice(0, 5)
          }
        })

      default:
        return NextResponse.json({
          success: false,
          message: '올바르지 않은 액션입니다',
          availableActions: ['connection', 'sample-data', 'create-test-business', 'history-test']
        })
    }

  } catch (error: any) {
    console.error('Database test error:', error)
    return NextResponse.json({
      success: false,
      message: '테스트 실행 중 오류 발생',
      error: error.message
    }, { status: 500 })
  }
}