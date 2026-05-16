"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, Save, Loader2, MessageSquare, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useGym, useUpdateGym } from "@/hooks/use-gym";
import type { GymUpdatePayload } from "@/services/gym.service";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CustomFieldsManager } from "@/components/settings/custom-fields-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  getTemplateForGym,
  saveTemplate as saveWaTemplate,
  PLACEHOLDER_KEYS,
} from "@/lib/whatsapp";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, isOwner, isAdminOrAbove, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { data: gym, isLoading } = useGym();
  const updateMutation = useUpdateGym();

  // Role-based route protection
  useEffect(() => {
    if (!authLoading && !isAdminOrAbove) {
      router.replace("/dashboard");
    }
  }, [isAdminOrAbove, authLoading, router]);

  const [form, setForm] = useState<GymUpdatePayload>({});
  const [waTemplate, setWaTemplate] = useState("");
  const [waTemplateDirty, setWaTemplateDirty] = useState(false);

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
      setWaTemplate(getTemplateForGym(gym.id));
    }
  }, [gym]);

  // Render-gate: prevent unauthorized content flash during hydration
  if (authLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isAdminOrAbove) {
    return null;
  }

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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      {/* WhatsApp Template */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-base">WhatsApp Reminder Template</CardTitle>
              <CardDescription>
                Customize the default message sent to members via WhatsApp.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wa-template">Default Message Template</Label>
            <Textarea
              id="wa-template"
              value={waTemplate}
              onChange={(e) => {
                setWaTemplate(e.target.value);
                setWaTemplateDirty(true);
              }}
              className="min-h-[160px] text-sm leading-relaxed font-mono"
              placeholder="Enter your default WhatsApp reminder template..."
            />
            <p className="text-xs text-muted-foreground">
              {waTemplate.length} characters
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Available placeholders:</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDER_KEYS.map((key) => (
                <Badge key={key} variant="secondary" className="text-xs font-mono">
                  {`{{${key}}}`}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!waTemplateDirty || !gym}
              onClick={() => {
                if (gym) {
                  saveWaTemplate(gym.id, waTemplate);
                  setWaTemplateDirty(false);
                  toast.success("WhatsApp template saved");
                }
              }}
            >
              <Save className="mr-2 h-4 w-4" />
              Save Template
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setWaTemplate(DEFAULT_WHATSAPP_TEMPLATE);
                setWaTemplateDirty(true);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Custom Member Fields */}
      {isOwner && <CustomFieldsManager />}
    </motion.div>
  );
}
