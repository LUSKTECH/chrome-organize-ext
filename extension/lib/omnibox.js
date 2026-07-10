export function parseOmnibox(text) {
  return { instruction: String(text || '').trim() };
}
