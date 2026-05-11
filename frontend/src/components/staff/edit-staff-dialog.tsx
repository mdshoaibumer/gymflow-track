"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffUser, UpdateUserPayload } from "@/services/user.service";
import type { UserRole } from "@/types";

interface EditStaffDialogProps {
  user: StaffUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, data: UpdateUserPayload) => Promise<void>;
  isPending: boolean;
  currentUserId: string | undefined;
}

interface FormErrors {
  name?: string;
  phone?: string;
  role?: string;
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
}

export function EditStaffDialog({
  user,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  currentUserId,
}: EditStaffDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("staff");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const isSelf = user?.id === currentUserId;
  const isOwnerUser = user?.role === "owner";

  // Populate form when user changes
  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone);
      setRole(user.role);
      setIsActive(user.is_active);
      setErrors({});
      setSubmitted(false);
    }
  }, [user]);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      errs.name = "Name is required";
    } else if (trimmedName.length < 2) {
      errs.name = "Name must be at least 2 characters";
    } else if (trimmedName.length > 200) {
      errs.name = "Name is too long";
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      errs.phone = "Phone is required";
    } else if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      errs.phone = "Enter a valid 10-digit Indian mobile number";
    }

    if (!isOwnerUser && (!role || role === "owner")) {
      errs.role = "Select a valid role";
    }

    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitted(true);

    const formErrors = validate();
    setErrors(formErrors);
    if (Object.keys(formErrors).length > 0) return;

    const payload: UpdateUserPayload = {};
    const trimmedName = name.trim();
    if (trimmedName !== user.name) payload.name = trimmedName;

    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone !== user.phone) payload.phone = normalizedPhone;

    if (!isOwnerUser && role !== user.role) {
      payload.role = role as UserRole;
    }

    if (!isOwnerUser && !isSelf && isActive !== user.is_active) {
      payload.is_active = isActive;
    }

    // Skip API call if nothing changed
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      await onSubmit(user.id, payload);
      onOpenChange(false);
    } catch {
      // Error toast handled by mutation hook
    }
  }

  // Live validation after first submit
  useEffect(() => {
    if (submitted) {
      setErrors(validate());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phone, role, submitted]);

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            {user ? `Update details for ${user.name}` : "Edit user details"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "edit-name-error" : undefined}
            />
            {errors.name && (
              <p id="edit-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={user?.email ?? ""}
              disabled
              className="opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed after creation.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isPending}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "edit-phone-error" : undefined}
            />
            {errors.phone && (
              <p id="edit-phone-error" className="text-xs text-destructive">
                {errors.phone}
              </p>
            )}
          </div>

          {!isOwnerUser && (
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={role}
                onValueChange={setRole}
                disabled={isPending}
              >
                <SelectTrigger id="edit-role" aria-invalid={!!errors.role}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-xs text-destructive">{errors.role}</p>
              )}
            </div>
          )}

          {!isOwnerUser && !isSelf && (
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={isActive ? "active" : "inactive"}
                onValueChange={(v) => setIsActive(v === "active")}
                disabled={isPending}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {isSelf && (
                <p className="text-xs text-muted-foreground">
                  You cannot deactivate your own account.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
