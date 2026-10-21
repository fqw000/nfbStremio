// ==========================================
// 全局配置
// ==========================================

function getUserConfig() {
  return (typeof globalThis !== 'undefined' && globalThis.__USER_CONFIG) || {};
}

function buildConfig() {
  const user = getUserConfig();

  // 预设频道
  const PRESET_CHANNELS = [
    { id: 'childrens_film', name: "Children's Film", isDefault: true, isGenre: true }, // ★ 新增
    { id: 'exploreanimation_new_en', name: 'New Animated Films', isDefault: true },     // ★ 默认勾选
    { id: 'cartoons_for_kids', name: 'Cartoons for Kids', isDefault: true },            // ★ 默认勾选
    { id: 'best_of_ani', name: 'Best of Animation', isDefault: true },                  // ★ 默认勾选
    { id: 'home_new_releases_en', name: 'New Releases', isDefault: false },
    { id: 'halloween-movies', name: 'Halloween Movies', isDefault: false },
    { id: 'classics', name: 'Classics', isDefault: false },
    { id: 'binge-worthy-series', name: 'Binge-worthy Series', isDefault: false },
    { id: 'funny-films', name: 'Funny Films', isDefault: false },
    { id: 'hot_topics', name: 'Hot Topics', isDefault: false },
    { id: 'spotlight-canadian-musicians', name: 'Canadian Musicians', isDefault: false },
    { id: 'the-great-lakes', name: 'The Great Lakes', isDefault: false },
    { id: 'classic-docs', name: 'Classic Docs', isDefault: false },
    { id: 'the_green_channel', name: 'The Green Channel', isDefault: false }
  ];

  let enabledChannels = PRESET_CHANNELS;
  if (Array.isArray(user.chs)) {
    enabledChannels = PRESET_CHANNELS.filter(ch => user.chs.includes(ch.id));
  } else {
    // ★ 默认只选 isDefault = true 的
    enabledChannels = PRESET_CHANNELS.filter(ch => ch.isDefault);
  }


  const customChannels = (user.customChs || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(id => ({ id, name: id }));

  const allChannels = [...enabledChannels, ...customChannels];

  // ===== 计算 Catalog 顺序 =====
  const validIds = new Set(['trending', ...allChannels.map(ch => ch.id)]);
  let catalogOrder;

  if (Array.isArray(user.order)) {
    // 用户自定义顺序：过滤无效 ID，把遗漏的（新勾选）追加末尾
    const filtered = user.order.filter(id => validIds.has(id));
    const existing = new Set(filtered);
    const missing = [...validIds].filter(id => !existing.has(id));
    catalogOrder = [...filtered, ...missing];
  } else {
    // 默认顺序：Trending 最前，动画频道优先，其余按预设顺序
    const PREFERRED = ['best_of_ani'];
    const channelIds = allChannels.map(ch => ch.id);
    const front = PREFERRED.filter(id => channelIds.includes(id));
    const rest = channelIds.filter(id => !PREFERRED.includes(id));
    catalogOrder = ['trending', ...front, ...rest];
  }

  return {
    APP_PREFIX: typeof process !== 'undefined' ? process.env?.APP_PREFIX : 'nfb:dev',
    UPSTASH_REDIS_REST_URL: typeof process !== 'undefined' ? process.env?.UPSTASH_REDIS_REST_URL : null,
    UPSTASH_REDIS_REST_TOKEN: typeof process !== 'undefined' ? process.env?.UPSTASH_REDIS_REST_TOKEN : null,

    TMDB_API_KEY: user.tmdbKey
      || (typeof process !== 'undefined' ? process.env?.TMDB_KEY : null)
      || 'e5c3c7269a147fee368c3649ddd98875',
    OPENSUBTITLES_API_KEY: user.osKey
      || (typeof process !== 'undefined' ? process.env?.OPENSUBTITLES_API_KEY : null),
    SUBDL_API_KEY: user.subdlKey
      || (typeof process !== 'undefined' ? process.env?.SUBDL_API_KEY : null),

    NFB_TRENDING_API: 'https://www.nfb.ca/api/v4/trending',
    NFB_CHANNEL_API: 'https://www.nfb.ca/api/v4/channels',
    NFB_SEARCH_API: 'https://searchapi.nfb.ca/api/search/v4/films/',
    NFB_CATALOG_API: 'https://publicapi.nfb.ca/api/v5/works',
    NFB_SERIES_API: 'https://publicapi.nfb.ca/api/v5/series',
    NFB_COLLECTION_API: 'https://publicapi.nfb.ca/api/v5/collections',
    NFB_META_API: 'https://www.nfb.ca/film/',
    NFB_STREAM_API: 'https://www.nfb.ca/api/v4/films/',

    TRYBOX_SUBTITLE_API: 'https://trybox.app/api/public/subtitles',
    OPENSUBTITLES_API: 'https://api.opensubtitles.com/api/v1',
    SUBDL_API: 'https://api.subdl.com/api/v1/subtitles',

    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    REQUEST_TIMEOUT: 15000,

    CHANNELS: allChannels,
    CATALOG_ORDER: catalogOrder
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