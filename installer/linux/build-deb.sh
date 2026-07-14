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
 AI CLI or an OpenAI-compatible endpoint. After install, run
 'browser-organizer-host --install' to register it for Chrome/Edge (per-user).
EOF

cat > "$STAGE/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
echo "Browser Organizer host installed. Each user should run once:"
echo "    browser-organizer-host --install chrome,edge"
exit 0
EOF
chmod 755 "$STAGE/DEBIAN/postinst"

mkdir -p "$ROOT_DIR/dist"
dpkg-deb --build --root-owner-group "$STAGE" "$OUT"
echo "Built $OUT"
