"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Direction-aware page transition with GPU-composited transforms only.
 * Forward navigation (deeper): slides in from right.
 * Back navigation (shallower): slides in from left.
 * Exit animations run at ~65% of enter duration (UI/UX Pro Max: exit-faster-than-enter).
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const directionRef = useRef(1);

  // Calculate direction in an effect to avoid mutating ref during render
  useEffect(() => {
    const prevSegments = prevPathRef.current.split("/").filter(Boolean).length;
    const currSegments = pathname.split("/").filter(Boolean).length;
    directionRef.current = currSegments >= prevSegments ? 1 : -1;
    prevPathRef.current = pathname;
  }, [pathname]);

  const direction = directionRef.current;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        className={className}
        initial={{ opacity: 0, x: 10 * direction, scale: 0.995 }}
        animate={{
          opacity: 1,
          x: 0,
          scale: 1,
          transition: { type: "spring", stiffness: 380, damping: 34, mass: 0.6 },
        }}
        exit={{
          opacity: 0,
          x: -6 * direction,
          scale: 0.998,
          transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
