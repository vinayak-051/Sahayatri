import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AuthProvider, PROFILE_COLUMNS, useAuth } from "@/context/AuthContext";

type AuthCallback = (event: string, session: unknown) => unknown;

let authCallback: AuthCallback | null = null;
const mockSingle = vi.fn();
const mockSelect = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: vi.fn(),
      signOut: () => mockSignOut(),
      signInWithOAuth: vi.fn(),
    },
    from: () => ({
      select: (columns: string) => {
        mockSelect(columns);
        return { eq: () => ({ single: () => mockSingle() }) };
      },
    }),
  },
}));

const session = (id: string, email = `${id}@example.com`) => ({ user: { id, email } });

function emit(event: string, value: unknown) {
  if (!authCallback) throw new Error("AuthProvider hasn't subscribed yet");
  let result: unknown;
  act(() => {
    result = authCallback?.(event, value);
  });
  return result;
}

function Consumer() {
  const { user, isLoading, logout, refreshProfile } = useAuth();
  const location = useLocation();
  return (
    <div>
      <div data-testid="state">{isLoading ? "loading" : user ? `signed-in:${user.name}:${user.email}` : "signed-out"}</div>
      <div data-testid="path">{location.pathname}</div>
      <button onClick={() => logout()}>Logout</button>
      <button onClick={() => refreshProfile()}>Refresh</button>
    </div>
  );
}

function LoginTester() {
  const { login } = useAuth();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div>
      <button
        onClick={async () => {
          const { error } = await login("test@example.com", "password123", "traveler");
          setResult(error ?? "no-error");
        }}
      >
        Login
      </button>
      <div data-testid="result">{result}</div>
    </div>
  );
}

function renderWithProvider(ui = <Consumer />) {
  return render(
    <BrowserRouter>
      <AuthProvider>{ui}</AuthProvider>
    </BrowserRouter>
  );
}

const state = () => screen.getByTestId("state");
const path = () => screen.getByTestId("path");

