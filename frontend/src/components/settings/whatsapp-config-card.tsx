"use client";

import { useState } from "react";
import {
  MessageSquare,
  Wifi,
  WifiOff,
  Send,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  QrCode,
} from "lucide-react";
import {
  useWhatsAppStatus,
  useWhatsAppConfig,
  useSaveWhatsAppConfig,
  useToggleWhatsApp,
  useTestWhatsApp,
  useRemoveWhatsAppConfig,
} from "@/hooks/use-whatsapp-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface Props {
  gymId?: string;
}

export function WhatsAppConfigCard({ gymId }: Props) {
  const { data: status, isLoading: statusLoading } = useWhatsAppStatus();
  const { data: config } = useWhatsAppConfig();
  const saveMutation = useSaveWhatsAppConfig();
  const toggleMutation = useToggleWhatsApp();
  const testMutation = useTestWhatsApp();
  const removeMutation = useRemoveWhatsAppConfig();

  const [apiKey, setApiKey] = useState("");
  const [campaignPrefix, setCampaignPrefix] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const isConfigured = status?.is_configured ?? false;
  const isActive = status?.is_active ?? false;

  const handleSave = () => {
    if (!apiKey || apiKey.trim().length < 10) return;
    saveMutation.mutate(
      {
        api_key: apiKey.trim(),
        is_enabled: true,
        campaign_prefix: campaignPrefix.trim() || null,
      },
      {
        onSuccess: () => {
          setApiKey("");
          setCampaignPrefix("");
          setIsEditing(false);
        },
      }
    );
  };

  const handleRemove = () => {
    if (confirm("Remove WhatsApp configuration? Automated messages will stop.")) {
      removeMutation.mutate();
      setIsEditing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-base">WhatsApp Integration</CardTitle>
              <CardDescription>
                Connect your WhatsApp for automated attendance & reminders.
              </CardDescription>
            </div>
          </div>
          {!statusLoading && (
            <Badge variant={isActive ? "success" : "secondary"} className="gap-1">
              {isActive ? (
                <>
                  <Wifi className="h-3 w-3" /> Active
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" /> Inactive
                </>
              )}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Overview */}
        {status && (
          <div className="grid grid-cols-1 gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
            <StatusItem
              label="API Key"
              ok={status.is_configured}
              text={status.is_configured ? "Configured" : "Not set"}
            />
            <StatusItem
              label="Automation"
              ok={status.is_enabled}
              text={status.is_enabled ? "Enabled" : "Disabled"}
            />
            <StatusItem
              label="Plan"
              ok={status.plan_allows_automation}
              text={status.plan_allows_automation ? "Allowed" : "Upgrade needed"}
            />
          </div>
        )}

        {/* Configured State */}
        {isConfigured && !isEditing && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">API Key</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {config?.api_key_masked || "••••••••"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={status?.is_enabled ?? false}
                    onCheckedChange={() => toggleMutation.mutate()}
                    disabled={toggleMutation.isPending}
                  />
                  <span className="text-xs text-muted-foreground">
                    {status?.is_enabled ? "On" : "Off"}
                  </span>
                </div>
              </div>

              {config?.campaign_prefix && (
                <div>
                  <p className="text-sm font-medium">Campaign Prefix</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {config.campaign_prefix}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* QR Attendance Info */}
            {gymId && (
              <div className="rounded-lg border border-dashed p-3">
                <div className="flex items-center gap-2 mb-1">
                  <QrCode className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">QR Attendance Display</p>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Open this link on a TV/tablet at your gym entrance for member self-check-in:
                </p>
                <code className="block rounded bg-muted p-2 text-xs break-all">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/gym-display?gymId=${gymId}`
                    : `/gym-display?gymId=${gymId}`}
                </code>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !status?.is_enabled}
              >
                {testMutation.isPending ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-2 h-3 w-3" />
                )}
                Send Test Message
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
              >
                Update Config
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleRemove}
                disabled={removeMutation.isPending}
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Remove
              </Button>
            </div>
          </>
        )}

        {/* Setup / Edit Form */}
        {(!isConfigured || isEditing) && (
          <div className="space-y-4">
            {!isConfigured && (
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-sm font-medium mb-1">Setup Instructions</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Create a free account at <span className="font-medium">aisensy.com</span></li>
                  <li>Go to Settings → API Keys in AiSensy dashboard</li>
                  <li>Copy your API key and paste it below</li>
                  <li>Create message templates in AiSensy for reminders</li>
                </ol>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="wa-api-key">AiSensy API Key</Label>
              <div className="relative">
                <Input
                  id="wa-api-key"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your AiSensy API key..."
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Found in your AiSensy Dashboard → Settings → API Keys
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wa-prefix">Campaign Prefix (optional)</Label>
              <Input
                id="wa-prefix"
                value={campaignPrefix}
                onChange={(e) => setCampaignPrefix(e.target.value)}
                placeholder="e.g., mygym"
              />
              <p className="text-xs text-muted-foreground">
                Helps organize campaigns in your AiSensy dashboard.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending || apiKey.trim().length < 10}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : null}
                {isConfigured ? "Update" : "Connect WhatsApp"}
              </Button>
              {isEditing && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setApiKey("");
                    setCampaignPrefix("");
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="text-muted-foreground">{label}:</span>
      <span className={ok ? "text-foreground font-medium" : ""}>{text}</span>
    </div>
  );
}
