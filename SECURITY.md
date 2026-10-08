# Security Policy

## Supported Versions

Currently, only the main branch is supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within Toru, please send an e-mail to security@toru.college (or the active maintainer). All security vulnerabilities will be promptly addressed.

Please do not disclose security-related issues publicly until a fix has been announced.

## Security Features

Toru enforces strict security constraints to protect user privacy and safety:
- **Zero PII Storage:** Dates of birth, full names, and unencrypted emails are never stored.
- **Strict Content Security Policy (CSP):** XSS attacks are mitigated via Helmet and Next.js strict CSP headers.
- **CSRF Protection:** State-changing REST endpoints enforce a CSRF token check.
- **Origin Verification:** Socket.IO handshakes are strictly validated against `ALLOWED_ORIGINS`.
- **Rate Limiting:** OTP requests, reports, and connection attempts are heavily rate limited per IP and per device token.
- **Log Redaction:** `pino` is configured to redact emails, OTPs, session cookies, auth headers, and message bodies to prevent sensitive data from reaching log aggregators.
- **Automated Scanning:** Every commit is checked by `gitleaks` for secrets, and dependencies are audited via `pnpm audit`.

## Code of Conduct
Please review our overall repository guidelines before contributing.
