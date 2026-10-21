import { CONFIG } from './config.js';

export function getManifest() {
  const catalogs = [];

  CONFIG.CATALOG_ORDER.forEach(itemId => {
    if (itemId === 'trending') {
      // ===== Trending 目录（只保留电影，移除剧集） =====
      catalogs.push({
        type: 'movie',
        id: 'nfb_trending_movies',
        name: 'NFB Trending - 电影',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      });
    } else {
      // ===== 频道目录 =====
      const ch = CONFIG.CHANNELS.find(c => c.id === itemId);
      if (!ch) return;

      // 1. 电影目录（所有频道都生成）
      catalogs.push({
        type: 'movie',
        id: `nfb_ch_${ch.id}_movies`,
        name: `NFB - ${ch.name}`,
        extra: [{ name: 'skip', isRequired: false }]
      });

      // 2. 剧集目录（childrens_film 除外，因为底层数据为 0）
      if (ch.id !== 'childrens_film') {
        catalogs.push({
          type: 'series',
          id: `nfb_ch_${ch.id}_series`,
          name: `NFB - ${ch.name}`,
          extra: [{ name: 'skip', isRequired: false }]
        });
      }
    }
  });

  return {
    id: 'com.nfb.addon',
    version: '2.1.0',
    name: 'NFB Films',
    description: 'National Film Board of Canada',
    logo: 'https://www.nfb.ca/static/img/apple-touch-icon.png',
    resources: ['catalog', 'meta', 'stream', 'subtitles'],
    types: ['movie', 'series'],
    catalogs: catalogs,
    idPrefixes: ['nfb_', 'tt'],
    behaviorHints: { configurable: true }
  };
}