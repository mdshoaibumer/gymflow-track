import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "@/store/ui-store";

describe("UIStore", () => {
  beforeEach(() => {
    // Reset the store state between tests
    useUIStore.setState({
      sidebarOpen: false,
      sidebarCollapsed: false,
    });
  });

  it("initializes with sidebar closed and not collapsed", () => {
    const state = useUIStore.getState();
    expect(state.sidebarOpen).toBe(false);
    expect(state.sidebarCollapsed).toBe(false);
  });

  it("toggleSidebar toggles sidebarOpen", () => {
    const { toggleSidebar } = useUIStore.getState();
    toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
    toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it("setSidebarOpen sets the value directly", () => {
    const { setSidebarOpen } = useUIStore.getState();
    setSidebarOpen(true);
    expect(useUIStore.getState().sidebarOpen).toBe(true);
    setSidebarOpen(false);
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it("toggleSidebarCollapse toggles the collapsed state", () => {
    const { toggleSidebarCollapse } = useUIStore.getState();
    toggleSidebarCollapse();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    toggleSidebarCollapse();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it("setSidebarCollapsed sets the value directly", () => {
    const { setSidebarCollapsed } = useUIStore.getState();
    setSidebarCollapsed(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    setSidebarCollapsed(false);
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });
});
