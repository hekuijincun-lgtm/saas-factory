'use client';

import { useEffect } from 'react';

/**
 * Activates scroll-triggered animations via IntersectionObserver.
 * Elements with class `pet-animate` (or variants) get `pet-visible` added
 * when they scroll into view. CSS handles the actual transition.
 *
 * No initial inline styles — elements start hidden via CSS class,
 * so if JS fails they remain visible (the CSS class is only applied
 * after hydration via this component).
 */
export function ScrollAnimator() {
  useEffect(() => {
    const selectors = '.pet-animate, .pet-animate-left, .pet-animate-right, .pet-animate-scale';
    const els = document.querySelectorAll(selectors);
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('pet-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
