#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-xinchao-runtime-bridge}"
INSTALL_DIR="${INSTALL_DIR:-/opt/xinchao-runtime-bridge}"
ENV_FILE="${ENV_FILE:-/etc/xinchao-runtime-bridge.env}"
SOURCE_DIR="${SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/packages/runtime-bridge}"

if [[ ! -f "$SOURCE_DIR/package.json" ]]; then
  echo "Cannot find runtime bridge source at $SOURCE_DIR" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install Node first, then rerun this script." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node.js 20+ is required. Current: $(node -v)" >&2
  exit 1
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run as root, for example: sudo bash scripts/install-runtime-bridge.sh" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
rsync -a --delete "$SOURCE_DIR/" "$INSTALL_DIR/"

if [[ ! -f "$ENV_FILE" ]]; then
  install -m 0600 "$SOURCE_DIR/.env.example" "$ENV_FILE"
  cat <<MSG
Created $ENV_FILE.
Edit it first, then rerun this script:
  sudo nano $ENV_FILE

Required:
  XINCHAO_BRIDGE_BASE_URL
  XINCHAO_BRIDGE_MACHINE_TOKEN
  XINCHAO_BRIDGE_INJECTOR_MODE
  process injector executable/args or webhook url/token
MSG
  exit 2
fi

if grep -Eq 'replace-with|example.com|absolute/path/to/your-runtime-adapter' "$ENV_FILE"; then
  echo "$ENV_FILE still contains placeholders. Edit it before installing the service." >&2
  exit 2
fi

cd "$INSTALL_DIR"
npm install
npm test

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
node src/cli.js check

cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=Xinchao Runtime Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/env node src/cli.js run
Restart=always
RestartSec=8
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME"
