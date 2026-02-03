// scripts/check-legacy-status.js - 구버전 status 코드 점검 스크립트
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uvdvfsjekqshxtxthxeq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZHZmc2pla3FzaHh0eHRoeGVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE1NDA3NywiZXhwIjoyMDgyNzMwMDc3fQ.yk5uwhcA3lHAJDp7LGfcMwIpX5k04qS1glNBILRwvPo';

const supabase = createClient(supabaseUrl, supabaseKey);

// 신버전 status prefix 목록
const VALID_PREFIXES = [
  'self_',       // 자비
  'subsidy_',    // 보조금
  'dealer_',     // 대리점
  'outsourcing_', // 외주설치
  'as_',         // AS
  'etc_'         // 기타
];

// 공통 status (prefix 없어도 되는 것들)
const COMMON_STATUS = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'on_hold'
];

async function checkLegacyStatus() {
  console.log('\n🔍 [CHECK] 구버전 status 코드 점검 시작...\n');

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

  const legacyTasks = [];
  const validTasks = [];

  tasks?.forEach(task => {
    const hasValidPrefix = VALID_PREFIXES.some(prefix => task.status.startsWith(prefix));
    const isCommonStatus = COMMON_STATUS.includes(task.status);

    if (!hasValidPrefix && !isCommonStatus) {
      legacyTasks.push(task);
    } else {
      validTasks.push(task);
    }
  });

  console.log('📊 분석 결과:\n');
  console.log(`  ✅ 신버전 status (prefix 있음): ${validTasks.length}개`);
  console.log(`  ⚠️  구버전 status (prefix 없음): ${legacyTasks.length}개\n`);

  if (legacyTasks.length > 0) {
    console.log('⚠️  구버전 status 발견:\n');

    // task_type별로 그룹화
    const groupedByType = {};
    legacyTasks.forEach(task => {
      if (!groupedByType[task.task_type]) {
        groupedByType[task.task_type] = [];
      }
      groupedByType[task.task_type].push(task);
    });

    Object.entries(groupedByType).forEach(([taskType, tasks]) => {
      console.log(`  📌 [${taskType}] ${tasks.length}개:`);
      tasks.forEach((task, index) => {
        console.log(`    ${index + 1}. ${task.business_name} - ${task.status}`);
        console.log(`       ID: ${task.id}`);
        console.log(`       Title: ${task.title}`);
        console.log(`       Created: ${task.created_at}`);

        // 예상 변환값 제시
        const expectedStatus = `${taskType}_${task.status}`;
        console.log(`       → 변환 예상: ${expectedStatus}\n`);
      });
    });

    // 고유 status 값 추출
    const uniqueLegacyStatus = [...new Set(legacyTasks.map(t => t.status))];
    console.log('\n📋 발견된 구버전 status 목록:');
    uniqueLegacyStatus.forEach(status => {
      const count = legacyTasks.filter(t => t.status === status).length;
      console.log(`  - ${status} (${count}개)`);
    });
  }

  // status별 통계
  console.log('\n\n📈 전체 status 통계:\n');
  const statusCounts = {};
  tasks?.forEach(task => {
    statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
  });

  Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      const hasPrefix = VALID_PREFIXES.some(p => status.startsWith(p));
      const isCommon = COMMON_STATUS.includes(status);
      const marker = hasPrefix || isCommon ? '✅' : '⚠️ ';
      console.log(`  ${marker} ${status}: ${count}개`);
    });
}

checkLegacyStatus().then(() => {
  console.log('\n✅ 점검 완료\n');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ 점검 오류:', error);
  process.exit(1);
});
