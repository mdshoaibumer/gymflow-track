import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>{children}</div>
    ),
  },
  useInView: () => true,
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Must import after mocks
import HomePage from "@/app/page";

describe("HomePage (Landing Page)", () => {
  it("renders the main headline", () => {
    render(<HomePage />);
    expect(screen.getByText("Gym Management")).toBeInTheDocument();
    expect(screen.getByText("Made Simple")).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(<HomePage />);
    // Each link appears twice (desktop nav + mobile dropdown)
    expect(screen.getAllByText("Features").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pricing").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Reviews").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("FAQ").length).toBeGreaterThanOrEqual(1);
  });

  it("renders all feature cards", () => {
    render(<HomePage />);
    expect(screen.getByText("Member Management")).toBeInTheDocument();
    expect(screen.getByText("Payments & Revenue")).toBeInTheDocument();
    expect(screen.getByText("Attendance Tracking")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp Reminders")).toBeInTheDocument();
    expect(screen.getByText("Analytics Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Equipment Management")).toBeInTheDocument();
  });

  it("renders pricing plans", () => {
    render(<HomePage />);
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Elite")).toBeInTheDocument();
    expect(screen.getByText("₹999")).toBeInTheDocument();
    expect(screen.getByText("₹1,999")).toBeInTheDocument();
    expect(screen.getByText("₹2,999")).toBeInTheDocument();
  });

  it("renders testimonials", () => {
    render(<HomePage />);
    expect(screen.getByText("Rajesh K.")).toBeInTheDocument();
    expect(screen.getByText("Priya M.")).toBeInTheDocument();
    expect(screen.getByText("Vikram S.")).toBeInTheDocument();
  });

  it("renders FAQ section with questions", () => {
    render(<HomePage />);
    expect(screen.getByText("How long does setup take?")).toBeInTheDocument();
    expect(screen.getByText("Can my staff use it too?")).toBeInTheDocument();
    expect(screen.getByText("Is my data secure?")).toBeInTheDocument();
  });

  it("renders CTA buttons", () => {
    render(<HomePage />);
    const freeTrialButtons = screen.getAllByText("Start Free Trial");
    expect(freeTrialButtons.length).toBeGreaterThan(0);
  });

  it("renders the mobile menu button", () => {
    render(<HomePage />);
    const menuButton = screen.getByLabelText("Open menu");
    expect(menuButton).toBeInTheDocument();
  });

  it("toggles mobile menu on button click", () => {
    render(<HomePage />);
    const menuButton = screen.getByLabelText("Open menu");
    fireEvent.click(menuButton);
    // After clicking, button label should change to "Close menu"
    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
  });

  it("renders trust bar items", () => {
    render(<HomePage />);
    expect(screen.getByText("Secure & Encrypted")).toBeInTheDocument();
    expect(screen.getByText("Built for India")).toBeInTheDocument();
    expect(screen.getByText("Setup in 10 minutes")).toBeInTheDocument();
  });

  it("renders footer", () => {
    render(<HomePage />);
    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument();
  });
});
