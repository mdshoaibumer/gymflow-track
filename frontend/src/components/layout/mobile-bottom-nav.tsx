"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Users, CalendarCheck, CreditCard, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui-store";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/members", label: "Members", icon: Users },
  { href: "/attendance", label: "Check-in", icon: CalendarCheck },
  { href: "/payments", label: "Payments", icon: CreditCard },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const { setSidebarOpen } = useUIStore();

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label="Mobile navigation">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("mobile-nav-item", isActive && "active")}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon
              className={cn(
                "mobile-nav-icon h-5 w-5 transition-transform duration-200",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span
              className={cn(
                "text-[11px] font-medium",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="mobile-nav-item"
        aria-label="Open menu"
      >
        <MoreHorizontal className="mobile-nav-icon h-5 w-5 text-muted-foreground transition-transform duration-200" />
        <span className="text-[11px] font-medium text-muted-foreground">More</span>
      </button>
    </nav>
  );
}
