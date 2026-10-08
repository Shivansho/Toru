#!/bin/bash
set -e

echo "Running security audit..."

# Check for gitleaks
if command -v gitleaks &> /dev/null
then
    echo "Running gitleaks..."
    gitleaks protect --staged
else
    echo "gitleaks not installed, skipping secret scan. Please install gitleaks for local pre-commit checks."
fi

# Run pnpm audit
echo "Running pnpm audit for critical vulnerabilities..."
pnpm audit --prod --audit-level critical

echo "Security audit passed!"
