/**
 * Authentication Feature Flag Configuration.
 *
 * Controls whether the application operates in full Authentication mode
 * or in Demo / Public Mode for static deployments (such as GitHub Pages).
 *
 * Behavior:
 * - When VITE_AUTH_ENABLED === "true" (or 1): Full Authentication mode is active.
 *   - /v1/me is requested on mount.
 *   - Login, registration, and email verification forms and buttons are visible.
 *   - Protected routes check authentication state and redirect unauthenticated users to /sign-in.
 *   - All auth API operations (signIn, signUp, signOut, verifyEmail, resendVerification) call backend endpoints.
 *
 * - When VITE_AUTH_ENABLED is false (or "false", "0", undefined): Demo / Public Mode is active.
 *   - No network calls to /v1/me or /v1/auth/* are made (prevents 405 Method Not Allowed / 401 on static hosts).
 *   - Login / Register buttons and sign out options are hidden.
 *   - Protected routes bypass authentication checks, allowing full exploration of the UI.
 *   - Direct navigation to /sign-in, /login, /register, /sign-up redirects cleanly to /home.
 *   - No fake user credentials needed; components gracefully fallback without crashing.
 */

export function isAuthEnabled(): boolean {
  const envVal = import.meta.env.VITE_AUTH_ENABLED;
  if (typeof envVal === "string") {
    const normalized = envVal.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return Boolean(envVal);
}
