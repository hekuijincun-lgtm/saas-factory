import { describe, it, expect } from 'vitest';
import { SPECIAL_FEATURE_CATALOG, type SpecialFeatureKey } from '../verticals/registry';

const ALL_FEATURE_KEYS: SpecialFeatureKey[] = [
  'vaccineRecord', 'progressRecord', 'shootingManagement',
  'treatmentBodyMap', 'colorFormula', 'equipmentCheck',
  'beforeAfterPhoto', 'courseCurriculum', 'petProfile',
  'allergyRecord', 'visitSummary',
];

describe('SPECIAL_FEATURE_CATALOG', () => {
  it('has all 11 features defined', () => {
    const catalogKeys = Object.keys(SPECIAL_FEATURE_CATALOG);
    expect(catalogKeys).toHaveLength(11);
    for (const key of ALL_FEATURE_KEYS) {
      expect(catalogKeys).toContain(key);
    }
  });

  it('each feature has label and description', () => {
    for (const key of ALL_FEATURE_KEYS) {
      const config = SPECIAL_FEATURE_CATALOG[key];
      expect(config.key).toBe(key);
      expect(config.label).toBeTruthy();
      expect(typeof config.label).toBe('string');
      expect(config.description).toBeTruthy();
      expect(typeof config.description).toBe('string');
    }
  });

  it('each feature has adminRoute', () => {
    for (const key of ALL_FEATURE_KEYS) {
      const config = SPECIAL_FEATURE_CATALOG[key];
      expect(config.adminRoute).toBeTruthy();
      expect(config.adminRoute).toMatch(/^\/admin\//);
    }
  });

  it('each feature has suitableFor array', () => {
    for (const key of ALL_FEATURE_KEYS) {
      const config = SPECIAL_FEATURE_CATALOG[key];
      expect(Array.isArray(config.suitableFor)).toBe(true);
      expect(config.suitableFor.length).toBeGreaterThan(0);
    }
  });
});
