/**
 * Landing redirect page.
 *
 * For authenticated users: redirects to home dashboard (/home).
 * For unauthenticated users: redirects to sign-in (/sign-in).
 * This keeps the app functional when accessing "/".
 */

import { Navigate } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider.js";

export function LandingRedirect() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#008080] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return <Navigate to="/sign-in" replace />;
}
