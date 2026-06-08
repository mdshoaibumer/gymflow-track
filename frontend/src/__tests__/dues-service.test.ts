import { describe, it, expect, vi, beforeEach } from "vitest";
import { duesService } from "@/services/dues.service";
import { request } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockGet = request.get as ReturnType<typeof vi.fn>;
const mockPost = request.post as ReturnType<typeof vi.fn>;

describe("duesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("calls GET /dues with no params when empty", async () => {
      const mockResponse = { items: [], total: 0, total_outstanding_paise: 0 };
      mockGet.mockResolvedValueOnce(mockResponse);

      const result = await duesService.list();
      expect(mockGet).toHaveBeenCalledWith("/dues");
      expect(result).toEqual(mockResponse);
    });

    it("appends query params for status filter", async () => {
      const mockResponse = { items: [], total: 0, total_outstanding_paise: 0 };
      mockGet.mockResolvedValueOnce(mockResponse);

      await duesService.list({ status: "pending", skip: 0, limit: 20 });
      const calledUrl = mockGet.mock.calls[0][0] as string;
      expect(calledUrl).toContain("status=pending");
      expect(calledUrl).toContain("skip=0");
      expect(calledUrl).toContain("limit=20");
    });

    it("appends member_id filter", async () => {
      const mockResponse = { items: [], total: 0, total_outstanding_paise: 0 };
      mockGet.mockResolvedValueOnce(mockResponse);

      await duesService.list({ member_id: "abc-123" });
      expect(mockGet).toHaveBeenCalledWith("/dues?member_id=abc-123");
    });

    it("omits undefined/empty params", async () => {
      const mockResponse = { items: [], total: 0, total_outstanding_paise: 0 };
      mockGet.mockResolvedValueOnce(mockResponse);

      await duesService.list({ status: undefined, member_id: undefined });
      expect(mockGet).toHaveBeenCalledWith("/dues");
    });
  });

  describe("getSummary", () => {
    it("calls GET /dues/summary", async () => {
      const mockSummary = {
        total_members_with_dues: 5,
        total_outstanding_paise: 150000,
        collected_this_month_paise: 50000,
      };
      mockGet.mockResolvedValueOnce(mockSummary);

      const result = await duesService.getSummary();
      expect(mockGet).toHaveBeenCalledWith("/dues/summary");
      expect(result).toEqual(mockSummary);
    });
  });

  describe("getAgingReport", () => {
    it("calls GET /dues/aging-report", async () => {
      const mockReport = {
        buckets: [
          { range: "0-30", count: 3, total_paise: 30000 },
          { range: "31-60", count: 2, total_paise: 50000 },
          { range: "61-90", count: 1, total_paise: 20000 },
          { range: "90+", count: 1, total_paise: 45000 },
        ],
        total_outstanding_paise: 145000,
      };
      mockGet.mockResolvedValueOnce(mockReport);

      const result = await duesService.getAgingReport();
      expect(mockGet).toHaveBeenCalledWith("/dues/aging-report");
      expect(result.buckets).toHaveLength(4);
      expect(result.total_outstanding_paise).toBe(145000);
    });
  });

  describe("getMemberDues", () => {
    it("calls GET /dues/member/:memberId", async () => {
      const memberId = "mem-001";
      const mockDues = [
        { id: "due-1", balance_paise: 5000, status: "pending" },
      ];
      mockGet.mockResolvedValueOnce(mockDues);

      const result = await duesService.getMemberDues(memberId);
      expect(mockGet).toHaveBeenCalledWith(`/dues/member/${memberId}`);
      expect(result).toEqual(mockDues);
    });
  });

  describe("getDetail", () => {
    it("calls GET /dues/:dueId", async () => {
      const dueId = "due-001";
      const mockDetail = {
        id: dueId,
        balance_paise: 3000,
        payments: [{ id: "pay-1", amount_paise: 2000 }],
      };
      mockGet.mockResolvedValueOnce(mockDetail);

      const result = await duesService.getDetail(dueId);
      expect(mockGet).toHaveBeenCalledWith(`/dues/${dueId}`);
      expect(result.payments).toHaveLength(1);
    });
  });

  describe("pay", () => {
    it("calls POST /dues/:dueId/pay with payload", async () => {
      const dueId = "due-001";
      const payload = {
        amount_in_paise: 5000,
        payment_method: "cash" as const,
        notes: "Partial payment",
      };
      const mockResponse = { id: dueId, balance_paise: 0, status: "paid" };
      mockPost.mockResolvedValueOnce(mockResponse);

      const result = await duesService.pay(dueId, payload);
      expect(mockPost).toHaveBeenCalledWith(`/dues/${dueId}/pay`, payload);
      expect(result.status).toBe("paid");
    });

    it("sends idempotency_key when provided", async () => {
      const dueId = "due-002";
      const payload = {
        amount_in_paise: 2000,
        payment_method: "upi" as const,
        idempotency_key: "idem-key-123",
      };
      mockPost.mockResolvedValueOnce({ id: dueId });

      await duesService.pay(dueId, payload);
      expect(mockPost).toHaveBeenCalledWith(`/dues/${dueId}/pay`, payload);
    });
  });

  describe("waive", () => {
    it("calls POST /dues/:dueId/waive with reason", async () => {
      const dueId = "due-001";
      const payload = { reason: "Member facing financial hardship" };
      const mockResponse = { id: dueId, status: "waived", waive_reason: payload.reason };
      mockPost.mockResolvedValueOnce(mockResponse);

      const result = await duesService.waive(dueId, payload);
      expect(mockPost).toHaveBeenCalledWith(`/dues/${dueId}/waive`, payload);
      expect(result.status).toBe("waived");
      expect(result.waive_reason).toBe(payload.reason);
    });
  });
});
