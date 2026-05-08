"use client";

import { useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function Header() {
  const { role, user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="flex h-16 items-center justify-between border-b px-4 md:px-6">
      {/* Mobile menu button */}
      <button className="md:hidden rounded-md p-2 hover:bg-accent">
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile logo */}
      <span className="text-lg font-bold text-primary md:hidden">GymFlow</span>

      {/* Spacer for desktop */}
      <div className="hidden md:block" />

      {/* User info + logout */}
      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden md:inline text-sm text-muted-foreground">
            {user.name}
          </span>
        )}
        {role && (
          <span className="hidden sm:inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
            {role}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
