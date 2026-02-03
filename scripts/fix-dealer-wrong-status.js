// scripts/fix-dealer-wrong-status.js - 대리점 업무의 잘못된 subsidy_payment → dealer_product_ordered 수정
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uvdvfsjekqshxtxthxeq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZHZmc2pla3FzaHh0eHRoeGVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE1NDA3NywiZXhwIjoyMDgyNzMwMDc3fQ.yk5uwhcA3lHAJDp7LGfcMwIpX5k04qS1glNBILRwvPo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDealerWrongStatus() {
  console.log('\n🔧 [FIX] 대리점 업무의 잘못된 status 수정...\n');
  console.log('⚠️  주의: 이 작업은 되돌릴 수 없습니다!\n');

  // 3초 대기
  console.log('3초 후 시작합니다...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 1. dealer 타입이면서 subsidy_payment status를 가진 업무 조회
  const { data: wrongTasks, error: fetchError } = await supabase
    .from('facility_tasks')
    .select('id, business_name, task_type, status, title')
    .eq('task_type', 'dealer')
    .eq('status', 'subsidy_payment')
    .eq('is_active', true)
    .eq('is_deleted', false);

  if (fetchError) {
    console.error('❌ 조회 실패:', fetchError);
    return;
  }

  console.log(`✅ 수정 대상 조회 완료: ${wrongTasks.length}개\n`);

  if (wrongTasks.length === 0) {
    console.log('✅ 수정 대상이 없습니다.\n');
    return { success: 0, failed: 0, total: 0 };
  }

  console.log('📋 수정 대상 목록:\n');
  wrongTasks.forEach((task, index) => {
    console.log(`  ${index + 1}. [${task.business_name}]`);
    console.log(`     제목: ${task.title}`);
    console.log(`     현재 status: ${task.status} ❌`);
    console.log(`     → dealer_product_ordered ✅\n`);
  });

  // 2. 수정 실행
  let successCount = 0;
  let failedCount = 0;

  console.log('🔄 수정 시작...\n');

  for (const task of wrongTasks) {
    const { error } = await supabase
      .from('facility_tasks')
      .update({
        status: 'dealer_product_ordered',
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id);

    if (error) {
      console.error(`  ❌ ${task.business_name}: 수정 실패`);
      console.error(`     오류: ${error.message}`);
      failedCount++;
    } else {
      console.log(`  ✅ ${task.business_name}: subsidy_payment → dealer_product_ordered`);
      successCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 수정 완료 요약\n');
  console.log(`  ✅ 성공: ${successCount}개`);
  console.log(`  ❌ 실패: ${failedCount}개`);
  console.log(`  📊 전체: ${wrongTasks.length}개`);
  console.log('='.repeat(60) + '\n');

  console.log('ℹ️  원인: 엑셀 일괄등록 시 getStatusCodeFromKorean 함수가');
  console.log('   task_type을 고려하지 않아 잘못된 status 매핑됨.');
  console.log('   → app/api/admin/tasks/bulk-upload/route.ts 수정 완료\n');

  return { success: successCount, failed: failedCount, total: wrongTasks.length };
}

fixDealerWrongStatus().then((result) => {
  if (!result) {
    console.log('✅ 수정 대상이 없습니다.\n');
    process.exit(0);
  }

  if (result.failed > 0) {
    console.log('⚠️  일부 항목이 실패했습니다.\n');
    process.exit(1);
  } else {
    console.log('✅ 모든 수정이 성공적으로 완료되었습니다!\n');
    process.exit(0);
  }
}).catch(error => {
  console.error('\n❌ 오류:', error);
  process.exit(1);
});
