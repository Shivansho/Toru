# Release Checklist

This document must be reviewed before deploying a new major version of Toru to production.

## 1. Legal and Compliance
- [ ] **Privacy Policy & Terms of Service**: Verify that the latest versions of the legal documents are correctly linked and accessible in the Web UI.
- [ ] **Grievance Officer Page**: Ensure the Grievance Officer contact details (required for social platforms in India) are up-to-date and the `/grievance` page is accessible to both authenticated and unauthenticated users.
- [ ] **Data Retention Compliance**: Confirm that no fields capturing actual identity (e.g., precise Date of Birth, real names, unhashed emails in logs) were introduced in the release. 

## 2. Testing and CI Verification
- [ ] Pull Requests pass all CI checks (Lint, Typecheck, Unit Tests, API Tests).
- [ ] Playwright E2E suites pass successfully against a staging replica.
- [ ] Dependencies have been audited (`pnpm audit`) and no critical vulnerabilities exist.
- [ ] Secrets scan (`trufflehog`) is clean.

## 3. Database
- [ ] Generate and review Prisma migrations.
- [ ] Take a pre-deployment database backup (`scripts/backup.sh`).
- [ ] Perform a rehearsal restore of the backup on a staging database to verify data integrity.

## 4. Deployment Execution
- [ ] Deploy API and Web containers to production.
- [ ] Run Prisma migration: `docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy`
- [ ] Monitor logs in AWS CloudWatch for the first 15 minutes after deployment. Ensure no spikes in 500 errors.
- [ ] Verify Sentry dashboard for any unhandled exceptions related to the new release.

## 5. Rollback Procedure
If critical failures occur (e.g., socket connection failures, immediate crash loops):
1. Revert the Git HEAD to the previous stable release commit.
2. Build and push the docker images (or simply point the docker-compose image tags to the previous version tag).
3. Restart the containers with `docker compose -f docker-compose.prod.yml up -d`.
4. If a database migration was destructive and caused the error, restore the database from the pre-deployment backup using `scripts/restore.sh`.

## 6. Incident Plan
If a breach or severe abuse pattern is detected:
1. Revoke the compromised college domain from the admin dashboard.
2. If the API is compromised, scale down the API containers to 0 immediately to halt traffic.
3. Access AWS logs and Sentry to determine the entry point.
4. Escalate to the security contact and optionally notify affected tenants based on the SLA.
