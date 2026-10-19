function getUserConfig() {
  return (typeof globalThis !== 'undefined' && globalThis.__USER_CONFIG) || {};
}

function buildConfig() {
  const user = getUserConfig();

  return {
    APP_PREFIX: typeof process !== 'undefined' ? process.env?.APP_PREFIX : 'nfb:dev',
    UPSTASH_REDIS_REST_URL: typeof process !== 'undefined' ? process.env?.UPSTASH_REDIS_REST_URL : null,
    UPSTASH_REDIS_REST_TOKEN: typeof process !== 'undefined' ? process.env?.UPSTASH_REDIS_REST_TOKEN : null,

    TMDB_API_KEY: (typeof process !== 'undefined' ? process.env?.TMDB_KEY : null) 
      || user.tk || 'e5c3c7269a147fee368c3649ddd98875',
    
    // ★ 新增字幕 API Key
    OPENSUBTITLES_API_KEY: typeof process !== 'undefined' ? process.env?.OPENSUBTITLES_API_KEY : null,
    SUBDL_API_KEY: typeof process !== 'undefined' ? process.env?.SUBDL_API_KEY : null,

    NFB_SEARCH_API: 'https://searchapi.nfb.ca/api/search/v4/films/',
    NFB_CATALOG_API: 'https://publicapi.nfb.ca/api/v5/works',
    NFB_META_API: 'https://www.nfb.ca/film/',
    NFB_STREAM_API: 'https://www.nfb.ca/api/v4/films/',
    TRYBOX_SUBTITLE_API: 'https://trybox.app/api/public/subtitles',
    
    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    REQUEST_TIMEOUT: 15000,
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