"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, LogOut, User, Search, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUIStore } from "@/store/ui-store";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./theme-toggle";
import { NotificationCenter } from "@/components/notification-center";

export function Header() {
  const { role, user, logout } = useAuth();
  const router = useRouter();
  const { toggleSidebar } = useUIStore();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    authService.logout().catch(() => {});
    queryClient.clear();  // Wipe all cached data to prevent cross-account leakage
    logout();
    router.push("/login");
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "GF";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border/40 bg-card/60 backdrop-blur-2xl backdrop-saturate-[1.6] px-4 md:px-6 transition-colors duration-200 relative">
      {/* Subtle bottom shine line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/10 to-transparent pointer-events-none" />
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-8 w-8"
        onClick={toggleSidebar}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Mobile logo */}
      <div className="flex items-center gap-2 md:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.png"
          alt="GymFlow Logo"
          className="h-7 object-contain"
        />
      </div>

      {/* Desktop search trigger */}
      <Button
        variant="outline"
        className="hidden md:inline-flex h-9 w-72 justify-start gap-2 text-xs text-muted-foreground border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/20 hover:shadow-[0_0_16px_-4px_hsl(var(--primary)/0.1)] transition-all duration-300 ease-spring rounded-xl"
        onClick={() => {
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true }),
          );
        }}
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-muted-foreground/70">Search anything…</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded-md border border-border/50 bg-background/80 px-1.5 font-mono text-2xs font-medium text-muted-foreground/60">
          ⌘K
        </kbd>
      </Button>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <NotificationCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full ml-1" aria-label="User menu">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                {role && (
                  <Badge variant="secondary" className="w-fit mt-1 capitalize">
                    {role}
                  </Badge>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/settings")}>
              <User className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/change-password")}>
              <Lock className="mr-2 h-4 w-4" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
