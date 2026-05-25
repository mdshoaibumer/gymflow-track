import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-shimmer rounded-lg bg-muted/80", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
