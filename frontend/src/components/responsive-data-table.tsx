"use client";

import { type ReactNode, memo } from "react";
import { type Table, type ColumnDef, type Row, flexRender } from "@tanstack/react-table";
import { motion } from "framer-motion";
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

// Memoized table row to prevent re-renders when sibling rows update
const MemoizedTableRow = memo(function MemoizedTableRow<T>({
  row,
  index,
}: {
  row: Row<T>;
  index: number;
}) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.2 }}
      className="border-b transition-colors duration-150 hover:bg-primary/[0.03] dark:hover:bg-primary/[0.05] last:border-b-0"
    >
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className="px-4 py-3">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </motion.tr>
  );
}) as <T>(props: { row: Row<T>; index: number }) => ReactNode;

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
          "overflow-x-auto rounded-xl border",
          renderMobileCard ? "hidden md:block" : "block",
        )}
      >
        <table className="w-full text-sm table-striped" role="table">
          {caption && (
            <caption className="sr-only">{caption}</caption>
          )}
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/30">
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
                        <div className="h-4 w-full animate-shimmer rounded-md" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, index) => (
                  <MemoizedTableRow key={row.id} row={row} index={index} />
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
                  className="rounded-xl border bg-card p-4 space-y-3 shadow-soft"
                >
                  <div className="h-4 w-2/3 animate-shimmer rounded-md" />
                  <div className="h-3 w-1/2 animate-shimmer rounded-md" />
                  <div className="h-3 w-1/3 animate-shimmer rounded-md" />
                </div>
              ))
            : rows.map((row, i) => (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4), type: "spring" as const, stiffness: 300, damping: 28 }}
                >
                  {renderMobileCard(row.original, i)}
                </motion.div>
              ))}
        </div>
      )}
    </>
  );
}
