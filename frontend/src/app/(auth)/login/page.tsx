"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Dumbbell, Users, BarChart3 } from "lucide-react";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth-store";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const user = useAuthStore((s) => s.user);

  // Redirect if already authenticated (e.g., user navigated back to /login).
  // Skip during active form submission — onSubmit handles routing itself.
  useEffect(() => {
    if (submittingRef.current) return;
    if (!isLoading && isAuthenticated && user) {
      if (user.role === "super_admin") {
        router.replace("/admin");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, user, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setFormError(null);

    try {
      const response = await authService.login(data);

      // Mark tokens saved (resets _profileFetched so dashboard can hydrate)
      useAuthStore.getState().saveTokens(response.access_token, response.refresh_token);

      // Determine redirect target from login response role (avoids race condition
      // with getMe() + cookie timing in fast automated flows).
      // Fall back to profile role if login response doesn't include role.
      let effectiveRole: string | undefined = response.role;

      // Fetch profile to hydrate user data before navigation.
      try {
        const profile = await authService.getMe();
        useAuthStore.getState().setUser(profile);
        if (!effectiveRole) effectiveRole = profile.role;
      } catch {
        // Profile fetch failed — dashboard's useAuth will retry on mount
      }

      toast.success("Welcome back!");

      // Route super admins to admin dashboard
      if (effectiveRole === "super_admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      setFormError(message);
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen bg-background">
      {/* Left decorative panel — animated gradient mesh with floating orbs */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden border-r">
        {/* Animated gradient mesh background */}
        <div className="absolute inset-0 gradient-mesh" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black_40%,transparent_100%)]" />
        {/* Static SVG gradient orbs — GPU-friendly, no blur repaints */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          <defs>
            <radialGradient id="orb1" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(262 83% 58% / 0.08)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id="orb2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(25 95% 53% / 0.06)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id="orb3" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(262 83% 68% / 0.05)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <circle cx="20%" cy="15%" r="120" fill="url(#orb1)" className="animate-orbit-slow" />
          <circle cx="85%" cy="80%" r="150" fill="url(#orb2)" className="animate-orbit-medium" />
          <circle cx="60%" cy="60%" r="90" fill="url(#orb3)" className="animate-orbit-fast" />
        </svg>
        {/* Content */}
        <div className="relative z-10 max-w-md px-12">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-8 animate-glow-pulse">
            <span className="text-2xl font-bold text-primary">G</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground leading-tight">Manage your gym,<br />effortlessly.</h2>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">Track members, automate billing, monitor attendance — all in one powerful dashboard built for Indian gym owners.</p>
          {/* Feature highlights */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span>Member management & renewals</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                <Dumbbell className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <span>Attendance & check-in tracking</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                <BarChart3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <span>Revenue analytics & insights</span>
            </div>
          </div>
        </div>
      </div>
      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center p-6 relative">
        {/* Subtle radial glow behind form on mobile */}
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,hsl(var(--primary)/0.04),transparent)] lg:hidden" />
      <div className="relative w-full max-w-[380px] animate-fade-in-up">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-glow animate-glow-pulse mb-5">
            <span className="text-lg font-bold text-primary-foreground">G</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight font-display">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Sign in to your GymFlow Track account</p>
        </div>
        <Card className="shadow-soft-lg border-border/60 glass-premium">
          <CardContent className="p-7">
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(onSubmit)(e);
              }}
              className="space-y-4" 
              noValidate
            >
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  {formError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="owner@yourgym.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email", { onChange: () => setFormError(null) })}
                />
                {errors.email && (
                  <p id="email-error" className="text-xs text-destructive" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary hover:underline"
                    tabIndex={isSubmitting ? -1 : 0}
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    {...register("password", { onChange: () => setFormError(null) })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    disabled={isSubmitting}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {errors.password && (
                  <p id="password-error" className="text-xs text-destructive" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-[15px] font-semibold shadow-glow hover:shadow-glow-lg"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                {isSubmitting ? "Signing in\u2026" : "Sign In"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-primary font-medium hover:underline">
                Register your gym
              </Link>
            </p>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          GymFlow Track — Gym Management Made Simple
        </p>
      </div>
      </div>
    </main>
  );
}
