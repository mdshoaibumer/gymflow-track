"use client";

import { Menu } from "lucide-react";

export function Header() {
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

      {/* User menu */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-xs font-medium text-primary">GF</span>
        </div>
      </div>
    </header>
  );
}
