// utils/costChangeFormatter.ts
// 비용 변경 내용 포맷팅 유틸리티

export function generateChangeDescription(params: {
  type: string;
  action: string;
  oldValue?: any;
  newValue?: any;
  itemName?: string;
}): string {
  const { type, action, oldValue, newValue, itemName } = params;
  const timestamp = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  let description = '';

  switch (type) {
    case 'operating_cost':
      if (action === 'added') {
        description = `${newValue.type === 'add' ? '추가(+)' : '차감(-)'} ${newValue.amount.toLocaleString()}원\n사유: ${newValue.reason || '없음'}`;
      } else if (action === 'updated') {
        const oldType = oldValue.type === 'add' ? '추가(+)' : '차감(-)';
        const newType = newValue.type === 'add' ? '추가(+)' : '차감(-)';
        description = `금액: ${oldValue.amount.toLocaleString()}원 → ${newValue.amount.toLocaleString()}원\n타입: ${oldType} → ${newType}\n사유: ${newValue.reason || '없음'}`;
      } else {
        // 🆕 deleted 액션 처리 - oldValue가 객체인지 원시값인지 확인
        if (typeof oldValue === 'object' && oldValue !== null) {
          // 객체 형태: { amount, type, reason }
          description = `${oldValue.amount?.toLocaleString() || '0'}원 (${oldValue.type === 'add' ? '추가' : '차감'}) 삭제됨\n사유: ${oldValue.reason || '없음'}`;
        } else {
          // 원시값 형태: 숫자만 전달된 경우
          const amount = typeof oldValue === 'number' ? oldValue : 0;
          description = `조정 금액 ${amount.toLocaleString()}원 삭제됨\n기본 영업비용으로 복귀`;
        }
      }
      break;

    case 'survey_fee':
      if (action === 'added' || action === 'updated') {
        const oldAmt = oldValue ?? 0;
        const finalOld = 100000 + oldAmt;
        const finalNew = 100000 + newValue;
        description = `조정액: ${oldAmt.toLocaleString()}원 → ${newValue.toLocaleString()}원\n최종 실사비: ${finalOld.toLocaleString()}원 → ${finalNew.toLocaleString()}원`;
      } else {
        description = `조정액 ${oldValue.toLocaleString()}원 초기화\n기본 실사비 100,000원으로 복귀`;
      }
      break;

    case 'as_cost':
      if (action === 'added' || action === 'updated') {
        const oldAmt = oldValue ?? 0;
        description = `${oldAmt.toLocaleString()}원 → ${newValue.toLocaleString()}원`;
      } else {
        description = `${oldValue.toLocaleString()}원 삭제됨`;
      }
      break;

    case 'custom_cost':
      if (action === 'added') {
        description = `항목명: ${itemName}\n금액: ${newValue.toLocaleString()}원`;
      } else if (action === 'updated') {
        description = `항목명: ${itemName}\n금액 변경: ${oldValue.toLocaleString()}원 → ${newValue.toLocaleString()}원`;
      } else {
        description = `항목명: ${itemName}\n금액: ${oldValue.toLocaleString()}원 삭제됨`;
      }
      break;
  }

  return `${description}\n\n📅 ${timestamp}`;
}
