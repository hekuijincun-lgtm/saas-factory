'use client';

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

// ── Shared defaults ────────────────────────────────────────────────
const DURATION = 0.5;
const EASE = [0.25, 0.1, 0.25, 1] as const;

// Respect prefers-reduced-motion — framer-motion does this internally
// when using `whileInView`, but we also skip transform for safety.
const reducedMotion = typeof window !== 'undefined'
  ? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  : false;

// ── Variant factories ──────────────────────────────────────────────

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: reducedMotion ? 0 : 24 },
  visible: { opacity: 1, y: 0 },
};

const fadeLeftVariants: Variants = {
  hidden: { opacity: 0, x: reducedMotion ? 0 : -32 },
  visible: { opacity: 1, x: 0 },
};

const fadeRightVariants: Variants = {
  hidden: { opacity: 0, x: reducedMotion ? 0 : 32 },
  visible: { opacity: 1, x: 0 },
};

const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: reducedMotion ? 1 : 0.92 },
  visible: { opacity: 1, scale: 1 },
};

// ── Shared props ───────────────────────────────────────────────────

interface AnimProps {
  children: ReactNode;
  className?: string;
  /** Extra delay in seconds (added on top of any stagger) */
  delay?: number;
  /** Duration override */
  duration?: number;
  /** Once = true (default). Set false to re-animate on re-enter. */
  once?: boolean;
  /** Viewport margin for triggering (default "-60px") */
  margin?: string;
}

const viewportOpts = (once: boolean, margin: string) => ({
  once,
  margin: margin as `${number}px`,
  amount: 0.15 as const,
});

// ── Components ─────────────────────────────────────────────────────

/** Fade up from below — the default scroll-reveal animation. */
export function FadeInUp({
  children, className, delay = 0, duration = DURATION, once = true, margin = '-60px',
}: AnimProps) {
  return (
    <motion.div
      className={className}
      variants={fadeUpVariants}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOpts(once, margin)}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Slide in from the left. */
export function FadeInLeft({
  children, className, delay = 0, duration = DURATION, once = true, margin = '-60px',
}: AnimProps) {
  return (
    <motion.div
      className={className}
      variants={fadeLeftVariants}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOpts(once, margin)}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Slide in from the right. */
export function FadeInRight({
  children, className, delay = 0, duration = DURATION, once = true, margin = '-60px',
}: AnimProps) {
  return (
    <motion.div
      className={className}
      variants={fadeRightVariants}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOpts(once, margin)}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Scale up while fading in — good for CTAs and hero elements. */
export function ScaleIn({
  children, className, delay = 0, duration = DURATION, once = true, margin = '-60px',
}: AnimProps) {
  return (
    <motion.div
      className={className}
      variants={scaleInVariants}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOpts(once, margin)}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// ── Stagger container ──────────────────────────────────────────────

interface StaggerProps {
  children: ReactNode;
  className?: string;
  /** Delay between each child (default 0.1s) */
  stagger?: number;
  /** Once = true (default) */
  once?: boolean;
  margin?: string;
}

const staggerContainerVariants = (stagger: number): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger } },
});

/** Wraps children so each animates in sequence. Children should use StaggerItem. */
export function StaggerContainer({
  children, className, stagger = 0.1, once = true, margin = '-60px',
}: StaggerProps) {
  return (
    <motion.div
      className={className}
      variants={staggerContainerVariants(stagger)}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOpts(once, margin)}
    >
      {children}
    </motion.div>
  );
}

/** A single item inside StaggerContainer — fades up. */
export function StaggerItem({
  children, className,
}: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={fadeUpVariants}
      transition={{ duration: DURATION, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
