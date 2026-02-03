// scripts/verify-migration.js - 마이그레이션 검증 스크립트
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uvdvfsjekqshxtxthxeq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZHZmc2pla3FzaHh0eHRoeGVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE1NDA3NywiZXhwIjoyMDgyNzMwMDc3fQ.yk5uwhcA3lHAJDp7LGfcMwIpX5k04qS1glNBILRwvPo';

const supabase = createClient(supabaseUrl, supabaseKey);

// 마이그레이션 매핑 정의
const MIGRATION_MAP = {
  // dealer 타입
  'dealer': {
    'product_order': 'dealer_product_ordered',
    'product_shipment': 'dealer_product_shipped',
    'installation_schedule': 'dealer_installation_schedule',
    'installation': 'dealer_installation',
    'deposit_confirm': 'dealer_deposit_confirm',
    'balance_payment': 'dealer_balance_payment',
    'document_complete': 'dealer_document_complete'
  },
  // self 타입
  'self': {
    'product_order': 'self_product_order',
    'product_shipment': 'self_product_shipment',
    'installation_schedule': 'self_installation_schedule',
    'installation': 'self_installation',
    'deposit_confirm': 'self_deposit_confirm',
    'balance_payment': 'self_balance_payment',
    'document_complete': 'self_document_complete'
  },
  // subsidy 타입
  'subsidy': {
    'product_order': 'subsidy_product_order',
    'product_shipment': 'subsidy_product_shipment',
    'installation_schedule': 'subsidy_installation_schedule',
    'installation': 'subsidy_installation',
    'document_preparation': 'subsidy_document_preparation',
    'application_submit': 'subsidy_application_submit',
    'approval_pending': 'subsidy_approval_pending',
    'approved': 'subsidy_approved',
    'rejected': 'subsidy_rejected',
    'document_supplement': 'subsidy_document_supplement',
    'pre_construction_inspection': 'subsidy_pre_construction_inspection',
    'pre_construction_supplement_1st': 'subsidy_pre_construction_supplement_1st',
    'pre_construction_supplement_2nd': 'subsidy_pre_construction_supplement_2nd',
    'construction_report_submit': 'subsidy_construction_report_submit',
    'pre_completion_document_submit': 'subsidy_pre_completion_document_submit',
    'completion_inspection': 'subsidy_completion_inspection',
    'completion_supplement_1st': 'subsidy_completion_supplement_1st',
    'completion_supplement_2nd': 'subsidy_completion_supplement_2nd',
    'completion_supplement_3rd': 'subsidy_completion_supplement_3rd',
    'final_document_submit': 'subsidy_final_document_submit',
    'subsidy_payment': 'subsidy_payment'
  }
};

async function verifyMigration() {
  console.log('\n📋 [VERIFY] 마이그레이션 검증 시작...\n');

  // 모든 활성 업무 조회
  const { data: tasks, error } = await supabase
    .from('facility_tasks')
    .select('id, title, business_name, task_type, status, created_at')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ 조회 오류:', error);
    return;
  }

  console.log(`✅ 전체 활성 업무: ${tasks?.length || 0}개\n`);

  // 마이그레이션 시뮬레이션
  const migrationPlan = [];
  let totalToMigrate = 0;

  tasks?.forEach(task => {
    const typeMap = MIGRATION_MAP[task.task_type];
    if (typeMap && typeMap[task.status]) {
      const newStatus = typeMap[task.status];
      migrationPlan.push({
        id: task.id,
        business_name: task.business_name,
        task_type: task.task_type,
        old_status: task.status,
        new_status: newStatus
      });
      totalToMigrate++;
    }
  });

  console.log('📊 마이그레이션 계획:\n');
  console.log(`  총 마이그레이션 대상: ${totalToMigrate}개\n`);

  // task_type별 그룹화
  const groupedByType = {};
  migrationPlan.forEach(plan => {
    if (!groupedByType[plan.task_type]) {
      groupedByType[plan.task_type] = [];
    }
    groupedByType[plan.task_type].push(plan);
  });

  Object.entries(groupedByType).forEach(([taskType, plans]) => {
    console.log(`  📌 [${taskType}] ${plans.length}개:`);

    // status별 그룹화
    const statusCount = {};
    plans.forEach(plan => {
      const key = `${plan.old_status} → ${plan.new_status}`;
      statusCount[key] = (statusCount[key] || 0) + 1;
    });

    Object.entries(statusCount).forEach(([transition, count]) => {
      console.log(`    - ${transition}: ${count}개`);
    });
    console.log('');
  });

  // 상위 5개 업무 상세 표시
  console.log('\n📝 마이그레이션 예시 (상위 5개):\n');
  migrationPlan.slice(0, 5).forEach((plan, index) => {
    console.log(`  ${index + 1}. ${plan.business_name}`);
    console.log(`     ID: ${plan.id}`);
    console.log(`     Type: ${plan.task_type}`);
    console.log(`     변경: ${plan.old_status} → ${plan.new_status}\n`);
  });

  // 마이그레이션 되지 않을 항목 확인
  const notMigrating = tasks?.filter(task => {
    const typeMap = MIGRATION_MAP[task.task_type];
    return !typeMap || !typeMap[task.status];
  });

  console.log(`\n✅ 마이그레이션 불필요 (이미 prefix 있거나 공통 status): ${notMigrating?.length || 0}개\n`);

  // 공통 status 통계
  const commonStatuses = ['pending', 'customer_contact', 'site_inspection', 'quotation', 'contract'];
  const commonStatusCount = {};
  notMigrating?.forEach(task => {
    if (commonStatuses.includes(task.status)) {
      commonStatusCount[task.status] = (commonStatusCount[task.status] || 0) + 1;
    }
  });

  if (Object.keys(commonStatusCount).length > 0) {
    console.log('  📊 공통 status 분포:');
    Object.entries(commonStatusCount).forEach(([status, count]) => {
      console.log(`    - ${status}: ${count}개`);
    });
  }

  return {
    total: tasks?.length || 0,
    toMigrate: totalToMigrate,
    notMigrating: notMigrating?.length || 0,
    migrationPlan
  };
}

verifyMigration().then((result) => {
  console.log('\n✅ 검증 완료');
  console.log('\n📊 최종 통계:');
  console.log(`  - 전체 업무: ${result.total}개`);
  console.log(`  - 마이그레이션 대상: ${result.toMigrate}개`);
  console.log(`  - 마이그레이션 불필요: ${result.notMigrating}개`);
  console.log('\n');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ 검증 오류:', error);
  process.exit(1);
});
