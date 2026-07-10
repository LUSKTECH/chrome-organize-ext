#!/bin/sh
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
BROWSER_ORGANIZER_CLI="/home/cody/.local/bin/claude"
export BROWSER_ORGANIZER_CLI
exec "/home/cody/.local/share/mise/installs/node/25.4.0/bin/node" "/home/cody/git/chrome-organize-ext/native-host/host.js"
