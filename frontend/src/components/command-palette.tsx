"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  Bell,
  Wrench,
  Receipt,
  Settings,
  ShieldCheck,
  FileSpreadsheet,
  Rocket,
  Search,
  UserPlus,
  Plus,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuthStore } from "@/store/auth-store";
import type { UserRole } from "@/types";

interface CommandItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  action: () => void;
  group: string;
  keywords?: string;
  roles?: UserRole[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const role = useAuthStore((s) => s.role);

  // Keyboard shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const items: CommandItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, action: () => navigate("/dashboard"), group: "Navigation", keywords: "home overview analytics" },
    { id: "members", label: "Members", icon: Users, action: () => navigate("/members"), group: "Navigation", keywords: "member list" },
    { id: "payments", label: "Payments", icon: CreditCard, action: () => navigate("/payments"), group: "Navigation", keywords: "payment revenue money" },
    { id: "attendance", label: "Attendance", icon: CalendarCheck, action: () => navigate("/attendance"), group: "Navigation", keywords: "checkin check-in qr" },
    { id: "reports", label: "Reports", icon: FileSpreadsheet, action: () => navigate("/reports"), group: "Navigation", keywords: "report export csv", roles: ["owner", "admin"] },
    { id: "equipment", label: "Equipment", icon: Wrench, action: () => navigate("/equipment"), group: "Navigation", keywords: "asset maintenance" },
    { id: "notifications", label: "Reminders", icon: Bell, action: () => navigate("/notifications"), group: "Navigation", keywords: "notification whatsapp sms" },
    { id: "staff", label: "Staff Management", icon: ShieldCheck, action: () => navigate("/staff"), group: "Navigation", keywords: "user role admin", roles: ["owner", "admin"] },
    { id: "billing", label: "Billing", icon: Receipt, action: () => navigate("/billing/manage"), group: "Navigation", keywords: "subscription plan", roles: ["owner"] },
    { id: "settings", label: "Settings", icon: Settings, action: () => navigate("/settings"), group: "Navigation", keywords: "gym config profile", roles: ["owner", "admin"] },
    { id: "setup", label: "Setup Wizard", icon: Rocket, action: () => navigate("/setup"), group: "Navigation", keywords: "onboard import", roles: ["owner", "admin"] },
    { id: "add-member", label: "Add New Member", icon: UserPlus, action: () => navigate("/members?action=create"), group: "Quick Actions", keywords: "create new member", roles: ["owner", "admin"] },
    { id: "record-payment", label: "Record Payment", icon: Plus, action: () => navigate("/payments?action=create"), group: "Quick Actions", keywords: "add payment", roles: ["owner", "admin"] },
  ];

  const visibleItems = items.filter(
    (item) => !item.roles || (role && item.roles.includes(role)),
  );

  const groups = Array.from(new Set(visibleItems.map((i) => i.group)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-lg [&>button]:hidden">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Type a command or search…"
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
            <kbd className="ml-2 hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>
            {groups.map((group) => (
              <Command.Group key={group} heading={group}>
                {visibleItems
                  .filter((i) => i.group === group)
                  .map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${item.keywords || ""}`}
                      onSelect={item.action}
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                      <item.icon className="mr-3 h-4 w-4 text-muted-foreground" />
                      <span>{item.label}</span>
                    </Command.Item>
                  ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
