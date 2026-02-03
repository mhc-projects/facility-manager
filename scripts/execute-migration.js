// scripts/execute-migration.js - 마이그레이션 실행 스크립트
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

async function executeMigration() {
  console.log('\n🚀 [MIGRATION] 마이그레이션 실행 시작...\n');
  console.log('⚠️  주의: 이 작업은 되돌릴 수 없습니다!\n');

  // 5초 대기
  console.log('5초 후 시작합니다...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 모든 활성 업무 조회
  const { data: tasks, error: fetchError } = await supabase
    .from('facility_tasks')
    .select('id, title, business_name, task_type, status')
    .eq('is_active', true)
    .eq('is_deleted', false);

  if (fetchError) {
    console.error('❌ 업무 조회 오류:', fetchError);
    return;
  }

  console.log(`\n✅ 전체 활성 업무 조회 완료: ${tasks?.length || 0}개\n`);

  // 마이그레이션 대상 식별
  const toMigrate = [];
  tasks?.forEach(task => {
    const typeMap = MIGRATION_MAP[task.task_type];
    if (typeMap && typeMap[task.status]) {
      toMigrate.push({
        id: task.id,
        business_name: task.business_name,
        task_type: task.task_type,
        old_status: task.status,
        new_status: typeMap[task.status]
      });
    }
  });

  console.log(`📊 마이그레이션 대상: ${toMigrate.length}개\n`);

  if (toMigrate.length === 0) {
    console.log('✅ 마이그레이션이 필요한 항목이 없습니다.\n');
    return { success: 0, failed: 0 };
  }

  // 배치 업데이트 실행
  let successCount = 0;
  let failedCount = 0;
  const batchSize = 10;

  for (let i = 0; i < toMigrate.length; i += batchSize) {
    const batch = toMigrate.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(toMigrate.length / batchSize);

    console.log(`\n🔄 배치 ${batchNum}/${totalBatches} 처리 중... (${batch.length}개)`);

    for (const item of batch) {
      const { error: updateError } = await supabase
        .from('facility_tasks')
        .update({
          status: item.new_status,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (updateError) {
        console.error(`  ❌ 실패: ${item.business_name} (${item.id})`);
        console.error(`     오류:`, updateError.message);
        failedCount++;
      } else {
        console.log(`  ✅ ${item.business_name}: ${item.old_status} → ${item.new_status}`);
        successCount++;
      }
    }

    // 진행률 표시
    const progress = Math.round(((i + batch.length) / toMigrate.length) * 100);
    console.log(`\n  진행률: ${progress}% (${successCount + failedCount}/${toMigrate.length})`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 마이그레이션 완료 요약\n');
  console.log(`  ✅ 성공: ${successCount}개`);
  console.log(`  ❌ 실패: ${failedCount}개`);
  console.log(`  📊 전체: ${toMigrate.length}개`);
  console.log('='.repeat(60) + '\n');

  return { success: successCount, failed: failedCount };
}

// 실행
executeMigration().then((result) => {
  if (result.failed > 0) {
    console.log('⚠️  일부 항목이 실패했습니다. 로그를 확인하세요.\n');
    process.exit(1);
  } else {
    console.log('✅ 모든 마이그레이션이 성공적으로 완료되었습니다!\n');
    process.exit(0);
  }
}).catch(error => {
  console.error('\n❌ 마이그레이션 오류:', error);
  process.exit(1);
});
