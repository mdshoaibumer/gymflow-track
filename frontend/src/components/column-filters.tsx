"use client";

import { useState, useRef, useEffect } from "react";
import { Filter, X, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  key: string;
  label: string;
  options: FilterOption[];
}

interface ColumnFiltersProps {
  definitions: FilterDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

export function ColumnFilters({ definitions, values, onChange, onClear }: ColumnFiltersProps) {
  const [open, setOpen] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeCount = Object.values(values).filter(Boolean).length;

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectedColumn(null);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSelectedColumn(null);
      }
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open]);

  const handleSelectValue = (key: string, value: string) => {
    onChange(key, value);
    setSelectedColumn(null);
    setOpen(false);
  };

  const handleRemoveFilter = (key: string) => {
    onChange(key, "");
  };

  const activeFilters = definitions.filter((d) => values[d.key]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Filter Trigger */}
      <div className="relative" ref={panelRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setOpen(!open); setSelectedColumn(null); }}
          className={cn(
            "h-9 gap-1.5 border-dashed",
            activeCount > 0 && "border-primary/50 bg-primary/5"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          <span>Filters</span>
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 min-w-[20px] rounded-full px-1.5 text-[11px] font-semibold bg-primary text-primary-foreground"
            >
              {activeCount}
            </Badge>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </Button>

        {/* Dropdown Panel */}
        {open && (
          <div className="absolute left-0 top-full z-50 mt-2 min-w-[220px] rounded-xl border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
            {!selectedColumn ? (
              // Column Selection
              <div className="p-1">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Filter by column
                </p>
                {definitions.map((def) => (
                  <button
                    key={def.key}
                    onClick={() => setSelectedColumn(def.key)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      values[def.key] && "text-primary font-medium"
                    )}
                  >
                    <span>{def.label}</span>
                    {values[def.key] && (
                      <Badge variant="secondary" className="text-[11px] h-5 px-1.5">
                        {def.options.find((o) => o.value === values[def.key])?.label || values[def.key]}
                      </Badge>
                    )}
                  </button>
                ))}
                {activeCount > 0 && (
                  <>
                    <div className="my-1 border-t" />
                    <button
                      onClick={() => { onClear(); setOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <X className="h-3.5 w-3.5" />
                      Clear all filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              // Value Selection
              <div className="p-1">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    onClick={() => setSelectedColumn(null)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Back
                  </button>
                  <span className="text-xs font-medium text-muted-foreground ml-auto">
                    {definitions.find((d) => d.key === selectedColumn)?.label}
                  </span>
                </div>
                <div className="my-1 border-t" />
                {/* "All" option to clear this filter */}
                <button
                  onClick={() => handleSelectValue(selectedColumn, "")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent",
                    !values[selectedColumn] && "bg-accent font-medium"
                  )}
                >
                  <span>All</span>
                  {!values[selectedColumn] && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
                {definitions
                  .find((d) => d.key === selectedColumn)
                  ?.options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSelectValue(selectedColumn, opt.value)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent",
                        values[selectedColumn] === opt.value && "bg-accent font-medium"
                      )}
                    >
                      <span className="capitalize">{opt.label}</span>
                      {values[selectedColumn] === opt.value && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeFilters.map((def) => (
        <Badge
          key={def.key}
          variant="secondary"
          className="h-7 gap-1 pl-2.5 pr-1 text-xs font-normal bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 transition-colors"
        >
          <span className="text-muted-foreground mr-0.5">{def.label}:</span>
          <span className="font-medium capitalize">
            {def.options.find((o) => o.value === values[def.key])?.label || values[def.key]}
          </span>
          <button
            onClick={() => handleRemoveFilter(def.key)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
            aria-label={`Remove ${def.label} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      {/* Clear All - only show outside when 2+ filters active */}
      {activeCount >= 2 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={onClear}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
