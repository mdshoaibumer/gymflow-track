"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  expenseService,
  type CreateCategoryPayload,
  type UpdateCategoryPayload,
  type CreateCategoryFieldPayload,
  type CreateExpensePayload,
  type UpdateExpensePayload,
  type ListExpensesParams,
} from "@/services/expense.service";
import { useAuthStore } from "@/store/auth-store";

const keys = {
  all: ["expenses"] as const,
  dashboard: () => [...keys.all, "dashboard"] as const,
  categories: () => [...keys.all, "categories"] as const,
  category: (id: string) => [...keys.all, "category", id] as const,
  list: (params?: ListExpensesParams) => [...keys.all, "list", params] as const,
};

// === Dashboard ===

export function useExpenseDashboard() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.dashboard(),
    queryFn: () => expenseService.getDashboard(),
    enabled: !!token,
  });
}

// === Categories ===

export function useExpenseCategories(activeOnly = true) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.categories(),
    queryFn: () => expenseService.listCategories(activeOnly),
    enabled: !!token,
  });
}

export function useExpenseCategory(id: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.category(id),
    queryFn: () => expenseService.getCategory(id),
    enabled: !!token && !!id,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCategoryPayload) => expenseService.createCategory(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Category created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCategoryPayload }) =>
      expenseService.updateCategory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Category updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAddCategoryField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      data,
    }: {
      categoryId: string;
      data: CreateCategoryFieldPayload;
    }) => expenseService.addCategoryField(categoryId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Field added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// === Expenses ===

export function useExpenses(params: ListExpensesParams = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => expenseService.listExpenses(params),
    enabled: !!token,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExpensePayload) => expenseService.createExpense(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Expense recorded");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateExpensePayload }) =>
      expenseService.updateExpense(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Expense updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expenseService.deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Expense deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
