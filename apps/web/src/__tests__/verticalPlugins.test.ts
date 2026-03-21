import { describe, it, expect } from 'vitest';
import { getVerticalPluginUI, type SpecialFeatureKey } from '../lib/verticalPlugins';

const EXPECTED_VERTICALS = [
  'eyebrow', 'nail', 'dental', 'hair', 'esthetic',
  'cleaning', 'handyman', 'pet', 'seitai', 'generic',
];

const VALID_FEATURE_KEYS: SpecialFeatureKey[] = [
  'vaccineRecord', 'progressRecord', 'shootingManagement',
  'treatmentBodyMap', 'colorFormula', 'equipmentCheck',
  'beforeAfterPhoto', 'courseCurriculum', 'petProfile',
  'allergyRecord', 'visitSummary',
];

describe('Vertical Plugin UI Registry', () => {
  it('has all expected verticals registered', () => {
    for (const v of EXPECTED_VERTICALS) {
      const plugin = getVerticalPluginUI(v);
      expect(plugin.key).toBe(v);
    }
  });

  it('each plugin has required labels', () => {
    for (const v of EXPECTED_VERTICALS) {
      const plugin = getVerticalPluginUI(v);
      expect(plugin.label).toBeTruthy();
      expect(plugin.labels.karteTab).toBeTruthy();
      expect(plugin.labels.kpiHeading).toBeTruthy();
    }
  });

  it('specialFeatures contain only valid keys', () => {
    for (const v of EXPECTED_VERTICALS) {
      const plugin = getVerticalPluginUI(v);
      if (plugin.specialFeatures) {
        for (const feat of plugin.specialFeatures) {
          expect(VALID_FEATURE_KEYS).toContain(feat);
        }
      }
    }
  });

  it('getVerticalPluginUI returns generic for unknown vertical', () => {
    expect(getVerticalPluginUI('nonexistent').key).toBe('generic');
    expect(getVerticalPluginUI(null).key).toBe('generic');
    expect(getVerticalPluginUI(undefined).key).toBe('generic');
  });

  it('pet has expected specialFeatures', () => {
    const plugin = getVerticalPluginUI('pet');
    expect(plugin.specialFeatures).toContain('vaccineRecord');
    expect(plugin.specialFeatures).toContain('petProfile');
    expect(plugin.specialFeatures).toContain('beforeAfterPhoto');
  });

  it('nail has expected specialFeatures', () => {
    const plugin = getVerticalPluginUI('nail');
    expect(plugin.specialFeatures).toContain('colorFormula');
    expect(plugin.specialFeatures).toContain('beforeAfterPhoto');
    expect(plugin.specialFeatures).toContain('visitSummary');
  });

  it('generic has no specialFeatures', () => {
    const plugin = getVerticalPluginUI('generic');
    expect(plugin.specialFeatures ?? []).toHaveLength(0);
  });
});
