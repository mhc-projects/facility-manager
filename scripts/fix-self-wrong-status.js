// scripts/fix-self-wrong-status.js - 자비 업무의 잘못된 보조금 상태 수정
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uvdvfsjekqshxtxthxeq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZHZmc2pla3FzaHh0eHRoeGVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE1NDA3NywiZXhwIjoyMDgyNzMwMDc3fQ.yk5uwhcA3lHAJDp7LGfcMwIpX5k04qS1glNBILRwvPo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findSelfWithSubsidyStatus() {
  console.log('\n🔍 자비 업무 중 보조금 상태를 가진 사업장 조회...\n');

  // 1. task_type이 'self'인데 status가 'subsidy_'로 시작하는 업무 조회
  const { data: tasks, error } = await supabase
    .from('facility_tasks')
    .select('id, business_name, task_type, status, title, created_at, assignee')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .eq('task_type', 'self')
    .like('status', 'subsidy_%')
    .order('business_name')
    .order('created_at');

  if (error) {
    console.error('❌ 조회 실패:', error);
    return null;
  }

  console.log(`📊 발견된 업무 수: ${tasks.length}개\n`);
  console.log('='.repeat(100));

  if (tasks.length === 0) {
    console.log('\n✅ 자비 업무 중 보조금 상태를 가진 업무가 없습니다.\n');
    return [];
  }

  // 2. 사업장별 그룹핑
  const businessGroups = {};
  tasks.forEach(task => {
    if (!businessGroups[task.business_name]) {
      businessGroups[task.business_name] = [];
    }
    businessGroups[task.business_name].push(task);
  });

  // 3. 결과 출력
  console.log('\n📋 자비 업무인데 보조금 상태를 가진 사업장:\n');

  Object.entries(businessGroups).forEach(([businessName, businessTasks], index) => {
    console.log(`[${index + 1}] ${businessName}`);
    console.log(`    업무 수: ${businessTasks.length}개`);

    businessTasks.forEach((task, i) => {
      console.log(`    ${i + 1}. ID: ${task.id}`);
      console.log(`       제목: ${task.title || '(제목 없음)'}`);
      console.log(`       업무타입: ${task.task_type}`);
      console.log(`       현재상태: ${task.status}`);
      console.log(`       담당자: ${task.assignee || '미배정'}`);
      console.log(`       생성일: ${new Date(task.created_at).toLocaleString('ko-KR')}`);
    });
    console.log('');
  });

  console.log('='.repeat(100));
  console.log(`\n💡 수정 방법:`);
  console.log(`   모든 자비 업무의 보조금 상태를 'self_document_complete'(서류 발송 완료)로 변경하려면`);
  console.log(`   다음 명령어를 실행하세요:\n`);
  console.log(`   node scripts/fix-self-wrong-status.js --fix\n`);

  return tasks;
}

async function fixSelfWithSubsidyStatus() {
  console.log('\n⚠️  자비 업무의 보조금 상태를 서류 발송 완료로 수정합니다.\n');
  console.log('3초 후 시작합니다...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 1. 수정 대상 조회
  const { data: tasks, error: fetchError } = await supabase
    .from('facility_tasks')
    .select('id, business_name, task_type, status, title')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .eq('task_type', 'self')
    .like('status', 'subsidy_%');

  if (fetchError) {
    console.error('❌ 조회 실패:', fetchError);
    return { success: 0, failed: 0, total: 0 };
  }

  if (tasks.length === 0) {
    console.log('✅ 수정할 업무가 없습니다.\n');
    return { success: 0, failed: 0, total: 0 };
  }

  console.log(`📋 수정 대상: ${tasks.length}개\n`);
  console.log('='.repeat(100));

  // 2. 수정 미리보기
  console.log('\n🔍 수정 대상 미리보기:\n');
  tasks.forEach((task, index) => {
    console.log(`[${index + 1}] ${task.business_name}`);
    console.log(`    현재: ${task.status}`);
    console.log(`    변경: self_document_complete (서류 발송 완료)`);
    console.log(`    제목: ${task.title || '(제목 없음)'}`);
    console.log('');
  });

  console.log('='.repeat(100));
  console.log(`\n⚠️  총 ${tasks.length}개 업무의 상태를 변경하시겠습니까?\n`);
  console.log('5초 후 수정이 시작됩니다... (Ctrl+C로 취소)\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 3. 수정 실행
  let successCount = 0;
  let failedCount = 0;

  console.log('🔄 수정 시작...\n');

  for (const task of tasks) {
    const { error } = await supabase
      .from('facility_tasks')
      .update({
        status: 'self_document_complete',
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id);

    if (error) {
      console.error(`  ❌ ${task.business_name}: 수정 실패`);
      console.error(`     오류: ${error.message}`);
      failedCount++;
    } else {
      console.log(`  ✅ ${task.business_name}: ${task.status} → self_document_complete`);
      successCount++;
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('📊 수정 완료 요약\n');
  console.log(`  ✅ 성공: ${successCount}개`);
  console.log(`  ❌ 실패: ${failedCount}개`);
  console.log(`  📊 전체: ${tasks.length}개`);
  console.log('='.repeat(100) + '\n');

  return { success: successCount, failed: failedCount, total: tasks.length };
}

// 메인 실행
const isFix = process.argv.includes('--fix');

if (isFix) {
  fixSelfWithSubsidyStatus().then((result) => {
    if (!result || result.total === 0) {
      console.log('✅ 수정할 대상이 없습니다.\n');
      process.exit(0);
    }

    if (result.failed > 0) {
      console.log('⚠️  일부 항목이 실패했습니다.\n');
      process.exit(1);
    } else {
      console.log('✅ 모든 업무가 성공적으로 수정되었습니다!\n');
      process.exit(0);
    }
  }).catch(error => {
    console.error('\n❌ 오류:', error);
    process.exit(1);
  });
} else {
  findSelfWithSubsidyStatus().then((tasks) => {
    if (tasks && tasks.length > 0) {
      console.log('💡 수정하려면 --fix 옵션을 추가하여 다시 실행하세요:\n');
      console.log('   node scripts/fix-self-wrong-status.js --fix\n');
    }
    process.exit(0);
  }).catch(error => {
    console.error('\n❌ 오류:', error);
    process.exit(1);
  });
}
