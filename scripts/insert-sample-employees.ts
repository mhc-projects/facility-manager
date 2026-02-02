// scripts/insert-sample-employees.ts
import { query } from '../lib/supabase-direct'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function insertSampleEmployees() {
  try {
    console.log('🚀 샘플 직원 데이터 삽입 시작...')

    // SQL 파일 읽기
    const sqlPath = path.join(process.cwd(), 'sql', 'insert_sample_employees.sql')
    const sql = fs.readFileSync(sqlPath, 'utf-8')

    // SQL 문을 개별적으로 실행
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`📋 총 ${statements.length}개의 SQL 문 발견`)

    let insertCount = 0
    for (const statement of statements) {
      if (statement.toLowerCase().includes('insert into')) {
        console.log('🔄 직원 데이터 삽입 중...')
        await query(statement)
        insertCount++
      } else if (statement.toLowerCase().includes('select')) {
        console.log('📊 결과 조회 중...')
        const result = await query(statement)
        if (result && Array.isArray(result) && result.length > 0) {
          console.table(result)
        }
      } else {
        // 기타 SQL 실행
        await query(statement)
      }
    }

    console.log(`\n✅ 샘플 직원 데이터 삽입 완료!`)
    console.log(`   총 ${insertCount}개 부서의 직원 데이터 처리됨`)
    console.log('\n🔍 확인 방법:')
    console.log('   1. Supabase Dashboard > Table Editor > employees')
    console.log('   2. 또는 /admin/users 페이지에서 확인')

  } catch (error) {
    console.error('❌ 샘플 직원 데이터 삽입 실패:', error)
    process.exit(1)
  }
}

// Run migration
insertSampleEmployees()
