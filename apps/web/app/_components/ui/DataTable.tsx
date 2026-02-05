'use client';

import type { ReactNode } from 'react';

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  columns?: Column<T>[];
  data?: T[];
  keyExtractor?: (item: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  // 簡易形式（headers/rows）
  headers?: string[];
  rows?: ReactNode[][];
}

export default function DataTable<T = unknown>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = 'データがありません',
  onRowClick,
  headers,
  rows,
}: DataTableProps<T>) {
  // 安全なデータとカラムの取得
  const safeData = Array.isArray(data) ? data : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
        <span className="ml-3 text-sm text-brand-muted">読み込み中...</span>
      </div>
    );
  }

  // 簡易形式（headers/rows）の処理
  if (safeHeaders.length > 0) {
    if (safeRows.length === 0) {
      return (
        <div className="bg-brand-bg rounded-2xl p-8 text-center">
          <p className="text-sm text-brand-muted">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-brand-border">
          <thead className="bg-brand-bg">
            <tr>
              {safeHeaders.map((header, index) => (
                <th
                  key={index}
                  className="px-6 py-4 text-left text-xs font-semibold text-brand-muted uppercase tracking-wider"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-brand-border">
            {safeRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="transition-colors hover:bg-brand-bg"
              >
                {Array.isArray(row) ? row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm">
                    {cell}
                  </td>
                )) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 通常形式（columns/data）の処理
  if (safeColumns.length === 0 || safeData.length === 0) {
    return (
      <div className="bg-brand-bg rounded-2xl p-8 text-center">
        <p className="text-sm text-brand-muted">{emptyMessage}</p>
      </div>
    );
  }

  if (!keyExtractor) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <p className="text-sm text-red-700">keyExtractor is required when using columns/data format</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-brand-border">
        <thead className="bg-brand-bg">
          <tr>
            {safeColumns.map((column) => (
              <th
                key={column.key}
                className="px-6 py-4 text-left text-xs font-semibold text-brand-muted uppercase tracking-wider"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-brand-border">
          {safeData.map((item) => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={`transition-colors ${onRowClick ? 'hover:bg-brand-bg cursor-pointer' : 'hover:bg-brand-bg'}`}
            >
              {safeColumns.map((column) => (
                <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm">
                  {column.render ? column.render(item) : String((item as Record<string, unknown>)[column.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

