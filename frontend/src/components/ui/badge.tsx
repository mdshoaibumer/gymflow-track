import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-red-50 text-red-700 shadow-[0_0_0_1px_rgba(239,68,68,0.08)] dark:bg-red-950/30 dark:text-red-400 dark:shadow-none",
        outline: "text-foreground border-border/70",
        success: "border-transparent bg-emerald-50 text-emerald-700 shadow-[0_0_0_1px_rgba(16,185,129,0.08)] dark:bg-emerald-950/30 dark:text-emerald-400 dark:shadow-none",
        warning: "border-transparent bg-amber-50 text-amber-700 shadow-[0_0_0_1px_rgba(245,158,11,0.08)] dark:bg-amber-950/30 dark:text-amber-400 dark:shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
