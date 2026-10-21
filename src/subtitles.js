import { CONFIG } from './config.js';
import { getCache, setCache } from './cache.js';

const LANG_MAP = {
  'zh': 'zho', 'zh-cn': 'zho', 'zh-tw': 'zho',
  'en': 'eng', 'ru': 'rus', 'uk': 'ukr', 'fr': 'fra'
};

function normalizeLang(raw) {
  if (!raw) return null;
  return LANG_MAP[raw.toLowerCase().trim()] || null;
}

function filterLangs(subs, targetLang) {
  if (targetLang === 'all') return subs;
  return subs.filter(s => {
    if (!s.lang) return false;
    if (targetLang === 'zh') return s.lang === 'zho';
    if (targetLang === 'en') return s.lang === 'eng';
    if (targetLang === 'zh-en') return s.lang === 'zho' || s.lang === 'eng';
    return true;
  });
}

async function fetchFromTrybox(imdbId, targetLang) {
  try {
    const url = `${CONFIG.TRYBOX_SUBTITLE_API}?imdb_id=${imdbId}&v=8`;
    console.log(`[Subtitles] 🌐 Trybox 请求: ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': CONFIG.USER_AGENT, 'Referer': 'https://trybox.app/' } });
    if (!res.ok) return [];
    const data = await res.json();
    const subs = (data.subtitles || []).map(s => ({
      id: s.id,
      url: `https://trybox.app${s.url}`,
      lang: normalizeLang(s.language),
    }));
    return filterLangs(subs, targetLang);
  } catch (e) {
    return [];
  }
}

async function fetchFromOpenSubtitles(imdbId, targetLang) {
  if (!CONFIG.OPENSUBTITLES_API_KEY) return [];
  try {
    const langs = targetLang === 'all' ? 'en,zh-cn,zh-tw' : targetLang === 'zh' ? 'zh-cn,zh-tw' : targetLang === 'en' ? 'en' : 'en,zh-cn,zh-tw';
    const url = `${CONFIG.OPENSUBTITLES_API}?imdb_id=${imdbId.replace('tt', '')}&languages=${langs}`;
    console.log(`[Subtitles] 🌐 OpenSubtitles 请求`);
    const res = await fetch(url, { headers: { 'Api-Key': CONFIG.OPENSUBTITLES_API_KEY, 'User-Agent': CONFIG.USER_AGENT } });
    if (!res.ok) return [];
    const data = await res.json();
    const subs = (data.data || []).map(item => ({
      id: item.id,
      url: item.attributes.files[0]?.file_id 
        ? `https://api.opensubtitles.com/api/v1/download?file_id=${item.attributes.files[0].file_id}` : null,
      lang: normalizeLang(item.attributes.language)
    })).filter(s => s.url);
    return filterLangs(subs, targetLang);
  } catch (e) {
    return [];
  }
}

async function fetchFromSubDL(imdbId, targetLang) {
  if (!CONFIG.SUBDL_API_KEY) return [];
  try {
    const langs = targetLang === 'all' ? 'EN,ZH' : targetLang === 'zh' ? 'ZH' : targetLang === 'en' ? 'EN' : 'EN,ZH';
    const url = `${CONFIG.SUBDL_API}?api_key=${CONFIG.SUBDL_API_KEY}&imdb_id=${imdbId}&languages=${langs}`;
    console.log(`[Subtitles] 🌐 SubDL 请求`);
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const subs = (data.subtitles || []).map(s => ({ id: s.sd_id, url: s.url, lang: normalizeLang(s.lang) }));
    return filterLangs(subs, targetLang);
  } catch (e) {
    return [];
  }
}

export async function getSubtitles(imdbId, targetLang = 'zh-en') {
  if (!imdbId) return [];

  // ★ 核心：字幕结果无论是否为空，都要缓存 1 小时，避免重复查询 3 个外部库
  const cacheKey = `nfb:subtitles:${imdbId}:${targetLang}`;
  const cached = await getCache(cacheKey);
  if (cached !== null && cached !== undefined) {
    console.log(`[Subtitles] ✅ 缓存命中: ${imdbId}`);
    return cached === '__EMPTY__' ? [] : cached;
  }

  let subs = await fetchFromTrybox(imdbId, targetLang);
  if (subs.length === 0) {
    subs = await fetchFromOpenSubtitles(imdbId, targetLang);
  }
  if (subs.length === 0) {
    subs = await fetchFromSubDL(imdbId, targetLang);
  }

  // 写入缓存
  if (subs.length > 0) {
    await setCache(cacheKey, subs, 3600);
  } else {
    // 空结果缓存的特殊标记
    await setCache(cacheKey, '__EMPTY__', 3600);
  }
  return subs;
}