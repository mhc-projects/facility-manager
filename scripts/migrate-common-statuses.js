// scripts/migrate-common-statuses.js - 공통 status에 prefix 적용
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uvdvfsjekqshxtxthxeq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZHZmc2pla3FzaHh0eHRoeGVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE1NDA3NywiZXhwIjoyMDgyNzMwMDc3fQ.yk5uwhcA3lHAJDp7LGfcMwIpX5k04qS1glNBILRwvPo';

const supabase = createClient(supabaseUrl, supabaseKey);

// 공통 status 매핑: type별로 적절한 prefix 적용
const commonStatusMappings = {
  'customer_contact': {
    'self': 'self_customer_contact',
    'subsidy': 'subsidy_customer_contact',
    'as': 'as_customer_contact',
    'dealer': 'customer_contact', // dealer는 공통 단계 사용 안 함
    'outsourcing': 'customer_contact', // outsourcing도 공통 단계 사용 안 함
    'etc': 'customer_contact' // etc도 유지
  },
  'site_inspection': {
    'self': 'self_site_inspection',
    'subsidy': 'subsidy_site_inspection',
    'as': 'as_site_inspection',
    'dealer': 'site_inspection',
    'outsourcing': 'site_inspection',
    'etc': 'site_inspection'
  },
  'quotation': {
    'self': 'self_quotation',
    'subsidy': 'subsidy_quotation',
    'as': 'as_quotation',
    'dealer': 'quotation',
    'outsourcing': 'quotation',
    'etc': 'quotation'
  },
  'contract': {
    'self': 'self_contract',
    'subsidy': 'subsidy_contract',
    'as': 'as_contract',
    'dealer': 'contract',
    'outsourcing': 'contract',
    'etc': 'contract'
  },
  'document_complete': {
    'self': 'self_document_complete',
    'subsidy': 'self_document_complete', // subsidy는 별도의 document_complete가 없음
    'as': 'document_complete',
    'dealer': 'document_complete',
    'outsourcing': 'document_complete',
    'etc': 'document_complete'
  }
};

async function migrateCommonStatuses() {
  console.log('\n🔧 [MIGRATION] 공통 status prefix 적용 시작...\n');
  console.log('⚠️  주의: 이 작업은 되돌릴 수 없습니다!\n');

  // 5초 대기
  console.log('5초 후 시작합니다...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 1. 공통 status 사용 중인 모든 업무 조회
  const { data: tasks, error: fetchError } = await supabase
    .from('facility_tasks')
    .select('id, business_name, task_type, status')
    .in('status', ['customer_contact', 'site_inspection', 'quotation', 'contract', 'document_complete'])
    .eq('is_active', true)
    .eq('is_deleted', false);

  if (fetchError) {
    console.error('❌ 조회 실패:', fetchError);
    return;
  }

  console.log(`✅ 전체 활성 업무 조회 완료: ${tasks.length}개\n`);

  if (tasks.length === 0) {
    console.log('✅ 마이그레이션 대상이 없습니다.\n');
    return;
  }

  // 2. task_type별로 그룹화
  const tasksByType = tasks.reduce((acc, task) => {
    if (!acc[task.task_type]) acc[task.task_type] = [];
    acc[task.task_type].push(task);
    return acc;
  }, {});

  console.log('📊 마이그레이션 대상:\n');
  for (const [type, typeTasks] of Object.entries(tasksByType)) {
    console.log(`  ${type}: ${typeTasks.length}개`);
    const statusCounts = typeTasks.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});
    for (const [status, count] of Object.entries(statusCounts)) {
      const mapping = commonStatusMappings[status];
      const newStatus = mapping ? mapping[type] : status;
      console.log(`    - ${status} → ${newStatus}: ${count}개`);
    }
  }
  console.log();

  // 3. 마이그레이션 실행
  let successCount = 0;
  let failedCount = 0;
  const batchSize = 10;

  console.log(`🔄 마이그레이션 시작 (배치 크기: ${batchSize})\n`);

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    console.log(`🔄 배치 ${Math.floor(i / batchSize) + 1}/${Math.ceil(tasks.length / batchSize)} 처리 중... (${batch.length}개)\n`);

    for (const task of batch) {
      const mapping = commonStatusMappings[task.status];
      if (!mapping) {
        console.log(`  ⚠️  ${task.business_name}: ${task.status} - 매핑 없음, 스킵`);
        continue;
      }

      const newStatus = mapping[task.task_type];

      // status가 같으면 업데이트 불필요
      if (newStatus === task.status) {
        console.log(`  ➡️  ${task.business_name}: ${task.status} - 변경 불필요`);
        successCount++;
        continue;
      }

      const { error } = await supabase
        .from('facility_tasks')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (error) {
        console.error(`  ❌ ${task.business_name}: ${task.status} → ${newStatus} 실패`);
        console.error(`     오류: ${error.message}`);
        failedCount++;
      } else {
        console.log(`  ✅ ${task.business_name}: ${task.status} → ${newStatus}`);
        successCount++;
      }
    }

    console.log(`\n  진행률: ${Math.round(((i + batch.length) / tasks.length) * 100)}% (${i + batch.length}/${tasks.length})\n`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 마이그레이션 완료 요약\n');
  console.log(`  ✅ 성공: ${successCount}개`);
  console.log(`  ❌ 실패: ${failedCount}개`);
  console.log(`  📊 전체: ${tasks.length}개`);
  console.log('='.repeat(60) + '\n');

  return { success: successCount, failed: failedCount, total: tasks.length };
}

migrateCommonStatuses().then((result) => {
  if (!result) {
    console.log('✅ 마이그레이션 대상이 없습니다.\n');
    process.exit(0);
  }

  if (result.failed > 0) {
    console.log('⚠️  일부 항목이 실패했습니다.\n');
    process.exit(1);
  } else {
    console.log('✅ 모든 마이그레이션이 성공적으로 완료되었습니다!\n');
    process.exit(0);
  }
}).catch(error => {
  console.error('\n❌ 오류:', error);
  process.exit(1);
});
