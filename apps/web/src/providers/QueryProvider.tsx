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

// Create singleton query client with application defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds before data is considered stale
      retry: 1, // Retry once on failure
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
