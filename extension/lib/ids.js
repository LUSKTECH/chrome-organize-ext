// Single source for the app's opaque unique ids (was inlined in 4 places).
// Uses crypto.randomUUID (available in the extension's worker/pages and in
// Node 20 that runs the tests) rather than Math.random, so the ids are
// collision-resistant and don't trip insecure-randomness scanners.
export function uniqueId(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`;
}
