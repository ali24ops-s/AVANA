/**
 * Framework-independent identity adapter port.
 *
 * Per ADR 0002, AVANA uses a managed OIDC identity provider behind
 * an internal adapter interface. This port defines the contract that
 * any identity provider implementation must satisfy.
 *
 * The adapter is kept framework-independent so providers can be
 * swapped without changing business logic.
 */

/**
 * Verified identity returned by the identity adapter after successful
 * authentication.
 */
export type VerifiedIdentity = {
  /**
   * Provider-specific unique identifier for the external identity.
   * Example: "local|user@example.com"
   */
  providerSubject: string;

  /**
   * The identity provider name (e.g., "local", "google", "microsoft").
   */
  provider: string;

  /** Verified email address from the provider. */
  email: string;

  /** Display name from the provider. */
  name: string;
};

/**
 * Credentials accepted by the local/mock adapter for Sprint 1.
 * In production, this would carry an OIDC id_token / authorization code.
 */
export type AuthenticationCredentials = {
  email: string;
  name?: string;
};

/**
 * Identity adapter interface.
 *
 * Implementations translate provider-specific authentication into
 * a standard VerifiedIdentity that the application can use to create
 * or link local user records and establish sessions.
 */
export interface IdentityAdapter {
  /**
   * Verify authentication credentials and return the verified identity.
   *
   * @param credentials - Provider-specific authentication input
   * @returns VerifiedIdentity on success
   * @throws DomainError with code "unauthorized" if verification fails
   */
  verifyIdentity(
    credentials: AuthenticationCredentials,
  ): Promise<VerifiedIdentity>;
}
