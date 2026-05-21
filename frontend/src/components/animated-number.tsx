"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatFn?: (n: number) => string;
  className?: string;
}

/**
 * Animates a number counting up from 0 to target value when in view.
 * Uses requestAnimationFrame for smooth 60fps performance.
 */
export function AnimatedNumber({
  value,
  duration = 600,
  formatFn = (n) => String(Math.round(n)),
  className,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [displayValue, setDisplayValue] = useState("0");

  useEffect(() => {
    if (!isInView) return;

    const startTime = performance.now();
    const startValue = 0;
    const endValue = value;

    // Respect reduced motion preference or skip in test environments
    const isTestEnv = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced || isTestEnv) {
      setDisplayValue(formatFn(endValue));
      return;
    }

    let rafId: number;

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;

      setDisplayValue(formatFn(current));

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    }

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isInView, value, duration, formatFn]);

  return (
    <span ref={ref} className={className}>
      {displayValue}
    </span>
  );
}
