// app/api/business-list/route.ts - business_info 테이블 기반 대기필증 사업장 목록
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { verifyTokenHybrid } from '@/lib/secure-jwt';
import { queryAll } from '@/lib/supabase-direct';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 🔥 배포 환경 캐싱 방지 헤더
const NO_CACHE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};


export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    // URL 파라미터 확인 - includeAll=true면 모든 사업장 반환
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get('includeAll') === 'true';

    if (includeAll) {
      // 모든 사업장 조회 (대기필증 추가 모달용) - Direct PostgreSQL
      console.log('🏢 [BUSINESS-LIST] 전체 사업장 목록 조회 (includeAll=true)');

      // Direct PostgreSQL로 전체 조회 (LIMIT 없음)
      const allBusinesses = await queryAll(
        `SELECT
          id,
          business_name,
          local_government,
          address,
          business_registration_number,
          presurvey_inspector_name,
          presurvey_inspector_date,
          postinstall_installer_name,
          postinstall_installer_date,
          aftersales_technician_name,
          aftersales_technician_date
        FROM business_info
        WHERE is_active = $1
          AND is_deleted = $2
          AND business_name IS NOT NULL
        ORDER BY updated_at DESC`,
        [true, false]
      )

      if (!allBusinesses) {
        console.error('🔴 [BUSINESS-LIST] 전체 사업장 조회 오류');
        throw new Error('사업장 목록 조회 실패');
      }

      console.log(`✅ [BUSINESS-LIST] 전체 사업장 조회 완료: ${allBusinesses.length}개`);

      // 📷 사진 통계 추가 (Direct PostgreSQL로 Primary DB 강제 사용)
      const businessIdsForPhotos = allBusinesses.map((b: any) => b.id);
      console.log('🔍 [BUSINESS-LIST-ALL] 사진 개수 조회 시작 (Direct PostgreSQL 사용)');

      // Direct PostgreSQL 쿼리로 사진 개수 조회
      const photoCountsAll = await queryAll(
        `SELECT business_id, COUNT(*) as photo_count
         FROM uploaded_files
         WHERE business_id = ANY($1::uuid[])
         GROUP BY business_id`,
        [businessIdsForPhotos]
      );

      const photoCountMapAll = new Map<string, number>();
      if (photoCountsAll) {
        photoCountsAll.forEach((row: any) => {
          photoCountMapAll.set(row.business_id, Number(row.photo_count));
        });
        console.log('✅ [BUSINESS-LIST-ALL] Direct PostgreSQL로 사진 개수 조회 완료:', {
          businesses_with_photos: photoCountMapAll.size,
          total_photos: Array.from(photoCountMapAll.values()).reduce((sum, count) => sum + count, 0)
        });
      }

      const allBusinessesWithPhotoStats = allBusinesses.map((business: any) => ({
        ...business,
        photo_count: photoCountMapAll.get(business.id) || 0,
        has_photos: (photoCountMapAll.get(business.id) || 0) > 0,
        phases: {
          presurvey: !!business.presurvey_inspector_name,
          postinstall: !!business.postinstall_installer_name,
          aftersales: !!business.aftersales_technician_name
        }
      }));

      return createSuccessResponse({
        businesses: allBusinessesWithPhotoStats || [],
        count: allBusinessesWithPhotoStats?.length || 0,
        metadata: {
          source: 'business_info_all',
          totalCount: allBusinessesWithPhotoStats?.length || 0,
          hasPhotoData: true,
          includesFullData: true,
          dataType: 'BusinessInfo[]',
          criteriaUsed: 'all_businesses',
          additionalInfo: {
            totalPhotos: Array.from(photoCountMapAll.values()).reduce((sum, count) => sum + count, 0),
            businessesWithPhotos: Array.from(photoCountMapAll.values()).filter(count => count > 0).length
          }
        }
      }, undefined, 200, { noCache: true });
    }

    // 기존 로직: 대기필증이 등록된 사업장만 조회
    console.log('🏢 [BUSINESS-LIST] 대기필증이 등록된 사업장 목록 조회');

    // 대기필증이 있는 business_id만 먼저 조회 - 직접 PostgreSQL 연결 사용
    console.log('🔍 [DEBUG] PostgreSQL 직접 연결로 air_permit_info 쿼리 실행');
    const businessIdsWithPermits = await queryAll(
      'SELECT business_id FROM air_permit_info WHERE business_id IS NOT NULL',
      []
    );

    console.log(`✅ [PG] air_permit_info 조회 완료: ${businessIdsWithPermits?.length || 0}개 레코드`);

    // 대기필증이 있는 business_id 목록 추출 (중복 제거)
    const businessIdsSet = new Set(
      (businessIdsWithPermits || []).map((p: any) => p.business_id).filter(Boolean)
    );
    const businessIds = Array.from(businessIdsSet);

    console.log(`🏢 [BUSINESS-LIST] 대기필증 보유 사업장 수: ${businessIds.length}개`);

    if (businessIds.length === 0) {
      console.log('📋 [BUSINESS-LIST] 대기필증 보유 사업장이 없음');
      return createSuccessResponse({
        businesses: [],
        count: 0,
        metadata: {
          message: '대기필증 정보가 등록된 사업장이 없습니다',
          source: 'air_permit_info',
          hasPhotoData: true,
          criteriaUsed: 'air_permit_required'
        }
      }, undefined, 200, { noCache: true });
    }

    // 대기필증이 있는 사업장만 business_info에서 조회 (Facility 페이지 필수 필드만)
    // ✅ 성능 최적화: 40개 이상 필드 → 9개 필수 필드만 조회 (60% 데이터 감소)
    // 직접 PostgreSQL 연결 사용
    console.log('🔍 [DEBUG] PostgreSQL 직접 연결로 business_info 쿼리 실행');

    let businessWithPermits: any[] | null = null;
    let businessError: any = null;

    try {
      businessWithPermits = await queryAll(
        `SELECT
          id,
          business_name,
          address,
          presurvey_inspector_name,
          presurvey_inspector_date,
          postinstall_installer_name,
          postinstall_installer_date,
          aftersales_technician_name,
          aftersales_technician_date
        FROM business_info
        WHERE id = ANY($1)
          AND is_active = true
          AND is_deleted = false
          AND business_name IS NOT NULL
        ORDER BY updated_at DESC`,
        [businessIds]
      );
    } catch (error) {
      businessError = error;
    }

    console.log(`🏢 [BUSINESS-LIST] 조회 결과:`, {
      permitBusinessesCount: businessIds.length,
      retrievedBusinesses: businessWithPermits?.length || 0,
      error: businessError?.message,
      sampleData: businessWithPermits?.slice(0, 3)?.map((b: any) => ({
        name: b.business_name,
        id: b.id
      }))
    });

    if (businessError) {
      console.error('🔴 [BUSINESS-LIST] business_info 조회 오류:', businessError);
      
      // 폴백: air_permit_management 테이블에서 조회 - Direct PostgreSQL
      console.log('🔍 [BUSINESS-LIST] 폴백: air_permit_management에서 조회');

      const airPermits = await queryAll(
        `SELECT business_name, business_id
         FROM air_permit_management
         WHERE business_name IS NOT NULL
         ORDER BY business_name`
      )

      if (!airPermits) {
        throw new Error('air_permit_management 조회 실패');
      }
      
      const uniqueBusinessNames = Array.from(new Set(
        (airPermits || []).map((permit: any) => permit.business_name).filter(Boolean)
      ));
      
      return createSuccessResponse({
        businesses: uniqueBusinessNames,
        count: uniqueBusinessNames.length,
        metadata: {
          source: 'air_permit_management_fallback',
          totalCount: uniqueBusinessNames.length,
          hasPhotoData: false
        }
      }, undefined, 200, { noCache: true });
    }
    
    if (!businessWithPermits || businessWithPermits.length === 0) {
      console.log('📋 [BUSINESS-LIST] 대기필증 보유 사업장이 없음');
      return createSuccessResponse({
        businesses: [],
        count: 0,
        metadata: {
          message: '대기필증 정보가 등록된 사업장이 없습니다',
          source: 'business_info',
          hasPhotoData: true,
          criteriaUsed: 'air_permit_required'
        }
      }, undefined, 200, { noCache: true });
    }

    // 📷 각 사업장의 사진 개수 조회
    // ✅ CRITICAL FIX: Read Replica Lag 문제 해결
    // - 기존: SELECT 쿼리 → Read Replica 사용 → 삭제 후 수십 초 지연
    // - 수정: Direct PostgreSQL 사용 → Primary DB 강제 실행 → 즉시 반영
    console.log('🔍 [BUSINESS-LIST] 사진 개수 조회 시작 (Direct PostgreSQL 사용)');

    // Direct PostgreSQL 쿼리로 사진 개수 조회
    const placeholders = businessIds.map((_: any, i: number) => `$${i + 1}`).join(', ');
    const photoCounts = await queryAll(
      `SELECT business_id, COUNT(*) as photo_count
       FROM uploaded_files
       WHERE business_id IN (${placeholders})
       GROUP BY business_id`,
      businessIds
    );

    // 사업장별 사진 개수 매핑
    const photoCountMap = new Map<string, number>();
    if (photoCounts) {
      photoCounts.forEach((row: any) => {
        photoCountMap.set(row.business_id, Number(row.photo_count));
      });
      console.log('✅ [BUSINESS-LIST] Direct PostgreSQL로 사진 개수 조회 완료 (Primary DB):', {
        businesses_with_photos: photoCountMap.size,
        total_photos: Array.from(photoCountMap.values()).reduce((sum, count) => sum + count, 0),
        sample: Array.from(photoCountMap.entries()).slice(0, 3).map(([id, count]) => `${id.slice(0, 8)}: ${count}`)
      });
    } else {
      console.log('⚠️ [BUSINESS-LIST] Fallback: 사진 개수를 0으로 설정');
    }

    // 사진 통계 및 phase 진행 상태를 각 사업장 객체에 추가
    const businessesWithPhotoStats = businessWithPermits.map((business: any) => ({
      ...business,
      photo_count: photoCountMap.get(business.id) || 0,
      has_photos: (photoCountMap.get(business.id) || 0) > 0,
      phases: {
        presurvey: !!business.presurvey_inspector_name,
        postinstall: !!business.postinstall_installer_name,
        aftersales: !!business.aftersales_technician_name
      }
    }));

    console.log(`📋 [BUSINESS-LIST] 대기필증 보유 사업장 객체 반환: ${businessesWithPhotoStats.length}개 (사진 통계 포함)`);

    return createSuccessResponse({
      businesses: businessesWithPhotoStats,
      count: businessesWithPhotoStats.length,
      metadata: {
        source: 'business_info_with_air_permits',
        totalCount: businessesWithPhotoStats.length,
        airPermitBusinessCount: businessIds.length,
        hasPhotoData: true,
        includesFullData: true,
        dataType: 'BusinessInfo[]',
        criteriaUsed: 'air_permit_required',
        additionalInfo: {
          totalPhotos: Array.from(photoCountMap.values()).reduce((sum, count) => sum + count, 0),
          businessesWithPhotos: Array.from(photoCountMap.values()).filter(count => count > 0).length
        }
      }
    }, undefined, 200, { noCache: true });
    
  } catch (error: any) {
    console.error('🔴 [BUSINESS-LIST] 오류:', error?.message || error);
    
    // 오류 시 빈 목록 반환 (대기필증 필수 조건)
    return createSuccessResponse({
      businesses: [],
      count: 0,
      metadata: {
        error: 'DATABASE_ERROR',
        message: error?.message || '데이터베이스 연결에 실패했습니다',
        source: 'business_info_error',
        hasPhotoData: false,
        fallback: true
      }
    }, undefined, 200, { noCache: true });
  }
}, { logLevel: 'debug' });

