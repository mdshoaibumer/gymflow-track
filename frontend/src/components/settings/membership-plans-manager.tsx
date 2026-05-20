"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Save, X, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getPlans,
  addPlan,
  updatePlan,
  deletePlan,
  type MembershipPlan,
} from "@/lib/membership-plans";
import { useGym } from "@/hooks/use-gym";
import { toast } from "sonner";

export function MembershipPlansManager() {
  const { data: gym } = useGym();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New plan form state
  const [newName, setNewName] = useState("");
  const [newDuration, setNewDuration] = useState<number>(1);
  const [newAmount, setNewAmount] = useState<number>(0);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState<number>(1);
  const [editAmount, setEditAmount] = useState<number>(0);

  useEffect(() => {
    setPlans(getPlans(gym?.id));
  }, [gym?.id]);

  const handleAdd = () => {
    if (!newName.trim()) {
      toast.error("Plan name is required");
      return;
    }
    if (newAmount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    const updated = addPlan(
      { name: newName.trim(), duration_months: newDuration, amount: newAmount },
      gym?.id
    );
    setPlans(updated);
    setNewName("");
    setNewDuration(1);
    setNewAmount(0);
    setIsAdding(false);
    toast.success("Plan added");
  };

  const handleEdit = (plan: MembershipPlan) => {
    setEditingId(plan.id);
    setEditName(plan.name);
    setEditDuration(plan.duration_months);
    setEditAmount(plan.amount);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    if (!editName.trim()) {
      toast.error("Plan name is required");
      return;
    }
    if (editAmount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    const updated = updatePlan(
      editingId,
      { name: editName.trim(), duration_months: editDuration, amount: editAmount },
      gym?.id
    );
    setPlans(updated);
    setEditingId(null);
    toast.success("Plan updated");
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this plan?")) return;
    const updated = deletePlan(id, gym?.id);
    setPlans(updated);
    toast.success("Plan deleted");
  };

  const formatDuration = (months: number) => {
    if (months === 1) return "1 Month";
    if (months === 3) return "3 Months";
    if (months === 6) return "6 Months";
    if (months === 12) return "1 Year";
    return `${months} Months`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <IndianRupee className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base">Membership Plans</CardTitle>
              <CardDescription>
                Define your gym&apos;s membership plans and pricing. These will appear when recording payments.
              </CardDescription>
            </div>
          </div>
          {!isAdding && (
            <Button size="sm" onClick={() => setIsAdding(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Plan
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Existing plans */}
        {plans.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No plans configured yet. Add your first membership plan.
          </p>
        )}

        {plans.map((plan) =>
          editingId === plan.id ? (
            <div
              key={plan.id}
              className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Plan Name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Monthly"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Duration (months)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={editAmount}
                    onChange={(e) => setEditAmount(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={plan.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDuration(plan.duration_months)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-sm font-semibold">
                  ₹{plan.amount.toLocaleString("en-IN")}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => handleEdit(plan)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(plan.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        )}

        {/* Add new plan form */}
        {isAdding && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/20 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Plan Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Monthly, Quarterly, Yearly"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duration (months)</Label>
                <select
                  value={newDuration}
                  onChange={(e) => setNewDuration(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m === 12 ? "1 Year" : `${m} Month${m > 1 ? "s" : ""}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount (₹)</Label>
                <Input
                  type="number"
                  min="1"
                  value={newAmount || ""}
                  onChange={(e) => setNewAmount(Number(e.target.value) || 0)}
                  placeholder="1000"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Plan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
