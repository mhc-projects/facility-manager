// scripts/run-remove-discussions.ts
import { query } from '../lib/supabase-direct'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function runMigration() {
  try {
    console.log('🚀 Starting discussions field removal migration...')

    // SQL 파일 읽기
    const sqlPath = path.join(process.cwd(), 'sql', 'remove_discussions_from_meeting_minutes.sql')
    const sql = fs.readFileSync(sqlPath, 'utf-8')

    // 여러 SQL 문을 개별적으로 실행
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`📋 Found ${statements.length} SQL statements to execute`)

    for (const statement of statements) {
      if (statement.includes('UPDATE meeting_minutes')) {
        console.log('🔄 Updating meeting_minutes content...')
      }

      const result = await query(statement)
      console.log('✅ Statement executed successfully')

      if (result && Array.isArray(result) && result.length > 0) {
        console.log(`   Affected rows: ${result.length}`)
      }
    }

    console.log('🎉 Migration completed successfully!')
    console.log('\n📊 Verification query:')
    console.log('   SELECT id, title, content->\'discussions\' as discussions FROM meeting_minutes LIMIT 10;')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
runMigration()
