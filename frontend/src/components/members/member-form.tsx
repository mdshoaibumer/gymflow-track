"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Camera, Upload, Trash2, User } from "lucide-react";
import { memberFormSchema, type MemberFormValues } from "@/lib/validations/member";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { useGym } from "@/hooks/use-gym";
import { getPlans, calculateEndDate, type MembershipPlan } from "@/lib/membership-plans";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Member } from "@/services/member.service";
import type { CustomField } from "@/services/custom-field.service";
import { useState, useRef, useEffect } from "react";
import { MemberCameraModal } from "./member-camera-modal";
import { PhotoPreviewModal } from "./photo-preview-modal";
import { compressImage } from "@/lib/compress-image";
import { API_URL } from "@/lib/api";

const getFullAssetUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  try {
    const origin = new URL(API_URL).origin;
    return `${origin}${url}`;
  } catch {
    return url;
  }
};

interface MemberFormProps {
  defaultValues?: Partial<MemberFormValues>;
  defaultCustomFields?: Record<string, string | number | null>;
  initialPhotoUrl?: string | null;
  isEditing?: boolean;
  onSubmit: (data: MemberFormValues & { 
    custom_fields?: Record<string, string | number | null>;
    photoFile?: File | null;
  }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  title: string;
  isPending?: boolean;
}

export function MemberForm({
  defaultValues,
  defaultCustomFields,
  initialPhotoUrl,
  isEditing = false,
  onSubmit,
  onCancel,
  submitLabel,
  title,
  isPending = false,
}: MemberFormProps) {
  const { data: customFieldsData } = useCustomFields();
  const customFields: CustomField[] = customFieldsData?.fields ?? [];
  const { data: gym } = useGym();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);

  useEffect(() => {
    if (gym?.id) {
      setPlans(getPlans(gym.id));
    }
  }, [gym?.id]);

