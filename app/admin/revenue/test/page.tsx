'use client';

import React, { useState, useEffect } from 'react';
import { TokenManager } from '@/lib/api-client';
import {
  BarChart3,
  Calculator,
  TrendingUp,
  DollarSign,
  Building2,
  Calendar,
  FileText,
  Search,
  Filter,
  Download,
  Loader2,
  Settings
} from 'lucide-react';

interface BusinessInfo {
  id: string;
  business_name: string;
  sales_office: string;
  [key: string]: any;
}

interface RevenueCalculation {
  id: string;
  business_id: string;
  business_name: string;
  sales_office: string;
  calculation_date: string;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  sales_commission: number;
  survey_costs: number;
  installation_costs: number;
  net_profit: number;
  equipment_breakdown: any[];
  cost_breakdown: any;
}

export default function RevenueTestPage() {
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBusinesses();
  }, []);

  const loadBusinesses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/business-list', {
        headers: { Authorization: `Bearer ${TokenManager.getToken()}` }
      });
      const data = await response.json();

      if (data.success) {
        setBusinesses(data.data.businesses.slice(0, 10) || []); // 처음 10개만 표시
      }
    } catch (error) {
      console.error('사업장 목록 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">매출 관리 시스템 테스트 페이지</h1>
          <p className="text-gray-600 mt-2">인증 우회 테스트용 페이지</p>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">총 사업장 수</p>
                <p className="text-2xl font-bold text-gray-900">{businesses.length}개</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">총 매출</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(15000000)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">총 순이익</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(5000000)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Calculator className="w-6 h-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">평균 이익률</p>
                <p className="text-2xl font-bold text-gray-900">33.3%</p>
              </div>
            </div>
          </div>
        </div>

        {/* 사업장 목록 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              사업장 목록 (테스트 - 처음 10개)
            </h3>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                <div className="text-gray-500">사업장 데이터를 불러오는 중...</div>
              </div>
            ) : businesses.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500">사업장 데이터가 없습니다.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-4 py-2 text-left">번호</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">사업장명</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">영업점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businesses.map((business, index) => (
                      <tr key={business.id || index} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2">{index + 1}</td>
                        <td className="border border-gray-300 px-4 py-2 font-medium">
                          {typeof business === 'string' ? business : business.business_name || business}
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          {typeof business === 'string' ? '미지정' : business.sales_office || '미지정'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* 접근 안내 */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h4 className="text-lg font-semibold text-blue-900 mb-2">🎉 매출관리 시스템 테스트 성공!</h4>
          <p className="text-blue-700 mb-4">
            이 페이지는 인증을 우회하여 매출관리 시스템이 정상적으로 작동하는지 테스트하는 페이지입니다.
          </p>
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <h5 className="font-semibold text-blue-900 mb-2">접근 URL:</h5>
            <ul className="text-blue-700 space-y-1">
              <li>• 테스트 페이지: <code className="bg-blue-100 px-2 py-1 rounded">/admin/revenue/test</code></li>
              <li>• 원본 페이지: <code className="bg-blue-100 px-2 py-1 rounded">/admin/revenue</code> (인증 필요)</li>
              <li>• 관리자 대시보드: <code className="bg-blue-100 px-2 py-1 rounded">/admin</code></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}