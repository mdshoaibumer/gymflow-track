"use client";

import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-border/50 bg-gradient-to-b from-muted/20 via-background to-muted/10 p-10 text-center animate-content-show",
        className,
      )}
    >
      <div className="relative">
        <div className="absolute -inset-4 rounded-3xl bg-primary/5 blur-2xl animate-pulse-soft" />
        <div className="absolute -inset-8 rounded-full bg-accent-warm/3 blur-3xl opacity-50" />
        <div className="relative rounded-2xl bg-muted/50 p-5 ring-1 ring-border/40 shadow-soft-md transition-all duration-500 ease-spring hover:scale-110 hover:shadow-soft-lg hover:ring-primary/20 animate-float">
          <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
      <div className="max-w-sm space-y-2.5">
        <h3 className="text-base font-semibold font-display tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      {action && (
        <Button onClick={action.onClick} size="sm" className="mt-3 shadow-soft hover:shadow-glow animate-glow-breathe">
          {action.icon && <action.icon className="mr-2 h-4 w-4" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
