import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderAt(path: string, role: "traveler" | "guide" | "any") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<div>auth page</div>} />
        <Route path="/home" element={<div>home page</div>} />
        <Route path="/guide-dashboard" element={<div>guide dashboard</div>} />
        <Route path="/complete-profile" element={<div>complete profile</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute role={role}>
              <div>protected content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("shows a loading state while auth is resolving", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    renderAt("/protected", "any");
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users to /auth", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    renderAt("/protected", "any");
    expect(screen.getByText("auth page")).toBeInTheDocument();
  });

  it("redirects to /complete-profile when the user hasn't onboarded", () => {
    mockUseAuth.mockReturnValue({ user: { role: "traveler", onboarded: false }, isLoading: false });
    renderAt("/protected", "any");
    expect(screen.getByText("complete profile")).toBeInTheDocument();
  });

  it("redirects a traveler away from a guide-only route to /home", () => {
    mockUseAuth.mockReturnValue({ user: { role: "traveler", onboarded: true }, isLoading: false });
    renderAt("/protected", "guide");
    expect(screen.getByText("home page")).toBeInTheDocument();
  });

  it("renders protected content for an authorized, onboarded user", () => {
    mockUseAuth.mockReturnValue({ user: { role: "traveler", onboarded: true }, isLoading: false });
    renderAt("/protected", "traveler");
    expect(screen.getByText("protected content")).toBeInTheDocument();
  });
});
