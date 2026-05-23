// components/ui/DataTable.tsx - Modern Data Table Component
'use client'

import { useState, ReactNode } from 'react'
import { ChevronDown, ChevronUp, Search, Filter, MoreVertical, Edit, Trash2, Eye } from 'lucide-react'

interface Column<T> {
  key: keyof T | string
  title: string
  sortable?: boolean
  searchable?: boolean
  render?: (item: T) => ReactNode
  width?: string
  align?: 'left' | 'center' | 'right'
}

interface Action<T> {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick: (item: T) => void
  variant?: 'primary' | 'secondary' | 'danger'
  show?: (item: T) => boolean
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  actions?: Action<T>[]
  searchable?: boolean
  pagination?: boolean
  pageSize?: number
  emptyMessage?: string
  loading?: boolean
  onRowClick?: (item: T) => void
  selectable?: boolean
  onSelectionChange?: (selectedIds: string[]) => void
  onPageChange?: (page: number, pageData: T[]) => void
}

export default function DataTable<T extends { id: string }>({
  data,
  columns,
  actions = [],
  searchable = true,
  pagination = true,
  pageSize = 10,
  emptyMessage = '데이터가 없습니다',
  loading = false,
  onRowClick,
  selectable = false,
  onSelectionChange,
  onPageChange
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

  // Filter data based on search term
  const filteredData = data.filter(item => {
    if (!searchTerm) return true
    
    const searchableColumns = columns.filter(col => col.searchable !== false)
    return searchableColumns.some(col => {
      const value = item[col.key as keyof T]
      return value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
    })
  })

  // Sort data
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0
    
    const aVal = a[sortColumn as keyof T]
    const bVal = b[sortColumn as keyof T]
    
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1
    
    const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDirection === 'desc' ? -result : result
  })

  // Paginate data
  const totalPages = Math.ceil(sortedData.length / pageSize)
  const paginatedData = pagination
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData

  // 페이지 변경 핸들러
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)

    if (onPageChange && pagination) {
      const newPageData = sortedData.slice((newPage - 1) * pageSize, newPage * pageSize)
      onPageChange(newPage, newPageData)
    }
  }

  const handleSort = (columnKey: string) => {
    const newSortColumn = sortColumn === columnKey ? sortColumn : columnKey
    const newSortDirection: 'asc' | 'desc' =
      sortColumn === columnKey ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc'

    setSortColumn(newSortColumn)
    setSortDirection(newSortDirection)
    setCurrentPage(1)

    if (onPageChange && pagination) {
      const newSorted = [...filteredData].sort((a, b) => {
        const aVal = a[newSortColumn as keyof T]
        const bVal = b[newSortColumn as keyof T]
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        const r = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return newSortDirection === 'desc' ? -r : r
      })
      onPageChange(1, newSorted.slice(0, pageSize))
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.length === paginatedData.length) {
      setSelectedIds([])
      onSelectionChange?.([])
    } else {
      const allIds = paginatedData.map(item => item.id)
      setSelectedIds(allIds)
      onSelectionChange?.(allIds)
    }
  }

  const handleSelectItem = (id: string) => {
    const newSelection = selectedIds.includes(id)
      ? selectedIds.filter(selectedId => selectedId !== id)
      : [...selectedIds, id]
    
    setSelectedIds(newSelection)
    onSelectionChange?.(newSelection)
  }

  const getActionButton = (action: Action<T>, item: T, index: number) => {
    const Icon = action.icon
    const variants = {
      primary: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
      secondary: 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200',
      danger: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200'
    }

    return (
      <button
        key={`${action.label}-${index}`}
        onClick={(e) => {
          e.stopPropagation()
          action.onClick(item)
        }}
        style={{ minWidth: '32px', width: '32px', height: '32px' }}
        className={`
          flex items-center justify-center
          sm:min-w-0 sm:w-auto sm:h-auto sm:gap-1.5 sm:px-3 sm:py-1.5
          rounded-lg text-[10px] sm:text-sm font-medium border transition-colors
          ${variants[action.variant || 'secondary']}
        `}
        title={typeof action.label === 'string' ? action.label : undefined}
      >
        {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
        <span className="hidden sm:inline">{action.label}</span>
      </button>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="animate-pulse">
          {/* Header skeleton */}
          <div className="border-b border-gray-200 p-6">
            <div className="flex justify-between items-center">
              <div className="h-4 bg-gray-200 rounded w-32"></div>
              <div className="h-10 bg-gray-200 rounded w-64"></div>
            </div>
          </div>
          
          {/* Table skeleton */}
          <div className="p-6">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full">
      {/* Table Header */}
      {searchable && (
        <div className="border-b border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="검색..."
                  className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                />
              </div>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Filter className="w-4 h-4" />
                필터
              </button>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <span>{selectedIds.length}개 선택됨</span>
                <button
                  onClick={() => {
                    setSelectedIds([])
                    onSelectionChange?.([])
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  선택 해제
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto max-w-full">
        <table className="w-full table-fixed" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {selectable && (
                <th className="px-1 sm:px-2 py-1 sm:py-2 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === paginatedData.length && paginatedData.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              
              {columns.map((column) => (
                <th
                  key={column.key.toString()}
                  className={`px-1 sm:px-2 py-1 sm:py-2 text-[10px] sm:text-xs font-semibold text-gray-600 uppercase tracking-wider
                    ${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : 'text-left'}
                    ${column.sortable !== false ? 'cursor-pointer hover:bg-gray-100' : ''}
                  `}
                  style={column.width ? { width: column.width } : undefined}
                  onClick={() => column.sortable !== false && handleSort(column.key.toString())}
                >
                  <div className="flex items-center gap-2">
                    {column.title}
                    {column.sortable !== false && sortColumn === column.key && (
                      sortDirection === 'asc' 
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
              ))}
              
              {actions.length > 0 && (
                <th className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  작업
                </th>
              )}
            </tr>
          </thead>
          
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedData.length === 0 ? (
              <tr>
                <td 
                  colSpan={columns.length + (selectable ? 1 : 0) + (actions.length > 0 ? 1 : 0)}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Search className="w-8 h-8 text-gray-300" />
                    <p>{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => (
                <tr
                  key={item.id}
                  className={`hover:bg-gray-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(item)}
                >
                  {selectable && (
                    <td className="px-1 sm:px-2 py-1 sm:py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleSelectItem(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                  )}
                  
                  {columns.map((column) => (
                    <td
                      key={column.key.toString()}
                      className={`px-1 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs text-gray-900 max-w-0 truncate overflow-hidden
                        ${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : 'text-left'}
                      `}
                      style={column.width ? { width: column.width } : undefined}
                      title={(() => {
                        const value = column.render ? column.render(item) : (item[column.key as keyof T] || '');
                        return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
                      })()}
                    >
                      {column.render ? column.render(item) : (item[column.key as keyof T] as ReactNode)}
                    </td>
                  ))}
                  
                  {actions.length > 0 && (
                    <td className="py-1 sm:py-1.5 text-center">
                      <div className="flex justify-center items-center gap-1">
                        {actions
                          .filter(action => action.show ? action.show(item) : true)
                          .map((action, actionIndex) => getActionButton(action, item, actionIndex))
                        }
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Results Info & Pagination */}
      {pagination && (
        <div className="border-t border-gray-200 px-6 py-4">
          {/* Results Info */}
          <div className="text-[10px] sm:text-sm text-gray-500 mb-3">
            {searchTerm ? (
              <>
                검색결과: {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, sortedData.length)} / {sortedData.length}개
                {data.length !== sortedData.length && (
                  <span className="text-gray-400 ml-1">(전체 {data.length}개 중)</span>
                )}
              </>
            ) : (
              `${((currentPage - 1) * pageSize) + 1}-${Math.min(currentPage * pageSize, sortedData.length)} / ${sortedData.length}개`
            )}
          </div>

          {/* Pagination with horizontal scroll */}
          {totalPages > 1 && (
            <div className="overflow-x-auto">
              <div className="flex items-center gap-2 min-w-min">
                <button
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                >
                  이전
                </button>

              {[...Array(totalPages)].map((_, i) => {
                const page = i + 1
                const isCurrentPage = page === currentPage

                return (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-sm rounded-md transition-colors flex-shrink-0
                      ${isCurrentPage
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-200 hover:bg-gray-50'
                      }
                    `}
                  >
                    {page}
                  </button>
                )
              })}

                <button
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Export common action presets
export const commonActions = {
  view: (onClick: (item: any) => void): Action<any> => ({
    label: '보기',
    icon: Eye,
    onClick,
    variant: 'secondary'
  }),
  
  edit: (onClick: (item: any) => void): Action<any> => ({
    label: '수정',
    icon: Edit,
    onClick,
    variant: 'primary'
  }),
  
  delete: (onClick: (item: any) => void): Action<any> => ({
    label: '삭제',
    icon: Trash2,
    onClick,
    variant: 'danger'
  })
}