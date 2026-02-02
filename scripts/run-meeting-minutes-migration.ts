// scripts/run-meeting-minutes-migration.ts
import { query } from '../lib/supabase-direct'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function runMigration() {
  try {
    console.log('🚀 Starting meeting_minutes foreign key migration...')

    // SQL 파일 읽기
    const sqlPath = path.join(process.cwd(), 'sql', 'fix_meeting_minutes_foreign_keys.sql')
    const sql = fs.readFileSync(sqlPath, 'utf-8')

    // 여러 SQL 문을 개별적으로 실행
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`📋 Found ${statements.length} SQL statements to execute`)

    for (const statement of statements) {
      if (statement.includes('DROP CONSTRAINT')) {
        console.log('🗑️  Dropping old constraint...')
      } else if (statement.includes('ADD CONSTRAINT')) {
        console.log('➕ Adding new constraint...')
      }

      await query(statement)
    }

    console.log('✅ Migration completed successfully!')
    console.log('✅ meeting_minutes 테이블이 이제 employees 테이블을 참조합니다.')

    process.exit(0)
  } catch (error: any) {
    console.error('❌ Migration failed:', error)
    console.error('Error details:', error.message)
    process.exit(1)
  }
}

runMigration()
