"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Wallet,
  FolderOpen,
  AlertTriangle,
  Calendar,
  Trash2,
} from "lucide-react";
import {
  useExpenseDashboard,
  useExpenses,
  useExpenseCategories,
  useCreateExpense,
  useDeleteExpense,
  useCreateCategory,
} from "@/hooks/use-expenses";
import type {
  Expense,
  ExpenseCategory,
  CreateExpensePayload,
  CreateCategoryPayload,
  ListExpensesParams,
} from "@/services/expense.service";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { formatPaise } from "@/lib/utils";
import { RoleGate } from "@/components/role-gate";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ModalState =
  | { type: "none" }
  | { type: "add-expense" }
  | { type: "add-category" }
  | { type: "delete"; expense: Expense };

const COLORS = [
  "#FF5733", "#FFC300", "#36D399", "#3B82F6", "#8B5CF6",
  "#F43F5E", "#06B6D4", "#F59E0B", "#10B981", "#EC4899",
];

export default function ExpensesPage() {
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [page, setPage] = useState(0);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const pageSize = 20;

  const params: ListExpensesParams = useMemo(
    () => ({
      skip: page * pageSize,
      limit: pageSize,
      ...(filterCategory ? { category_id: filterCategory } : {}),
    }),
    [page, filterCategory]
  );

  const { data: dashboard, isLoading: dashLoading } = useExpenseDashboard();
  const { data: expensesData, isLoading: expLoading } = useExpenses(params);
  const { data: categoriesData } = useExpenseCategories();
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const createCategory = useCreateCategory();

  const categories = categoriesData?.categories ?? [];
  const expenses = expensesData?.expenses ?? [];
  const total = expensesData?.total ?? 0;

  // Month-over-month change
  const monthChange = useMemo(() => {
    if (!dashboard) return 0;
    if (dashboard.total_last_month_paise === 0) return 0;
    return Math.round(
      ((dashboard.total_this_month_paise - dashboard.total_last_month_paise) /
        dashboard.total_last_month_paise) *
        100
    );
  }, [dashboard]);

  const handleCreateExpense = (formData: CreateExpensePayload) => {
    createExpense.mutate(formData, { onSuccess: () => setModal({ type: "none" }) });
  };

  const handleCreateCategory = (formData: CreateCategoryPayload) => {
    createCategory.mutate(formData, { onSuccess: () => setModal({ type: "none" }) });
  };

  const handleDelete = (expense: Expense) => {
    deleteExpense.mutate(expense.id, { onSuccess: () => setModal({ type: "none" }) });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">
            Track and manage all your gym expenses
          </p>
        </div>
        <div className="flex gap-2">
          <RoleGate allowed={["owner"]}>
            <Button
              variant="outline"
              onClick={() => setModal({ type: "add-category" })}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </RoleGate>
          <RoleGate allowed={["owner", "admin"]}>
            <Button onClick={() => setModal({ type: "add-expense" })}>
              <Plus className="mr-2 h-4 w-4" />
              Record Expense
            </Button>
          </RoleGate>
        </div>
      </div>

      {/* Dashboard Cards */}
      {dashLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : dashboard ? (
        <motion.div
          className="grid gap-4 md:grid-cols-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <DashboardCard
            title="This Month"
            value={formatPaise(dashboard.total_this_month_paise)}
            icon={<Wallet className="h-5 w-5" />}
            subtitle={
              monthChange !== 0
                ? `${monthChange > 0 ? "+" : ""}${monthChange}% vs last month`
                : "Same as last month"
            }
          />
          <DashboardCard
            title="Last Month"
            value={formatPaise(dashboard.total_last_month_paise)}
            icon={<Calendar className="h-5 w-5" />}
          />
          <DashboardCard
            title="Categories"
            value={String(dashboard.category_count)}
            icon={<FolderOpen className="h-5 w-5" />}
          />
          <DashboardCard
            title="Budget Alerts"
            value={String(dashboard.budget_alerts.length)}
            icon={<AlertTriangle className="h-5 w-5" />}
            subtitle={
              dashboard.budget_alerts.length > 0
                ? `${dashboard.budget_alerts[0]?.category_name} over budget`
                : "All within limits"
            }
          />
        </motion.div>
      ) : null}

      {/* Budget Alerts */}
      {dashboard && dashboard.budget_alerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Budget Exceeded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {dashboard.budget_alerts.map((alert) => (
                <div key={alert.category_id} className="flex justify-between text-sm">
                  <span>{alert.category_name}</span>
                  <span className="font-medium text-destructive">
                    {formatPaise(alert.total_paise)} spent
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Breakdown */}
      {dashboard && dashboard.category_breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Category Breakdown (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboard.category_breakdown.map((item) => (
                <div key={item.category_id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full inline-block"
                        style={{ backgroundColor: item.category_color || "#6B7280" }}
                      />
                      {item.category_name}
                    </span>
                    <span className="font-medium">
                      {formatPaise(item.total_paise)} ({item.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: item.category_color || "#6B7280",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recurring Status */}
      {dashboard && dashboard.recurring_status.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recurring Expenses Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.recurring_status.map((item) => (
                <div
                  key={item.category_id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    {item.is_recorded_this_month ? (
                      <Badge variant="success" className="text-xs">Recorded</Badge>
                    ) : (
                      <Badge variant="warning" className="text-xs">Pending</Badge>
                    )}
                    {item.category_name}
                    {item.recurring_day && (
                      <span className="text-muted-foreground">
                        (due on {item.recurring_day}th)
                      </span>
                    )}
                  </span>
                  {item.last_amount_paise && (
                    <span className="text-muted-foreground">
                      Last: {formatPaise(item.last_amount_paise)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expense List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Expense Records</CardTitle>
          <Select
            value={filterCategory}
            onValueChange={(val) => {
              setFilterCategory(val === "all" ? "" : val);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {expLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <EmptyState
              title="No expenses recorded"
              description="Start by adding a category and recording your first expense."
            />
          ) : (
            <>
              <div className="space-y-2">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: expense.category_color || "#6B7280",
                        }}
                      />
                      <div>
                        <div className="font-medium text-sm">
                          {expense.category_name || "Uncategorized"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {expense.expense_date}
                          {expense.description && ` — ${expense.description}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">
                        {formatPaise(expense.amount_in_paise)}
                      </span>
                      <RoleGate allowed={["owner"]}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            setModal({ type: "delete", expense })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </RoleGate>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <PaginationControls
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Expense Modal */}
      <AddExpenseModal
        open={modal.type === "add-expense"}
        onClose={() => setModal({ type: "none" })}
        categories={categories}
        onSubmit={handleCreateExpense}
        isLoading={createExpense.isPending}
      />

      {/* Add Category Modal */}
      <AddCategoryModal
        open={modal.type === "add-category"}
        onClose={() => setModal({ type: "none" })}
        onSubmit={handleCreateCategory}
        isLoading={createCategory.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={modal.type === "delete"}
        onOpenChange={(open) => !open && setModal({ type: "none" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this expense record. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                modal.type === "delete" && handleDelete(modal.expense)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// === Add Expense Modal ===

function AddExpenseModal({
  open,
  onClose,
  categories,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  onSubmit: (data: CreateExpensePayload) => void;
  isLoading: boolean;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [description, setDescription] = useState("");
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const activeFields = selectedCategory?.fields.filter((f) => f.is_active) ?? [];

  const handleSubmit = () => {
    if (!categoryId || !amount) return;
    onSubmit({
      category_id: categoryId,
      amount_in_paise: Math.round(parseFloat(amount) * 100),
      expense_date: expenseDate,
      description: description || undefined,
      custom_data: Object.keys(customData).length > 0 ? customData : undefined,
    });
    // Reset form
    setCategoryId("");
    setAmount("");
    setDescription("");
    setCustomData({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Expense</DialogTitle>
          <DialogDescription>
            Add a new expense entry to track your spending.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Category *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (₹) *</Label>
            <Input
              type="number"
              min="1"
              step="0.01"
              placeholder="e.g. 12500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>Date *</Label>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              placeholder="Optional note"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Dynamic Custom Fields */}
          {activeFields.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs text-muted-foreground font-medium">
                Custom Fields
              </p>
              {activeFields.map((field) => (
                <div key={field.id}>
                  <Label>
                    {field.label}
                    {field.is_required && " *"}
                  </Label>
                  {field.field_type === "dropdown" ? (
                    <Select
                      value={(customData[field.field_key] as string) || ""}
                      onValueChange={(val) =>
                        setCustomData((prev) => ({
                          ...prev,
                          [field.field_key]: val,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
                      placeholder={field.label}
                      value={(customData[field.field_key] as string) || ""}
                      onChange={(e) =>
                        setCustomData((prev) => ({
                          ...prev,
                          [field.field_key]:
                            field.field_type === "number"
                              ? Number(e.target.value)
                              : e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!categoryId || !amount || isLoading}
          >
            {isLoading ? "Saving..." : "Save Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === Add Category Modal ===

function AddCategoryModal({
  open,
  onClose,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCategoryPayload) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState("1");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [fields, setFields] = useState<
    Array<{ label: string; field_type: string; is_required: boolean; options: string }>
  >([]);

  const addField = () => {
    setFields([...fields, { label: "", field_type: "text", is_required: false, options: "" }]);
  };

  const removeField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx));
  };

  const updateField = (idx: number, key: string, value: unknown) => {
    setFields(
      fields.map((f, i) => (i === idx ? { ...f, [key]: value } : f))
    );
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const payload: CreateCategoryPayload = {
      name: name.trim(),
      color,
      is_recurring: isRecurring,
      ...(isRecurring ? { recurring_day: parseInt(recurringDay) } : {}),
      ...(budgetLimit ? { budget_limit_paise: Math.round(parseFloat(budgetLimit) * 100) } : {}),
      ...(fields.length > 0
        ? {
            fields: fields
              .filter((f) => f.label.trim())
              .map((f, i) => ({
                label: f.label.trim(),
                field_type: f.field_type as "text" | "number" | "date" | "dropdown",
                is_required: f.is_required,
                sort_order: i,
                ...(f.field_type === "dropdown" && f.options
                  ? { options: f.options.split(",").map((o) => o.trim()).filter(Boolean) }
                  : {}),
              })),
          }
        : {}),
    };
    onSubmit(payload);
    // Reset form
    setName("");
    setColor(COLORS[0]);
    setIsRecurring(false);
    setRecurringDay("1");
    setBudgetLimit("");
    setFields([]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Expense Category</DialogTitle>
          <DialogDescription>
            Define a new expense type with optional custom fields.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Category Name *</Label>
            <Input
              placeholder="e.g. Electricity, Rent, Trainer Salary"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`h-6 w-6 rounded-full border-2 transition-all ${
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is-recurring"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="is-recurring" className="mb-0">
              Recurring monthly expense
            </Label>
          </div>

          {isRecurring && (
            <div>
              <Label>Due Day (1-28)</Label>
              <Input
                type="number"
                min="1"
                max="28"
                value={recurringDay}
                onChange={(e) => setRecurringDay(e.target.value)}
              />
            </div>
          )}

          <div>
            <Label>Monthly Budget Limit (₹, optional)</Label>
            <Input
              type="number"
              min="0"
              placeholder="e.g. 50000"
              value={budgetLimit}
              onChange={(e) => setBudgetLimit(e.target.value)}
            />
          </div>

          {/* Custom Fields Builder */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="mb-0">Custom Fields</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addField}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Field
              </Button>
            </div>
            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Optional: Add extra fields like &quot;Bill Number&quot;, &quot;Vendor Name&quot;, etc.
              </p>
            )}
            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-end border p-2 rounded"
                >
                  <div className="col-span-4">
                    <Label className="text-xs">Label</Label>
                    <Input
                      placeholder="Field name"
                      value={field.label}
                      onChange={(e) =>
                        updateField(idx, "label", e.target.value)
                      }
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={field.field_type}
                      onValueChange={(val) =>
                        updateField(idx, "field_type", val)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="dropdown">Dropdown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    {field.field_type === "dropdown" ? (
                      <>
                        <Label className="text-xs">Options (comma-separated)</Label>
                        <Input
                          placeholder="UPI, Cash, NEFT"
                          value={field.options}
                          onChange={(e) =>
                            updateField(idx, "options", e.target.value)
                          }
                        />
                      </>
                    ) : (
                      <div className="flex items-center gap-1 pt-5">
                        <input
                          type="checkbox"
                          checked={field.is_required}
                          onChange={(e) =>
                            updateField(idx, "is_required", e.target.checked)
                          }
                          className="rounded"
                        />
                        <span className="text-xs">Required</span>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeField(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || isLoading}
          >
            {isLoading ? "Creating..." : "Create Category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
