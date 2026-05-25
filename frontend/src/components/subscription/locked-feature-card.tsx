"use client";

import Link from "next/link";
import { Lock, Sparkles, ArrowRight, Check } from "lucide-react";
import { motion } from "framer-motion";
import type { FeatureName } from "@/services/billing.service";
import {
  FEATURE_DISPLAY_NAMES,
  FEATURE_DESCRIPTIONS,
} from "@/services/billing.service";
import { useFeatureAccess } from "@/hooks/use-feature-access";

interface LockedFeatureCardProps {
  feature: FeatureName;
  /** Optional: compact mode for inline lock indicators */
  compact?: boolean;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  elite: "Elite",
};

/**
 * Premium upgrade card shown when a feature is locked.
 *
 * Design: Professional, non-aggressive, upgrade-friendly.
 * Shows what the user gets, not what they're missing.
 */
export function LockedFeatureCard({ feature, compact = false }: LockedFeatureCardProps) {
  const { requiredPlan } = useFeatureAccess(feature);
  const displayName = FEATURE_DISPLAY_NAMES[feature];
  const benefits = FEATURE_DESCRIPTIONS[feature];
  const planLabel = PLAN_LABELS[requiredPlan] ?? "Pro";

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/30 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Lock className="h-3 w-3" />
        {planLabel} Plan
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mx-auto max-w-lg"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        {/* Gradient header */}
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-8 pb-6 pt-8">
          <div className="absolute right-4 top-4">
            <Sparkles className="h-5 w-5 text-primary/40" />
          </div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1">
            <Lock className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">
              {planLabel} Feature
            </span>
          </div>
          <h3 className="text-xl font-bold text-foreground">
            Unlock {displayName}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Upgrade to {planLabel} to enable this feature for your gym.
          </p>
        </div>

        {/* Benefits */}
        <div className="px-8 py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What you get
          </p>
          <ul className="space-y-2.5">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                  <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-sm text-foreground">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="border-t bg-muted/30 px-8 py-4">
          <Link
            href="/billing/manage"
            className="group flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-all duration-200 ease-spring hover:bg-primary/90 hover:shadow-glow active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Upgrade to {planLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
