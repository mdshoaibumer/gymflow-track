"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface UpgradePromptProps {
  /** Warning severity: soft (80%), hard (95%), limit (100%) */
  level: "soft" | "hard" | "limit";
  /** Resource type: "members" or "staff" */
  resource: "members" | "staff";
  /** Current count */
  current: number;
  /** Maximum allowed */
  max: number;
  /** Whether the resource is unlimited */
  isUnlimited?: boolean;
}

/**
 * Contextual upgrade prompt shown when usage approaches limits.
 *
 * Soft (80%): Subtle, informational
 * Hard (95%): More visible, encouraging
 * Limit (100%): Clear but not aggressive — blocks NEW creation only
 */
export function UpgradePrompt({
  level,
  resource,
  current,
  max,
  isUnlimited = false,
}: UpgradePromptProps) {
  if (isUnlimited) return null;

  const resourceLabel = resource === "members" ? "active members" : "staff accounts";

  const config = {
    soft: {
      icon: TrendingUp,
      bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
      text: "text-amber-800 dark:text-amber-200",
      message: `You're using ${current} of ${max} ${resourceLabel}. Consider upgrading for more capacity.`,
      cta: "View Plans",
    },
    hard: {
      icon: AlertTriangle,
      bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
      text: "text-orange-800 dark:text-orange-200",
      message: `Almost at capacity: ${current} of ${max} ${resourceLabel} used. Upgrade to avoid disruption.`,
      cta: "Upgrade Now",
    },
    limit: {
      icon: AlertTriangle,
      bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
      text: "text-red-800 dark:text-red-200",
      message: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)} limit reached (${current}/${max}). Upgrade to add more.`,
      cta: "Upgrade Plan",
    },
  };

  const { icon: Icon, bg, text, message, cta } = config[level];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
        className={`rounded-lg border px-4 py-3 ${bg}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${text}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${text}`}>{message}</p>
          </div>
          <Link
            href="/billing/manage"
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${text} hover:underline`}
          >
            {cta}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
