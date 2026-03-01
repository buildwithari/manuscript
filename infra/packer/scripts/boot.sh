#!/bin/bash
# boot.sh — runs on every EC2 instance startup via manuscript-secrets.service
# Pulls secrets from SSM Parameter Store and writes them as a systemd EnvironmentFile.
# The app service reads /etc/manuscript/env before starting.

set -euo pipefail

SSM_PATH="/manuscript/backend/"
ENV_FILE="/etc/manuscript/env"
REGION="us-east-1"

echo "==> Pulling secrets from SSM: ${SSM_PATH}"

# Get all parameters under /manuscript/backend/ in one API call.
# --with-decryption handles SecureString params (which all secrets should be).
PARAMS=$(aws ssm get-parameters-by-path \
  --path "${SSM_PATH}" \
  --with-decryption \
  --region "${REGION}" \
  --query "Parameters[*].{Name:Name,Value:Value}" \
  --output json)

if [ -z "$PARAMS" ] || [ "$PARAMS" = "[]" ]; then
  echo "ERROR: No parameters found at ${SSM_PATH}" >&2
  exit 1
fi

echo "==> Writing environment file to ${ENV_FILE}"

# Clear existing env file and lock it down before writing secrets
install -m 600 -o root -g root /dev/null "${ENV_FILE}"

# Convert SSM parameter names to env var names:
# /manuscript/backend/OPENAI_API_KEY → OPENAI_API_KEY=<value>
echo "$PARAMS" | python3 -c "
import sys, json
params = json.load(sys.stdin)
for p in params:
    name = p['Name'].split('/')[-1]  # take the last path segment
    value = p['Value'].replace('\n', '\\\\n')  # escape newlines
    print(f'{name}={value}')
" >> "${ENV_FILE}"

echo "==> Secrets written (${ENV_FILE} is mode 600, readable by root only)"
echo "==> boot.sh complete"
