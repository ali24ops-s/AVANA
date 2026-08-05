# ADR 0001: Use Fastify for the AVANA API

- **Status:** Accepted
- **Date:** 2026-07-18
- **Owner:** CTO and Engineering
- **Decision scope:** API application framework for the modular monolith

## Context

AVANA needs a TypeScript API that supports schema-validated HTTP boundaries, OpenAPI 3.1 contracts, secure middleware, dependency injection for tests, structured logging, and a future SSE endpoint for AI responses. The API must start as a modular monolith with asynchronous workers handling document and AI workloads.

## Decision

Use **Fastify** as the API framework. Use JSON Schema-compatible request/response schemas at HTTP boundaries and keep domain/application logic framework-independent. Fastify plugins must be registered through a single application-composition layer so tests can start the API in process and replace infrastructure adapters.

OpenAPI remains the contract source of truth. Fastify route schemas must be generated from, or verified against, that contract; handwritten runtime schemas may not drift from published API schemas.

## Alternatives considered

### NestJS

NestJS provides a mature module and dependency-injection model, decorators, and a broad ecosystem. It introduces more framework conventions and metadata/decorator complexity than AVANA needs at this stage. AVANA can keep module boundaries explicit with Fastify and plain TypeScript while retaining simpler performance and test behavior.

### Express

Express is familiar but requires assembling validation, typing, logging, and performance conventions from separate packages. It does not provide as strong a schema-first default as Fastify.

### Serverless function handlers only

This would make local composition, long-lived SSE connections, consistent middleware, and worker/API operational conventions harder. It also obscures module boundaries without reducing the need for an API application.

## Consequences

- API code uses Fastify plugins/routes, schema validation, and `app.inject()` integration tests.
- Business logic must not depend on Fastify request/reply objects.
- The API can run in containers or compatible managed compute, not only in one cloud runtime.
- Engineering must maintain the OpenAPI-to-runtime schema consistency check from PR 4 onward.

## Revisit trigger

Revisit if the team requires NestJS-specific ecosystem capabilities that demonstrably reduce delivery or operational risk, or if the API evolves into independently deployed services with a different runtime requirement. Any change requires migration and test strategy ADR.
