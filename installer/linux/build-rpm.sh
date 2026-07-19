#!/bin/sh
# Browser Organizer — native host installer (Linux / .rpm)
#
# TOOLCHAIN: rpmbuild (Fedora/RHEL: `dnf install rpm-build`; Debian: `apt-get
# install rpm`). Run on a Fedora/RHEL host or a runner with rpmbuild installed.
# NOT run in the offline sandbox unless rpmbuild is present.
#
# Expects the SEA binary from `npm run build:sea` at
# dist/host/browser-organizer-host. Produces
# dist/browser-organizer-host-<version>-1.<arch>.rpm.
#
# Like the .deb, the package installs the binary system-wide
# (/usr/lib/browser-organizer + /usr/bin symlink) and leaves per-user
# native-messaging registration to `browser-organizer-host --install`, since
# manifests live under each user's home.
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# Default the version from the single source of truth (native-host/package.json);
# CI overrides via $VERSION. Keeps all installers from drifting apart.
VERSION="${VERSION:-$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT_DIR/native-host/package.json" | head -1)}"
ARCH="${ARCH:-x86_64}"
BIN="$ROOT_DIR/dist/host/browser-organizer-host"

if [ ! -f "$BIN" ]; then
  echo "error: $BIN not found — run 'npm run build:sea' first." >&2
  exit 1
fi

TOP="$(mktemp -d)"
trap 'rm -rf "$TOP"' EXIT
mkdir -p "$TOP/BUILD" "$TOP/RPMS" "$TOP/SOURCES" "$TOP/SPECS" "$TOP/BUILDROOT"

# Stage the binary into the buildroot layout the spec installs from.
mkdir -p "$TOP/SOURCES/usr/lib/browser-organizer"
cp "$BIN" "$TOP/SOURCES/usr/lib/browser-organizer/browser-organizer-host"

cat > "$TOP/SPECS/browser-organizer-host.spec" <<EOF
Name:           browser-organizer-host
Version:        $VERSION
Release:        1
Summary:        Browser Organizer native messaging host
License:        MIT
URL:            https://lusk.tech
BuildArch:      $ARCH
%description
Local helper that lets the Browser Organizer browser extension talk to your AI
CLI or an OpenAI-compatible endpoint. Registered system-wide for Chrome,
Chromium, and Edge on install (available to all users on this machine).

%install
mkdir -p %{buildroot}/usr/lib/browser-organizer %{buildroot}/usr/bin
install -m 0755 %{_sourcedir}/usr/lib/browser-organizer/browser-organizer-host %{buildroot}/usr/lib/browser-organizer/browser-organizer-host
ln -s ../lib/browser-organizer/browser-organizer-host %{buildroot}/usr/bin/browser-organizer-host
# Static system-wide native-messaging manifests, staged into the payload so RPM
# tracks them (rpm -ql) and removes them on uninstall. No %post/%postun needed.
# \$d is escaped so it stays literal in the generated spec (runs during %install).
for d in /etc/opt/chrome/native-messaging-hosts /etc/chromium/native-messaging-hosts /etc/opt/edge/native-messaging-hosts; do
  mkdir -p %{buildroot}\$d
  cat > %{buildroot}\$d/com.browser_organizer.host.json <<'JSON'
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

%files
/usr/lib/browser-organizer/browser-organizer-host
/usr/bin/browser-organizer-host
/etc/opt/chrome/native-messaging-hosts/com.browser_organizer.host.json
/etc/chromium/native-messaging-hosts/com.browser_organizer.host.json
/etc/opt/edge/native-messaging-hosts/com.browser_organizer.host.json
EOF

rpmbuild --define "_topdir $TOP" -bb "$TOP/SPECS/browser-organizer-host.spec"

mkdir -p "$ROOT_DIR/dist"
find "$TOP/RPMS" -name '*.rpm' -exec cp {} "$ROOT_DIR/dist/" \;
echo "Built RPM into $ROOT_DIR/dist/"
