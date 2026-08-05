# ADR 0003: Use PostgreSQL and Drizzle with SQL-reviewed migrations

- **Status:** Accepted
- **Date:** 2026-07-18
- **Owner:** CTO and Engineering
- **Decision scope:** Transactional database access and schema migration workflow

## Context

AVANA needs relational integrity for tenant ownership, courses, learning records, billing projections, audit trails, and job state. It also needs a clear path to full-text search and initial vector retrieval. Schema evolution must be transparent, reversible, and safe across staging and production.

## Decision

Use **PostgreSQL 16+** as the transactional source of truth and **Drizzle ORM** for typed query construction and migration generation. Treat generated SQL migrations as reviewed production artifacts. Drizzle is not a substitute for database design: foreign keys, unique constraints, indexes, transaction boundaries, and query plans must be explicit.

Migration workflow:

1. Develop schema changes with a migration and a matching data-access change.
2. Review generated SQL in pull requests.
3. Use backwards-compatible expand → migrate/backfill → contract changes.
4. Rehearse every migration against a fresh database and staging-like data before production.
5. Do not edit an applied migration; create a corrective migration instead.
6. Document restore/rollback behavior before destructive or data-moving changes.

## Alternatives considered

### Prisma

Prisma offers strong developer ergonomics and broad adoption. Drizzle is selected because it stays closer to SQL and migration artifacts, which fits AVANA's security-sensitive tenancy, audit, and data-lifecycle requirements while retaining TypeScript types.

### No ORM / raw SQL only

Raw SQL remains valid for migrations and exceptional measured queries, but an ORM/query builder reduces repetitive mapping errors and improves type safety for ordinary application access.

### Document database

Rejected. AVANA's core requirements are relational: tenancy, memberships, course ownership, payments, schedules, and immutable history. PostgreSQL also supplies a measured initial path for JSONB, full-text, and vectors.

## Consequences

- Database schema and migrations are created in PR 6, not this PR.
- All tenant-bound queries must include an authorization/tenant scope supplied by application policy.
- Drizzle schema definitions and SQL migrations must remain aligned and tested.
- `pgvector` is optional and introduced only with the document/RAG milestone, after its index and query plan are defined.

## Revisit trigger

Revisit if Drizzle prevents required schema/database capabilities, or if measured vector/search workloads need a dedicated system. Replacements require a data migration, compatibility period, and rollback plan.
