// scripts/delete-duplicate-tasks.js - 중복 업무 삭제 (soft delete)
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uvdvfsjekqshxtxthxeq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZHZmc2pla3FzaHh0eHRoeGVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE1NDA3NywiZXhwIjoyMDgyNzMwMDc3fQ.yk5uwhcA3lHAJDp7LGfcMwIpX5k04qS1glNBILRwvPo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteDuplicates() {
  console.log('\n🔍 중복 업무 삭제 시작...\n');
  console.log('⚠️  주의: 이 작업은 soft delete (is_deleted=true)로 진행되므로 복구 가능합니다.\n');

  // 3초 대기
  console.log('3초 후 시작합니다...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 1. 중복 업무 조회
  const { data: tasks, error } = await supabase
    .from('facility_tasks')
    .select('id, business_name, task_type, status, title, created_at')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('business_name')
    .order('task_type')
    .order('status')
    .order('created_at');

  if (error) {
    console.error('❌ 조회 실패:', error);
    return;
  }

  // 2. 중복 그룹 찾기
  const groups = {};
  tasks.forEach(task => {
    const key = `${task.business_name}|${task.task_type}|${task.status}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(task);
  });

  // 3. 중복만 필터링 (2개 이상)
  const duplicates = Object.entries(groups).filter(([key, tasks]) => tasks.length > 1);

  if (duplicates.length === 0) {
    console.log('✅ 중복된 업무가 없습니다.\n');
    return { success: 0, failed: 0, total: 0 };
  }

  // 4. 삭제 대상 수집
  const tasksToDelete = [];
  duplicates.forEach(([key, groupTasks]) => {
    // 생성일 기준 정렬 (최신순)
    const sorted = groupTasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // 최신 1개 제외하고 나머지 삭제 대상
    const toDelete = sorted.slice(1);
    tasksToDelete.push(...toDelete);
  });

  console.log(`📋 삭제 대상: ${tasksToDelete.length}개\n`);
  console.log('='.repeat(100));

  // 5. 삭제 대상 미리보기
  console.log('\n🔍 삭제 대상 미리보기:\n');

  const preview = {};
  tasksToDelete.forEach(task => {
    const key = `${task.business_name}|${task.task_type}|${task.status}`;
    if (!preview[key]) {
      preview[key] = [];
    }
    preview[key].push(task);
  });

  Object.entries(preview).forEach(([key, tasks], index) => {
    const [business, type, status] = key.split('|');
    console.log(`[${index + 1}] ${business} / ${type} / ${status}`);
    console.log(`    삭제 예정: ${tasks.length}개`);

    tasks.forEach((task, i) => {
      console.log(`    ${i + 1}. ${task.title || '(제목 없음)'}`);
      console.log(`       ID: ${task.id}`);
      console.log(`       생성일: ${new Date(task.created_at).toLocaleString('ko-KR')}`);
    });
    console.log('');
  });

  console.log('='.repeat(100));
  console.log(`\n⚠️  총 ${tasksToDelete.length}개 업무를 삭제하시겠습니까?\n`);
  console.log('5초 후 삭제가 시작됩니다... (Ctrl+C로 취소)\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  // 6. 삭제 실행 (soft delete)
  let successCount = 0;
  let failedCount = 0;

  console.log('🔄 삭제 시작...\n');

  for (const task of tasksToDelete) {
    const { error } = await supabase
      .from('facility_tasks')
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id);

    if (error) {
      console.error(`  ❌ ${task.business_name}: 삭제 실패`);
      console.error(`     오류: ${error.message}`);
      failedCount++;
    } else {
      console.log(`  ✅ ${task.business_name}: ${task.title || '(제목 없음)'} 삭제`);
      successCount++;
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('📊 삭제 완료 요약\n');
  console.log(`  ✅ 성공: ${successCount}개`);
  console.log(`  ❌ 실패: ${failedCount}개`);
  console.log(`  📊 전체: ${tasksToDelete.length}개`);
  console.log('='.repeat(100) + '\n');

  console.log('ℹ️  복구 방법:');
  console.log('   UPDATE facility_tasks SET is_deleted = false WHERE id = \'[task_id]\';');
  console.log('\n');

  return { success: successCount, failed: failedCount, total: tasksToDelete.length };
}

deleteDuplicates().then((result) => {
  if (!result) {
    console.log('✅ 삭제 대상이 없습니다.\n');
    process.exit(0);
  }

  if (result.failed > 0) {
    console.log('⚠️  일부 항목이 실패했습니다.\n');
    process.exit(1);
  } else {
    console.log('✅ 모든 중복 업무가 성공적으로 삭제되었습니다!\n');
    process.exit(0);
  }
}).catch(error => {
  console.error('\n❌ 오류:', error);
  process.exit(1);
});
