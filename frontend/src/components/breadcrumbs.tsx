"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbsProps {
  /** Override the last breadcrumb label (useful for dynamic pages like member names) */
  overrideLastLabel?: string;
  className?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  members: "Members",
  payments: "Payments",
  attendance: "Attendance",
  reports: "Reports",
  equipment: "Equipment",
  notifications: "Reminders",
  staff: "Staff",
  billing: "Billing",
  settings: "Settings",
  setup: "Setup Wizard",
  manage: "Manage",
  metrics: "Metrics",
};

export function Breadcrumbs({ overrideLastLabel, className }: BreadcrumbsProps) {
  const pathname = usePathname();

  // Build breadcrumb items from pathname
  const segments = pathname
    .split("/")
    .filter((s) => s && s !== "(dashboard)" && s !== "(auth)");

  if (segments.length <= 1) return null;

  const crumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const isLast = index === segments.length - 1;
    const label =
      isLast && overrideLastLabel
        ? overrideLastLabel
        : ROUTE_LABELS[segment] || decodeURIComponent(segment);

    return { href, label, isLast };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", className)}
    >
      <Link
        href="/dashboard"
        className="flex items-center hover:text-foreground transition-colors"
        aria-label="Home"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground truncate max-w-[200px]">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors truncate max-w-[150px]"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
