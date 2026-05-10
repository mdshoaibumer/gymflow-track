"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeedbackWidget } from "@/components/feedback-widget";
import { BillingBanner } from "@/components/billing-banner";
import { useAuth } from "@/hooks/use-auth";
import { onAuthExpired } from "@/lib/api";
import { authService } from "@/services/auth.service";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Wait until auth check completes before deciding to redirect
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Listen for 401 responses from API client — auto-logout on session expiry
  useEffect(() => {
    return onAuthExpired(() => {
      // Server-side logout to clear HttpOnly cookies (best-effort)
      authService.logout().catch(() => {});
      logout();
      router.replace("/login");
    });
  }, [logout, router]);

  // Show spinner while validating token with server
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <BillingBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
        </main>
      </div>
      <FeedbackWidget />
    </div>
  );
}
