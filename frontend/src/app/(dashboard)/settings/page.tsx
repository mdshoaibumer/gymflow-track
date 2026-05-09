"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useGym, useUpdateGym } from "@/hooks/use-gym";
import type { GymUpdatePayload } from "@/services/gym.service";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { user, isOwner } = useAuth();
  const { data: gym, isLoading } = useGym();
  const updateMutation = useUpdateGym();

  const [form, setForm] = useState<GymUpdatePayload>({});

  const [validationError, setValidationError] = useState<string | null>(null);

  // Populate form when gym data loads
  useEffect(() => {
    if (gym) {
      setForm({
        name: gym.name,
        phone: gym.phone || "",
        email: gym.email || "",
        address: gym.address || "",
        city: gym.city || "",
      });
    }
  }, [gym]);

  const handleSave = async () => {
    // Basic validation
    if (!form.name || form.name.trim().length < 2) {
      setValidationError("Gym name must be at least 2 characters");
      return;
    }
    if (form.phone && !/^[6-9]\d{9}$/.test(form.phone)) {
      setValidationError("Enter a valid 10-digit Indian mobile number");
      return;
    }
    setValidationError(null);
    await updateMutation.mutateAsync(form);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your gym profile and preferences.
        </p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Gym Profile</CardTitle>
              <CardDescription>
                {isOwner
                  ? "Update your gym details visible to staff."
                  : "Only the gym owner can edit these settings."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Gym Name</Label>
                <Input
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={!isOwner}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone || ""}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={!isOwner}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    value={form.email || ""}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={!isOwner}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input
                  value={form.address || ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  disabled={!isOwner}
                />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input
                  value={form.city || ""}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  disabled={!isOwner}
                />
              </div>
              {isOwner && (
                <>
                  {validationError && (
                    <p className="text-sm text-destructive">{validationError}</p>
                  )}
                  <Button onClick={handleSave} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Changes
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-medium">{user?.name || "—"}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{user?.email || "—"}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant="secondary" className="capitalize">
              {user?.role || "—"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Choose your preferred theme.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm">Theme</span>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
