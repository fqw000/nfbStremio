import { CONFIG } from './config.js';

// 简易语言归一化
const LANG_MAP = {
  'zh': 'zho', 'zh-cn': 'zho', 'zh-tw': 'zho', 'chi': 'zho', 'zho': 'zho',
  'en': 'eng', 'eng': 'eng',
  'ru': 'rus', 'rus': 'rus',
  'uk': 'ukr', 'ukr': 'ukr',
  'fr': 'fra', 'fra': 'fra'
};

function normalizeLang(raw) {
  if (!raw) return null;
  return LANG_MAP[raw.toLowerCase().trim()] || null;
}

/**
 * 严格的语言过滤函数
 * targetLang: 'zh' | 'en' | 'zh-en' | 'all'
 */
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

// 源1：trybox.app
async function fetchFromTrybox(imdbId, targetLang) {
  try {
    const url = `${CONFIG.TRYBOX_SUBTITLE_API}?imdb_id=${imdbId}&v=8`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': '*/*',
        'Referer': 'https://trybox.app/'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    
    const subs = (data.subtitles || []).map(s => ({
      id: s.id,
      url: `https://trybox.app${s.url}`,
      lang: normalizeLang(s.language),
    }));
    
    return filterLangs(subs, targetLang);
  } catch (e) {
    console.warn(`[Subtitles] trybox 失败: ${e.message}`);
    return [];
  }
}

// 源2：OpenSubtitles 官方 API
async function fetchFromOpenSubtitles(imdbId, targetLang) {
  if (!CONFIG.OPENSUBTITLES_API_KEY) {
    console.warn(`[Subtitles] ⚠️ 未配置 OPENSUBTITLES_API_KEY，跳过`);
    return [];
  }
  try {
    // 默认请求中文和英文
    const langs = targetLang === 'all' ? 'en,zh-cn,zh-tw' : 
                  targetLang === 'zh' ? 'zh-cn,zh-tw' : 
                  targetLang === 'en' ? 'en' : 'en,zh-cn,zh-tw';
                  
    const url = `https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId.replace('tt', '')}&languages=${langs}`;
    const res = await fetch(url, {
      headers: {
        'Api-Key': CONFIG.OPENSUBTITLES_API_KEY,
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    
    const subs = (data.data || []).map(item => ({
      id: item.id,
      url: item.attributes.files[0]?.file_id 
        ? `https://api.opensubtitles.com/api/v1/download?file_id=${item.attributes.files[0].file_id}` 
        : null,
      lang: normalizeLang(item.attributes.language)
    })).filter(s => s.url);
    
    return filterLangs(subs, targetLang);
  } catch (e) {
    console.warn(`[Subtitles] OpenSubtitles 失败: ${e.message}`);
    return [];
  }
}

// 源3：SubDL API
async function fetchFromSubDL(imdbId, targetLang) {
  if (!CONFIG.SUBDL_API_KEY) {
    console.warn(`[Subtitles] ⚠️ 未配置 SUBDL_API_KEY，跳过`);
    return [];
  }
  try {
    const langs = targetLang === 'all' ? 'EN,ZH' : 
                  targetLang === 'zh' ? 'ZH' : 
                  targetLang === 'en' ? 'EN' : 'EN,ZH';
                  
    const url = `https://api.subdl.com/api/v1/subtitles?api_key=${CONFIG.SUBDL_API_KEY}&imdb_id=${imdbId}&languages=${langs}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    
    const subs = (data.subtitles || []).map(s => ({
      id: s.sd_id,
      url: s.url,
      lang: normalizeLang(s.lang)
    }));
    
    return filterLangs(subs, targetLang);
  } catch (e) {
    console.warn(`[Subtitles] SubDL 失败: ${e.message}`);
    return [];
  }
}

export async function getSubtitles(imdbId, targetLang = 'zh-en') {
  if (!imdbId) return [];

  // 主源 -> 备源1 -> 备源2
  let subs = await fetchFromTrybox(imdbId, targetLang);
  
  if (subs.length === 0) {
    console.log(`[Subtitles] trybox 无匹配语言结果，降级到 OpenSubtitles`);
    subs = await fetchFromOpenSubtitles(imdbId, targetLang);
  }
  
  if (subs.length === 0) {
    console.log(`[Subtitles] OpenSubtitles 无匹配语言结果，降级到 SubDL`);
    subs = await fetchFromSubDL(imdbId, targetLang);
  }

  return subs;
}