describe("AuthContext", () => {
  beforeEach(() => {
    authCallback = null;
    mockSingle.mockReset();
    mockSelect.mockReset();
    mockSignInWithPassword.mockReset();
    mockSignOut.mockReset().mockResolvedValue({ error: null });
    window.history.pushState({}, "", "/");
  });

  it("stays loading until the initial session arrives, then renders signed-out", () => {
    renderWithProvider();
    expect(state()).toHaveTextContent("loading");

    emit("INITIAL_SESSION", null);

    expect(state()).toHaveTextContent("signed-out");
    expect(mockSingle).not.toHaveBeenCalled();
  });

  it("stays loading until the profile for the session resolves", async () => {
    let resolveProfile: (value: unknown) => void = () => {};
    mockSingle.mockReturnValue(new Promise((resolve) => (resolveProfile = resolve)));
    renderWithProvider();

    emit("INITIAL_SESSION", session("user-1", "traveler@example.com"));
    expect(state()).toHaveTextContent("loading");

    await act(async () => resolveProfile({ data: { id: "user-1", name: "Test Traveler", role: "traveler" }, error: null }));

    expect(state()).toHaveTextContent("signed-in:Test Traveler:traveler@example.com");
    expect(mockSelect).toHaveBeenCalledWith(PROFILE_COLUMNS);
  });

  it("never runs a Supabase query inside the auth callback", async () => {
    mockSingle.mockResolvedValue({ data: { id: "user-1", name: "Test Traveler", role: "traveler" }, error: null });
    renderWithProvider();

    let returned: unknown = "not-called";
    let queriedDuringCallback = true;
    act(() => {
      returned = authCallback?.("SIGNED_IN", session("user-1"));
      queriedDuringCallback = mockSingle.mock.calls.length > 0;
    });

    expect(returned).toBeUndefined();
    expect(queriedDuringCallback).toBe(false);
    await waitFor(() => expect(state()).toHaveTextContent("signed-in:Test Traveler"));
  });

  it("loads the profile once per session user", async () => {
    mockSingle.mockResolvedValue({ data: { id: "user-1", name: "Test Traveler", role: "traveler" }, error: null });
    renderWithProvider();

    emit("INITIAL_SESSION", session("user-1"));
    emit("SIGNED_IN", session("user-1"));
    await waitFor(() => expect(state()).toHaveTextContent("signed-in:Test Traveler"));
    emit("TOKEN_REFRESHED", session("user-1"));
    emit("SIGNED_IN", session("user-1"));
    await act(async () => {});

    expect(mockSingle).toHaveBeenCalledTimes(1);

    mockSingle.mockResolvedValue({ data: { id: "user-2", name: "Other Traveler", role: "traveler" }, error: null });
    emit("SIGNED_IN", session("user-2"));
    await waitFor(() => expect(state()).toHaveTextContent("signed-in:Other Traveler"));
    expect(mockSingle).toHaveBeenCalledTimes(2);
  });

  it("treats a failed profile load as resolved with no user", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProvider();

    emit("INITIAL_SESSION", session("user-1"));

    await waitFor(() => expect(state()).toHaveTextContent("signed-out"));
  });

  it("sends an admin to /admin on initial load", async () => {
    window.history.pushState({}, "", "/home");
    mockSingle.mockResolvedValue({ data: { id: "admin-1", name: "Admin", role: "traveler", is_admin: true }, error: null });
    renderWithProvider();

    emit("INITIAL_SESSION", session("admin-1"));

    await waitFor(() => expect(path()).toHaveTextContent("/admin"));
  });

  it("leaves an admin on /reset-password on initial load", async () => {
    window.history.pushState({}, "", "/reset-password");
    mockSingle.mockResolvedValue({ data: { id: "admin-1", name: "Admin", role: "traveler", is_admin: true }, error: null });
    renderWithProvider();

    emit("INITIAL_SESSION", session("admin-1"));

    await waitFor(() => expect(state()).toHaveTextContent("signed-in:Admin"));
    expect(path()).toHaveTextContent("/reset-password");
  });

  it("sends an admin to /admin after SIGNED_IN, but not again on later events for the same user", async () => {
    mockSingle.mockResolvedValue({ data: { id: "admin-1", name: "Admin", role: "traveler", is_admin: true }, error: null });
    renderWithProvider();
    emit("INITIAL_SESSION", null);

    emit("SIGNED_IN", session("admin-1"));
    await waitFor(() => expect(path()).toHaveTextContent("/admin"));

    act(() => window.history.pushState({}, "", "/terms"));
    emit("SIGNED_IN", session("admin-1"));
    emit("TOKEN_REFRESHED", session("admin-1"));
    await act(async () => {});
    expect(window.location.pathname).toBe("/terms");
  });

  it("does not redirect a non-admin", async () => {
    window.history.pushState({}, "", "/explore");
    mockSingle.mockResolvedValue({ data: { id: "user-1", name: "Test Traveler", role: "traveler", is_admin: false }, error: null });
    renderWithProvider();

    emit("INITIAL_SESSION", session("user-1"));

    await waitFor(() => expect(state()).toHaveTextContent("signed-in:Test Traveler"));
    expect(path()).toHaveTextContent("/explore");
  });

  it("goes to /reset-password on PASSWORD_RECOVERY and keeps an admin there", async () => {
    window.history.pushState({}, "", "/auth");
    mockSingle.mockResolvedValue({ data: { id: "admin-1", name: "Admin", role: "traveler", is_admin: true }, error: null });
    renderWithProvider();

    emit("INITIAL_SESSION", session("admin-1"));
    emit("PASSWORD_RECOVERY", session("admin-1"));
    expect(path()).toHaveTextContent("/reset-password");

    await waitFor(() => expect(state()).toHaveTextContent("signed-in:Admin"));
    expect(path()).toHaveTextContent("/reset-password");
  });

  it("subscribes to auth changes once, even across navigation", async () => {
    mockSingle.mockResolvedValue({ data: { id: "admin-1", name: "Admin", role: "traveler", is_admin: true }, error: null });
    renderWithProvider();
    const firstCallback = authCallback;
    emit("SIGNED_IN", session("admin-1"));
    await waitFor(() => expect(path()).toHaveTextContent("/admin"));

    expect(authCallback).toBe(firstCallback);
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it("logout clears the user and refreshProfile reloads it", async () => {
    mockSingle.mockResolvedValue({ data: { id: "user-1", name: "Old Name", role: "traveler" }, error: null });
    renderWithProvider();
    emit("INITIAL_SESSION", session("user-1"));
    await waitFor(() => expect(state()).toHaveTextContent("signed-in:Old Name"));

    mockSingle.mockResolvedValue({ data: { id: "user-1", name: "New Name", role: "traveler" }, error: null });
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => expect(state()).toHaveTextContent("signed-in:New Name"));

    fireEvent.click(screen.getByText("Logout"));
    await waitFor(() => expect(state()).toHaveTextContent("signed-out"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("rejects login and signs out when the account's role doesn't match expectedRole", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockSingle.mockResolvedValue({ data: { role: "guide" }, error: null });

    renderWithProvider(<LoginTester />);
    emit("INITIAL_SESSION", null);

    fireEvent.click(screen.getByText("Login"));

    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("Invalid credentials"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("allows login when the account's role matches expectedRole", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockSingle.mockResolvedValue({ data: { role: "traveler" }, error: null });

    renderWithProvider(<LoginTester />);
    emit("INITIAL_SESSION", null);

    fireEvent.click(screen.getByText("Login"));

    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("no-error"));
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
