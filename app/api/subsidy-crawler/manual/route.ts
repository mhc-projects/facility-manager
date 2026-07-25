/**
 * POST /api/subsidy-crawler/manual
 *
 * 관리자 대시보드에서 수동으로 크롤링을 실행하는 엔드포인트
 * 3개의 GitHub Actions 워크플로우를 모두 트리거:
 * 1. Direct URL Subsidy Crawler
 * 2. Subsidy Crawler - Phase 2
 * 3. Subsidy Announcement Crawler
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

interface ManualCrawlResponse {
  success: boolean;
  message?: string;
  workflows_triggered?: string[];
  errors?: string[];
}

const WORKFLOWS = [
  { name: 'Direct URL Subsidy Crawler', file: 'subsidy-crawler-direct.yml' },
  { name: 'Subsidy Crawler - Phase 2', file: 'subsidy-crawler-phase2.yml' },
  { name: 'Subsidy Announcement Crawler', file: 'subsidy-crawler.yml' },
];

export async function POST(
  request: NextRequest
): Promise<NextResponse<ManualCrawlResponse>> {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response as NextResponse<ManualCrawlResponse>;

  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPOSITORY || 'mhc-projects/facility-manager';

    if (!githubToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'GITHUB_TOKEN not configured',
        },
        { status: 500 }
      );
    }

    const triggeredWorkflows: string[] = [];
    const errors: string[] = [];

    // 3개의 워크플로우를 모두 트리거
    for (const workflow of WORKFLOWS) {
      try {
        console.log(`[Manual Crawler] Triggering ${workflow.name}...`);

        const response = await fetch(
          `https://api.github.com/repos/${githubRepo}/actions/workflows/${workflow.file}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/vnd.github+json',
              'Authorization': `Bearer ${githubToken}`,
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ref: 'main',
            }),
          }
        );

        if (response.status === 204) {
          console.log(`[Manual Crawler] ✅ ${workflow.name} triggered successfully`);
          triggeredWorkflows.push(workflow.name);
        } else {
          const errorText = await response.text();
          console.error(`[Manual Crawler] ❌ Failed to trigger ${workflow.name}:`, errorText);
          errors.push(`${workflow.name}: HTTP ${response.status}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Manual Crawler] Error triggering ${workflow.name}:`, error);
        errors.push(`${workflow.name}: ${errorMsg}`);
      }
    }

    // 결과 반환
    if (triggeredWorkflows.length === WORKFLOWS.length) {
      return NextResponse.json({
        success: true,
        message: `${triggeredWorkflows.length}개의 크롤링 워크플로우가 시작되었습니다.`,
        workflows_triggered: triggeredWorkflows,
      });
    } else if (triggeredWorkflows.length > 0) {
      return NextResponse.json({
        success: true,
        message: `${triggeredWorkflows.length}/${WORKFLOWS.length}개의 크롤링 워크플로우가 시작되었습니다.`,
        workflows_triggered: triggeredWorkflows,
        errors,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: '모든 워크플로우 트리거에 실패했습니다.',
          errors,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Manual Crawler] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
