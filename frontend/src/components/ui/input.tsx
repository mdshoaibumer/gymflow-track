import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-3.5 py-2 text-base md:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50",
          // Smooth interaction states
          "transition-[border-color,box-shadow,background-color,transform] duration-200 ease-spring",
          // Hover: subtle elevation + border hint
          "hover:border-primary/30 hover:bg-background/80 hover:shadow-[0_2px_8px_-3px_hsl(var(--primary)/0.08)]",
          // Focus: ring + border + glow + micro-scale
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-primary focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.08),0_2px_12px_-4px_hsl(var(--primary)/0.12)] focus-visible:scale-[1.005]",
          // Active: pressed feel
          "active:scale-[0.998]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
