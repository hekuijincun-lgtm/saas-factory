'use client';

import { useEffect, useRef, useState } from 'react';

interface RevealProps {
  children: React.ReactNode;
  /** Extra Tailwind classes forwarded to the wrapper div (e.g. "h-full", "sm:col-span-2") */
  className?: string;
  /** Stagger delay in ms — pass i * 80 for cards */
  delay?: number;
}

/**
 * Fade-up reveal on scroll.
 * • Pure IntersectionObserver + CSS — zero extra deps.
 * • Respects prefers-reduced-motion: shows content immediately with no animation.
 * • SSR-safe: server renders opacity-0/translate-y-5, client animates in after mount.
 */
export function Reveal({ children, className = '', delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Respect user preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    let tid: ReturnType<typeof setTimeout>;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (delay) {
            tid = setTimeout(() => setVisible(true), delay);
          } else {
            setVisible(true);
          }
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' },
    );

    obs.observe(el);
    return () => {
      obs.disconnect();
      clearTimeout(tid);
    };
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
      } ${className}`}
    >
      {children}
    </div>
  );
}
