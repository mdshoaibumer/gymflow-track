"use client";

interface ChartTooltipContentProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
  formatter?: (value: number, name: string) => string;
  labelFormatter?: (label: string) => string;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;

  const displayLabel = labelFormatter ? labelFormatter(label ?? "") : label;

  return (
    <div className="animate-scale-in rounded-xl border border-border/50 bg-card/95 backdrop-blur-xl px-4 py-3 shadow-soft-lg dark:shadow-dark-soft-lg dark:ring-1 dark:ring-white/[0.06]">
      {displayLabel && (
        <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          {displayLabel}
        </p>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, index) => {
          const displayValue = formatter
            ? formatter(entry.value, entry.name)
            : entry.value.toLocaleString("en-IN");
          return (
            <div key={index} className="flex items-center gap-2.5 text-sm">
              <div
                className="h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-card"
                style={{ backgroundColor: entry.color, boxShadow: `0 0 8px ${entry.color}50` }}
              />
              <span className="text-muted-foreground text-xs">{entry.name}</span>
              <span className="font-bold text-foreground ml-auto tabular-nums">{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
