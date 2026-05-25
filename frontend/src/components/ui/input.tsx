import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-3.5 py-2 text-base md:text-sm ring-offset-background transition-all duration-200 ease-spring file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/50 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-primary focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)] disabled:cursor-not-allowed disabled:opacity-50",
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
