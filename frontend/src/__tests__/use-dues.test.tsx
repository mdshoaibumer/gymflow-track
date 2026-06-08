import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock auth store
vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: { token: string; user: { gym_id: string }; role: string }) => unknown) =>
    selector({ token: "test-token", user: { gym_id: "gym-1" }, role: "owner" }),
}));

// Mock dues service
const mockList = vi.fn();
const mockGetSummary = vi.fn();
const mockGetAgingReport = vi.fn();
const mockGetMemberDues = vi.fn();
const mockGetDetail = vi.fn();
const mockPay = vi.fn();
const mockWaive = vi.fn();

vi.mock("@/services/dues.service", () => ({
  duesService: {
    list: (...args: unknown[]) => mockList(...args),
    getSummary: (...args: unknown[]) => mockGetSummary(...args),
    getAgingReport: (...args: unknown[]) => mockGetAgingReport(...args),
    getMemberDues: (...args: unknown[]) => mockGetMemberDues(...args),
    getDetail: (...args: unknown[]) => mockGetDetail(...args),
    pay: (...args: unknown[]) => mockPay(...args),
    waive: (...args: unknown[]) => mockWaive(...args),
  },
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useDues,
  useDuesSummary,
  useDuesAgingReport,
  useMemberDues,
  useDueDetail,
  usePayDue,
  useWaiveDue,
} from "@/hooks/use-dues";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useDues hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches dues list with default params", async () => {
    const mockData = {
      items: [{ id: "due-1", balance_paise: 5000, status: "pending" }],
      total: 1,
      total_outstanding_paise: 5000,
    };
    mockList.mockResolvedValueOnce(mockData);

    const { result } = renderHook(() => useDues(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(mockList).toHaveBeenCalledWith({});
  });

  it("passes filter params to service", async () => {
    mockList.mockResolvedValueOnce({ items: [], total: 0, total_outstanding_paise: 0 });

    const { result } = renderHook(
      () => useDues({ status: "partial", skip: 20, limit: 20 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockList).toHaveBeenCalledWith({ status: "partial", skip: 20, limit: 20 });
  });
});

describe("useDuesSummary hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches summary data", async () => {
    const mockSummary = {
      total_members_with_dues: 3,
      total_outstanding_paise: 75000,
      collected_this_month_paise: 25000,
    };
    mockGetSummary.mockResolvedValueOnce(mockSummary);

    const { result } = renderHook(() => useDuesSummary(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSummary);
  });
});

describe("useDuesAgingReport hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches aging report", async () => {
    const mockReport = {
      buckets: [
        { range: "0-30", count: 2, total_paise: 20000 },
        { range: "31-60", count: 1, total_paise: 15000 },
      ],
      total_outstanding_paise: 35000,
    };
    mockGetAgingReport.mockResolvedValueOnce(mockReport);

    const { result } = renderHook(() => useDuesAgingReport(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.buckets).toHaveLength(2);
  });
});

describe("useMemberDues hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches dues for a specific member", async () => {
    const memberId = "mem-123";
    const mockDues = [
      { id: "due-1", member_id: memberId, balance_paise: 3000, status: "partial" },
    ];
    mockGetMemberDues.mockResolvedValueOnce(mockDues);

    const { result } = renderHook(() => useMemberDues(memberId), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetMemberDues).toHaveBeenCalledWith(memberId);
    expect(result.current.data).toHaveLength(1);
  });
});

describe("useDueDetail hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches single due with payment links", async () => {
    const dueId = "due-456";
    const mockDetail = {
      id: dueId,
      balance_paise: 2000,
      payments: [{ id: "link-1", payment_id: "pay-1", amount_paise: 3000 }],
    };
    mockGetDetail.mockResolvedValueOnce(mockDetail);

    const { result } = renderHook(() => useDueDetail(dueId), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetDetail).toHaveBeenCalledWith(dueId);
    expect(result.current.data?.payments).toHaveLength(1);
  });
});

describe("usePayDue mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls pay service and shows success toast", async () => {
    const { toast } = await import("sonner");
    mockPay.mockResolvedValueOnce({ id: "due-1", status: "paid", balance_paise: 0 });

    const { result } = renderHook(() => usePayDue(), { wrapper: createWrapper() });

    await result.current.mutateAsync({
      dueId: "due-1",
      payload: { amount_in_paise: 5000, payment_method: "cash" },
    });

    expect(mockPay).toHaveBeenCalledWith("due-1", { amount_in_paise: 5000, payment_method: "cash" });
    expect(toast.success).toHaveBeenCalledWith("Payment recorded against due");
  });

  it("shows error toast on failure", async () => {
    const { toast } = await import("sonner");
    mockPay.mockRejectedValueOnce(new Error("Overpayment not allowed"));

    const { result } = renderHook(() => usePayDue(), { wrapper: createWrapper() });

    try {
      await result.current.mutateAsync({
        dueId: "due-1",
        payload: { amount_in_paise: 999999, payment_method: "cash" },
      });
    } catch {
      // expected
    }

    expect(toast.error).toHaveBeenCalledWith("Overpayment not allowed");
  });
});

describe("useWaiveDue mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls waive service and shows success toast", async () => {
    const { toast } = await import("sonner");
    mockWaive.mockResolvedValueOnce({ id: "due-1", status: "waived" });

    const { result } = renderHook(() => useWaiveDue(), { wrapper: createWrapper() });

    await result.current.mutateAsync({
      dueId: "due-1",
      payload: { reason: "Member hardship" },
    });

    expect(mockWaive).toHaveBeenCalledWith("due-1", { reason: "Member hardship" });
    expect(toast.success).toHaveBeenCalledWith("Due waived successfully");
  });

  it("shows error toast on failure", async () => {
    const { toast } = await import("sonner");
    mockWaive.mockRejectedValueOnce(new Error("Only owner can waive"));

    const { result } = renderHook(() => useWaiveDue(), { wrapper: createWrapper() });

    try {
      await result.current.mutateAsync({
        dueId: "due-1",
        payload: { reason: "Test" },
      });
    } catch {
      // expected
    }

    expect(toast.error).toHaveBeenCalledWith("Only owner can waive");
  });
});
