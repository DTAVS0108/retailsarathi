'use client';

import { useEffect, useRef, useState } from 'react';

export function useScrollReveal<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

export function revealClass(visible: boolean, delayClass = '', variant: 'up' | 'scale' = 'up') {
  if (variant === 'scale') {
    return visible
      ? `reveal-scale-visible ${delayClass}`.trim()
      : `reveal-scale-hidden ${delayClass}`.trim();
  }
  return visible
    ? `reveal-visible ${delayClass}`.trim()
    : `reveal-hidden ${delayClass}`.trim();
}
