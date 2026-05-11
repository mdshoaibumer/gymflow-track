"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  BarChart3,
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

function SidebarContent() {
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
      <div className="flex h-16 items-center justify-between border-b px-6">
        <Link href="/dashboard" className="text-xl font-bold text-primary">
          GymFlow
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
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
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : isLocked
                    ? "text-muted-foreground/50 hover:bg-accent/50"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {isLocked && (
                <Lock className="ml-auto h-3 w-3 text-muted-foreground/40" />
              )}
              {isActive && !isLocked && (
                <motion.div
                  layoutId="sidebar-indicator"
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-primary"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground text-center">
          GymFlow v1.0
        </p>
      </div>
    </>
  );
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-card md:flex">
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
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", bounce: 0.1, duration: 0.3 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card shadow-xl md:hidden"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
