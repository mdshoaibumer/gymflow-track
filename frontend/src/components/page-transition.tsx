"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wraps page content with a smooth fade+slide transition on route changes.
 * Uses AnimatePresence with unique key per pathname.
 * Performance: only animates opacity + translateY (GPU-composited).
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        className={className}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, scale: 0.99 }}
        transition={{
          duration: 0.25,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
