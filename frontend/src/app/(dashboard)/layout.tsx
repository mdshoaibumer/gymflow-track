"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeedbackWidget } from "@/components/feedback-widget";
import { BillingBanner } from "@/components/billing-banner";
import { CommandPalette } from "@/components/command-palette";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageTransition } from "@/components/page-transition";
import { ScrollProgress } from "@/components/scroll-progress";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { OnboardingTour } from "@/components/onboarding-tour";
import { LayoutGroup } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useUIStore } from "@/store/ui-store";
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
  const { sidebarCollapsed } = useUIStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    return onAuthExpired(() => {
      authService.logout().catch(() => {});
      logout();
      router.replace("/login");
    });
  }, [logout, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background relative">
        <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_50%,hsl(var(--primary)/0.04),transparent)]" />
        <div className="relative flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <div className="absolute inset-0 rounded-full animate-ping opacity-20 border border-primary" />
          </div>
          <p className="text-sm text-muted-foreground font-medium animate-pulse-soft">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      {/* Ambient background glow — premium depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.03),transparent_60%)] pointer-events-none" />
      {/* Skip to content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden relative min-w-0">
        <ScrollProgress />
        <Header />
        <BillingBanner />
        <main id="main-content" className="flex-1 overflow-y-auto scroll-smooth overscroll-contain p-4 pb-20 md:p-6 md:pb-6 lg:p-8">
          <Breadcrumbs className="mb-5" />
          <ErrorBoundary key={pathname}>
            <LayoutGroup>
              <PageTransition>{children}</PageTransition>
            </LayoutGroup>
          </ErrorBoundary>
        </main>
      </div>
      <MobileBottomNav />
      <FeedbackWidget />
      <CommandPalette />
      <OnboardingTour />
    </div>
  );
}
