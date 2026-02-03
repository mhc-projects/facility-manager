// scripts/fix-remaining-legacy.js - 남은 3개 레거시 status 수정
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uvdvfsjekqshxtxthxeq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZHZmc2pla3FzaHh0eHRoeGVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzE1NDA3NywiZXhwIjoyMDgyNzMwMDc3fQ.yk5uwhcA3lHAJDp7LGfcMwIpX5k04qS1glNBILRwvPo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixRemaining() {
  console.log('\n🔧 [FIX] 남은 레거시 status 수정...\n');

  const fixes = [
    {
      id: 'c7fce885-3e34-48db-a6ec-1eea9aa03385',
      business_name: '삼경산업(보조금 동시진행)',
      old_status: 'document_complete',
      new_status: 'subsidy_document_complete',
      reason: 'subsidy 타입은 subsidy_document_complete 사용 필요'
    },
    // quotation과 site_inspection은 공통 status이므로 prefix 불필요 - 수정하지 않음
  ];

  let successCount = 0;
  let failedCount = 0;

  for (const fix of fixes) {
    console.log(`🔄 수정 중: ${fix.business_name}`);
    console.log(`   ${fix.old_status} → ${fix.new_status}`);
    console.log(`   이유: ${fix.reason}\n`);

    const { error } = await supabase
      .from('facility_tasks')
      .update({
        status: fix.new_status,
        updated_at: new Date().toISOString()
      })
      .eq('id', fix.id);

    if (error) {
      console.error(`  ❌ 실패:`, error.message);
      failedCount++;
    } else {
      console.log(`  ✅ 성공\n`);
      successCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 수정 완료 요약\n');
  console.log(`  ✅ 성공: ${successCount}개`);
  console.log(`  ❌ 실패: ${failedCount}개`);
  console.log('='.repeat(60) + '\n');

  console.log('ℹ️  참고: quotation과 site_inspection은 공통 status이므로');
  console.log('   prefix가 없어도 정상입니다. (여러 타입에서 공유)\n');

  return { success: successCount, failed: failedCount };
}

fixRemaining().then((result) => {
  if (result.failed > 0) {
    console.log('⚠️  일부 항목이 실패했습니다.\n');
    process.exit(1);
  } else {
    console.log('✅ 모든 수정이 완료되었습니다!\n');
    process.exit(0);
  }
}).catch(error => {
  console.error('\n❌ 오류:', error);
  process.exit(1);
});
