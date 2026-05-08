"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/hooks/use-auth";

export default function RegisterPage() {
  const router = useRouter();
  const { saveTokens } = useAuth();
  const [formData, setFormData] = useState({
    gym_name: "",
    owner_name: "",
    phone: "",
    email: "",
    password: "",
    city: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        city: formData.city || undefined,
      };
      const response = await authService.register(payload);
      saveTokens(response.access_token, response.refresh_token);
      router.push("/setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Register your gym</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Get started in under 10 minutes
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="gym_name" className="text-sm font-medium">
              Gym Name
            </label>
            <input
              id="gym_name"
              name="gym_name"
              value={formData.gym_name}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              placeholder="Iron Paradise Gym"
            />
          </div>

          <div>
            <label htmlFor="owner_name" className="text-sm font-medium">
              Your Name
            </label>
            <input
              id="owner_name"
              name="owner_name"
              value={formData.owner_name}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              placeholder="Rajesh Kumar"
            />
          </div>

          <div>
            <label htmlFor="phone" className="text-sm font-medium">
              WhatsApp Number
            </label>
            <input
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              pattern="[6-9]\d{9}"
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              placeholder="9876543210"
            />
          </div>

          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              placeholder="rajesh@gmail.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="city" className="text-sm font-medium">
              City (optional)
            </label>
            <input
              id="city"
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              placeholder="Mumbai"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
