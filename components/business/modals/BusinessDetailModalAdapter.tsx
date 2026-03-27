'use client'

import React, { useCallback } from 'react';
import BusinessDetailModal from './BusinessDetailModal';

// Simplified props that Revenue page can provide
interface BusinessDetailModalAdapterProps {
  isOpen: boolean;
  business: any;
  onClose: () => void;
  onEdit: (business: any) => void;
  businessTasks?: any[];
  facilityData?: any;
  isLoadingTasks?: boolean;
  onUpdateTaskStatus?: (taskId: string, newStatus: string) => Promise<void>;
  invoiceAmounts?: Record<string, number>;
  onUpdateInvoiceDate?: (key: string, date: string) => Promise<void>;
  onUpdateInvoiceAmount?: (key: string, amount: number) => Promise<void>;
  mapCategoryToInvoiceType?: (category: string) => string;
  userPermission?: number;
  canDeleteAutoMemos?: boolean;
}

/**
 * Adapter component that wraps BusinessDetailModal with state management
 * for contexts where the full Business page state is not available (e.g., Revenue page)
 */
export default function BusinessDetailModalAdapter({
  isOpen,
  business,
  onClose,
  onEdit,
  businessTasks = [],
  facilityData,
  isLoadingTasks = false,
  onUpdateTaskStatus,
  invoiceAmounts = {},
  onUpdateInvoiceDate,
  onUpdateInvoiceAmount,
  mapCategoryToInvoiceType = (category) => category,
  userPermission = 0,
  canDeleteAutoMemos = false,
}: BusinessDetailModalAdapterProps) {

  // Integrated items getter (tasks only - memos handled by MemoSection)
  const getIntegratedItems = useCallback(() => {
    const items: any[] = [];
    if (businessTasks && Array.isArray(businessTasks)) {
      businessTasks.forEach(task => {
        items.push({
          id: task.task_id,
          type: 'task',
          title: task.title || '',
          created_at: task.created_at,
          updated_at: task.updated_at,
          status: task.status,
          task_type: task.task_type,
          assignee: task.assignee,
          data: task
        });
      });
    }
    return items.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [businessTasks]);

  // Task status helpers
  const getStatusColor = (status: string) => {
    switch (status) {
      case '완료':
        return { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-800', text: 'text-green-700' };
      case '진행중':
        return { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800', text: 'text-blue-700' };
      case '대기':
        return { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-800', text: 'text-yellow-700' };
      case '보류':
        return { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-800', text: 'text-gray-700' };
      default:
        return { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-800', text: 'text-gray-700' };
    }
  };

  const getStatusDisplayName = (status: string) => {
    return status || '미정';
  };

  // Revenue handlers (simplified)
  const setSelectedRevenueBusiness = (business: any) => {
    console.log('📊 [ADAPTER] Revenue business selected:', business.business_name);
    // Could potentially open another modal or navigate
  };

  const setShowRevenueModal = (show: boolean) => {
    console.log('📊 [ADAPTER] Show revenue modal:', show);
    // Not implemented in adapter context
  };

  // Facility update handler
  const onFacilityUpdate = (businessName: string) => {
    console.log('🏭 [ADAPTER] Facility update:', businessName);
    // Could trigger a refresh if needed
  };

  return (
    <BusinessDetailModal
      isOpen={isOpen}
      business={business}
      onClose={onClose}
      onEdit={onEdit}
      businessTasks={businessTasks}
      userPermission={userPermission}
      canDeleteAutoMemos={canDeleteAutoMemos}
      getStatusColor={getStatusColor}
      getStatusDisplayName={getStatusDisplayName}
      facilityDeviceCounts={null}
      facilityLoading={isLoadingTasks}
      facilityData={facilityData}
      airPermitData={null}
      setSelectedRevenueBusiness={setSelectedRevenueBusiness}
      setShowRevenueModal={setShowRevenueModal}
      mapCategoryToInvoiceType={mapCategoryToInvoiceType}
      onFacilityUpdate={onFacilityUpdate}
    />
  );
}
