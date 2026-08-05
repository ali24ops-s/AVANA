# Contributing to AVANA

## Before you begin

Read the [Technical Blueprint](TECHNICAL_BLUEPRINT.md), applicable ADRs in `docs/adr/`, and the active sprint plan. The blueprint is authoritative for architecture; an approved ADR is required to change a consequential technical decision.

The repository uses npm Workspaces. Install dependencies once from the repository root with `npm install`; this also enables the versioned pre-commit hook. The API, database, authentication, queues, uploads, and AI implementation begin only in their scheduled pull requests.

## Development prerequisites

Use Node.js 22+ and npm 10+. Docker Compose is not required until PR 6. Do not install, configure, or connect to production services for local development.

Use only synthetic course, learner, and document data in local fixtures, tests, screenshots, and issue reports.

## Branches and commits

- Create focused branches using `feature/`, `fix/`, `chore/`, `docs/`, or `security/` prefixes, followed by a concise kebab-case description.
- Keep one independently reviewable outcome per pull request. Do not combine foundational work with visual redesigns, dependency upgrades, or unrelated cleanup.
- Use Conventional Commits: `type(scope): imperative summary`. Allowed types are `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci`, `chore`, and `security`.
- Do not force-push after review begins without noting the reason in the pull request.

## Pull request requirements

Every pull request must include:

1. A concise problem statement and intended outcome.
2. Linked sprint task, issue, or ADR.
3. Acceptance criteria and explicit out-of-scope items.
4. Tests run and their result; add or update tests for changed behavior.
5. Accessibility impact for user-facing work, including keyboard/focus behavior.
6. Security and privacy impact, including tenant authorization, data retention, and logging considerations.
7. API/OpenAPI and database migration impact, when applicable.
8. Observability impact: logs, metrics, traces, alerts, and audit events.
9. Screenshots or recordings for visual changes, using synthetic data only.

All production code changes require one approving reviewer. Changes to authentication, authorization, cryptography, payment handling, tenant isolation, secrets, migrations, or infrastructure require an additional security/platform reviewer. Code-owner rules are enforced when repository hosting is configured in PR 3.

## Engineering standards

- Keep TypeScript strict. Do not use `any` without a documented, reviewed exception.
- Validate all untrusted input at the system boundary. Client-side validation is not authorization or security validation.
- Keep domain logic independent of web framework, database, cloud, and model-provider SDKs.
- Use semantic HTML and meet WCAG 2.2 AA acceptance criteria for user-facing changes.
- Store timestamps in UTC and present them in the user's timezone.
- Keep tenant scoping explicit in every data access path.
- Do not call model providers outside the future model gateway or object storage outside the future file module.

## Security and data handling

Never commit credentials, tokens, private keys, `.env` files, production exports, real learner data, raw uploaded files, or logs containing personal data. Never paste these into issues, pull requests, or AI prompts.

If you suspect a security issue, do not open a public issue or include exploit details in a normal pull request. Escalate privately to the designated security owner and preserve relevant evidence without copying sensitive data.

## Verification

Run `npm run format:check`, `npm run lint`, `npm run secrets`, `npm run type-check`, `npm run test:coverage`, and `npm run build --workspace=@avana/web` before requesting review. CI runs the same commands after a deterministic `npm ci --ignore-scripts`. Coverage is reported without a threshold until baseline suites exist.

## Definition of ready and done

A task is ready when its acceptance criteria, dependencies, API/data ownership, and security/privacy implications are known. A task is done only when its acceptance criteria and required tests pass, documentation is updated, observability and rollback implications are addressed, and no unrelated scope is included.
