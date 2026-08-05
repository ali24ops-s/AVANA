# ADR 0002: Use managed OIDC identity with an application-owned session boundary

- **Status:** Accepted
- **Date:** 2026-07-18
- **Owner:** CTO, Security, and Engineering
- **Decision scope:** Authentication, identity lifecycle, and browser-session strategy

## Context

AVANA needs verified identity, password recovery, MFA readiness, account recovery, future SSO, session revocation, and security monitoring. Building and operating password credentials directly would add high-risk work before AVANA's learning product is validated.

## Decision

Use a **managed OIDC/OAuth 2.1 identity provider** behind an internal identity adapter. The selected vendor must support email verification, passwordless/password login where required, recovery, MFA, administrative suspension, OIDC standards, webhook/audit capabilities, EU/UK privacy obligations where applicable, and future SAML/OIDC enterprise SSO.

AVANA owns its user record, roles, organization memberships, authorization policy, and browser application session. The API exchanges verified identity assertions for an AVANA session using `HttpOnly`, `Secure`, `SameSite` cookies, rotation/revocation, expiry, CSRF protection for mutations, and device/session audit metadata. No long-lived provider token is exposed to browser JavaScript.

The provider is an implementation detail behind the adapter; vendor selection and data-processing agreement approval occur before production deployment, not before PR 2 platform scaffolding.

## Alternatives considered

### In-house password and identity implementation

Rejected for the initial product. It would require credential hashing, breach monitoring, recovery, MFA, email security, fraud protection, session security, and compliance operations that do not differentiate AVANA.

### Browser-held JWTs

Rejected for the web application. Tokens accessible to JavaScript increase XSS impact and make revocation/rotation harder to enforce. Short-lived access tokens remain a possible native-client strategy in a later ADR.

### Provider-hosted session only

Rejected because AVANA needs application-owned user lifecycle, audit records, tenancy authorization, and controlled session policy independent of vendor behavior.

## Consequences

- PR 7 implements an identity adapter and a local development adapter/test double, not password storage.
- Browser session state is server-controlled and auditable.
- Vendor contracts, regional data handling, webhook security, and outage fallback are release requirements.
- Email delivery and enterprise SSO implementation remain out of scope until their planned phase.

## Revisit trigger

Revisit if regulatory, data-residency, cost, or enterprise SSO requirements cannot be met by a managed OIDC provider, or when native clients require a distinct token model. Changes require a security review and migration plan.
