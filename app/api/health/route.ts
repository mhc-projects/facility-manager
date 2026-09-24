// app/api/health/route.ts - 헬스체크 및 환경 변수 검증 (Vercel 최적화)
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export async function GET(request: NextRequest) {
  try {
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

    // Google Drive 서비스계정 검사는 제거함 — Drive 업로드를 쓰지 않아 자격증명이 없고, 항상 실패로 degraded를 만들었다
    const health = {
      status: missingEnvVars.length === 0 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      region: process.env.VERCEL_REGION || 'local',
      vercel: {
        deployment: process.env.VERCEL_URL || 'local',
        branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown'
      },
      checks: {
        envVars: {
          status: missingEnvVars.length === 0 ? 'pass' : 'fail',
          required: requiredEnvVars.length,
          missing: missingEnvVars.length,
          ...(missingEnvVars.length > 0 && { missingVars: missingEnvVars })
        },
        uploadLimits: {
          maxFileSize: '10MB',
          maxTotalSize: '30MB',
          maxDuration: '60s',
          runtime: 'nodejs'
        }
      }
    };

    return NextResponse.json(health, { 
      status: health.status === 'healthy' ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('🔴 [HEALTH] 헬스체크 실패:', error);
    
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        message: '헬스체크 실패',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      }
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}