// ==========================================
// 全局配置
// ==========================================

function getUserConfig() {
  return (typeof globalThis !== 'undefined' && globalThis.__USER_CONFIG) || {};
}

function buildConfig() {
  const user = getUserConfig();

  // 预设的频道列表（用户可以在 configure 页面勾选）
  const PRESET_CHANNELS = [
    { id: 'home_new_releases_en', name: 'New Releases' },
    { id: 'halloween-movies', name: 'Halloween Movies' },
    { id: 'best_of_ani', name: 'Best of Animation' },
    { id: 'classics', name: 'Classics' },
    { id: 'binge-worthy-series', name: 'Binge-worthy Series' }
  ];

  // 处理用户勾选的预设频道
  let enabledChannels = PRESET_CHANNELS;
  if (Array.isArray(user.chs)) {
    enabledChannels = PRESET_CHANNELS.filter(ch => user.chs.includes(ch.id));
  }

  // 处理用户自定义频道（逗号分隔）
  const customChannels = (user.customChs || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(id => ({ id, name: id }));

  return {
    // ===== 部署级基础配置 =====
    APP_PREFIX: typeof process !== 'undefined' ? process.env?.APP_PREFIX : 'nfb:dev',
    UPSTASH_REDIS_REST_URL: typeof process !== 'undefined' ? process.env?.UPSTASH_REDIS_REST_URL : null,
    UPSTASH_REDIS_REST_TOKEN: typeof process !== 'undefined' ? process.env?.UPSTASH_REDIS_REST_TOKEN : null,

    // ===== API 密钥 =====
    TMDB_API_KEY: (typeof process !== 'undefined' ? process.env?.TMDB_KEY : null) 
      || user.tmdbKey || 'e5c3c7269a147fee368c3649ddd98875',
    OPENSUBTITLES_API_KEY: typeof process !== 'undefined' ? process.env?.OPENSUBTITLES_API_KEY : null,
    SUBDL_API_KEY: typeof process !== 'undefined' ? process.env?.SUBDL_API_KEY : null,

    // ===== 底层 NFB API 端点 =====
    NFB_TRENDING_API: 'https://www.nfb.ca/api/v4/trending',
    NFB_CHANNEL_API: 'https://www.nfb.ca/api/v4/channels',
    NFB_SEARCH_API: 'https://searchapi.nfb.ca/api/search/v4/films/',
    NFB_CATALOG_API: 'https://publicapi.nfb.ca/api/v5/works',
    NFB_SERIES_API: 'https://publicapi.nfb.ca/api/v5/series',
    NFB_COLLECTION_API: 'https://publicapi.nfb.ca/api/v5/collections',
    NFB_META_API: 'https://www.nfb.ca/film/',
    NFB_STREAM_API: 'https://www.nfb.ca/api/v4/films/',

    // ===== 第三方字幕 API 端点 =====
    TRYBOX_SUBTITLE_API: 'https://trybox.app/api/public/subtitles',
    OPENSUBTITLES_API: 'https://api.opensubtitles.com/api/v1',
    SUBDL_API: 'https://api.subdl.com/api/v1/subtitles',

    // ===== 网络与通用配置 =====
    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    REQUEST_TIMEOUT: 15000,
    
    // ===== 最终生效的频道列表 =====
    CHANNELS: [...enabledChannels, ...customChannels]
  };
}

let _configCache = null;
let _configCacheKey = '';

export function getConfig() {
  const user = getUserConfig();
  const key = JSON.stringify(user);
  if (!_configCache || key !== _configCacheKey) {
    _configCache = buildConfig();
    _configCacheKey = key;
  }
  return _configCache;
}

export const CONFIG = new Proxy({}, {
  get(target, prop) { return getConfig()[prop]; }
});