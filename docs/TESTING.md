# Testing Strategy

This repository employs a multi-tiered testing strategy to ensure reliability, security, and privacy.

## 1. Unit & API Tests
Run all unit tests and API integration tests:
```bash
pnpm test -F api
```
**Coverage:** 
We enforce an 80% coverage threshold across lines, branches, functions, and statements.
To view the coverage report:
```bash
pnpm test --coverage -F api
```

## 2. Playwright End-to-End Tests
E2E tests verify the user flow across the web interface and API, including onboarding, chat sessions, reporting, and moderation.
```bash
cd apps/e2e
npx playwright test
```

## 3. Privacy Regression Suite
Privacy is a core tenet. The regression suite is integrated within the API tests and asserts:
- No Date of Birth is ever stored (only `ageVerified`).
- No user email appears in student-facing API endpoints.
- No PII is exposed during match events.
- Data retention jobs execute accurately.
To run specifically:
```bash
pnpm test src/routes/admin_reports.test.ts -F api
pnpm test src/services/retention.test.ts -F api
```

## 4. Load Testing
We use Artillery to simulate concurrent users, specifically testing the matching queue and socket connection scaling.
Requirements: 500 concurrent connections, 100 queued users, and message bursting.
```bash
cd apps/api
pnpm run load-test
```
*Results and bottleneck analysis are found in `docs/LOAD_TEST_RESULTS.md`.*

## 5. Chaos Check
Chaos testing ensures the system degrades and recovers gracefully. 
To perform the chaos check:
1. Start the dev server (`pnpm dev`).
2. Run the load test or E2E suite.
3. Mid-test, restart the Redis container (`docker restart toru_redis`) or API server.
4. Verify clients automatically reconnect and no user is placed in multiple active sessions concurrently.
