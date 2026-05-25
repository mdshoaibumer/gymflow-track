"use client";

import { useReducedMotion } from "framer-motion";
import { memo } from "react";

/**
 * GPU-composited floating orbs for premium hero backgrounds.
 * Uses CSS animations only (no JS per-frame), fully GPU composited via transform/opacity.
 * Respects prefers-reduced-motion.
 */
function FloatingOrbsInner() {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) return null;

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Primary orb — large, slow drift */}
      <div
        className="absolute top-[15%] left-[20%] w-[500px] h-[500px] rounded-full opacity-[0.07] animate-orbit-slow"
        style={{
          background: "radial-gradient(circle, hsl(262 83% 58%) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      {/* Secondary orb — warm accent, medium speed */}
      <div
        className="absolute top-[50%] right-[15%] w-[400px] h-[400px] rounded-full opacity-[0.05] animate-orbit-medium"
        style={{
          background: "radial-gradient(circle, hsl(25 95% 53%) 0%, transparent 70%)",
          filter: "blur(50px)",
        }}
      />
      {/* Tertiary orb — smaller, faster, adds depth */}
      <div
        className="absolute bottom-[20%] left-[40%] w-[300px] h-[300px] rounded-full opacity-[0.06] animate-orbit-fast"
        style={{
          background: "radial-gradient(circle, hsl(280 75% 55%) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      {/* Micro orb — creates perceived depth at corners */}
      <div
        className="absolute top-[35%] right-[35%] w-[200px] h-[200px] rounded-full opacity-[0.04] animate-float"
        style={{
          background: "radial-gradient(circle, hsl(262 83% 68%) 0%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />
    </div>
  );
}

export const FloatingOrbs = memo(FloatingOrbsInner);
