"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/**
 * Thin scroll-progress bar at top of page.
 * GPU-composited (scaleX only). Auto-hides when at top.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 200,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className="scroll-progress"
      style={{ scaleX }}
      aria-hidden="true"
    />
  );
}
