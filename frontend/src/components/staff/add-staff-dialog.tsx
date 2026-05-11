"use client";

import { useState, useRef, useEffect } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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
import type { UserRole } from "@/types";

interface AddStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
  }) => Promise<void>;
  isPending: boolean;
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
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

function validateForm(values: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
}): FormErrors {
  const errors: FormErrors = {};

  const trimmedName = values.name.trim();
  if (!trimmedName) {
    errors.name = "Name is required";
  } else if (trimmedName.length < 2) {
    errors.name = "Name must be at least 2 characters";
  } else if (trimmedName.length > 200) {
    errors.name = "Name is too long";
  }

  const trimmedEmail = values.email.trim();
  if (!trimmedEmail) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = "Enter a valid email address";
  }

  const normalizedPhone = normalizePhone(values.phone);
  if (!normalizedPhone) {
    errors.phone = "Phone is required";
  } else if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    errors.phone = "Enter a valid 10-digit Indian mobile number";
  }

  if (!values.password) {
    errors.password = "Password is required";
  } else if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  } else if (!/[A-Z]/.test(values.password)) {
    errors.password = "Password must contain an uppercase letter";
  } else if (!/[a-z]/.test(values.password)) {
    errors.password = "Password must contain a lowercase letter";
  } else if (!/\d/.test(values.password)) {
    errors.password = "Password must contain a number";
  }

  if (!values.role || values.role === "owner") {
    errors.role = "Select a valid role (admin or staff)";
  }

  return errors;
}

export function AddStaffDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: AddStaffDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("staff");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  // Focus first field on open
  useEffect(() => {
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 100);
    }
  }, [open]);

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRole("staff");
    setShowPassword(false);
    setErrors({});
    setSubmitted(false);
  }

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    const formErrors = validateForm({ name, email, phone, password, role });
    setErrors(formErrors);

    if (Object.keys(formErrors).length > 0) {
      // Focus first invalid field
      if (formErrors.name) nameRef.current?.focus();
      return;
    }

    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: normalizePhone(phone),
        password,
        role: role as UserRole,
      });
      // Form is reset by the useEffect when dialog closes
      onOpenChange(false);
    } catch {
      // Error toast is handled by the mutation hook
    }
  }

  // Live validation after first submit attempt
  useEffect(() => {
    if (submitted) {
      setErrors(validateForm({ name, email, phone, password, role }));
    }
  }, [name, email, phone, password, role, submitted]);

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Staff Member</DialogTitle>
          <DialogDescription>
            Create a new admin or staff account for your gym.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="staff-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              ref={nameRef}
              id="staff-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              disabled={isPending}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "staff-name-error" : undefined}
              autoComplete="name"
            />
            {errors.name && (
              <p id="staff-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@gym.com"
              disabled={isPending}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "staff-email-error" : undefined}
              autoComplete="email"
            />
            {errors.email && (
              <p id="staff-email-error" className="text-xs text-destructive">
                {errors.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-phone">
              Phone <span className="text-destructive">*</span>
            </Label>
            <Input
              id="staff-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              disabled={isPending}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "staff-phone-error" : undefined}
              autoComplete="tel"
            />
            {errors.phone && (
              <p id="staff-phone-error" className="text-xs text-destructive">
                {errors.phone}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-role">
              Role <span className="text-destructive">*</span>
            </Label>
            <Select
              value={role}
              onValueChange={setRole}
              disabled={isPending}
            >
              <SelectTrigger id="staff-role" aria-invalid={!!errors.role}>
                <SelectValue placeholder="Select role" />
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

          <div className="space-y-2">
            <Label htmlFor="staff-password">
              Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="staff-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                disabled={isPending}
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "staff-password-error" : undefined
                }
                autoComplete="new-password"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {errors.password && (
              <p id="staff-password-error" className="text-xs text-destructive">
                {errors.password}
              </p>
            )}
          </div>

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
              {isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
