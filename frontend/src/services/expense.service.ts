import { request } from "@/lib/api";

// === Types ===

export interface ExpenseCategoryField {
  id: string;
  label: string;
  field_key: string;
  field_type: "text" | "number" | "date" | "dropdown";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface ExpenseCategory {
  id: string;
  gym_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  is_recurring: boolean;
  recurring_day: number | null;
  budget_limit_paise: number | null;
  sort_order: number;
  is_active: boolean;
  fields: ExpenseCategoryField[];
}

export interface Expense {
  id: string;
  gym_id: string;
  category_id: string;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  amount_in_paise: number;
  expense_date: string;
  description: string | null;
  receipt_url: string | null;
  custom_data: Record<string, unknown> | null;
  created_by: string | null;
}

export interface CategoryBreakdown {
  category_id: string;
  category_name: string;
  category_color: string | null;
  total_paise: number;
  count: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string;
  total_paise: number;
}

export interface RecurringStatus {
  category_id: string;
  category_name: string;
  recurring_day: number | null;
  is_recorded_this_month: boolean;
  last_amount_paise: number | null;
}

export interface ExpenseDashboard {
  total_this_month_paise: number;
  total_last_month_paise: number;
  category_count: number;
  category_breakdown: CategoryBreakdown[];
  monthly_trend: MonthlyTrend[];
  recurring_status: RecurringStatus[];
  budget_alerts: CategoryBreakdown[];
}

// === Payloads ===

export interface CreateCategoryFieldPayload {
  label: string;
  field_type: "text" | "number" | "date" | "dropdown";
  options?: string[];
  is_required?: boolean;
  sort_order?: number;
}

export interface CreateCategoryPayload {
  name: string;
  icon?: string;
  color?: string;
  is_recurring?: boolean;
  recurring_day?: number;
  budget_limit_paise?: number;
  sort_order?: number;
  fields?: CreateCategoryFieldPayload[];
}

export interface UpdateCategoryPayload {
  name?: string;
  icon?: string;
  color?: string;
  is_recurring?: boolean;
  recurring_day?: number;
  budget_limit_paise?: number;
  sort_order?: number;
  is_active?: boolean;
}

export interface CreateExpensePayload {
  category_id: string;
  amount_in_paise: number;
  expense_date: string;
  description?: string;
  receipt_url?: string;
  custom_data?: Record<string, unknown>;
}

export interface UpdateExpensePayload {
  category_id?: string;
  amount_in_paise?: number;
  expense_date?: string;
  description?: string;
  receipt_url?: string;
  custom_data?: Record<string, unknown>;
}

export interface ListExpensesParams {
  skip?: number;
  limit?: number;
  category_id?: string;
  date_from?: string;
  date_to?: string;
}

// === API Functions ===

export const expenseService = {
  // Dashboard
  getDashboard: () =>
    request.get<ExpenseDashboard>("/expenses/dashboard"),

  // Categories
  listCategories: (activeOnly = true) =>
    request.get<{ categories: ExpenseCategory[]; total: number }>(
      "/expenses/categories",
      { active_only: activeOnly }
    ),

  getCategory: (id: string) =>
    request.get<ExpenseCategory>(`/expenses/categories/${id}`),

  createCategory: (data: CreateCategoryPayload) =>
    request.post<ExpenseCategory>("/expenses/categories", data),

  updateCategory: (id: string, data: UpdateCategoryPayload) =>
    request.patch<ExpenseCategory>(`/expenses/categories/${id}`, data),

  addCategoryField: (categoryId: string, data: CreateCategoryFieldPayload) =>
    request.post<ExpenseCategoryField>(
      `/expenses/categories/${categoryId}/fields`,
      data
    ),

  // Expenses
  listExpenses: (params: ListExpensesParams = {}) =>
    request.get<{ expenses: Expense[]; total: number }>("/expenses", params as Record<string, unknown>),

  getExpense: (id: string) =>
    request.get<Expense>(`/expenses/${id}`),

  createExpense: (data: CreateExpensePayload) =>
    request.post<Expense>("/expenses", data),

  updateExpense: (id: string, data: UpdateExpensePayload) =>
    request.patch<Expense>(`/expenses/${id}`, data),

  deleteExpense: (id: string) =>
    request.delete<void>(`/expenses/${id}`),
};
