import { readFileSync } from 'node:fs';

// The host's own package version, read from the package.json shipped alongside
// it (the installer copies package.json into the stable home). Resolved once at
// module load — the version can't change during the process. 'unknown' when it
// can't be read (e.g. a SEA build, which has no package.json on disk).
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

export function hostVersion() {
  return VERSION;
}
