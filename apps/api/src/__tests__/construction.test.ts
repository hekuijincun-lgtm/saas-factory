import { describe, it, expect } from 'vitest';
import { getVerticalPlugin, getAllVerticalPlugins } from '../verticals/registry';

describe('Construction / Reform / Equipment verticals', () => {
  it('construction plugin exists with coreType=project', () => {
    const plugin = getVerticalPlugin('construction');
    expect(plugin.key).toBe('construction');
    expect(plugin.coreType).toBe('project');
    expect(plugin.label).toBe('工務店・建設');
  });

  it('reform plugin exists with coreType=project', () => {
    const plugin = getVerticalPlugin('reform');
    expect(plugin.key).toBe('reform');
    expect(plugin.coreType).toBe('project');
    expect(plugin.label).toBe('リフォーム');
  });

  it('equipment plugin exists with coreType=project', () => {
    const plugin = getVerticalPlugin('equipment');
    expect(plugin.key).toBe('equipment');
    expect(plugin.coreType).toBe('project');
    expect(plugin.label).toBe('設備工事');
  });

  it('all 3 project verticals are in registry', () => {
    const all = getAllVerticalPlugins();
    const projectVerticals = all.filter(p => p.coreType === 'project');
    expect(projectVerticals.length).toBe(3);
    const keys = projectVerticals.map(p => p.key).sort();
    expect(keys).toEqual(['construction', 'equipment', 'reform']);
  });

  it('construction has correct onboarding checks', () => {
    const plugin = getVerticalPlugin('construction');
    const checks = plugin.getOnboardingChecks({ menuVerticalCount: 0, repeatEnabled: false, templateSet: false });
    expect(checks.length).toBeGreaterThanOrEqual(3);
    expect(checks[0].key).toBe('projectSetup');
  });

  it('construction has correct specialFeatures', () => {
    const plugin = getVerticalPlugin('construction');
    expect(plugin.specialFeatures).toContain('beforeAfterPhoto');
    expect(plugin.specialFeatures).toContain('equipmentCheck');
  });

  it('reform has beforeAfterPhoto feature', () => {
    const plugin = getVerticalPlugin('reform');
    expect(plugin.specialFeatures).toContain('beforeAfterPhoto');
  });

  it('equipment has equipmentCheck feature', () => {
    const plugin = getVerticalPlugin('equipment');
    expect(plugin.specialFeatures).toContain('equipmentCheck');
  });

  it('all project plugins have defaultMenu', () => {
    for (const key of ['construction', 'reform', 'equipment']) {
      const plugin = getVerticalPlugin(key);
      const menu = plugin.defaultMenu();
      expect(menu.length).toBeGreaterThanOrEqual(5);
      expect(menu[0]).toHaveProperty('name');
      expect(menu[0]).toHaveProperty('price');
    }
  });

  it('unknown vertical falls back to generic', () => {
    const plugin = getVerticalPlugin('nonexistent');
    expect(plugin.key).toBe('generic');
  });
});
