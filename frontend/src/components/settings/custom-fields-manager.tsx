"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical, Settings2 } from "lucide-react";
import {
  useCustomFields,
  useCreateCustomField,
  useDeleteCustomField,
  useUpdateCustomField,
} from "@/hooks/use-custom-fields";
import type { CustomField, CreateCustomFieldPayload } from "@/services/custom-field.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type FieldType = "text" | "number" | "date" | "dropdown";

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
};

export function CustomFieldsManager() {
  const { data, isLoading } = useCustomFields();
  const createMutation = useCreateCustomField();
  const deleteMutation = useDeleteCustomField();
  const updateMutation = useUpdateCustomField();

  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [newRequired, setNewRequired] = useState(false);

  const fields = data?.fields ?? [];

  const handleCreate = async () => {
    if (!newLabel.trim()) return;

    const payload: CreateCustomFieldPayload = {
      label: newLabel.trim(),
      field_type: newType,
      is_required: newRequired,
      sort_order: fields.length,
    };

    if (newType === "dropdown" && newOptions.trim()) {
      payload.options = newOptions
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
    }

    await createMutation.mutateAsync(payload);
    setNewLabel("");
    setNewType("text");
    setNewOptions("");
    setNewRequired(false);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  const handleToggleRequired = async (field: CustomField) => {
    await updateMutation.mutateAsync({
      id: field.id,
      data: { is_required: !field.is_required },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <Settings2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">Custom Member Fields</CardTitle>
            <CardDescription>
              Add custom fields that appear on the member registration form.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Field
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Field Form */}
        {showForm && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Field Label *</Label>
                <Input
                  placeholder="e.g. Blood Group, Address, Aadhar No."
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Field Type</Label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as FieldType)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="dropdown">Dropdown (multiple options)</option>
                </select>
              </div>
            </div>

            {newType === "dropdown" && (
              <div className="space-y-1.5">
                <Label>Options (comma-separated)</Label>
                <Input
                  placeholder="e.g. A+, A-, B+, B-, O+, O-, AB+, AB-"
                  value={newOptions}
                  onChange={(e) => setNewOptions(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  These will appear as dropdown choices in the member form.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="new-required"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="rounded border-input"
              />
              <Label htmlFor="new-required" className="text-sm font-normal">
                Required field
              </Label>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newLabel.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Field"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Field List */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No custom fields yet. Click &quot;Add Field&quot; to create one.
          </p>
        ) : (
          <div className="space-y-2">
            {fields.map((field) => (
              <div
                key={field.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{field.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {FIELD_TYPE_LABELS[field.field_type]}
                    </Badge>
                    {field.is_required && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </div>
                  {field.options && field.options.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Options: {field.options.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => handleToggleRequired(field)}
                  >
                    {field.is_required ? "Optional" : "Required"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(field.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
