"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";

const registerSchema = z.object({
  gym_name: z.string().min(2, "Gym name must be at least 2 characters"),
  owner_name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/\d/, "Must contain at least one digit"),
  city: z.string().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/setup");
    }
  }, [isAuthenticated, isLoading, router]);

  const {
    register: reg,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        ...data,
        city: data.city || undefined,
      };
      const response = await authService.register(payload);

      // Mark tokens saved (resets _profileFetched so dashboard can hydrate)
      useAuthStore.getState().saveTokens(response.access_token, response.refresh_token);

      // Flag for onboarding tour — only new gym owners see the tour
      localStorage.setItem("gymflow-show-tour", "true");

      // Fetch profile immediately to hydrate user data before navigation
      try {
        const profile = await authService.getMe();
        useAuthStore.getState().setUser(profile);
      } catch {
        // Profile fetch failed — dashboard's useAuth will retry on mount
      }

      toast.success("Gym registered! Let\u2019s set things up.");
      router.push("/setup");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Registration failed. Please try again.";
      setFormError(message);
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md animate-fade-in-up">
        <Card>
          <CardHeader className="text-center">
            <Link href="/" className="flex justify-center mb-4">
              <img src="/logo.png" alt="GymFlow Track" className="h-14 w-auto object-contain" />
            </Link>
            <CardTitle className="text-xl">Register your gym</CardTitle>
            <CardDescription>Get started in under 10 minutes</CardDescription>
          </CardHeader>
          <CardContent>
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
                  className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {formError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gym_name">Gym Name</Label>
                  <Input
                    id="gym_name"
                    placeholder="Iron Paradise Gym"
                    autoComplete="organization"
                    disabled={isSubmitting}
                    aria-invalid={!!errors.gym_name}
                    {...reg("gym_name", { onChange: () => setFormError(null) })}
                  />
                  {errors.gym_name && (
                    <p className="text-xs text-destructive" role="alert">{errors.gym_name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_name">Your Name</Label>
                  <Input
                    id="owner_name"
                    placeholder="Rajesh Kumar"
                    autoComplete="name"
                    disabled={isSubmitting}
                    aria-invalid={!!errors.owner_name}
                    {...reg("owner_name", { onChange: () => setFormError(null) })}
                  />
                  {errors.owner_name && (
                    <p className="text-xs text-destructive" role="alert">{errors.owner_name.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">WhatsApp Number</Label>
                <Input
                  id="phone"
                  placeholder="9876543210"
                  autoComplete="tel"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.phone}
                  {...reg("phone", { onChange: () => setFormError(null) })}
                />
                {errors.phone && (
                  <p className="text-xs text-destructive" role="alert">{errors.phone.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="rajesh@gmail.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  {...reg("email", { onChange: () => setFormError(null) })}
                />
                {errors.email && (
                  <p className="text-xs text-destructive" role="alert">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    aria-invalid={!!errors.password}
                    {...reg("password", { onChange: () => setFormError(null) })}
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
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive" role="alert">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City (optional)</Label>
                <Input id="city" placeholder="Mumbai" disabled={isSubmitting} {...reg("city")} />
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting} 
                aria-busy={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Creating\u2026" : "Create Account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
