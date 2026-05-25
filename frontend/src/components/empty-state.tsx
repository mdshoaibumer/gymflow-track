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
        "flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-border/60 bg-gradient-to-b from-muted/30 to-background p-10 text-center animate-content-show",
        className,
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-xl bg-primary/5 blur-xl animate-pulse-soft" />
        <div className="relative rounded-xl bg-muted/60 p-4 ring-1 ring-border/50 transition-transform duration-300 ease-spring hover:scale-105 animate-float">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-base font-semibold font-display">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      {action && (
        <Button onClick={action.onClick} size="sm" className="mt-1">
          {action.icon && <action.icon className="mr-2 h-4 w-4" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
