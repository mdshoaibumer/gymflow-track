import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50",
          "transition-[border-color,box-shadow,background-color] duration-200 ease-spring",
          "hover:border-primary/30 hover:bg-background/80 hover:shadow-[0_2px_8px_-3px_hsl(var(--primary)/0.08)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-primary focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.08),0_2px_12px_-4px_hsl(var(--primary)/0.12)]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
