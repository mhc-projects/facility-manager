'use client';

// 접수현황(AS/크리닝/상담종료) 통합 조회 — 본문은 DpfServiceListView(mode='reception')에 위임
import AdminLayout from '@/components/ui/AdminLayout';
import DpfServiceListView from '@/components/dpf/DpfServiceListView';

export default function DpfServicePage() {
  return (
    <AdminLayout title="접수현황" description="AS/크리닝/물류 접수 통합 조회">
      <DpfServiceListView mode="reception" />
    </AdminLayout>
  );
}
