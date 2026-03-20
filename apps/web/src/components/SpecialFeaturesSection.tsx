'use client';
import Link from 'next/link';
import { withTenant } from '@/src/lib/useAdminTenantId';
import { getVerticalPluginUI, type SpecialFeatureKey } from '@/src/lib/verticalPlugins';
import { FileText, Palette, Syringe, ShieldAlert, ClipboardCheck, Camera, PawPrint, User, TrendingUp, BookOpen, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  FileText, Palette, Syringe, ShieldAlert, ClipboardCheck, Camera, PawPrint, User, TrendingUp, BookOpen,
};

const FEATURE_META: Record<SpecialFeatureKey, { label: string; description: string; href: string; icon: string }> = {
  visitSummary: { label: '施術メモ', description: '来店ごとの施術内容・お客様の要望を記録', href: '/admin/visit-summary', icon: 'FileText' },
  colorFormula: { label: 'カラーレシピ', description: '顧客ごとのカラー配合・使用薬剤の記録', href: '/admin/color-formula', icon: 'Palette' },
  vaccineRecord: { label: 'ワクチン記録', description: 'ワクチン接種履歴と有効期限のアラート', href: '/admin/vaccine-record', icon: 'Syringe' },
  allergyRecord: { label: 'アレルギー記録', description: 'アレルギー情報と禁忌事項の管理', href: '/admin/allergy-record', icon: 'ShieldAlert' },
  equipmentCheck: { label: '機器チェック', description: '作業前後の機器・道具の点検記録', href: '/admin/equipment-check', icon: 'ClipboardCheck' },
  beforeAfterPhoto: { label: 'ビフォーアフター', description: '施術前後の写真を記録・比較表示', href: '/admin/before-after', icon: 'Camera' },
  petProfile: { label: 'ペットカルテ', description: 'ペットの犬種・体重・アレルギーの管理', href: '/admin/pet/profiles', icon: 'PawPrint' },
  treatmentBodyMap: { label: '施術部位マップ', description: '施術部位・症状を人体図上で記録', href: '/admin/treatment-body-map', icon: 'User' },
  progressRecord: { label: '成績・進捗', description: '生徒の成績推移や学習進捗の記録', href: '/admin/progress', icon: 'TrendingUp' },
  shootingManagement: { label: '撮影管理', description: '撮影カット数・データ納品の管理', href: '/admin/shooting', icon: 'Camera' },
  courseCurriculum: { label: 'カリキュラム', description: 'コース進行・受講状況の管理', href: '/admin/curriculum', icon: 'BookOpen' },
};

export default function SpecialFeaturesSection({ vertical, tenantId }: { vertical: string; tenantId: string }) {
  const plugin = getVerticalPluginUI(vertical);
  const features = plugin.specialFeatures;
  if (!features || features.length === 0) return null;

  return (
    <section className="px-6 pb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">業務特化機能</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((key) => {
          const meta = FEATURE_META[key];
          if (!meta) return null;
          const Icon = ICONS[meta.icon];
          return (
            <Link
              key={key}
              href={withTenant(meta.href, tenantId)}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {Icon && <Icon size={24} className="text-indigo-500" />}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{meta.label}</p>
                  <p className="text-sm text-gray-500 truncate">{meta.description}</p>
                  <p className="text-sm text-indigo-600 font-medium mt-2">開く →</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
