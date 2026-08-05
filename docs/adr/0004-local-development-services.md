# ADR 0004: Use Docker Compose for local PostgreSQL and Redis

- **Status:** Accepted
- **Date:** 2026-07-18
- **Owner:** CTO and Engineering
- **Decision scope:** Reproducible local infrastructure, workspace tooling, and configuration ownership

## Context

The platform needs PostgreSQL and Redis from Sprint 1 onward. Developers must be able to reproduce local dependencies without installing or sharing production services. It also needs one package-manager and workspace workflow so developers install dependencies once and run consistent repository-wide commands. Configuration must distinguish local, preview, staging, and production while preventing secrets and personal data from entering the repository.

## Decision

Use **npm Workspaces** as the AVANA package-manager workspace solution. The root `package.json` defines the `apps/*` and `packages/*` workspaces, root scripts orchestrate workspace commands, and the committed npm lockfile is the deterministic installation record. Developers install dependencies once from the repository root.

Starting in PR 6, provide a version-controlled Docker Compose configuration for **PostgreSQL** and **Redis**. It uses local-only credentials, named volumes, pinned major versions, health checks, and non-public host bindings suitable for development. The compose file is an implementation of this decision, not part of PR 1.

Configuration ownership:

- Required environment variables are documented in version-controlled `.env.example` files beginning in PR 3/PR 5.
- Local values are stored only in ignored `.env` files.
- Preview, staging, and production values are supplied by the deployment platform/managed secret store; they are never copied from local files.
- Local seed data is synthetic only. Production data, uploads, API tokens, and personal information must never be used in local development or tests.
- Application startup fails fast for missing or invalid required configuration and redacts secret values from logs.

## Alternatives considered

### pnpm workspaces

pnpm provides efficient disk usage and strong workspace support. It is not selected because npm Workspaces supplies the required monorepo capabilities without adding a second package-manager binary or package-store model for the initial foundation.

### Yarn workspaces

Yarn provides mature workspace support, but it introduces Yarn-specific configuration and release choices. npm Workspaces keeps the initial developer workflow aligned with Node.js's bundled package manager.

### Separate package installations without workspaces

Rejected because independent lockfiles and installations would make repository-wide build, type-check, test, lint, and format commands less reproducible and would weaken package-boundary management.

### Manually installed developer services

Rejected because versions, configuration, cleanup, and onboarding would drift between developers.

### Shared development database/cache

Rejected because it creates data leakage, test interference, accidental destructive changes, and unclear ownership.

### Production-like Kubernetes locally

Rejected for the initial foundation because it adds operational burden without improving the API/database/worker workflows being validated.

## Consequences

- Node.js and npm are required local prerequisites; the supported npm version is declared by the root package manifest.
- Root workspace scripts are the supported way to run repository-wide build, type-check, test, lint, and format commands.
- Package dependencies and workspace metadata are maintained in root and workspace `package.json` files, with changes captured in the npm lockfile.
- A future move to another package manager requires an ADR update and a deterministic-install migration plan.

- Docker Desktop or a compatible Compose runtime becomes a documented local prerequisite once PR 6 lands.
- Developers can reset only their local named volumes; commands must never target broad or unresolved paths.
- CI uses disposable services/containers and does not depend on a developer machine.
- Object storage, email, and external identity are represented by documented test/local adapters until their delivery phases.

## Revisit trigger

Revisit if local Compose materially impedes development on supported platforms, or if the worker/document pipeline needs a managed local emulator that Compose cannot support. Changes must preserve isolated, synthetic, reproducible development environments.
