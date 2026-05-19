"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
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
  { href: "/staff", label: "Staff", icon: ShieldCheck, roles: ["owner"] },
  { href: "/billing/manage", label: "Billing", icon: Receipt, roles: ["owner"] },
  { href: "/setup", label: "Setup Wizard", icon: Rocket, roles: ["owner", "admin"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["owner", "admin"] },
];

function SidebarContent({ showClose = false }: { showClose?: boolean }) {
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
      <div className="flex h-14 items-center justify-between px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-glow">
            <span className="text-sm font-bold text-primary-foreground">G</span>
          </div>
          <span className="text-base font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors duration-200">
            GymFlow
          </span>
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
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
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
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                "before:absolute before:inset-0 before:rounded-lg before:transition-all before:duration-200",
                isActive
                  ? "text-primary before:bg-primary/8 dark:before:bg-primary/10"
                  : isLocked
                    ? "text-muted-foreground/50 hover:before:bg-accent/50 before:bg-transparent"
                    : "text-muted-foreground hover:text-foreground hover:before:bg-accent before:bg-transparent"
              )}
            >
              <item.icon className={cn("relative z-[1] h-4 w-4 shrink-0", isActive && "text-primary")} />
              <span className="relative z-[1]">{item.label}</span>
              {isLocked && (
                <Lock className="relative z-[1] ml-auto h-3 w-3 text-muted-foreground/40" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t px-4 py-3">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-[11px] text-muted-foreground text-center font-medium">
            GymFlow Track v1.0
          </p>
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] flex-col border-r bg-sidebar md:flex">
        <SidebarContent />
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
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-card shadow-soft-lg md:hidden"
            >
              <SidebarContent showClose />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