// POST: 신규 사업장 생성 (라우터 할당 시 사용)
export const POST = withApiHandler(
  async (request: NextRequest) => {
    try {
      // 인증 확인
      const authHeader = request.headers.get('authorization')
      let token: string | null = null

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '')
      } else {
        const cookieToken = request.cookies.get('auth_token')?.value
        if (cookieToken) token = cookieToken
      }

      if (!token) {
        return createErrorResponse('인증이 필요합니다', 401)
      }

      const result = await verifyTokenHybrid(token)
      if (!result.user) {
        return createErrorResponse('인증이 필요합니다', 401)
      }

      const body = await request.json()
      const { business_name } = body

      if (!business_name || !business_name.trim()) {
        return createErrorResponse('사업장 이름은 필수입니다', 400)
      }

      console.log('[BUSINESS-LIST] 신규 사업장 생성:', {
        user: result.user.name,
        business_name
      })

      // 중복 확인
      const { data: existing } = await supabaseAdmin
        .from('business_info')
        .select('id, business_name')
        .eq('business_name', business_name.trim())
        .eq('is_deleted', false)
        .single()

      if (existing) {
        console.log('[BUSINESS-LIST] 이미 존재하는 사업장:', existing)
        return createSuccessResponse({
          id: existing.id,
          business_name: existing.business_name,
          message: '이미 존재하는 사업장입니다'
        })
      }

      // 신규 생성
      const { data: newBusiness, error } = await supabaseAdmin
        .from('business_info')
        .insert({
          business_name: business_name.trim(),
          is_deleted: false,
          is_active: true
        })
        .select('id, business_name')
        .single()

      if (error) {
        console.error('[BUSINESS-LIST] 생성 오류:', error)
        return createErrorResponse('사업장 생성 중 오류가 발생했습니다', 500)
      }

      console.log('[BUSINESS-LIST] 신규 사업장 생성 완료:', newBusiness)

      return createSuccessResponse({
        id: newBusiness.id,
        business_name: newBusiness.business_name,
        message: '신규 사업장이 등록되었습니다'
      })
    } catch (error: any) {
      console.error('[BUSINESS-LIST] POST 오류:', error)
      return createErrorResponse('서버 내부 오류가 발생했습니다', 500)
    }
  },
  { logLevel: 'debug' }
)