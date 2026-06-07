"use client";

import { useState } from "react";
import {
  Save,
  AlertTriangle,
  RefreshCw,
  Bell,
  Clock,
  Wrench,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminSettings, useUpdatePlatformSettings } from "@/hooks/use-admin";

export default function SettingsPage() {
  const { data: settings, isLoading, error } = useAdminSettings();
  const updateMutation = useUpdatePlatformSettings();

  // Local form state
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);

  const updateField = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const getValue = <T,>(field: string, fallback: T): T => {
    if (field in formData) return formData[field] as T;
    if (settings && field in settings) return (settings as unknown as Record<string, unknown>)[field] as T;
    return fallback;
  };

  const handleSave = async () => {
    if (!dirty || Object.keys(formData).length === 0) return;
    await updateMutation.mutateAsync(formData as Parameters<typeof updateMutation.mutateAsync>[0]);
    setFormData({});
    setDirty(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
        </div>
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <p>Failed to load settings. Run migrations first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
          <p className="text-muted-foreground">
            Configure global platform behavior and policies.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!dirty || updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Trial & Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Trial & Billing Configuration
          </CardTitle>
          <CardDescription>
            Default values for new gym onboarding and billing policies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <Label htmlFor="trial-days">Default Trial Days</Label>
              <Input
                id="trial-days"
                type="number"
                min={1}
                max={90}
                value={getValue("default_trial_days", 3) || ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") { updateField("default_trial_days", 0); return; }
                  const num = parseInt(raw, 10);
                  if (!isNaN(num) && num >= 0) updateField("default_trial_days", num);
                }}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Days given to new gyms on signup
              </p>
            </div>
            <div>
              <Label htmlFor="grace-days">Grace Period Days</Label>
              <Input
                id="grace-days"
                type="number"
                min={0}
                max={30}
                value={getValue("grace_period_days", 7) || ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") { updateField("grace_period_days", 0); return; }
                  const num = parseInt(raw, 10);
                  if (!isNaN(num) && num >= 0) updateField("grace_period_days", num);
                }}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Days after failed payment before lockout
              </p>
            </div>
            <div>
              <Label htmlFor="max-retries">Max Payment Retries</Label>
              <Input
                id="max-retries"
                type="number"
                min={1}
                max={10}
                value={getValue("max_payment_retries", 3) || ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") { updateField("max_payment_retries", 0); return; }
                  const num = parseInt(raw, 10);
                  if (!isNaN(num) && num >= 0) updateField("max_payment_retries", num);
                }}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Retry attempts before marking payment as failed
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <Label htmlFor="max-gyms">Maximum Gyms on Platform</Label>
            <Input
              id="max-gyms"
              type="number"
              min={1}
              value={getValue("max_gyms", 10000) || ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") { updateField("max_gyms", 0); return; }
                const num = parseInt(raw, 10);
                if (!isNaN(num) && num >= 0) updateField("max_gyms", num);
              }}
              className="mt-1 w-48"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Hard cap on total gym registrations
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            Maintenance Mode
          </CardTitle>
          <CardDescription>
            Enable maintenance mode to temporarily block tenant access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Maintenance Mode</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, all tenant users see a maintenance page.
              </p>
            </div>
            <Switch
              checked={getValue("maintenance_mode", false)}
              onCheckedChange={(checked) => updateField("maintenance_mode", checked)}
            />
          </div>
          {getValue("maintenance_mode", false) && (
            <div>
              <Label htmlFor="maint-msg">Maintenance Message</Label>
              <Textarea
                id="maint-msg"
                placeholder="We're upgrading our systems. Back shortly..."
                value={getValue("maintenance_message", "") || ""}
                onChange={(e) => updateField("maintenance_message", e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          )}
          {getValue("maintenance_mode", false) && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Maintenance mode is ACTIVE. All tenant users are blocked.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Announcement */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Platform Announcement
          </CardTitle>
          <CardDescription>
            Show a banner message to all users across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Announcement Active</Label>
              <p className="text-xs text-muted-foreground">
                Display a banner on all pages for all users.
              </p>
            </div>
            <Switch
              checked={getValue("announcement_active", false)}
              onCheckedChange={(checked) => updateField("announcement_active", checked)}
            />
          </div>
          {getValue("announcement_active", false) && (
            <>
              <div>
                <Label htmlFor="ann-type">Announcement Type</Label>
                <Select
                  value={getValue("announcement_type", "info")}
                  onValueChange={(v) => updateField("announcement_type", v)}
                >
                  <SelectTrigger className="mt-1 w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ann-msg">Announcement Message</Label>
                <Textarea
                  id="ann-msg"
                  placeholder="Enter announcement message..."
                  value={getValue("announcement_message", "") || ""}
                  onChange={(e) => updateField("announcement_message", e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-lg border bg-card p-4 shadow-lg">
          <p className="text-sm font-medium">You have unsaved changes</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFormData({});
                setDirty(false);
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
