"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface UserStatusToggleProps {
  isActive: boolean;
  disabled?: boolean;
  onToggle: (active: boolean) => void;
}

export function UserStatusToggle({
  isActive,
  disabled,
  onToggle,
}: UserStatusToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id="user-status-toggle"
        checked={isActive}
        onCheckedChange={onToggle}
        disabled={disabled}
        aria-label={isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
      />
      <Label
        htmlFor="user-status-toggle"
        className={`text-xs font-medium ${isActive ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
      >
        {isActive ? "Active" : "Inactive"}
      </Label>
    </div>
  );
}