  const [cfValues, setCfValues] = useState<Record<string, string | number | null>>(
    defaultCustomFields ?? {}
  );

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Please select a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Photo must be under 10MB.");
      return;
    }

    const compressed = await compressImage(file);
    setPhotoFile(compressed);
    setPhotoPreview(URL.createObjectURL(compressed));
  };

  const handleCameraCapture = async (file: File) => {
    const compressed = await compressImage(file);
    setPhotoFile(compressed);
    setPhotoPreview(URL.createObjectURL(compressed));
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    setError,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      gender: "" as const,
      date_of_birth: "",
      father_name: "",
      batch: "" as const,
      emergency_contact: "",
      membership_plan: "",
      membership_start: "",
      membership_end: "",
      ...defaultValues,
    },
  });

  // Auto-calculate end date when plan or start date changes
  const watchedPlan = watch("membership_plan");
  const watchedStart = watch("membership_start");

  useEffect(() => {
    if (!watchedPlan || !watchedStart || plans.length === 0) return;
    const matchedPlan = plans.find((p) => p.name === watchedPlan);
    if (matchedPlan) {
      const calculated = calculateEndDate(watchedStart, matchedPlan.duration_months);
      setValue("membership_end", calculated, { shouldDirty: true });
    }
  }, [watchedPlan, watchedStart, plans, setValue]);

  useUnsavedChanges(isDirty);

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    try {
      const payload = {
        ...(data as MemberFormValues),
        custom_fields: Object.keys(cfValues).length > 0 ? cfValues : undefined,
        photoFile,
      };
      await onSubmit(payload);
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>

      {errors.root && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
          {errors.root.message}
        </div>
      )}

      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className="grid gap-4 sm:grid-cols-2"
      >
        {/* Photo Upload & Webcam Option */}
        <div className="sm:col-span-2 flex flex-col items-start gap-3 pb-4 border-b">
          <Label className="text-sm font-medium">Member Photo</Label>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <div
              className="relative h-20 w-20 rounded-full overflow-hidden border-2 border-dashed border-muted bg-muted/50 flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              onClick={() => {
                const url = photoPreview || getFullAssetUrl(initialPhotoUrl ?? null);
                if (url) setIsPhotoPreviewOpen(true);
              }}
              title={photoPreview || initialPhotoUrl ? "Click to view full photo" : undefined}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="h-full w-full object-cover"
                />
              ) : initialPhotoUrl ? (
                <img
                  src={getFullAssetUrl(initialPhotoUrl)!}
                  alt="Existing"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Upload Photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCameraOpen(true)}
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                  Take Snap
                </Button>
                {(photoFile || initialPhotoUrl) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemovePhoto}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Capture live with your device camera or select a JPEG/PNG/WebP image (auto-compressed).
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            capture="environment"
            onChange={handlePhotoSelect}
            className="hidden"
          />

          <MemberCameraModal
            isOpen={isCameraOpen}
            onClose={() => setIsCameraOpen(false)}
            onCapture={handleCameraCapture}
          />

          <PhotoPreviewModal
            isOpen={isPhotoPreviewOpen}
            imageUrl={photoPreview || getFullAssetUrl(initialPhotoUrl ?? null)}
            onClose={() => setIsPhotoPreviewOpen(false)}
          />
        </div>

        {/* Personal Details Section */}
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-muted-foreground">
            Personal Details
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            {...register("name")}
            placeholder="Member name"
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone *</Label>
          <Input
            id="phone"
            {...register("phone")}
            placeholder="9876543210"
          />
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            placeholder="member@email.com"
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <select
            id="gender"
            {...register("gender")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="father_name">Father&apos;s Name</Label>
          <Input
            id="father_name"
            {...register("father_name")}
            placeholder="Father's name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="batch">Batch</Label>
          <select
            id="batch"
            {...register("batch")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select Batch</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="date_of_birth">Date of Birth</Label>
          <Input
            id="date_of_birth"
            type="date"
            {...register("date_of_birth")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="emergency_contact">Emergency Contact</Label>
          <Input
            id="emergency_contact"
            {...register("emergency_contact")}
            placeholder="Emergency phone number"
          />
        </div>

        {/* Membership Details Section */}
        <>
          <div className="sm:col-span-2 pt-4 border-t">
            <p className="text-sm font-medium text-muted-foreground">
              Membership Details
            </p>
          </div>

            {/* Plan quick-select buttons from settings */}
            {plans.length > 0 && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Select Plan</Label>
                <div className="flex flex-wrap gap-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        setValue("membership_plan", plan.name, { shouldDirty: true });
                        const today = new Date().toISOString().split("T")[0];
                        const start = watch("membership_start") || today;
                        setValue("membership_start", start, { shouldDirty: true });
                        setValue("membership_end", calculateEndDate(start, plan.duration_months), { shouldDirty: true });
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent ${
                        watch("membership_plan") === plan.name
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-input"
                      }`}
                    >
                      <span className="font-medium">{plan.name}</span>
                      <span className="ml-1.5 text-muted-foreground">
                        ₹{plan.amount.toLocaleString("en-IN")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="membership_plan">Membership Plan</Label>
              {plans.length > 0 ? (
                <select
                  id="membership_plan"
                  {...register("membership_plan")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select Plan</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.name}>
                      {plan.name} — ₹{plan.amount.toLocaleString("en-IN")}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="membership_plan"
                  {...register("membership_plan")}
                  placeholder="e.g., Monthly, Quarterly, Annual"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="membership_start">Start Date</Label>
              <Input
                id="membership_start"
                type="date"
                {...register("membership_start")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="membership_end">End Date</Label>
              <Input
                id="membership_end"
                type="date"
                {...register("membership_end")}
              />
              <p className="text-xs text-muted-foreground">Auto-calculated from plan. You can override manually.</p>
            </div>
          </>

        {/* Dynamic Custom Fields */}
        {customFields.map((cf) => (
          <div key={cf.id} className="space-y-1.5">
            <Label htmlFor={`cf_${cf.field_key}`}>
              {cf.label}
              {cf.is_required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {cf.field_type === "dropdown" ? (
              <select
                id={`cf_${cf.field_key}`}
                value={(cfValues[cf.field_key] as string) ?? ""}
                onChange={(e) =>
                  setCfValues({ ...cfValues, [cf.field_key]: e.target.value || null })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select</option>
                {cf.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`cf_${cf.field_key}`}
                type={cf.field_type === "number" ? "number" : cf.field_type === "date" ? "date" : "text"}
                value={(cfValues[cf.field_key] as string) ?? ""}
                onChange={(e) =>
                  setCfValues({
                    ...cfValues,
                    [cf.field_key]: cf.field_type === "number"
                      ? (e.target.value ? Number(e.target.value) : null)
                      : (e.target.value || null),
                  })
                }
                placeholder={cf.label}
              />
            )}
          </div>
        ))}

        <div className="sm:col-span-2 flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={isSubmitting || isPending}
          >
            {(isSubmitting || isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isSubmitting || isPending ? "Saving..." : submitLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Convert a Member to form default values. */
export function memberToFormValues(member: Member): {
  formValues: Partial<MemberFormValues>;
  customFieldValues: Record<string, string | number | null>;
} {
  return {
    formValues: {
      name: member.name,
      phone: member.phone,
      email: member.email || "",
      gender: member.gender || "",
      date_of_birth: member.date_of_birth || "",
      father_name: member.father_name || "",
      batch: member.batch || "",
      emergency_contact: member.emergency_contact || "",
      membership_plan: member.membership_plan || "",
      membership_start: member.membership_start || "",
      membership_end: member.membership_end || "",
    },
    customFieldValues: member.custom_fields ?? {},
  };
}
