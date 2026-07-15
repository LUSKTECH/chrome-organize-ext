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

VERSION="${VERSION:-0.1.0}"
ARCH="${ARCH:-x86_64}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
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

%files
/usr/lib/browser-organizer/browser-organizer-host
/usr/bin/browser-organizer-host

%post
# Register the native host system-wide for all users (\$ escaped so these stay
# literal in the generated spec, not expanded when this heredoc is written).
for dir in /etc/opt/chrome/native-messaging-hosts /etc/chromium/native-messaging-hosts /etc/opt/edge/native-messaging-hosts; do
  mkdir -p "\$dir"
  cat > "\$dir/com.browser_organizer.host.json" <<'JSON'
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

%postun
if [ "\$1" = 0 ]; then
  for dir in /etc/opt/chrome/native-messaging-hosts /etc/chromium/native-messaging-hosts /etc/opt/edge/native-messaging-hosts; do
    rm -f "\$dir/com.browser_organizer.host.json"
  done
fi
EOF

rpmbuild --define "_topdir $TOP" -bb "$TOP/SPECS/browser-organizer-host.spec"

mkdir -p "$ROOT_DIR/dist"
find "$TOP/RPMS" -name '*.rpm' -exec cp {} "$ROOT_DIR/dist/" \;
echo "Built RPM into $ROOT_DIR/dist/"
