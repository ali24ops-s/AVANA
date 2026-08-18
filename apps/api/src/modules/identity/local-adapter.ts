/**
 * Local/mock identity adapter for development and testing.
 *
 * Per ADR 0002, Sprint 1 uses a test double for the identity provider.
 * This adapter validates against a simple email domain check and
 * provides deterministic responses for local development.
 */

import {
  DomainError,
  type IdentityAdapter,
  type VerifiedIdentity,
  type AuthenticationCredentials,
} from "@avana/domain";

/**
 * Local identity adapter for Sprint 1 development.
 *
 * Accepts any email matching a verified pattern. In production, this
 * would be replaced by an OIDC-based adapter.
 */
export class LocalIdentityAdapter implements IdentityAdapter {
  /**
   * @param allowedDomains - Email domains that are considered verified.
   *                         Defaults to ["example.com"] in test mode.
   */
  constructor(
    private readonly allowedDomains: string[] = ["example.com", "avana.dev"],
  ) {}

  async verifyIdentity(
    credentials: AuthenticationCredentials,
  ): Promise<VerifiedIdentity> {
    if (!credentials.email || !credentials.email.includes("@")) {
      throw new DomainError("bad_request", "Invalid email address");
    }

    const domain = credentials.email.split("@")[1];

    if (!this.allowedDomains.includes(domain)) {
      throw new DomainError("unauthorized", "دامنه ایمیل مجاز نیست.");
    }

    return {
      provider: "local",
      providerSubject: `local|${credentials.email}`,
      email: credentials.email,
      name: credentials.name ?? credentials.email.split("@")[0],
    };
  }
}
