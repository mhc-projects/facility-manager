// hooks/useCostChangeLogger.ts
// 비용 변경 이력 자동 기록 Hook

import { useState, useCallback } from 'react';
import { TokenManager } from '@/lib/api-client';
import { generateChangeDescription } from '@/utils/costChangeFormatter';
import { getCurrentUserName } from '@/lib/getCurrentUser';
import { validateCostChange } from '@/utils/validation';
import { AuditLogger } from '@/utils/AuditLogger';

interface CreateLogParams {
  type: 'operating_cost' | 'survey_fee' | 'as_cost' | 'custom_cost';
  action: 'added' | 'updated' | 'deleted';
  oldValue?: any;
  newValue?: any;
  itemName?: string; // 커스텀 추가비용 항목명
}

export function useCostChangeLogger(businessId: string) {
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const createCostChangeLog = useCallback(async (params: CreateLogParams) => {
    const { type, action, oldValue, newValue, itemName } = params;

    // 데이터 검증
    const validation = validateCostChange({ type, action, oldValue, newValue });
    if (!validation.isValid) {
      console.warn('⚠️ [COST-LOG] 검증 실패:', validation.errors);
      // 검증 실패해도 원본 작업은 성공 상태 유지 (비침습적)
      return;
    }

    setIsLogging(true);
    setLogError(null);

    try {
      // 1️⃣ 제목 생성
      const typeLabels = {
        operating_cost: '영업비용조정',
        survey_fee: '실사비용조정',
        as_cost: 'AS비용',
        custom_cost: `커스텀추가비용${itemName ? `(${itemName})` : ''}`
      };

      const actionLabels = {
        added: '추가',
        updated: '수정',
        deleted: '삭제'
      };

      const title = `[자동] ${typeLabels[type]} ${actionLabels[action]}`;

      // 2️⃣ 내용 생성
      const content = generateChangeDescription({
        type,
        action,
        oldValue,
        newValue,
        itemName
      });

      // 3️⃣ 사용자 정보 가져오기
      const userName = await getCurrentUserName();

      // 4️⃣ 메모 저장 (재시도 로직 포함)
      await saveMemoWithRetry({
        businessId,
        title,
        content,
        created_by: `${userName} (자동)`,
        updated_by: `${userName} (자동)`
      });

      console.log('✅ [COST-LOG] 변경 이력 자동 기록 성공:', title);

      // 🆕 감사 로그 기록
      AuditLogger.logCostChangeCreated({
        userName,
        businessId,
        costType: type,
        action
      });

    } catch (error) {
      console.error('❌ [COST-LOG] 변경 이력 기록 실패:', error);
      setLogError(error instanceof Error ? error.message : '알 수 없는 오류');

      // 🆕 실패 감사 로그 기록
      const userName = await getCurrentUserName().catch(() => 'Unknown');
      AuditLogger.logCostChangeFailed({
        userName,
        businessId,
        costType: type,
        error: error instanceof Error ? error.message : '알 수 없는 오류'
      });

      // 에러는 기록하되, 원본 작업(비용 저장)은 성공 상태 유지
      // 사용자에게는 알림 없이 콘솔 로그만 남김 (비침습적)
    } finally {
      setIsLogging(false);
    }
  }, [businessId]);

  return { createCostChangeLog, isLogging, logError };
}

// 🆕 재시도 로직이 포함된 메모 저장 함수
async function saveMemoWithRetry(
  memoData: {
    businessId: string;
    title: string;
    content: string;
    created_by: string;
    updated_by: string;
  },
  maxRetries = 2
): Promise<void> {
  const { businessId, title, content, created_by, updated_by } = memoData;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const token = TokenManager.getToken();
      const response = await fetch(`/api/businesses/${businessId}/memos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          content,
          created_by,
          updated_by,
          is_auto_generated: true // 자동 생성 플래그
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || '메모 저장 실패');
      }

      // 성공 시 즉시 반환
      return;

    } catch (error) {
      console.warn(`⚠️ [COST-LOG] 저장 시도 ${attempt}/${maxRetries + 1} 실패:`, error);

      if (attempt === maxRetries + 1) {
        // 최종 실패
        throw error;
      }

      // 재시도 전 대기 (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}
