/**
 * Authentication provider.
 *
 * Centralises auth state for the application:
 *  - Fetches /v1/me on mount to determine auth state
 *  - Exposes user, loading, error, signIn, signOut
 *  - Handles loading, success, error, and unauthorized states
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createAuthApi } from "../lib/api/auth.js";
import { ApiError } from "../lib/api/errors.js";
import type { UserResource } from "@avana/contracts";

export type AuthState = {
  /** Current authenticated user, or null if not authenticated. */
  user: UserResource | null;
  /** True while initial auth check is in progress. */
  isLoading: boolean;
  /** Error that occurred during sign-in or initial auth check. */
  error: string | null;
  /** True if the user is authenticated. */
  isAuthenticated: boolean;
  /** Sign in with an email address. */
  signIn: (email: string) => Promise<void>;
  /** Sign out (revoke session). */
  signOut: () => Promise<void>;
  /** Clear any auth error. */
  clearError: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable API references across renders (useRef to avoid infinite loops)
  const authApiRef = useRef(
    createAuthApi(createApiClient({ baseUrl: getApiBaseUrl() })),
  );
  const authApi = authApiRef.current;

  const clearError = useCallback(() => setError(null), []);

  /**
   * Fetch current user. Called on mount and after sign-in.
   * A 401 response simply means no session — not an error state.
   */
  const fetchMe = useCallback(async () => {
    try {
      const response = await authApi.getMe();
      setUser(response.user);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "unauthorized") {
        // Not signed in — this is expected, not an error
        setUser(null);
        setError(null);
      } else {
        // Real error
        setUser(null);
        setError(err instanceof ApiError ? err.message : "Failed to load user");
      }
    } finally {
      setIsLoading(false);
    }
  }, [authApi]);

  // Check auth state on mount
  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  const signIn = useCallback(
    async (email: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await authApi.signIn(email);
        setUser(response.user);
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Sign in failed";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [authApi],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.signOut();
    } catch {
      // Even if the API call fails, clear local state
    }
    setUser(null);
    setError(null);
  }, [authApi]);

  const value: AuthState = {
    user,
    isLoading,
    error,
    isAuthenticated: user !== null,
    signIn,
    signOut,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth state. Must be used within an AuthProvider.
 */
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
