#!/bin/sh
# Browser Organizer — native host installer (Linux / .deb)
#
# TOOLCHAIN: dpkg-deb (Debian/Ubuntu: `apt-get install dpkg-dev`). Run on an
# ubuntu-latest runner (see .github/workflows/release-host.yml) or a Debian host.
# NOT run in the offline sandbox unless dpkg-deb is present.
#
# Expects the SEA binary from `npm run build:sea` at
# dist/host/browser-organizer-host. Produces
# dist/browser-organizer-host_<version>_amd64.deb.
#
# The package installs the binary system-wide at
# /usr/lib/browser-organizer/browser-organizer-host and drops a helper wrapper at
# /usr/bin/browser-organizer-host. Native-messaging manifests are per-user, so
# registration is NOT done at package-install time: each user runs
# `browser-organizer-host --install` once (the postinst prints this hint). This
# keeps the package free of per-user side effects and multi-user safe.
set -eu

VERSION="${VERSION:-0.1.0}"
ARCH="${ARCH:-amd64}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$ROOT_DIR/dist/host/browser-organizer-host"
OUT="$ROOT_DIR/dist/browser-organizer-host_${VERSION}_${ARCH}.deb"

if [ ! -f "$BIN" ]; then
  echo "error: $BIN not found — run 'npm run build:sea' first." >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/usr/lib/browser-organizer" "$STAGE/usr/bin" "$STAGE/DEBIAN"
cp "$BIN" "$STAGE/usr/lib/browser-organizer/browser-organizer-host"
chmod 755 "$STAGE/usr/lib/browser-organizer/browser-organizer-host"
ln -s ../lib/browser-organizer/browser-organizer-host "$STAGE/usr/bin/browser-organizer-host"

cat > "$STAGE/DEBIAN/control" <<EOF
Package: browser-organizer-host
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Maintainer: Lusk Technologies <hello@lusk.dev>
Homepage: https://lusk.tech
Description: Browser Organizer native messaging host
 Local helper that lets the Browser Organizer browser extension talk to your
 AI CLI or an OpenAI-compatible endpoint. Registered system-wide for Chrome,
 Chromium, and Edge on install (available to all users on this machine).
EOF

# postinst: register the native host system-wide for all users. Linux browsers
# read these /etc locations in addition to each user's ~/.config.
cat > "$STAGE/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
for dir in /etc/opt/chrome/native-messaging-hosts /etc/chromium/native-messaging-hosts /etc/opt/edge/native-messaging-hosts; do
  mkdir -p "$dir"
  cat > "$dir/com.browser_organizer.host.json" <<'JSON'
{
  "name": "com.browser_organizer.host",
  "description": "Browser Organizer native host",
  "path": "/usr/lib/browser-organizer/browser-organizer-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://jjacbpnaekkhbfpncfhmignbiocddocc/"
  ]
}
JSON
done
echo "Browser Organizer host registered system-wide (Chrome, Chromium, Edge)."
exit 0
EOF
chmod 755 "$STAGE/DEBIAN/postinst"

# postrm: remove the system-wide manifests when the package is removed.
cat > "$STAGE/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e
for dir in /etc/opt/chrome/native-messaging-hosts /etc/chromium/native-messaging-hosts /etc/opt/edge/native-messaging-hosts; do
  rm -f "$dir/com.browser_organizer.host.json"
done
exit 0
EOF
chmod 755 "$STAGE/DEBIAN/postrm"

mkdir -p "$ROOT_DIR/dist"
dpkg-deb --build --root-owner-group "$STAGE" "$OUT"
echo "Built $OUT"
