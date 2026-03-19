import type { DesignKey, DesignProps } from './shared';

import { DarkHero } from './DarkHero';
import { SplitHero } from './SplitHero';
import { Minimal } from './Minimal';
import { Storytelling } from './Storytelling';
import { CardShowcase } from './CardShowcase';
import { Comparison } from './Comparison';
import { Testimonial } from './Testimonial';
import { GradientWave } from './GradientWave';
import { Magazine } from './Magazine';
import { BoldTypography } from './BoldTypography';

export const DESIGNS: Record<DesignKey, React.ComponentType<DesignProps>> = {
  'dark-hero': DarkHero,
  'split-hero': SplitHero,
  'minimal': Minimal,
  'storytelling': Storytelling,
  'card-showcase': CardShowcase,
  'comparison': Comparison,
  'testimonial': Testimonial,
  'gradient-wave': GradientWave,
  'magazine': Magazine,
  'bold-typography': BoldTypography,
};

export type { DesignKey, DesignProps };
