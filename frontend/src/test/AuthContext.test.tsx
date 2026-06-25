import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSingle = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: unknown) => mockOnAuthStateChange(cb),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: vi.fn(),
      signOut: () => mockSignOut(),
      signInWithOAuth: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockSingle(),
        }),
      }),
    }),
  },
}));

function Consumer() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  return <div>{user ? `signed-in:${user.name}` : "signed-out"}</div>;
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

describe("AuthContext", () => {
  beforeEach(() => {
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mockSignInWithPassword.mockReset();
    mockSignOut.mockReset();
  });

  it("renders signed-out state when there is no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(
      <BrowserRouter>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => expect(screen.getByText("signed-out")).toBeInTheDocument());
  });

  it("loads the profile and renders signed-in state when a session exists", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    });
    mockSingle.mockResolvedValue({
      data: { id: "user-1", name: "Test Traveler", role: "traveler", onboarded: true },
      error: null,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => expect(screen.getByText("signed-in:Test Traveler")).toBeInTheDocument());
  });

  it("rejects login and signs out when the account's role doesn't match expectedRole", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockSingle.mockResolvedValue({ data: { role: "guide" }, error: null });

    render(
      <BrowserRouter>
        <AuthProvider>
          <LoginTester />
        </AuthProvider>
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText("Login"));

    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("Invalid credentials"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("allows login when the account's role matches expectedRole", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockSingle.mockResolvedValue({ data: { role: "traveler" }, error: null });

    render(
      <BrowserRouter>
        <AuthProvider>
          <LoginTester />
        </AuthProvider>
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText("Login"));

    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("no-error"));
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
