import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import SpecialFeaturesSection from '@/src/components/SpecialFeaturesSection';

// Mock next/link to render a simple anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) =>
    createElement('a', { href, ...props }, children),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const Icon = ({ size, className }: any) =>
    createElement('svg', { 'data-testid': 'icon', className });
  return {
    FileText: Icon, Palette: Icon, Syringe: Icon, ShieldAlert: Icon,
    ClipboardCheck: Icon, Camera: Icon, PawPrint: Icon, User: Icon,
    TrendingUp: Icon, BookOpen: Icon,
  };
});

afterEach(() => cleanup());

describe('SpecialFeaturesSection', () => {
  it('renders pet features correctly', () => {
    render(createElement(SpecialFeaturesSection, { vertical: 'pet', tenantId: 't1' }));
    expect(screen.getByText('業務特化機能')).toBeInTheDocument();
    expect(screen.getByText('ワクチン記録')).toBeInTheDocument();
    expect(screen.getByText('ペットカルテ')).toBeInTheDocument();
    expect(screen.getByText('ビフォーアフター')).toBeInTheDocument();
  });

  it('renders nail features correctly', () => {
    render(createElement(SpecialFeaturesSection, { vertical: 'nail', tenantId: 't1' }));
    expect(screen.getByText('カラーレシピ')).toBeInTheDocument();
    expect(screen.getByText('ビフォーアフター')).toBeInTheDocument();
    expect(screen.getByText('施術メモ')).toBeInTheDocument();
  });

  it('renders nothing for generic vertical', () => {
    const { container } = render(
      createElement(SpecialFeaturesSection, { vertical: 'generic', tenantId: 't1' })
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders seitai features correctly', () => {
    render(createElement(SpecialFeaturesSection, { vertical: 'seitai', tenantId: 't1' }));
    expect(screen.getByText('業務特化機能')).toBeInTheDocument();
    expect(screen.getByText('施術部位マップ')).toBeInTheDocument();
    expect(screen.getByText('ビフォーアフター')).toBeInTheDocument();
    expect(screen.getByText('施術メモ')).toBeInTheDocument();
  });
});
