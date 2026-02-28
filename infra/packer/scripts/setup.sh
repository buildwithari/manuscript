#!/bin/bash
# setup.sh — runs during Packer AMI bake (not at runtime)
# Installs Python 3.11, sets up the app, registers systemd services.
# Secrets are NOT handled here — boot.sh does that at instance startup.

set -euo pipefail

echo "==> Installing system dependencies"
apt-get update -y
apt-get install -y software-properties-common curl unzip

# Ubuntu 22.04 ships with Python 3.10; use deadsnakes PPA for 3.11
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -y
apt-get install -y python3.11 python3.11-venv python3.11-dev

# AWS CLI v2 — needed by boot.sh to pull SSM secrets at startup
echo "==> Installing AWS CLI v2"
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/awscliv2.zip /tmp/aws

echo "==> Creating manuscript user and directories"
useradd --system --no-create-home --shell /usr/sbin/nologin manuscript
mkdir -p /opt/manuscript
mkdir -p /etc/manuscript  # env file written here by boot.sh at runtime

# Packer uploads backend/ to /tmp/backend via the file provisioner
echo "==> Installing backend code"
cp -r /tmp/backend /opt/manuscript/backend

echo "==> Creating Python virtualenv and installing dependencies"
python3.11 -m venv /opt/manuscript/venv
/opt/manuscript/venv/bin/pip install --upgrade pip
/opt/manuscript/venv/bin/pip install -r /opt/manuscript/backend/requirements.txt

echo "==> Installing boot script"
cp /tmp/boot.sh /opt/manuscript/boot.sh
chmod +x /opt/manuscript/boot.sh

echo "==> Setting ownership"
chown -R manuscript:manuscript /opt/manuscript
chown root:root /opt/manuscript/boot.sh  # boot.sh runs as root to write env file

echo "==> Registering systemd services"

# manuscript-secrets.service — runs boot.sh once at startup, before the app
# Uses Type=oneshot + RemainAfterExit so systemd knows it "succeeded" persistently
cat > /etc/systemd/system/manuscript-secrets.service << 'EOF'
[Unit]
Description=Pull Manuscript secrets from SSM Parameter Store
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/opt/manuscript/boot.sh

[Install]
WantedBy=multi-user.target
EOF

# manuscript.service — the FastAPI app, starts after secrets are loaded
cat > /etc/systemd/system/manuscript.service << 'EOF'
[Unit]
Description=Manuscript FastAPI Backend
After=manuscript-secrets.service
Requires=manuscript-secrets.service

[Service]
Type=simple
User=manuscript
WorkingDirectory=/opt/manuscript
# EnvironmentFile is written by boot.sh at startup
EnvironmentFile=/etc/manuscript/env
ExecStart=/opt/manuscript/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable manuscript-secrets.service
systemctl enable manuscript.service
# Do NOT start either service here — they'll start on first boot

echo "==> setup.sh complete"
