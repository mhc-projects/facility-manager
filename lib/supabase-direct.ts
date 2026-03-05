// lib/supabase-direct.ts - PostgreSQL 직접 연결 (PostgREST 우회)
import { Pool, types } from 'pg';

// date 타입(OID 1082)을 Date 객체 대신 "YYYY-MM-DD" 문자열로 반환
// pg 기본 동작은 Date 객체로 변환하며 UTC 기준이라 KST에서 하루 밀림 발생
types.setTypeParser(1082, (val: string) => val);

// PostgreSQL 연결 풀 (싱글톤)
let pool: Pool | null = null;

export function getDirectConnection() {
  if (!pool) {
    // .env.local에서 Supabase URL 파싱
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    // uvdvfsjekqshxtxthxeq.supabase.co에서 프로젝트 ID 추출
    const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

    pool = new Pool({
      // Transaction Mode pooler - Session Mode의 연결 제한 회피
      host: `aws-1-ap-southeast-1.pooler.supabase.com`,
      port: 6543, // Transaction Mode port (5432 = Session Mode, 6543 = Transaction Mode)
      database: 'postgres',
      user: `postgres.${projectRef}`,
      password: 'chlansgh35855#',
      ssl: {
        rejectUnauthorized: false, // Supabase SSL 인증서 허용
      },
      max: 30, // Transaction Mode는 더 많은 동시 연결 지원
      idleTimeoutMillis: 20000, // Transaction Mode는 짧은 idle timeout 권장
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('❌ [PG] Unexpected pool error:', err);
    });

    console.log('✅ [PG] PostgreSQL 직접 연결 풀 초기화 (Transaction Mode):', {
      host: `aws-1-ap-southeast-1.pooler.supabase.com`,
      port: 6543,
      database: 'postgres',
      user: `postgres.${projectRef}`,
      max: 30,
      mode: 'Transaction'
    });
  }

  return pool;
}

// Helper: 단일 쿼리 실행
export async function query(text: string, params?: any[]) {
  const pool = getDirectConnection();
  const start = Date.now();

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('✅ [PG] Query executed:', { text: text.substring(0, 50), duration: `${duration}ms`, rows: res.rowCount });
    return res;
  } catch (error: any) {
    console.error('❌ [PG] Query failed:', { text: text.substring(0, 50), error: error.message });
    throw error;
  }
}

// Helper: 트랜잭션 실행
export async function transaction(callback: (client: any) => Promise<any>) {
  const pool = getDirectConnection();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper: 단일 row 조회
export async function queryOne(text: string, params?: any[]) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

// Helper: 모든 rows 조회
export async function queryAll(text: string, params?: any[]) {
  const result = await query(text, params);
  return result.rows;
}

// 연결 풀 종료 (graceful shutdown)
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ [PG] PostgreSQL 연결 풀 종료');
  }
}
