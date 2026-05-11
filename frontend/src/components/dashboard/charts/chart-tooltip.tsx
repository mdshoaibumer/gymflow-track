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
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
      {displayLabel && (
        <p className="text-xs font-medium text-muted-foreground mb-1.5">
          {displayLabel}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const displayValue = formatter
            ? formatter(entry.value, entry.name)
            : String(entry.value);
          return (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-semibold">{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
