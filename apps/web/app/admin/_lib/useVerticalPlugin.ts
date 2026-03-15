/**
 * useVerticalPlugin — vertical plugin を hook として提供する
 *
 * Phase 5a: useVertical() + getVerticalPluginUI() を統合し、
 * コンポーネントが直接 plugin.labels / plugin.flags を参照できるようにする。
 */

import { useVertical } from './useVertical';
import { getVerticalPluginUI, type VerticalPluginUI } from '@/src/lib/verticalPlugins';

/**
 * テナントの vertical plugin UI を取得する hook。
 * loading 中は generic fallback を返す（null ではない）。
 */
export function useVerticalPlugin(tenantId: string): {
  plugin: VerticalPluginUI;
  loading: boolean;
} {
  const { vertical, loading } = useVertical(tenantId);
  const plugin = getVerticalPluginUI(vertical);
  return { plugin, loading };
}
