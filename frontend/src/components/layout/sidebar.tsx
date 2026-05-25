"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  Bell,
  Wrench,
  Rocket,
  Receipt,
  Settings,
  ShieldCheck,
  FileSpreadsheet,
  X,
  Lock,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store/ui-store";
import { useAuthStore } from "@/store/auth-store";
import { useFeatureLimits } from "@/hooks/use-billing";
import type { UserRole } from "@/types";
import type { FeatureName } from "@/services/billing.service";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Roles allowed to see this item. Omit for all roles. */
  roles?: UserRole[];
  /** Feature required to show this item. If locked, shows lock icon. */
  requiredFeature?: FeatureName;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/members", label: "Members", icon: Users },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck, requiredFeature: "qr_attendance" },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet, roles: ["owner", "admin"], requiredFeature: "export_reports" },
  { href: "/equipment", label: "Equipment", icon: Wrench },
  { href: "/notifications", label: "Reminders", icon: Bell },
  { href: "/staff", label: "Staff", icon: ShieldCheck, roles: ["owner", "admin"] },
  { href: "/billing/manage", label: "Billing", icon: Receipt, roles: ["owner"] },
  { href: "/setup", label: "Setup Wizard", icon: Rocket, roles: ["owner", "admin"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["owner", "admin"] },
];

function SidebarContent({ showClose = false, collapsed = false }: { showClose?: boolean; collapsed?: boolean }) {
  const pathname = usePathname();
  const { setSidebarOpen } = useUIStore();
  const role = useAuthStore((s) => s.role);
  const { data: features } = useFeatureLimits();

  const featureFlags: Record<FeatureName, boolean> = {
    qr_attendance: features?.qr_attendance_enabled ?? true,
    advanced_analytics: features?.advanced_analytics_enabled ?? true,
    export_reports: features?.export_reports_enabled ?? true,
    multi_branch: features?.multi_branch_enabled ?? true,
    automated_whatsapp: features?.automated_whatsapp_enabled ?? true,
    advanced_reports: features?.advanced_reports_enabled ?? true,
    sms_notifications: features?.sms_notifications_enabled ?? true,
  };

  const visibleItems = navItems.filter(
    (item) => !item.roles || (role && item.roles.includes(role))
  );

  return (
    <>
      <div className={cn("flex h-14 items-center justify-between", collapsed ? "px-2" : "px-5")}>
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-glow transition-all duration-300 group-hover:shadow-[0_0_16px_-2px_hsl(var(--primary)/0.3)] group-hover:scale-105">
            <span className="text-sm font-bold text-primary-foreground">G</span>
          </div>
          {!collapsed && (
            <span className="text-base font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors duration-200">
              GymFlow
            </span>
          )}
        </Link>
        {showClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <nav className={cn("flex-1 py-3 overflow-y-auto space-y-0.5", collapsed ? "px-2" : "px-3")}>
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const isLocked = item.requiredFeature ? !featureFlags[item.requiredFeature] : false;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-250 ease-spring",
                "before:absolute before:inset-0 before:rounded-xl before:transition-all before:duration-250 before:ease-spring",
                collapsed && "justify-center px-2",
                isActive
                  ? "text-primary before:bg-primary/8 dark:before:bg-primary/12 before:shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12),0_0_8px_-2px_hsl(var(--primary)/0.1)]"
                  : isLocked
                    ? "text-muted-foreground/50 hover:before:bg-accent/50 before:bg-transparent"
                    : "text-muted-foreground hover:text-foreground hover:before:bg-accent/80 before:bg-transparent"
              )}
            >
              <item.icon className={cn("relative z-[1] h-4 w-4 shrink-0", isActive && "text-primary")} />
              {!collapsed && <span className="relative z-[1]">{item.label}</span>}
              {!collapsed && isLocked && (
                <Lock className="relative z-[1] ml-auto h-3 w-3 text-muted-foreground/40" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t px-4 py-3">
        {!collapsed && (
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground text-center font-medium">
              GymFlow Track v1.0
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapse } = useUIStore();

  // Mobile swipe-to-open from left edge
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    const EDGE_WIDTH = 24;
    const SWIPE_THRESHOLD = 60;

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    }

    function handleTouchEnd(e: TouchEvent) {
      if (startX > EDGE_WIDTH) return; // Only detect from left edge
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      // Horizontal swipe right from left edge
      if (deltaX > SWIPE_THRESHOLD && deltaX > deltaY) {
        setSidebarOpen(true);
      }
    }

    // Only on mobile
    const mql = window.matchMedia("(max-width: 767px)");
    if (mql.matches) {
      document.addEventListener("touchstart", handleTouchStart, { passive: true });
      document.addEventListener("touchend", handleTouchEnd, { passive: true });
    }

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [setSidebarOpen]);

  // Swipe-to-close handler for the open sidebar
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.x < -80 || info.velocity.x < -300) {
        setSidebarOpen(false);
      }
    },
    [setSidebarOpen]
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden flex-col border-r border-border/50 sidebar-premium dark:dark-depth-sidebar md:flex transition-[width] duration-300 ease-spring",
          sidebarCollapsed ? "w-[60px]" : "w-[260px]"
        )}
      >
        <SidebarContent collapsed={sidebarCollapsed} />
        {/* Collapse toggle button */}
        <div className="border-t px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebarCollapse}
            className="h-7 w-full flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* Mobile overlay sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", bounce: 0.08, duration: 0.3 }}
              drag="x"
              dragConstraints={{ left: -280, right: 0 }}
              dragElastic={0.1}
              onDragEnd={handleDragEnd}
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-card shadow-soft-lg md:hidden touch-pan-y"
            >
              <SidebarContent showClose />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
