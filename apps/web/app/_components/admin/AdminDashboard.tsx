'use client';

import Card from '../ui/Card';
import PageHeader from '../ui/PageHeader';

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="ダッシュボード"
        subtitle="今日の店舗状況のサマリーです。"
      />
      {/* KPIカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 本日の予約数 */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📅</span>
              </div>
              <div>
                <p className="text-sm text-brand-muted mb-1">本日の予約数</p>
                <p className="text-2xl font-semibold text-brand-text">12</p>
              </div>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-md">
              <span className="text-xs font-medium text-green-700">+20%</span>
            </div>
          </div>
        </Card>

        {/* 売上見込み */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-sm text-brand-muted mb-1">売上見込み</p>
                <p className="text-2xl font-semibold text-brand-text">¥84,000</p>
              </div>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-md">
              <span className="text-xs font-medium text-green-700">+5%</span>
            </div>
          </div>
        </Card>

        {/* 空き枠 */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                <span className="text-2xl">⏰</span>
              </div>
              <div>
                <p className="text-sm text-brand-muted mb-1">空き枠</p>
                <p className="text-2xl font-semibold text-brand-text">8</p>
              </div>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded-md">
              <span className="text-xs font-medium text-slate-600">-</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
