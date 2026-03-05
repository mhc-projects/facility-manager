'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Building2, Search, X } from 'lucide-react';

/**
 * 사업장 간단 정보 타입
 */
interface BusinessSummary {
  id: string;
  business_name: string;
  address?: string;
}

interface BusinessAutocompleteProps {
  value: string | null; // 현재 선택된 사업장명
  businessId: string | null; // 현재 선택된 사업장 ID
  onChange: (businessId: string | null, businessName: string | null) => void;
  onBusinessClick?: (businessId: string, businessName: string) => void; // 사업장명 클릭 시 콜백
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * 사업장 자동완성 입력 컴포넌트
 * - 사업장 리스트 검색 및 자동완성
 * - 사업장명 클릭 시 상세 정보 표시 가능 (선택적)
 */
export default function BusinessAutocomplete({
  value,
  businessId,
  onChange,
  onBusinessClick,
  placeholder = '사업장명을 입력하세요',
  disabled = false,
  required = false
}: BusinessAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value || '');
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [filteredBusinesses, setFilteredBusinesses] = useState<BusinessSummary[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // 사업장 리스트 로드
  useEffect(() => {
    loadBusinesses();
  }, []);

  // businesses 로드 완료 후, businessId 없이 value(사업장명)만 있으면 자동 매칭
  useEffect(() => {
    if (businesses.length > 0 && !businessId && value) {
      const matched = businesses.find(b => b.business_name === value);
      if (matched) {
        onChange(matched.id, matched.business_name);
      }
    }
  }, [businesses]);

  // value prop 변경 시 inputValue 동기화
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // 입력값 변경 시 필터링
  useEffect(() => {
    // 사업장이 이미 선택된 상태면 자동완성 표시하지 않음
    if (businessId) {
      setShowSuggestions(false);
      return;
    }

    if (inputValue.trim()) {
      const filtered = businesses.filter(business =>
        business.business_name.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredBusinesses(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredBusinesses([]);
      setShowSuggestions(false);
    }
  }, [inputValue, businesses, businessId]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadBusinesses = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/business-list?includeAll=true');
      if (!response.ok) {
        throw new Error('사업장 목록 조회 실패');
      }

      const data = await response.json();
      if (data.success && data.data && data.data.businesses) {
        const businessList: BusinessSummary[] = data.data.businesses.map((b: any) => ({
          id: b.id,
          business_name: b.business_name,
          address: b.address
        }));
        setBusinesses(businessList);
        console.log(`✅ [BUSINESS-AUTOCOMPLETE] ${businessList.length}개 사업장 로드 완료`);
      }
    } catch (err) {
      console.error('❌ [BUSINESS-AUTOCOMPLETE] 사업장 목록 로드 실패:', err);
      setError('사업장 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // 입력값이 변경되면 선택 해제
    if (newValue !== value) {
      onChange(null, null);
    }
  };

  const handleSelectBusiness = (business: BusinessSummary) => {
    setInputValue(business.business_name);
    onChange(business.id, business.business_name);
    setShowSuggestions(false);
    console.log(`✅ [BUSINESS-AUTOCOMPLETE] 사업장 선택: ${business.business_name}`);
  };

  const handleClear = () => {
    setInputValue('');
    onChange(null, null);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleBusinessNameClick = (e: React.MouseEvent) => {
    if (businessId && value && onBusinessClick) {
      e.preventDefault();
      onBusinessClick(businessId, value);
    }
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        사업장 {required && <span className="text-red-500">*</span>}
        {businessId && onBusinessClick && (
          <span className="ml-2 text-xs text-gray-500">(클릭하여 상세정보 보기)</span>
        )}
      </label>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600"></div>
          ) : (
            <Building2 className="h-4 w-4 text-gray-400" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            // Only show suggestions on focus if no business is currently selected
            // This prevents autocomplete from showing when editing an existing event
            if (!businessId && inputValue.trim() && filteredBusinesses.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onClick={businessId && onBusinessClick ? handleBusinessNameClick : undefined}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full pl-10 pr-10 py-2 text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
            businessId && onBusinessClick ? 'cursor-pointer hover:bg-blue-50' : ''
          } ${error ? 'border-red-300' : 'border-gray-300'}`}
        />

        {inputValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 자동완성 제안 목록 */}
      {showSuggestions && filteredBusinesses.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredBusinesses.map((business) => (
            <button
              key={business.id}
              type="button"
              onClick={() => handleSelectBusiness(business)}
              className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-blue-50 transition-colors"
            >
              <div className="flex items-start">
                <Building2 className="h-4 w-4 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {business.business_name}
                  </div>
                  {business.address && (
                    <div className="text-sm text-gray-500 truncate mt-0.5">
                      {business.address}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 검색 결과 없음 메시지 */}
      {showSuggestions && inputValue.trim() && filteredBusinesses.length === 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500"
        >
          <Search className="h-6 w-6 mx-auto mb-2 text-gray-400" />
          <div className="text-sm">"{inputValue}"에 해당하는 사업장이 없습니다.</div>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="mt-1 text-sm text-red-600 flex items-center">
          <span>{error}</span>
        </div>
      )}

      {/* 도움말 */}
      {!error && !businessId && (
        <div className="mt-1 text-xs text-gray-500">
          사업장명을 입력하면 자동완성 목록이 표시됩니다.
        </div>
      )}
    </div>
  );
}
