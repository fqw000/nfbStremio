export function getManifest() {
  return {
    id: 'com.nfb.addon',
    version: '1.0.0',
    name: 'NFB Films',
    description: 'National Film Board of Canada',
    logo: 'https://www.nfb.ca/favicon.ico',
    resources: ['catalog', 'meta', 'stream', 'subtitles'],
    types: ['movie'],
    catalogs: [
      {
        type: 'movie',
        id: 'nfb_catalog',
        name: 'NFB Catalog',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      }
    ],
    idPrefixes: ['nfb_', 'tt'],
    behaviorHints: { configurable: true }
  };
}