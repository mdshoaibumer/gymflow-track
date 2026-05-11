"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, X, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Impersonation banner displayed when a super admin is impersonating a gym owner.
 * Shown at the top of the page in the tenant (dashboard) layout.
 *
 * The impersonation token is passed via URL param `impersonation_token`
 * and stored in sessionStorage for the duration of the impersonation.
 */
export function ImpersonationBanner() {
  const router = useRouter();
  const [impersonation, setImpersonation] = useState<{
    gym_name?: string;
    owner_name?: string;
  } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("impersonation");
    if (stored) {
      try {
        setImpersonation(JSON.parse(stored));
      } catch {
        setImpersonation({});
      }
    }
  }, []);

  const endImpersonation = () => {
    sessionStorage.removeItem("impersonation");
    sessionStorage.removeItem("impersonation_token");
    setImpersonation(null);
    router.push("/admin");
  };

  if (!impersonation) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-amber-950">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4" />
        <span className="text-sm font-semibold">
          IMPERSONATION MODE
        </span>
        <span className="text-sm">
          {impersonation.gym_name
            ? `Viewing as ${impersonation.owner_name || "owner"} of ${impersonation.gym_name}`
            : "Viewing as gym owner"}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={endImpersonation}
        className="h-7 gap-1.5 text-amber-950 hover:bg-amber-600 hover:text-amber-950"
      >
        <LogOut className="h-3.5 w-3.5" />
        Exit Impersonation
      </Button>
    </div>
  );
}
