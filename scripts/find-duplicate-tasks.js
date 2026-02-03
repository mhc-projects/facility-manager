// scripts/find-duplicate-tasks.js - 중복 업무 조회
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uvdvfsjekqshxtxthxeq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZHZmc2pla3FzaHh0eHRoeGVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE1NDA3NywiZXhwIjoyMDgyNzMwMDc3fQ.yk5uwhcA3lHAJDp7LGfcMwIpX5k04qS1glNBILRwvPo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findDuplicates() {
  console.log('\n🔍 중복 업무 조회 중...\n');

  const { data: tasks, error } = await supabase
    .from('facility_tasks')
    .select('id, business_name, task_type, status, title, created_at, assignee, due_date')
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

  console.log(`✅ 전체 업무: ${tasks.length}개\n`);

  // 중복 그룹 찾기: business_name + task_type + status 조합
  const groups = {};
  tasks.forEach(task => {
    const key = `${task.business_name}|${task.task_type}|${task.status}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(task);
  });

  // 중복만 필터링 (2개 이상)
  const duplicates = Object.entries(groups).filter(([key, tasks]) => tasks.length > 1);

  console.log(`🔍 중복 그룹 수: ${duplicates.length}개\n`);
  console.log('='.repeat(100));

  if (duplicates.length === 0) {
    console.log('\n✅ 중복된 업무가 없습니다.\n');
    return { duplicates: [], totalTasks: tasks.length };
  }

  duplicates.forEach(([key, groupTasks], index) => {
    const [business, type, status] = key.split('|');
    console.log(`\n[${index + 1}] ${business} / ${type} / ${status}`);
    console.log(`    중복 수: ${groupTasks.length}개`);
    console.log(`    ---`);

    // 생성일 기준 정렬 (최신순)
    const sorted = groupTasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    sorted.forEach((task, i) => {
      const isNewest = i === 0;
      const marker = isNewest ? '✅ 보존' : '❌ 삭제 대상';

      console.log(`    ${i + 1}. ${marker} - ${task.title || '(제목 없음)'}`);
      console.log(`       ID: ${task.id}`);
      console.log(`       생성일: ${new Date(task.created_at).toLocaleString('ko-KR')}`);
      if (task.assignee) console.log(`       담당자: ${task.assignee}`);
      if (task.due_date) console.log(`       마감일: ${task.due_date}`);
    });
  });

  console.log('\n' + '='.repeat(100));
  console.log(`\n📊 요약:`);
  console.log(`   전체 업무: ${tasks.length}개`);
  console.log(`   중복 그룹: ${duplicates.length}개`);
  console.log(`   중복 업무 총 개수: ${duplicates.reduce((sum, [_, tasks]) => sum + tasks.length, 0)}개`);
  console.log(`   삭제 대상: ${duplicates.reduce((sum, [_, tasks]) => sum + (tasks.length - 1), 0)}개 (각 그룹에서 최신 1개 제외)\n`);

  return { duplicates, totalTasks: tasks.length };
}

findDuplicates()
  .then((result) => {
    if (result && result.duplicates.length > 0) {
      console.log('💡 다음 단계: scripts/delete-duplicate-tasks.js를 실행하여 중복 업무를 삭제할 수 있습니다.\n');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ 오류:', error);
    process.exit(1);
  });
