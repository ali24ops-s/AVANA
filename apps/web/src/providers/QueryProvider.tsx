/**
 * TanStack Query provider.
 *
 * Configures query client defaults for the application:
 *  - Disable automatic refetch on window focus (prototype/preview behavior)
 *  - Reasonable stale time
 *  - Retry configuration
 */

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../lib/api/errors.js";

// Create singleton query client with application defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds before data is considered stale
      retry: (failureCount, error) => {
        // Never retry on authentication or session revocation errors
        if (
          error instanceof ApiError &&
          (error.statusCode === 401 ||
            error.statusCode === 403 ||
            (error.code as string) === "SESSION_REVOKED" ||
            (error.code as string) === "DEVICE_LIMIT_REACHED")
        ) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
