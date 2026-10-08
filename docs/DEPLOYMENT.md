# Toru Deployment Guide (AWS Mumbai)

## Environment Strategy
The system uses separate configuration files and secrets for different environments. Secrets are strictly supplied by the host (environment variables) or a secrets manager (e.g., AWS Secrets Manager, GitHub Secrets) and must never be committed to the repository.
- **Development**: Managed via `.env` file and `docker-compose.yml`.
- **Staging/Production**: Managed via `.env.production` on the target host or injected via CI/CD. Use `docker-compose.prod.yml`.

## Provisioning a Fresh Server (India Region - AWS Mumbai / ap-south-1)
1. Launch an EC2 instance (e.g., t3.medium for a small start) running Ubuntu 24.04 LTS.
2. Install Docker and Docker Compose.
3. **Time Synchronisation**: 
   Ensure `chrony` is installed for precise NTP time synchronization (crucial for OTPs and Chat token verification).
   `sudo apt install chrony && sudo systemctl enable --now chronyd`
4. Copy `docker-compose.prod.yml` to the server along with the `.env` containing production secrets.
5. Log into your container registry to pull the `toru-api` and `toru-web` images.
6. Run `docker compose -f docker-compose.prod.yml up -d`.

### Database & Migrations
The database schema is managed via Prisma. 
To run migrations on deploy:
`docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy`

### Database Backups & Retention
Use the provided `scripts/backup.sh` to take logical dumps (`pg_dump`) of the PostgreSQL database.
Store these backups in an S3 bucket (ap-south-1) with a lifecycle policy matching the data retention rules (e.g., expire after 30 days depending on college rules, but note that the core application strictly deletes data via the retention cron job; backups should thus not outlive the maximum legal retention).

To restore the database:
`docker exec -i <postgres_container_name> psql -U toru toru_test < backup.sql`

## Observability, Logs & 180-Day Retention
1. **Logs**: Application logs are structured JSON via `pino`. Docker should be configured to ship logs to AWS CloudWatch using the `awslogs` log driver. Set the CloudWatch Log Group retention strictly to **180 Days** to comply with Indian data regulations (CERT-In).
2. **Error Tracking**: Handled via Sentry (`@sentry/node` & `@sentry/nextjs`). Sensitive fields (e.g., passwords, emails) are scrubbed at the `pino` level and Sentry should be configured to drop PII fields.
3. **Health & Uptime**: Use AWS Route53 Health Checks or UptimeRobot against `https://<domain>/health` on the API. Set up alerts for latency or downtime.

## HTTPS & Automatic Certificates
We recommend placing an Application Load Balancer (ALB) or a lightweight reverse proxy like Caddy in front of the API (port 4000) and Web (port 3000) containers. 
- Using **Caddy**: Provides automatic Let's Encrypt SSL.
- Using **AWS ALB**: Attach an ACM (AWS Certificate Manager) certificate for auto-renewal and routing.
