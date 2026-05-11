"use client";

import { type ReactNode } from "react";
import { type Table, type ColumnDef, flexRender } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

interface ResponsiveDataTableProps<T> {
  table: Table<T>;
  columns: ColumnDef<T>[];
  /** Render a mobile card for each row. If omitted, falls back to horizontal scroll. */
  renderMobileCard?: (row: T, index: number) => ReactNode;
  /** Table caption for accessibility */
  caption?: string;
  isLoading?: boolean;
  loadingRows?: number;
}

export function ResponsiveDataTable<T>({
  table,
  columns,
  renderMobileCard,
  caption,
  isLoading,
  loadingRows = 5,
}: ResponsiveDataTableProps<T>) {
  const rows = table.getRowModel().rows;

  return (
    <>
      {/* Desktop table — hidden on small screens when mobile cards are available */}
      <div
        className={cn(
          "overflow-x-auto rounded-md border",
          renderMobileCard ? "hidden md:block" : "block",
        )}
      >
        <table className="w-full text-sm" role="table">
          {caption && (
            <caption className="sr-only">{caption}</caption>
          )}
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: loadingRows }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    {columns.map((_, ci) => (
                      <td key={ci} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b transition-colors hover:bg-muted/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards — shown only on small screens */}
      {renderMobileCard && (
        <div className="space-y-3 md:hidden">
          {isLoading
            ? Array.from({ length: loadingRows }).map((_, i) => (
                <div
                  key={`mskel-${i}`}
                  className="rounded-lg border bg-card p-4 space-y-3"
                >
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              ))
            : rows.map((row, i) => renderMobileCard(row.original, i))}
        </div>
      )}
    </>
  );
}
