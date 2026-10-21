import { CONFIG } from './config.js';

export function getManifest() {
  const catalogs = [
    {
      type: 'movie',
      id: 'nfb_trending_movies',
      name: 'NFB Trending - 电影',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'nfb_trending_series',
      name: 'NFB Trending - 剧集与合集',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    }
  ];

  // 动态加入用户选择/自定义的频道
  CONFIG.CHANNELS.forEach(ch => {
    catalogs.push({
      type: 'movie',
      id: `nfb_ch_${ch.id}_movies`,
      name: `NFB - ${ch.name} (电影)`,
      extra: [{ name: 'skip', isRequired: false }]
    });
    catalogs.push({
      type: 'series',
      id: `nfb_ch_${ch.id}_series`,
      name: `NFB - ${ch.name} (剧集)`,
      extra: [{ name: 'skip', isRequired: false }]
    });
  });

  return {
    id: 'com.nfb.addon',
    version: '2.0.0',
    name: 'NFB Films',
    description: 'National Film Board of Canada',
    logo: 'https://www.nfb.ca/static/img/apple-touch-icon.png',
    resources: ['catalog', 'meta', 'stream', 'subtitles'],
    types: ['movie', 'series'],
    catalogs,
    idPrefixes: ['nfb_', 'tt'],
    behaviorHints: { configurable: true }
  };
}