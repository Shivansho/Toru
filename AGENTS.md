```text
PROJECT: Campus Anonymous Chat. A verified, anonymous, TEXT-ONLY chat platform for college students.
Read README.md in the repository root for the full specification before you write anything.

STACK: TypeScript everywhere. pnpm workspaces monorepo.
- apps/web: Next.js (App Router) + Tailwind CSS, mobile-first, installable as a PWA. Student UI and an /admin route group.
- apps/api: Node.js + Express + Socket.IO. REST API, realtime server and scheduled jobs.
- packages/shared: zod schemas, shared types, constants and the email-parsing module.
- PostgreSQL with Prisma. Redis for matching queues, rate limits and presence.
- Vitest for unit tests, Supertest for API tests, Playwright for end-to-end tests.
- Docker Compose for Postgres, Redis and Mailpit in development.

NON-NEGOTIABLE RULES:
1. Multi-tenant: every table and every query is scoped by college_id. College behaviour (domains, email patterns, programme lengths, retention) comes from the database, never hard-coded.
2. Text only. No images, files, links, video or voice anywhere.
3. Privacy: never store a date of birth (store only an age_verified boolean and a timestamp). No gender, no real name, no photo. The college email is encrypted at rest and never returned by any student-facing or default admin endpoint. Store an email hash (HMAC with a pepper) for lookups and bans.
4. Never log message bodies, emails or one-time codes.
5. Validate every REST input and every socket event with zod. Return generic error messages for auth failures.
6. Every admin action requires a reason string and writes an append-only audit_log row.
7. All times are stored in UTC. All secrets come from environment variables. Never commit secrets or real data.
8. Seed data, tests and examples use FAKE emails on a fake domain (for example student1@college.example). Never use real emails or names.
9. Write tests for the logic you add. Keep functions small and typed. No `any` unless justified in a comment.
10. Do not add features that were not asked for. If something is unclear, ask a question instead of guessing.

HOW TO WORK: First briefly state your plan and the files you will create or change. Then implement. Then run lint, type-check and tests, and show the results. Finish with a short summary and anything I should verify manually.
```