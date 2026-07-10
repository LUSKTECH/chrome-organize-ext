# Chrome Web Store Listing — Browser Organizer

_Last updated: 2026-07-09_

## Short description
Organize a messy browser: group open tabs by topic, close forgotten tabs, bookmark the
important ones, and clean out dead or duplicate bookmarks — powered by your own local AI CLI.

## Detailed description
Browser Organizer turns a 200-tab mess into order. Click one button and it groups your
open tabs by topic, flags forgotten tabs you can close (saving any worth keeping first),
files genuinely useful pages into tidy bookmark folders, and finds stale, dead, or
duplicate bookmarks to remove. You review every change before it happens, or turn on
automatic mode with one-click undo. All processing runs through a helper program on your
own computer, which calls your own AI CLI — tab titles and URLs are sent to that CLI's
AI provider under your own subscription. Nothing is ever sent to our servers; we operate
none.

## Permission justifications
- **tabs**: Read tab titles and URLs to suggest groupings and identify forgotten tabs.
- **tabGroups**: Create and label tab groups when organizing open tabs in place.
- **bookmarks**: Read your bookmarks to find duplicates/stale entries and create new ones.
- **history**: Check when a bookmarked page was last visited, to identify stale bookmarks.
- **storage**: Save your settings, tab-activity timestamps, and the undo log locally.
- **alarms**: Run scheduled organization passes and prune the undo log in auto mode.
- **sidePanel**: Show the review dashboard where you approve suggested changes.
- **nativeMessaging**: Communicate with the local helper that runs your AI CLI.
- **notifications**: Tell you when a scheduled pass finishes and changes are ready/applied.
- **optional_host_permissions `<all_urls>`**: Requested at runtime only if you enable
  dead-link scanning, to check whether bookmarked pages still load. Not granted at install.
  The extension never reads page contents — it only checks the HTTP status.

## Privacy
See PRIVACY.md. Tab titles and URLs (query strings/fragments stripped) are sent to your
AI provider under your own subscription, via your local AI CLI. Bookmarks and history
are never sent anywhere — they stay on your machine. No data ever reaches the
extension developer's servers; we operate none.

## Pre-publish checklist
- [ ] Real 16/48/128 px icons added to `extension/icons/` and referenced in manifest
- [ ] At least one 1280×800 screenshot of the side panel
- [ ] Privacy policy URL is live and matches PRIVACY.md
- [ ] ZIP excludes `.git/`, `node_modules/`, `test/`, `CHROMEWEBSTORE.md`
- [ ] After publishing, update the native host `allowed_origins` note if the store ID differs
