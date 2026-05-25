"use client";

import { motion, useInView } from "framer-motion";
import { useRef, type ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  duration?: number;
  once?: boolean;
  threshold?: number;
}

const directionOffsets = {
  up: { y: 24, x: 0 },
  down: { y: -24, x: 0 },
  left: { x: 24, y: 0 },
  right: { x: -24, y: 0 },
};

/**
 * Wraps content with scroll-triggered entrance animation.
 * Performance-optimized: uses transform + opacity only (GPU-composited).
 * Respects prefers-reduced-motion automatically via Framer Motion.
 */
export function ScrollReveal({
  children,
  className,
  delay = 0,
  direction = "up",
  duration = 0.5,
  once = true,
  threshold,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, margin: threshold ? `${-threshold}px` : "-80px" });

  const offset = directionOffsets[direction];

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, x: offset.x, y: offset.y }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: offset.x, y: offset.y }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1], // ease-spring
      }}
    >
      {children}
    </motion.div>
  );
}

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  threshold?: number;
}

/**
 * Container that staggers children animation on scroll into view.
 * Higher threshold prevents overlap with other stagger groups.
 */
export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.08,
  threshold,
}: StaggerContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: threshold ? `${-threshold}px` : "-60px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? "show" : "hidden"}
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: staggerDelay, delayChildren: 0.1 },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};
