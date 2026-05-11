"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  const canGoPrev = page > 0;
  const canGoNext = page < totalPages - 1;

  // Generate page numbers to show (max 5 visible)
  const getPageNumbers = (): (number | "ellipsis")[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i);
    }
    const pages: (number | "ellipsis")[] = [];
    if (page <= 2) {
      pages.push(0, 1, 2, "ellipsis", totalPages - 1);
    } else if (page >= totalPages - 3) {
      pages.push(0, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1);
    } else {
      pages.push(0, "ellipsis", page - 1, page, page + 1, "ellipsis", totalPages - 1);
    }
    return pages;
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {/* Info + page size */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          Showing {start}–{end} of {total}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 hidden sm:inline-flex"
          onClick={() => onPageChange(0)}
          disabled={!canGoPrev}
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page - 1)}
          disabled={!canGoPrev}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Page numbers — hidden on very small screens */}
        <div className="hidden sm:flex items-center gap-1">
          {getPageNumbers().map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 text-xs"
                onClick={() => onPageChange(p)}
              >
                {p + 1}
              </Button>
            ),
          )}
        </div>

        {/* Mobile page indicator */}
        <span className="px-2 text-sm text-muted-foreground sm:hidden">
          {page + 1} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page + 1)}
          disabled={!canGoNext}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 hidden sm:inline-flex"
          onClick={() => onPageChange(totalPages - 1)}
          disabled={!canGoNext}
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
