function tabTable(tabs, extraCols = () => '') {
  return tabs
    .map((t) => `${t.tabId}\t${(t.title || '').replace(/\s+/g, ' ').slice(0, 120)}\t${t.url}${extraCols(t)}`)
    .join('\n');
}

export function buildGroupPrompt(tabs) {
  return [
    'You organize browser tabs into topical groups.',
    'Below are open tabs as: tabId<TAB>title<TAB>url (one per line).',
    'Cluster them into a small number of meaningful groups by topic or task.',
    'Rules:',
    '- Put every tabId into exactly one group.',
    '- Use between 2 and 8 groups; prefer fewer, broader groups over many tiny ones.',
    '- "color" must be one of: grey, blue, red, yellow, green, pink, purple, cyan, orange.',
    'Respond with ONLY this JSON, no prose:',
    '{"groups":[{"name":"Short label","color":"blue","tabIds":[1,2]}]}',
    '',
    'Tabs:',
    tabTable(tabs),
  ].join('\n');
}

export function buildStalePrompt(tabs, thresholdDays) {
  return [
    `You decide which forgotten browser tabs are safe to close. A tab is a candidate if idle more than ${thresholdDays} days, but keep ones that look important or hard to find again.`,
    'Below are candidate tabs as: tabId<TAB>title<TAB>url<TAB>idleDays.',
    'For each tab you recommend closing, set suggestBookmark=true when it is worth saving before closing.',
    'Respond with ONLY this JSON, no prose:',
    '{"close":[{"tabId":1,"reason":"why","suggestBookmark":true}]}',
    '',
    'Tabs:',
    tabTable(tabs, (t) => `\t${t.idleDays}`),
  ].join('\n');
}

export function buildImportantPrompt(tabs) {
  return [
    'You identify high-value browser tabs worth bookmarking and file them into a tidy folder structure.',
    'Below are open tabs as: tabId<TAB>title<TAB>url.',
    'Pick only genuinely useful/reference-worthy tabs (skip transient pages, searches, logins).',
    'folderPath is an array of folder names, e.g. ["Dev","React"]. Keep the tree shallow (1-2 levels).',
    'Respond with ONLY this JSON, no prose:',
    '{"important":[{"tabId":1,"folderPath":["Dev","React"],"reason":"why"}]}',
    '',
    'Tabs:',
    tabTable(tabs),
  ].join('\n');
}
