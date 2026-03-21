import { describe, it, expect } from 'vitest';
import {
  getVerticalPlugin,
  getAllVerticalPlugins,
  type SpecialFeatureKey,
  SPECIAL_FEATURE_CATALOG,
} from '../verticals/registry';

const EXPECTED_VERTICALS = [
  'eyebrow', 'nail', 'dental', 'hair', 'esthetic',
  'cleaning', 'handyman', 'pet', 'seitai', 'generic',
];

const VALID_FEATURE_KEYS = Object.keys(SPECIAL_FEATURE_CATALOG) as SpecialFeatureKey[];

describe('Vertical Plugin Registry', () => {
  it('has all expected verticals registered', () => {
    const plugins = getAllVerticalPlugins();
    const keys = plugins.map(p => p.key);
    for (const v of EXPECTED_VERTICALS) {
      expect(keys).toContain(v);
    }
  });

  it('each plugin has required fields', () => {
    for (const plugin of getAllVerticalPlugins()) {
      expect(plugin.key).toBeTruthy();
      expect(plugin.coreType).toMatch(/^(reservation|project|subscription|ec)$/);
      expect(plugin.label).toBeTruthy();
      expect(plugin.labels).toBeDefined();
      expect(plugin.flags).toBeDefined();

      // labels must have all required keys
      expect(plugin.labels.karteTab).toBeTruthy();
      expect(plugin.labels.kpiHeading).toBeTruthy();
      expect(plugin.labels.settingsHeading).toBeTruthy();

      // flags must be booleans
      expect(typeof plugin.flags.hasKarte).toBe('boolean');
      expect(typeof plugin.flags.hasMenuFilter).toBe('boolean');
      expect(typeof plugin.flags.hasVerticalKpi).toBe('boolean');
    }
  });

  it('specialFeatures contain only valid keys', () => {
    for (const plugin of getAllVerticalPlugins()) {
      if (plugin.specialFeatures) {
        for (const feat of plugin.specialFeatures) {
          expect(VALID_FEATURE_KEYS).toContain(feat);
        }
      }
    }
  });

  it('getVerticalPlugin returns generic for unknown vertical', () => {
    const plugin = getVerticalPlugin('unknown_vertical_xyz');
    expect(plugin.key).toBe('generic');
  });

  it('getVerticalPlugin returns generic for null/undefined', () => {
    expect(getVerticalPlugin(null).key).toBe('generic');
    expect(getVerticalPlugin(undefined).key).toBe('generic');
  });

  it('seitai plugin has correct specialFeatures', () => {
    const plugin = getVerticalPlugin('seitai');
    expect(plugin.key).toBe('seitai');
    expect(plugin.specialFeatures).toContain('treatmentBodyMap');
    expect(plugin.specialFeatures).toContain('beforeAfterPhoto');
    expect(plugin.specialFeatures).toContain('visitSummary');
  });
});
