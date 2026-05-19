import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock hooks used by NotificationCenter
vi.mock("@/hooks/use-notifications", () => ({
  useNotificationStats: () => ({
    data: { pending_count: 3, failed_count: 1, sent_today: 5 },
  }),
  useNotifications: () => ({
    data: {
      notifications: [
        {
          id: "1",
          type: "expiry_7_days",
          member_name: "Alice",
          status: "pending",
          created_at: new Date().toISOString(),
        },
        {
          id: "2",
          type: "payment_overdue",
          member_name: "Bob",
          status: "pending",
          created_at: new Date().toISOString(),
        },
      ],
    },
  }),
}));

import { NotificationCenter } from "@/components/notification-center";

describe("NotificationCenter", () => {
  it("renders the notification bell button", () => {
    render(<NotificationCenter />);
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });

  it("displays unread count badge", () => {
    render(<NotificationCenter />);
    // pending_count (3) + failed_count (1) = 4
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders as a button with bell icon", () => {
    render(<NotificationCenter />);
    const button = screen.getByLabelText("Notifications");
    expect(button.tagName).toBe("BUTTON");
  });
});
