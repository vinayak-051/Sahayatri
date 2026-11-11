import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { mockQuery } from "./supabaseMock";
import Notifications from "@/pages/Notifications";

const push = vi.hoisted(() => ({
  isPushSupported: vi.fn(),
  isPushConfigured: vi.fn(),
  getPushStatus: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));
vi.mock("@/lib/push", () => push);

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// A stable object, like the real context: the page's effects depend on `user`.
const auth = vi.hoisted(() => ({ user: { id: "user-1" }, isGuide: false }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));

vi.mock("@/lib/supabaseClient", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: () => mockQuery({ data: [], error: null }),
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Notifications />
    </MemoryRouter>
  );
}

describe("Notifications push card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    push.isPushSupported.mockReturnValue(true);
    push.isPushConfigured.mockReturnValue(true);
  });

  it("is hidden when push is unsupported or not configured", async () => {
    push.isPushSupported.mockReturnValue(false);
    const { unmount } = renderPage();
    await waitFor(() => expect(screen.getByText("No notifications yet.")).toBeInTheDocument());
    expect(screen.queryByText("Push notifications")).not.toBeInTheDocument();
    unmount();

    push.isPushSupported.mockReturnValue(true);
    push.isPushConfigured.mockReturnValue(false);
    renderPage();
    await waitFor(() => expect(screen.getByText("No notifications yet.")).toBeInTheDocument());
    expect(screen.queryByText("Push notifications")).not.toBeInTheDocument();
    expect(push.getPushStatus).not.toHaveBeenCalled();
  });

  it("shows the status and turns push on from the switch", async () => {
    push.getPushStatus.mockResolvedValueOnce("disabled").mockResolvedValueOnce("enabled");
    push.enablePush.mockResolvedValue({ error: null });
    renderPage();

    const toggle = await screen.findByRole("switch", { name: "Push notifications on this device" });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(push.enablePush).toHaveBeenCalledWith("user-1");
    expect(toast.success).toHaveBeenCalledWith("Push notifications are on for this device.");
    expect(screen.getByText(/On for this device/)).toBeInTheDocument();
  });

  it("turns push off and reports failures with a toast", async () => {
    push.getPushStatus.mockResolvedValue("enabled");
    push.disablePush.mockResolvedValue({ error: "Couldn't turn off push notifications. Please try again." });
    renderPage();

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));

    fireEvent.click(toggle);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't turn off push notifications. Please try again."));
    expect(push.disablePush).toHaveBeenCalled();
    expect(push.enablePush).not.toHaveBeenCalled();
  });

  it("disables the switch while checking and when the browser blocks notifications", async () => {
    let resolveStatus: (status: string) => void = () => {};
    push.getPushStatus.mockReturnValue(new Promise((resolve) => (resolveStatus = resolve)));
    renderPage();

    const toggle = await screen.findByRole("switch");
    expect(toggle).toBeDisabled();
    expect(screen.getByText("Checking this device…")).toBeInTheDocument();

    resolveStatus("denied");
    await waitFor(() => expect(screen.getByText(/Blocked by your browser/)).toBeInTheDocument());
    expect(toggle).toBeDisabled();
  });
});
