/**
 * Protected route component.
 *
 * Wraps routes that require authentication.
 * If the user is not authenticated, redirects to /sign-in.
 * Shows a loading state while auth state is being determined.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";

export function ProtectedRoute() {
  const { isAuthenticated, isEmailVerified, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth on mount
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--color-text-muted)] text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — redirect to sign-in
  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace />;
  }

  // Authenticated but unverified — redirect to /verify-email
  if (!isEmailVerified && location.pathname !== "/verify-email") {
    return <Navigate to="/verify-email" replace />;
  }

  // Authenticated — render child routes
  return <Outlet />;
}
